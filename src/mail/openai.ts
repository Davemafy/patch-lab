import type { ReplyFacts } from "./types";

const AI_RESPONSES_URL = "https://api.groq.com/openai/v1/responses";

const EMPTY_FACTS: ReplyFacts = {
  canTakeJob: null,
  arrivalText: null,
  priceAmount: null,
  currency: null,
  note: null,
};

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    canTakeJob: {
      type: ["boolean", "null"],
      description:
        "True only when the sender clearly says they can take the repair, false only when they clearly decline, otherwise null.",
    },
    arrivalText: {
      type: ["string", "null"],
      description:
        "An exact short substring from the reply describing when they could come. Null if no arrival/visit time is actually stated.",
    },
    priceAmount: {
      type: ["number", "null"],
      description:
        "Numeric quoted or approximate price only when the reply actually states one. Null when absent.",
    },
    currency: {
      type: ["string", "null"],
      description:
        "ISO-style currency code such as NGN, USD, GBP only when the reply gives enough evidence to identify it. Null when unknown.",
    },
    note: {
      type: ["string", "null"],
      description:
        "A short exact or minimally normalized fact needed to preserve an important condition or ambiguity from the reply. Null if none.",
    },
  },
  required: ["canTakeJob", "arrivalText", "priceAmount", "currency", "note"],
  additionalProperties: false,
} as const;

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function responseText(payload: ResponsesPayload): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateFacts(value: unknown, rawText: string): ReplyFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_FACTS;
  const input = value as Record<string, unknown>;

  const canTakeJob =
    typeof input.canTakeJob === "boolean" ? input.canTakeJob : null;
  const requestedArrival = nullableString(input.arrivalText);
  const arrivalText =
    requestedArrival && rawText.toLocaleLowerCase().includes(requestedArrival.toLocaleLowerCase())
      ? requestedArrival
      : null;
  const priceAmount =
    typeof input.priceAmount === "number" &&
    Number.isFinite(input.priceAmount) &&
    input.priceAmount >= 0
      ? input.priceAmount
      : null;
  const currency = nullableString(input.currency)?.toUpperCase() ?? null;
  const note = nullableString(input.note);

  return { canTakeJob, arrivalText, priceAmount, currency, note };
}

export async function extractReplyFacts(input: {
  apiKey: string;
  model: string;
  rawText: string;
  fetchImpl?: typeof fetch;
}): Promise<ReplyFacts> {
  if (!input.rawText.trim()) return EMPTY_FACTS;
  if (!input.apiKey.trim()) throw new Error("GROQ_API_KEY is required");
  if (!input.model.trim()) throw new Error("GROQ_MODEL is required");

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(AI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      instructions: [
        "Extract only facts explicitly present in a repair person's email reply.",
        "Never invent or infer a price, visit time, acceptance, or currency.",
        "Vague language must stay vague. If a field is not supported by the reply, return null.",
        "arrivalText must be copied verbatim from the reply, not rewritten.",
        "Do not treat a greeting, politeness, or willingness to talk later as accepting the job.",
      ].join(" "),
      input: input.rawText,
      text: {
        format: {
          type: "json_schema",
          name: "repair_reply_facts",
          strict: true,
          schema: REPLY_SCHEMA,
        },
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GPT-OSS extraction failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = JSON.parse(body) as ResponsesPayload;
  const text = responseText(payload);
  if (!text) throw new Error("GPT-OSS response did not contain output text");

  return validateFacts(JSON.parse(text), input.rawText);
}

export function emptyReplyFacts(): ReplyFacts {
  return { ...EMPTY_FACTS };
}
