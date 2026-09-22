import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const nullableBoolean = v.union(v.boolean(), v.null());
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

const DEFAULT_DEMO_KEY = "default";

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function normalizeCandidateKey(candidate: {
  candidateKey?: string;
  email?: string;
  website: string;
  sourceUrl: string;
  name: string;
}) {
  const raw =
    cleanOptional(candidate.candidateKey) ??
    cleanOptional(candidate.email) ??
    cleanOptional(candidate.sourceUrl) ??
    candidate.website + "|" + candidate.name;

  return raw.trim().toLowerCase();
}

export const createRepair = mutationGeneric({
  args: {
    description: v.string(),
    area: v.string(),
    photoUrl: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
    demoKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clientRequestId = cleanOptional(args.clientRequestId);
    if (clientRequestId) {
      const existing = await ctx.db
        .query("repairs")
        .withIndex("by_clientRequestId", (q) => q.eq("clientRequestId", clientRequestId))
        .unique();
      if (existing) {
        return { repairId: existing._id, created: false };
      }
    }

    const now = Date.now();
    const repairId = await ctx.db.insert("repairs", {
      description: args.description.trim(),
      area: args.area.trim(),
      ...(cleanOptional(args.photoUrl) ? { photoUrl: args.photoUrl!.trim() } : {}),
      ...(clientRequestId ? { clientRequestId } : {}),
      demoKey: cleanOptional(args.demoKey) ?? DEFAULT_DEMO_KEY,
      status: "reported",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("repairEvents", {
      repairId,
      type: "reported",
      at: now,
    });

    return { repairId, created: true };
  },
});

export const markLooking = mutationGeneric({
  args: { repairId: v.id("repairs") },
  handler: async (ctx, args) => {
    const repair = await ctx.db.get(args.repairId);
    if (!repair) throw new Error("Repair not found.");
    if (repair.status !== "reported") return { status: repair.status };

    const now = Date.now();
    await ctx.db.patch(args.repairId, { status: "looking", updatedAt: now });
    await ctx.db.insert("repairEvents", {
      repairId: args.repairId,
      type: "looking",
      at: now,
    });

    return { status: "looking" as const };
  },
});

export const saveDiscoveredCandidates = mutationGeneric({
  args: {
    repairId: v.id("repairs"),
    candidates: v.array(
      v.object({
        candidateKey: v.optional(v.string()),
        name: v.string(),
        website: v.string(),
        email: v.optional(v.string()),
        serviceEvidence: v.string(),
        sourceUrl: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const repair = await ctx.db.get(args.repairId);
    if (!repair) throw new Error("Repair not found.");

    const now = Date.now();
    const candidateIds = [];
    let createdCount = 0;

    for (const candidate of args.candidates) {
      const candidateKey = normalizeCandidateKey(candidate);
      const existing = await ctx.db
        .query("candidates")
        .withIndex("by_repairId_and_candidateKey", (q) =>
          q.eq("repairId", args.repairId).eq("candidateKey", candidateKey),
        )
        .unique();

      const email = cleanOptional(candidate.email);
      if (existing) {
        await ctx.db.patch(existing._id, {
          candidateKey,
          name: candidate.name.trim(),
          website: candidate.website.trim(),
          ...(email ? { email } : { email: undefined }),
          serviceEvidence: candidate.serviceEvidence.trim(),
          sourceUrl: candidate.sourceUrl.trim(),
          updatedAt: now,
        });
        candidateIds.push(existing._id);
        continue;
      }

      const candidateId = await ctx.db.insert("candidates", {
        repairId: args.repairId,
        candidateKey,
        name: candidate.name.trim(),
        website: candidate.website.trim(),
        ...(email ? { email } : {}),
        serviceEvidence: candidate.serviceEvidence.trim(),
        sourceUrl: candidate.sourceUrl.trim(),
        createdAt: now,
        updatedAt: now,
      });
      candidateIds.push(candidateId);
      createdCount += 1;
    }

    if (repair.status === "reported") {
      await ctx.db.patch(args.repairId, { status: "looking", updatedAt: now });
    } else {
      await ctx.db.patch(args.repairId, { updatedAt: now });
    }

    if (args.candidates.length > 0) {
      await ctx.db.insert("repairEvents", {
        repairId: args.repairId,
        type: "candidates_saved",
        at: now,
      });
    }

    return { candidateIds, createdCount };
  },
});

export const startOutreach = mutationGeneric({
  args: {
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const repair = await ctx.db.get(args.repairId);
    if (!repair) throw new Error("Repair not found.");

    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.repairId !== args.repairId) {
      throw new Error("Repair candidate not found for this repair.");
    }

    const existing = await ctx.db
      .query("outreach")
      .withIndex("by_repairId_and_candidateId", (q) =>
        q.eq("repairId", args.repairId).eq("candidateId", args.candidateId),
      )
      .unique();

    if (existing) {
      return {
        outreachId: existing._id,
        status: existing.status,
        shouldSend: false,
      };
    }

    const now = Date.now();
    const idempotencyKey = cleanOptional(args.idempotencyKey);
    const outreachId = await ctx.db.insert("outreach", {
      repairId: args.repairId,
      candidateId: args.candidateId,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      status: "started",
      createdAt: now,
      updatedAt: now,
    });

    if (repair.status === "reported" || repair.status === "looking") {
      await ctx.db.patch(args.repairId, { status: "waiting", updatedAt: now });
    } else {
      await ctx.db.patch(args.repairId, { updatedAt: now });
    }

    await ctx.db.insert("repairEvents", {
      repairId: args.repairId,
      candidateId: args.candidateId,
      outreachId,
      type: "outreach_started",
      at: now,
    });

    return { outreachId, status: "started" as const, shouldSend: true };
  },
});

export const markOutreachSent = mutationGeneric({
  args: {
    outreachId: v.id("outreach"),
    providerMessageId: v.string(),
    providerThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const outreach = await ctx.db.get(args.outreachId);
    if (!outreach) throw new Error("Outreach not found.");

    const providerMessageId = args.providerMessageId.trim();
    if (outreach.status === "sent") {
      if (outreach.providerMessageId === providerMessageId) {
        return { status: outreach.status };
      }
      throw new Error("Outreach is already marked sent with a different provider message.");
    }

    const duplicateProviderMessage = await ctx.db
      .query("outreach")
      .withIndex("by_providerMessageId", (q) => q.eq("providerMessageId", providerMessageId))
      .unique();
    if (duplicateProviderMessage && duplicateProviderMessage._id !== args.outreachId) {
      throw new Error("Provider message is already attached to another outreach.");
    }

    const providerThreadId = cleanOptional(args.providerThreadId);
    if (providerThreadId) {
      const duplicateThread = await ctx.db
        .query("outreach")
        .withIndex("by_providerThreadId", (q) => q.eq("providerThreadId", providerThreadId))
        .unique();
      if (duplicateThread && duplicateThread._id !== args.outreachId) {
        throw new Error("Provider thread is already attached to another outreach.");
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.outreachId, {
      status: "sent",
      providerMessageId,
      ...(providerThreadId ? { providerThreadId } : {}),
      error: undefined,
      sentAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("repairEvents", {
      repairId: outreach.repairId,
      candidateId: outreach.candidateId,
      outreachId: args.outreachId,
      type: "outreach_sent",
      at: now,
    });

    return { status: "sent" as const };
  },
});

export const markOutreachFailed = mutationGeneric({
  args: {
    outreachId: v.id("outreach"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const outreach = await ctx.db.get(args.outreachId);
    if (!outreach) throw new Error("Outreach not found.");

    if (outreach.status === "sent" || outreach.status === "failed") {
      return { status: outreach.status };
    }

    const now = Date.now();
    await ctx.db.patch(args.outreachId, {
      status: "failed",
      error: args.error.trim(),
      failedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("repairEvents", {
      repairId: outreach.repairId,
      candidateId: outreach.candidateId,
      outreachId: args.outreachId,
      type: "outreach_failed",
      at: now,
    });

    return { status: "failed" as const };
  },
});

export const recordInboundReply = mutationGeneric({
  args: {
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
    externalMessageId: v.string(),
    providerEventId: v.optional(v.string()),
    rawText: v.string(),
    canTakeJob: nullableBoolean,
    arrivalText: nullableString,
    priceAmount: nullableNumber,
    currency: nullableString,
    note: nullableString,
    extractionStatus: v.optional(v.union(v.literal("ok"), v.literal("failed"))),
    extractionError: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const repair = await ctx.db.get(args.repairId);
    if (!repair) throw new Error("Repair not found.");

    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.repairId !== args.repairId) {
      throw new Error("Repair candidate not found for this repair.");
    }

    const externalMessageId = args.externalMessageId.trim();
    const existingByMessage = await ctx.db
      .query("replies")
      .withIndex("by_externalMessageId", (q) => q.eq("externalMessageId", externalMessageId))
      .unique();
    if (existingByMessage) {
      return { replyId: existingByMessage._id, duplicate: true };
    }

    const providerEventId = cleanOptional(args.providerEventId);
    if (providerEventId) {
      const existingByEvent = await ctx.db
        .query("replies")
        .withIndex("by_providerEventId", (q) => q.eq("providerEventId", providerEventId))
        .unique();
      if (existingByEvent) {
        return { replyId: existingByEvent._id, duplicate: true };
      }
    }

    const now = Date.now();
    const receivedAt = args.receivedAt ?? now;
    const replyId = await ctx.db.insert("replies", {
      repairId: args.repairId,
      candidateId: args.candidateId,
      externalMessageId,
      ...(providerEventId ? { providerEventId } : {}),
      rawText: args.rawText,
      canTakeJob: args.canTakeJob,
      arrivalText: args.arrivalText,
      priceAmount: args.priceAmount,
      currency: args.currency,
      note: args.note,
      ...(args.extractionStatus ? { extractionStatus: args.extractionStatus } : {}),
      ...(cleanOptional(args.extractionError) ? { extractionError: args.extractionError!.trim() } : {}),
      receivedAt,
      createdAt: now,
    });

    if (repair.status !== "chosen") {
      await ctx.db.patch(args.repairId, {
        status: "options_ready",
        updatedAt: now,
      });
    }

    await ctx.db.insert("repairEvents", {
      repairId: args.repairId,
      candidateId: args.candidateId,
      replyId,
      type: "reply_received",
      at: now,
    });

    return { replyId, duplicate: false };
  },
});

export const chooseRepairPerson = mutationGeneric({
  args: {
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
  },
  handler: async (ctx, args) => {
    const repair = await ctx.db.get(args.repairId);
    if (!repair) throw new Error("Repair not found.");

    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.repairId !== args.repairId) {
      throw new Error("Repair candidate not found for this repair.");
    }

    if (repair.status === "chosen") {
      if (repair.chosenCandidateId === args.candidateId) {
        return {
          candidateId: args.candidateId,
          chosenAt: repair.chosenAt ?? repair.updatedAt,
        };
      }
      throw new Error("This repair already has a chosen repair person.");
    }

    const now = Date.now();
    await ctx.db.patch(args.repairId, {
      status: "chosen",
      chosenCandidateId: args.candidateId,
      chosenAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("repairEvents", {
      repairId: args.repairId,
      candidateId: args.candidateId,
      type: "chosen",
      at: now,
    });

    return { candidateId: args.candidateId, chosenAt: now };
  },
});

export const getRepair = queryGeneric({
  args: { repairId: v.id("repairs") },
  handler: async (ctx, args) => {
    const repair = await ctx.db.get(args.repairId);
    if (!repair) return null;

    const [candidates, outreach, replies, events] = await Promise.all([
      ctx.db
        .query("candidates")
        .withIndex("by_repairId", (q) => q.eq("repairId", args.repairId))
        .collect(),
      ctx.db
        .query("outreach")
        .withIndex("by_repairId", (q) => q.eq("repairId", args.repairId))
        .collect(),
      ctx.db
        .query("replies")
        .withIndex("by_repairId", (q) => q.eq("repairId", args.repairId))
        .collect(),
      ctx.db
        .query("repairEvents")
        .withIndex("by_repairId", (q) => q.eq("repairId", args.repairId))
        .collect(),
    ]);

    const outreachByCandidate = new Map(
      outreach.map((item) => [String(item.candidateId), item]),
    );
    const repliesByCandidate = new Map<string, typeof replies>();

    for (const reply of replies) {
      const key = String(reply.candidateId);
      const bucket = repliesByCandidate.get(key) ?? [];
      bucket.push(reply);
      repliesByCandidate.set(key, bucket);
    }

    const candidateViews = candidates.map((candidate) => {
      const candidateReplies = [
        ...(repliesByCandidate.get(String(candidate._id)) ?? []),
      ].sort((a, b) => b.receivedAt - a.receivedAt);
      const outreachRecord = outreachByCandidate.get(String(candidate._id));

      return {
        id: candidate._id,
        repairId: candidate.repairId,
        name: candidate.name,
        website: candidate.website,
        email: candidate.email ?? null,
        serviceEvidence: candidate.serviceEvidence,
        sourceUrl: candidate.sourceUrl,
        outreach: outreachRecord
          ? {
              id: outreachRecord._id,
              status: outreachRecord.status,
              providerMessageId: outreachRecord.providerMessageId ?? null,
              providerThreadId: outreachRecord.providerThreadId ?? null,
              error: outreachRecord.error ?? null,
              sentAt: outreachRecord.sentAt ?? null,
            }
          : null,
        replies: candidateReplies.map((reply) => ({
          id: reply._id,
          repairId: reply.repairId,
          personId: reply.candidateId,
          rawText: reply.rawText,
          canTakeJob: reply.canTakeJob,
          arrivalText: reply.arrivalText,
          priceAmount: reply.priceAmount,
          currency: reply.currency,
          note: reply.note,
          extractionStatus: reply.extractionStatus ?? "ok",
          extractionError: reply.extractionError ?? null,
          receivedAt: reply.receivedAt,
        })),
        latestReply: candidateReplies[0]
          ? {
              id: candidateReplies[0]._id,
              rawText: candidateReplies[0].rawText,
              canTakeJob: candidateReplies[0].canTakeJob,
              arrivalText: candidateReplies[0].arrivalText,
              priceAmount: candidateReplies[0].priceAmount,
              currency: candidateReplies[0].currency,
              note: candidateReplies[0].note,
              extractionStatus: candidateReplies[0].extractionStatus ?? "ok",
              extractionError: candidateReplies[0].extractionError ?? null,
              receivedAt: candidateReplies[0].receivedAt,
            }
          : null,
      };
    });

    return {
      repair: {
        id: repair._id,
        description: repair.description,
        area: repair.area,
        photoUrl: repair.photoUrl ?? null,
        status: repair.status,
        createdAt: repair.createdAt,
        chosenCandidateId: repair.chosenCandidateId ?? null,
        chosenAt: repair.chosenAt ?? null,
      },
      candidates: candidateViews,
      chosenCandidate:
        candidateViews.find(
          (candidate) => candidate.id === repair.chosenCandidateId,
        ) ?? null,
      events: [...events]
        .sort((a, b) => a.at - b.at)
        .map((event) => ({
          id: event._id,
          type: event.type,
          candidateId: event.candidateId ?? null,
          outreachId: event.outreachId ?? null,
          replyId: event.replyId ?? null,
          at: event.at,
        })),
    };
  },
});

export const getCandidateContext = queryGeneric({
  args: { candidateId: v.id("candidates") },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) return null;
    const repair = await ctx.db.get(candidate.repairId);
    if (!repair) return null;
    return {
      repair: {
        id: repair._id,
        description: repair.description,
        area: repair.area,
        photoUrl: repair.photoUrl ?? null,
        status: repair.status,
        createdAt: repair.createdAt,
      },
      candidate: {
        id: candidate._id,
        repairId: candidate.repairId,
        name: candidate.name,
        website: candidate.website,
        email: candidate.email ?? null,
        serviceEvidence: candidate.serviceEvidence,
        sourceUrl: candidate.sourceUrl,
      },
    };
  },
});

export const findOutreachByThreadId = queryGeneric({
  args: { providerThreadId: v.string() },
  handler: async (ctx, args) => {
    const providerThreadId = args.providerThreadId.trim();
    if (!providerThreadId) return null;
    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_providerThreadId", (q) => q.eq("providerThreadId", providerThreadId))
      .unique();
    if (!outreach) return null;
    return {
      outreachId: outreach._id,
      repairId: outreach.repairId,
      candidateId: outreach.candidateId,
      status: outreach.status,
    };
  },
});

export const findOutreachByProviderMessageId = queryGeneric({
  args: { providerMessageId: v.string() },
  handler: async (ctx, args) => {
    const providerMessageId = args.providerMessageId.trim();
    if (!providerMessageId) return null;

    const outreach = await ctx.db
      .query("outreach")
      .withIndex("by_providerMessageId", (q) =>
        q.eq("providerMessageId", providerMessageId),
      )
      .unique();

    if (!outreach) return null;

    return {
      outreachId: outreach._id,
      repairId: outreach.repairId,
      candidateId: outreach.candidateId,
      status: outreach.status,
    };
  },
});

export const resetDemo = mutationGeneric({
  args: { demoKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const demoKey = cleanOptional(args.demoKey) ?? DEFAULT_DEMO_KEY;
    const repairs = await ctx.db
      .query("repairs")
      .withIndex("by_demoKey", (q) => q.eq("demoKey", demoKey))
      .collect();

    let candidatesDeleted = 0;
    let outreachDeleted = 0;
    let repliesDeleted = 0;
    let eventsDeleted = 0;

    for (const repair of repairs) {
      const [candidates, outreach, replies, events] = await Promise.all([
        ctx.db
          .query("candidates")
          .withIndex("by_repairId", (q) => q.eq("repairId", repair._id))
          .collect(),
        ctx.db
          .query("outreach")
          .withIndex("by_repairId", (q) => q.eq("repairId", repair._id))
          .collect(),
        ctx.db
          .query("replies")
          .withIndex("by_repairId", (q) => q.eq("repairId", repair._id))
          .collect(),
        ctx.db
          .query("repairEvents")
          .withIndex("by_repairId", (q) => q.eq("repairId", repair._id))
          .collect(),
      ]);

      for (const event of events) await ctx.db.delete(event._id);
      for (const reply of replies) await ctx.db.delete(reply._id);
      for (const item of outreach) await ctx.db.delete(item._id);
      for (const candidate of candidates) await ctx.db.delete(candidate._id);
      await ctx.db.delete(repair._id);

      candidatesDeleted += candidates.length;
      outreachDeleted += outreach.length;
      repliesDeleted += replies.length;
      eventsDeleted += events.length;
    }

    return {
      demoKey,
      repairsDeleted: repairs.length,
      candidatesDeleted,
      outreachDeleted,
      repliesDeleted,
      eventsDeleted,
    };
  },
});
