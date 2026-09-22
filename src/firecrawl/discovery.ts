import type { RepairPersonCandidate } from "../domain/patch.js";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const DEFAULT_LIMIT = 5;
const SEARCH_LIMIT = 10;

export type RepairDiscoveryInput = {
  repairId: string;
  description: string;
  area: string;
  /** Optional narrow context such as "locksmith door handle repair". */
  searchContext?: string;
  limit?: number;
};

export type RepairDiscoveryFailureCode =
  | "invalid_input"
  | "not_configured"
  | "firecrawl_error"
  | "no_results";

export type RepairDiscoveryResult =
  | {
      ok: true;
      candidates: RepairPersonCandidate[];
      query: string;
    }
  | {
      ok: false;
      candidates: [];
      query: string;
      code: RepairDiscoveryFailureCode;
      message: string;
    };

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type FirecrawlDiscoveryOptions = {
  apiKey?: string;
  fetchImpl?: FetchLike;
};

type FirecrawlWebResult = {
  url?: unknown;
  title?: unknown;
  description?: unknown;
  markdown?: unknown;
};

type FirecrawlSearchResponse = {
  success?: unknown;
  data?: {
    web?: unknown;
  };
  error?: unknown;
};

type RepairProfile = {
  categoryTerms: string[];
  queryTerms: string[];
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "bedroom",
  "broken",
  "cannot",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "need",
  "open",
  "properly",
  "repair",
  "that",
  "their",
  "there",
  "this",
  "turns",
  "when",
  "will",
  "with",
  "wont",
  "would",
]);

const SERVICE_TERMS = [
  "repair",
  "repairs",
  "fix",
  "fixes",
  "replacement",
  "replace",
  "installation",
  "install",
  "maintenance",
  "service",
  "services",
  "locksmith",
  "handyman",
  "plumber",
  "plumbing",
  "electrician",
  "electrical",
  "carpenter",
  "carpentry",
  "hvac",
];

const CATEGORY_PROFILES: Array<{
  match: RegExp;
  terms: string[];
}> = [
  {
    match: /\b(door|doorknob|door knob|handle|lock|key|latch)\b/i,
    terms: ["door", "lock", "locksmith", "handle", "knob", "latch"],
  },
  {
    match: /\b(tap|faucet|sink|toilet|leak|pipe|drain|plumb)\w*\b/i,
    terms: ["plumbing", "plumber", "tap", "faucet", "sink", "toilet", "leak", "pipe", "drain"],
  },
  {
    match: /\b(socket|outlet|switch|wire|wiring|electric|power)\w*\b/i,
    terms: ["electrical", "electrician", "socket", "outlet", "switch", "wiring"],
  },
  {
    match: /\b(ac|air conditioner|air conditioning|hvac|cooling)\b/i,
    terms: ["air conditioning", "air conditioner", "ac repair", "hvac", "cooling"],
  },
  {
    match: /\b(cabinet|cupboard|hinge|carpenter|woodwork)\w*\b/i,
    terms: ["cabinet", "cupboard", "hinge", "carpentry", "carpenter", "handyman"],
  },
];

export async function discoverRepairCandidates(
  input: RepairDiscoveryInput,
  options: FirecrawlDiscoveryOptions = {},
): Promise<RepairDiscoveryResult> {
  const repairId = input.repairId.trim();
  const description = input.description.trim();
  const area = input.area.trim();
  const query = buildSearchQuery(input);

  if (!repairId || !description || !area) {
    return failure(
      query,
      "invalid_input",
      "Patch needs a repair id, repair description, and area before looking for repair people.",
    );
  }

  const apiKey = options.apiKey ?? readServerApiKey();
  if (!apiKey) {
    return failure(
      query,
      "not_configured",
      "Repair search is not configured yet. Set FIRECRAWL_API_KEY on the server.",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: SEARCH_LIMIT,
        sources: [{ type: "web" }],
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
    });
  } catch {
    return failure(
      query,
      "firecrawl_error",
      "Patch could not reach repair search right now. Try again in a moment.",
    );
  }

  if (!response.ok) {
    return failure(
      query,
      "firecrawl_error",
      `Patch could not search for repair people right now (search returned ${response.status}).`,
    );
  }

  let payload: FirecrawlSearchResponse;
  try {
    payload = (await response.json()) as FirecrawlSearchResponse;
  } catch {
    return failure(
      query,
      "firecrawl_error",
      "Patch got an unreadable response while looking for repair people.",
    );
  }

  if (payload.success === false) {
    return failure(
      query,
      "firecrawl_error",
      "Patch could not search for repair people right now. Try again in a moment.",
    );
  }

  const rawResults = Array.isArray(payload.data?.web)
    ? (payload.data?.web as FirecrawlWebResult[])
    : [];
  const profile = buildRepairProfile(description, input.searchContext);
  const limit = clampLimit(input.limit);
  const candidates = selectCandidates(rawResults, repairId, profile, limit);

  if (candidates.length === 0) {
    return failure(
      query,
      "no_results",
      "Patch did not find a strong public match for this repair yet. Try a nearby area or a little more detail about what broke.",
    );
  }

  return { ok: true, candidates, query };
}

export function buildSearchQuery(input: Pick<RepairDiscoveryInput, "description" | "area" | "searchContext">): string {
  const profile = buildRepairProfile(input.description, input.searchContext);
  const context = input.searchContext?.trim();
  const repairTerms = context || profile.queryTerms.slice(0, 6).join(" ") || input.description.trim();
  return `${repairTerms} repair service ${input.area.trim()} contact`.replace(/\s+/g, " ").trim();
}

export function selectCandidates(
  results: FirecrawlWebResult[],
  repairId: string,
  profile: RepairProfile,
  limit = DEFAULT_LIMIT,
): RepairPersonCandidate[] {
  const byBusiness = new Map<string, { candidate: RepairPersonCandidate; score: number }>();

  for (const result of results) {
    const sourceUrl = asHttpUrl(result.url);
    if (!sourceUrl || isLowSignalHost(sourceUrl.hostname)) continue;

    const markdown = stringValue(result.markdown);
    const description = stringValue(result.description);
    const evidenceSource = markdown || description;
    if (!evidenceSource) continue;

    const evidence = findServiceEvidence(evidenceSource, profile);
    if (!evidence) continue;

    const name = businessName(stringValue(result.title), sourceUrl.hostname);
    const email = findPublicEmail(evidenceSource);
    const hostKey = normalizeHostname(sourceUrl.hostname);
    const score = evidence.score + (markdown ? 2 : 0) + (email ? 1 : 0);
    const candidate: RepairPersonCandidate = {
      id: candidateId(repairId, hostKey),
      repairId,
      name,
      website: sourceUrl.origin,
      ...(email ? { email } : {}),
      serviceEvidence: evidence.text,
      sourceUrl: sourceUrl.toString(),
    };

    const existing = byBusiness.get(hostKey);
    if (!existing || score > existing.score) {
      byBusiness.set(hostKey, { candidate, score });
    }
  }

  return [...byBusiness.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, clampLimit(limit))
    .map(({ candidate }) => candidate);
}

function buildRepairProfile(description: string, searchContext?: string): RepairProfile {
  const text = `${description} ${searchContext ?? ""}`.toLowerCase();
  const categories = CATEGORY_PROFILES.filter(({ match }) => match.test(text)).flatMap(({ terms }) => terms);
  const freeTerms = tokenize(text).filter((term) => !STOP_WORDS.has(term));
  const categoryTerms = unique([...categories, ...freeTerms]).slice(0, 18);
  const queryTerms = unique([...categories.slice(0, 8), ...freeTerms]).slice(0, 12);
  return { categoryTerms, queryTerms };
}

function findServiceEvidence(
  source: string,
  profile: RepairProfile,
): { text: string; score: number } | null {
  const lines = source
    .replace(/\r/g, "\n")
    .split(/\n+|(?<=[.!?])\s+/)
    .map(cleanEvidenceText)
    .filter((line) => line.length >= 18 && line.length <= 420);

  let best: { text: string; score: number } | null = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    const matchedRepairTerms = profile.categoryTerms.filter((term) => includesTerm(lower, term));
    const serviceHits = SERVICE_TERMS.filter((term) => includesTerm(lower, term)).length;
    if (matchedRepairTerms.length === 0 || serviceHits === 0) continue;

    const score = matchedRepairTerms.length * 3 + Math.min(serviceHits, 2) * 2 - (line.length > 220 ? 1 : 0);
    if (!best || score > best.score) {
      best = { text: safeEvidenceSummary(matchedRepairTerms), score };
    }
  }

  return best;
}

function findPublicEmail(source: string): string | undefined {
  const matches = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const match of matches) {
    const email = match.replace(/[),.;:]+$/, "").toLowerCase();
    if (email.includes("example.com") || email.endsWith("@sentry.io")) continue;
    return email;
  }
  return undefined;
}

function asHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isLowSignalHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "x.com",
    "twitter.com",
    "youtube.com",
    "yelp.com",
    "yellowpages.com",
  ].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function businessName(title: string, hostname: string): string {
  const cleaned = title
    .split(/\s+[|–—-]\s+/)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  if (cleaned && cleaned.length >= 2 && cleaned.length <= 90) return cleaned;

  return normalizeHostname(hostname)
    .split(".")[0]
    ?.split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || normalizeHostname(hostname);
}

function candidateId(repairId: string, host: string): string {
  const slug = host.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${repairId}:${slug}`;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function cleanEvidenceText(value: string): string {
  return value
    .replace(/[#*_>`~]+/g, " ")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function safeEvidenceSummary(matchedTerms: string[]): string {
  const terms = unique(matchedTerms)
    .filter((term) => !["repair", "service", "services"].includes(term))
    .slice(0, 2);
  const label = terms.length === 0
    ? "Repair services"
    : `${terms.map(titleCaseTerm).join(" and ")} repair services`;
  return `${label} are listed on the source page.`;
}

function titleCaseTerm(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function includesTerm(text: string, term: string): boolean {
  if (term.includes(" ")) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}[a-z]*\\b`, "i").test(text);
}

function tokenize(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((part) => part.replace(/^-+|-+$/g, ""))
    .filter((part) => part.length >= 3);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(5, Math.floor(limit as number)));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function failure(
  query: string,
  code: RepairDiscoveryFailureCode,
  message: string,
): RepairDiscoveryResult {
  return { ok: false, candidates: [], query, code, message };
}

function readServerApiKey(): string | undefined {
  const processLike = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return processLike?.env?.FIRECRAWL_API_KEY?.trim() || undefined;
}
