import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const repairStatus = v.union(
  v.literal("reported"),
  v.literal("looking"),
  v.literal("waiting"),
  v.literal("options_ready"),
  v.literal("chosen"),
);

const outreachStatus = v.union(
  v.literal("started"),
  v.literal("sent"),
  v.literal("failed"),
);

const eventType = v.union(
  v.literal("reported"),
  v.literal("looking"),
  v.literal("candidates_saved"),
  v.literal("outreach_started"),
  v.literal("outreach_sent"),
  v.literal("outreach_failed"),
  v.literal("reply_received"),
  v.literal("chosen"),
);

export default defineSchema({
  repairs: defineTable({
    description: v.string(),
    area: v.string(),
    photoUrl: v.optional(v.string()),
    status: repairStatus,
    chosenCandidateId: v.optional(v.id("candidates")),
    chosenAt: v.optional(v.number()),
    clientRequestId: v.optional(v.string()),
    demoKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clientRequestId", ["clientRequestId"])
    .index("by_demoKey", ["demoKey"]),

  candidates: defineTable({
    repairId: v.id("repairs"),
    candidateKey: v.string(),
    name: v.string(),
    website: v.string(),
    email: v.optional(v.string()),
    serviceEvidence: v.string(),
    sourceUrl: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_repairId", ["repairId"])
    .index("by_repairId_and_candidateKey", ["repairId", "candidateKey"]),

  outreach: defineTable({
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
    idempotencyKey: v.optional(v.string()),
    status: outreachStatus,
    providerMessageId: v.optional(v.string()),
    providerThreadId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  })
    .index("by_repairId", ["repairId"])
    .index("by_repairId_and_candidateId", ["repairId", "candidateId"])
    .index("by_providerMessageId", ["providerMessageId"])
    .index("by_providerThreadId", ["providerThreadId"]),

  replies: defineTable({
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
    externalMessageId: v.string(),
    providerEventId: v.optional(v.string()),
    rawText: v.string(),
    canTakeJob: v.union(v.boolean(), v.null()),
    arrivalText: v.union(v.string(), v.null()),
    priceAmount: v.union(v.number(), v.null()),
    currency: v.union(v.string(), v.null()),
    note: v.union(v.string(), v.null()),
    extractionStatus: v.optional(v.union(v.literal("ok"), v.literal("failed"))),
    extractionError: v.optional(v.string()),
    receivedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_repairId", ["repairId"])
    .index("by_candidateId", ["candidateId"])
    .index("by_externalMessageId", ["externalMessageId"])
    .index("by_providerEventId", ["providerEventId"]),

  repairEvents: defineTable({
    repairId: v.id("repairs"),
    type: eventType,
    candidateId: v.optional(v.id("candidates")),
    outreachId: v.optional(v.id("outreach")),
    replyId: v.optional(v.id("replies")),
    at: v.number(),
  }).index("by_repairId", ["repairId"]),
});
