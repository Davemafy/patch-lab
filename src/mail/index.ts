export { createAgentMailClient } from "./agentmail";
export { composeRepairOutreach } from "./compose";
export {
  handleAgentMailWebhookRequest,
  processAgentMailReceivedEvent,
  type InboundWebhookResult,
  type ReplyExtractor,
} from "./inbound";
export { extractReplyFacts, emptyReplyFacts } from "./openai";
export { sendRepairOutreach, type SendRepairOutreachResult } from "./outreach";
export type {
  InboundReplyRecord,
  MailCoreAdapter,
  OutreachClaim,
  OutreachCorrelation,
  ReplyFacts,
  SendRepairOutreachInput,
} from "./types";
export {
  readAgentMailWebhookHeaders,
  verifyAgentMailWebhook,
} from "./webhookVerification";
