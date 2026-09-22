import type { AgentMailMessage } from "./types";

const AGENTMAIL_BASE_URL = "https://api.agentmail.to/v0";

type AgentMailSendResult = {
  message_id: string;
  thread_id: string;
};

export type AgentMailClient = {
  sendMessage(input: {
    to: string;
    subject: string;
    text: string;
  }): Promise<AgentMailSendResult>;
  getMessage(inboxId: string, messageId: string): Promise<AgentMailMessage>;
};

function assertOk(response: Response, body: string, operation: string): void {
  if (response.ok) return;
  const suffix = body ? `: ${body.slice(0, 500)}` : "";
  throw new Error(`AgentMail ${operation} failed (${response.status})${suffix}`);
}

export function createAgentMailClient(input: {
  apiKey: string;
  inboxId: string;
  fetchImpl?: typeof fetch;
}): AgentMailClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const inboxId = input.inboxId.trim();

  if (!input.apiKey.trim()) throw new Error("AGENTMAIL_API_KEY is required");
  if (!inboxId) throw new Error("AGENTMAIL_INBOX_ID is required");

  const request = async (url: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await response.text();
    assertOk(response, body, "request");
    return body ? JSON.parse(body) : {};
  };

  return {
    async sendMessage(message) {
      const result = (await request(
        `${AGENTMAIL_BASE_URL}/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
        {
          method: "POST",
          body: JSON.stringify({
            to: message.to,
            subject: message.subject,
            text: message.text,
          }),
        },
      )) as Partial<AgentMailSendResult>;

      if (!result.message_id || !result.thread_id) {
        throw new Error("AgentMail send response did not include message_id and thread_id");
      }
      return { message_id: result.message_id, thread_id: result.thread_id };
    },

    async getMessage(messageInboxId, messageId) {
      const result = (await request(
        `${AGENTMAIL_BASE_URL}/inboxes/${encodeURIComponent(messageInboxId)}/messages/${encodeURIComponent(messageId)}`,
      )) as AgentMailMessage;
      return result;
    },
  };
}
