import type { AgentMailClient } from "./agentmail";
import { emptyReplyFacts } from "./openai";
import type {
  AgentMailReceivedEvent,
  MailCoreAdapter,
  ReplyFacts,
} from "./types";
import {
  readAgentMailWebhookHeaders,
  verifyAgentMailWebhook,
} from "./webhookVerification";

export type ReplyExtractor = (rawText: string) => Promise<ReplyFacts>;

export type InboundWebhookResult =
  | { status: "ignored"; reason: "event_type" | "inbox" | "uncorrelated" }
  | { status: "duplicate" }
  | { status: "stored"; extractionStatus: "ok" | "failed" };

function isReceivedEvent(value: unknown): value is AgentMailReceivedEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<AgentMailReceivedEvent>;
  return (
    event.type === "event" &&
    event.event_type === "message.received" &&
    typeof event.event_id === "string" &&
    !!event.message &&
    typeof event.message.message_id === "string" &&
    typeof event.message.thread_id === "string" &&
    typeof event.message.inbox_id === "string"
  );
}

function messageBody(message: AgentMailReceivedEvent["message"]): string {
  return (
    message.extracted_text?.trim() ||
    message.text?.trim() ||
    message.preview?.trim() ||
    ""
  );
}

export async function processAgentMailReceivedEvent(input: {
  event: AgentMailReceivedEvent;
  expectedInboxId: string;
  core: MailCoreAdapter;
  agentMail: AgentMailClient;
  extract: ReplyExtractor;
  nowMs?: number;
}): Promise<InboundWebhookResult> {
  const { event } = input;
  if (event.message.inbox_id !== input.expectedInboxId) {
    return { status: "ignored", reason: "inbox" };
  }

  const correlation = await input.core.findOutreachByThread(event.message.thread_id);
  if (!correlation) return { status: "ignored", reason: "uncorrelated" };

  let rawText = messageBody(event.message);
  if (!rawText) {
    const fullMessage = await input.agentMail.getMessage(
      event.message.inbox_id,
      event.message.message_id,
    );
    rawText = messageBody(fullMessage as AgentMailReceivedEvent["message"]);
  }

  let facts = emptyReplyFacts();
  let extractionStatus: "ok" | "failed" = "ok";
  let extractionError: string | null = null;
  try {
    facts = await input.extract(rawText);
  } catch (error) {
    extractionStatus = "failed";
    extractionError = error instanceof Error ? error.message : String(error);
  }

  const stored = await input.core.recordInboundReply({
    ...correlation,
    eventId: event.event_id,
    messageId: event.message.message_id,
    threadId: event.message.thread_id,
    rawText,
    facts,
    extractionStatus,
    extractionError,
    receivedAt: input.nowMs ?? Date.now(),
  });

  if (stored.status === "duplicate") return { status: "duplicate" };
  return { status: "stored", extractionStatus };
}

export async function handleAgentMailWebhookRequest(input: {
  request: Request;
  webhookSecret: string;
  expectedInboxId: string;
  core: MailCoreAdapter;
  agentMail: AgentMailClient;
  extract: ReplyExtractor;
  nowMs?: number;
}): Promise<Response> {
  const rawBody = await input.request.text();
  const headers = readAgentMailWebhookHeaders(input.request.headers);
  if (!headers) return new Response("Missing webhook signature headers", { status: 400 });

  const verified = await verifyAgentMailWebhook({
    secret: input.webhookSecret,
    rawBody,
    headers,
    nowMs: input.nowMs,
  });
  if (!verified) return new Response("Invalid webhook signature", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!isReceivedEvent(payload)) {
    return new Response(null, { status: 200 });
  }

  await processAgentMailReceivedEvent({
    event: payload,
    expectedInboxId: input.expectedInboxId,
    core: input.core,
    agentMail: input.agentMail,
    extract: input.extract,
    nowMs: input.nowMs,
  });
  return new Response(null, { status: 200 });
}
