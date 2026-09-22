import { actionGeneric, anyApi } from "convex/server";
import { v } from "convex/values";
import { createAgentMailClient } from "../src/mail/agentmail.js";
import { composeRepairOutreach } from "../src/mail/compose.js";
import { extractReplyFacts } from "../src/mail/openai.js";

function configuredMailClient() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY is not configured in Convex.");
  if (!inboxId) throw new Error("AGENTMAIL_INBOX_ID is not configured in Convex.");
  return createAgentMailClient({ apiKey, inboxId });
}

export const askRepairPeople = actionGeneric({
  args: { candidateIds: v.array(v.id("candidates")) },
  handler: async (ctx, { candidateIds }) => {
    const unique = [...new Map(candidateIds.map((id) => [String(id), id])).values()].slice(0, 4);
    const client = configuredMailClient();
    let sent = 0;
    const failures: string[] = [];

    for (const candidateId of unique) {
      const context = await ctx.runQuery(anyApi.patch.getCandidateContext, { candidateId });
      if (!context?.candidate?.email) continue;

      const claim = await ctx.runMutation(anyApi.patch.startOutreach, {
        repairId: context.repair.id,
        candidateId,
      });
      if (!claim?.shouldSend) continue;

      const message = composeRepairOutreach(
        {
          id: String(context.repair.id),
          description: context.repair.description,
          area: context.repair.area,
          status: context.repair.status,
          createdAt: context.repair.createdAt,
          ...(context.repair.photoUrl ? { photoUrl: context.repair.photoUrl } : {}),
        },
        {
          id: String(candidateId),
          repairId: String(context.repair.id),
          name: context.candidate.name,
          website: context.candidate.website,
          email: context.candidate.email,
          serviceEvidence: context.candidate.serviceEvidence,
          sourceUrl: context.candidate.sourceUrl,
        },
      );

      try {
        const result = await client.sendMessage({
          to: context.candidate.email,
          subject: message.subject,
          text: message.text,
        });
        await ctx.runMutation(anyApi.patch.markOutreachSent, {
          outreachId: claim.outreachId,
          providerMessageId: result.message_id,
          providerThreadId: result.thread_id,
        });
        sent += 1;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "Could not send the request.";
        failures.push(context.candidate.name);
        await ctx.runMutation(anyApi.patch.markOutreachFailed, {
          outreachId: claim.outreachId,
          error: messageText,
        });
      }
    }

    if (sent === 0 && failures.length) throw new Error(`We couldn't reach ${failures.join(", ")}.`);
    return { sent, failures };
  },
});

export const processInbound = actionGeneric({
  args: {
    eventId: v.string(),
    messageId: v.string(),
    threadId: v.string(),
    rawText: v.string(),
  },
  handler: async (ctx, args) => {
    const outreach = await ctx.runQuery(anyApi.patch.findOutreachByThreadId, {
      providerThreadId: args.threadId,
    });
    if (!outreach) return { ignored: true, reason: "No matching Patch outreach." };

    let extractionStatus: "ok" | "failed" = "ok";
    let extractionError: string | undefined;
    let facts = {
      canTakeJob: null as boolean | null,
      arrivalText: null as string | null,
      priceAmount: null as number | null,
      currency: null as string | null,
      note: null as string | null,
    };

    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error("GROQ_API_KEY is not configured in Convex.");
      facts = await extractReplyFacts({
        apiKey,
        model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        rawText: args.rawText,
      });
    } catch (error) {
      extractionStatus = "failed";
      extractionError = error instanceof Error ? error.message : "GPT-OSS extraction failed.";
    }

    const stored = await ctx.runMutation(anyApi.patch.recordInboundReply, {
      repairId: outreach.repairId,
      candidateId: outreach.candidateId,
      externalMessageId: args.messageId,
      providerEventId: args.eventId,
      rawText: args.rawText,
      ...facts,
      extractionStatus,
      ...(extractionError ? { extractionError } : {}),
    });

    return { ignored: false, duplicate: stored.duplicate, extractionStatus };
  },
});
