import { anyApi, httpActionGeneric, httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { readAgentMailWebhookHeaders, verifyAgentMailWebhook } from "../src/mail/webhookVerification.js";

const http = httpRouter();

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpActionGeneric(async (ctx, request) => {
    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
    if (!secret) return new Response("AGENTMAIL_WEBHOOK_SECRET is not configured in Convex.", { status: 503 });

    const rawBody = await request.text();
    const headers = readAgentMailWebhookHeaders(request.headers);
    if (!headers) return new Response("Missing webhook signature headers", { status: 401 });

    const valid = await verifyAgentMailWebhook({ secret, rawBody, headers });
    if (!valid) return new Response("Invalid webhook signature", { status: 401 });

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (payload?.event_type !== "message.received") return new Response(null, { status: 204 });

    const message = payload?.message ?? {};
    const rawText = String(message.extracted_text || message.text || message.preview || "").trim();
    if (!payload?.event_id || !message?.message_id || !message?.thread_id || !rawText) {
      return new Response("Missing message fields", { status: 400 });
    }

    await ctx.scheduler.runAfter(0, anyApi.mail.processInbound, {
      eventId: String(payload.event_id),
      messageId: String(message.message_id),
      threadId: String(message.thread_id),
      rawText,
    });
    return new Response(null, { status: 204 });
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;
