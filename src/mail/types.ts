import type { RepairPersonCandidate, RepairRequest } from "../domain/patch";

export type ReplyFacts = {
  canTakeJob: boolean | null;
  arrivalText: string | null;
  priceAmount: number | null;
  currency: string | null;
  note: string | null;
};

export type OutreachClaim =
  | { status: "claimed"; claimId: string }
  | {
      status: "already_sent";
      messageId: string;
      threadId: string;
    }
  | { status: "in_flight" };

export type OutreachCorrelation = {
  repairId: string;
  candidateId: string;
};

export type InboundReplyRecord = OutreachCorrelation & {
  eventId: string;
  messageId: string;
  threadId: string;
  rawText: string;
  facts: ReplyFacts;
  extractionStatus: "ok" | "failed";
  extractionError: string | null;
  receivedAt: number;
};

export interface MailCoreAdapter {
  /** Must atomically prevent two sends for the same repair/candidate pair. */
  claimOutreachSend(input: OutreachCorrelation): Promise<OutreachClaim>;
  completeOutreachSend(input: {
    claimId: string;
    messageId: string;
    threadId: string;
  }): Promise<void>;
  failOutreachSend(input: { claimId: string; error: string }): Promise<void>;

  /** Resolve an AgentMail conversation back to Patch-owned repair state. */
  findOutreachByThread(threadId: string): Promise<OutreachCorrelation | null>;

  /** Must atomically dedupe by eventId and/or messageId before storing. */
  recordInboundReply(
    input: InboundReplyRecord,
  ): Promise<{ status: "stored" | "duplicate" }>;
}

export type SendRepairOutreachInput = {
  repair: RepairRequest;
  candidate: RepairPersonCandidate;
};

export type AgentMailMessage = {
  inbox_id: string;
  thread_id: string;
  message_id: string;
  timestamp?: string;
  from?: string | string[];
  to?: string[];
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
  extracted_text?: string;
  extracted_html?: string;
};

export type AgentMailReceivedEvent = {
  type: "event";
  event_type: "message.received";
  event_id: string;
  message: AgentMailMessage;
  thread?: {
    inbox_id?: string;
    thread_id?: string;
  };
};
