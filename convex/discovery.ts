import { actionGeneric, anyApi } from "convex/server";
import { v } from "convex/values";
import { discoverRepairCandidates } from "../src/firecrawl/discovery.js";

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function outputText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("GPT-OSS returned no output text.");
}

async function understandRepair(description: string, area: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured in Convex.");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  const response = await fetch("https://api.groq.com/openai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "Turn a normal person's home-repair description into concise search context. Do not diagnose the root cause and do not claim urgency, price, availability, safety, or acceptance.",
      input: `Area: ${area}\nProblem: ${description}`,
      text: {
        format: {
          type: "json_schema",
          name: "repair_search_context",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["category", "searchQuery"],
            properties: {
              category: { type: "string" },
              searchQuery: { type: "string" },
            },
          },
        },
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`GPT-OSS search-context request failed (${response.status}): ${body.slice(0, 300)}`);
  const parsed = JSON.parse(outputText(JSON.parse(body) as ResponsesPayload)) as {
    category?: unknown;
    searchQuery?: unknown;
  };
  return {
    category: typeof parsed.category === "string" ? parsed.category.trim() : "",
    searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery.trim() : "",
  };
}

export const findRepairPeople = actionGeneric({
  args: { repairId: v.id("repairs") },
  handler: async (ctx, { repairId }) => {
    const view = await ctx.runQuery(anyApi.patch.getRepair, { repairId });
    if (!view?.repair) throw new Error("Repair not found.");

    await ctx.runMutation(anyApi.patch.markLooking, { repairId });

    let searchContext: string | undefined;
    try {
      const understood = await understandRepair(view.repair.description, view.repair.area);
      searchContext = understood.searchQuery || understood.category || undefined;
    } catch {
      // Firecrawl's deterministic repair profile is the safe fallback.
    }

    const result = await discoverRepairCandidates(
      {
        repairId: String(repairId),
        description: view.repair.description,
        area: view.repair.area,
        searchContext,
        limit: 4,
      },
      { apiKey: process.env.FIRECRAWL_API_KEY },
    );

    if (!result.ok) throw new Error(result.message);

    await ctx.runMutation(anyApi.patch.saveDiscoveredCandidates, {
      repairId,
      candidates: result.candidates.map((candidate) => ({
        candidateKey: candidate.id,
        name: candidate.name,
        website: candidate.website,
        ...(candidate.email ? { email: candidate.email } : {}),
        serviceEvidence: candidate.serviceEvidence,
        sourceUrl: candidate.sourceUrl,
      })),
    });

    const refreshed = await ctx.runQuery(anyApi.patch.getRepair, { repairId });
    return (refreshed?.candidates ?? []).map((candidate: any) => ({
      id: String(candidate.id),
      repairId: String(repairId),
      name: candidate.name,
      website: candidate.website,
      ...(candidate.email ? { email: candidate.email } : {}),
      serviceEvidence: candidate.serviceEvidence,
      sourceUrl: candidate.sourceUrl,
    }));
  },
});
