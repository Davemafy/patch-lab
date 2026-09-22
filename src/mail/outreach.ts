import { composeRepairOutreach } from "./compose";
import type { AgentMailClient } from "./agentmail";
import type { MailCoreAdapter, SendRepairOutreachInput } from "./types";

export type SendRepairOutreachResult =
  | { status: "sent"; messageId: string; threadId: string }
  | { status: "already_sent"; messageId: string; threadId: string }
  | { status: "in_flight" };

export async function sendRepairOutreach(input: {
  data: SendRepairOutreachInput;
  core: MailCoreAdapter;
  agentMail: AgentMailClient;
}): Promise<SendRepairOutreachResult> {
  const { repair, candidate } = input.data;
  if (candidate.repairId !== repair.id) {
    throw new Error("Candidate does not belong to the repair request");
  }
  if (!candidate.email?.trim()) {
    throw new Error("Candidate has no email address");
  }

  const claim = await input.core.claimOutreachSend({
    repairId: repair.id,
    candidateId: candidate.id,
  });

  if (claim.status === "already_sent") {
    return {
      status: "already_sent",
      messageId: claim.messageId,
      threadId: claim.threadId,
    };
  }
  if (claim.status === "in_flight") return { status: "in_flight" };

  const message = composeRepairOutreach(repair, candidate);
  let sent: Awaited<ReturnType<AgentMailClient["sendMessage"]>>;
  try {
    sent = await input.agentMail.sendMessage({
      to: candidate.email,
      subject: message.subject,
      text: message.text,
    });
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    await input.core.failOutreachSend({ claimId: claim.claimId, error: failure });
    throw error;
  }

  // Once AgentMail has returned stable IDs, never release the claim here. If the
  // core write fails, keeping the claim in-flight is safer than sending twice.
  await input.core.completeOutreachSend({
    claimId: claim.claimId,
    messageId: sent.message_id,
    threadId: sent.thread_id,
  });
  return { status: "sent", messageId: sent.message_id, threadId: sent.thread_id };
}
