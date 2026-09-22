export type AgentMailWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function webhookSecretBytes(secret: string): Uint8Array {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  if (!encoded) throw new Error("AGENTMAIL_WEBHOOK_SECRET is empty");
  return decodeBase64(encoded);
}

export function readAgentMailWebhookHeaders(headers: Headers): AgentMailWebhookHeaders | null {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  return id && timestamp && signature ? { id, timestamp, signature } : null;
}

export async function verifyAgentMailWebhook(input: {
  secret: string;
  rawBody: string;
  headers: AgentMailWebhookHeaders;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const timestampSeconds = Number(input.headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    webhookSecretBytes(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${input.headers.id}.${input.headers.timestamp}.${input.rawBody}`;
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent)),
  );

  for (const token of input.headers.signature.split(" ")) {
    const [version, encoded] = token.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    try {
      if (constantTimeEqual(expected, decodeBase64(encoded))) return true;
    } catch {
      // Ignore malformed signatures and continue checking any remaining values.
    }
  }
  return false;
}
