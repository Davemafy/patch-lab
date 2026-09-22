import {
  buildSearchQuery,
  discoverRepairCandidates,
  selectCandidates,
} from "./discovery.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function run() {
  const query = buildSearchQuery({
    description: "My bedroom doorknob is broken. The handle turns but the door won't open properly.",
    area: "Wuse 2, Abuja",
  });
  assert(query.toLowerCase().includes("door"), "doorknob search should contain door/lock context");
  assert(query.includes("Wuse 2, Abuja"), "search should include the user's area");

  const result = await discoverRepairCandidates(
    {
      repairId: "repair-1",
      description: "My bedroom doorknob is broken. The handle turns but the door won't open properly.",
      area: "Wuse 2, Abuja",
      limit: 3,
    },
    {
      apiKey: "fc-test",
      fetchImpl: async () =>
        jsonResponse({
          success: true,
          data: {
            web: [
              {
                title: "Tunde Locks & Doors | Abuja Locksmith",
                url: "https://tundelocks.test/services/door-repairs",
                markdown:
                  "# Door services\nWe repair door locks, handles and faulty latches for homes in Abuja. Available today from 2 PM for ₦12,000.\nContact hello@tundelocks.test for enquiries.",
              },
              {
                title: "Tunde Locks & Doors — Home",
                url: "https://www.tundelocks.test/",
                markdown: "Door lock repair and handle replacement services for homes.",
              },
              {
                title: "Good Fix Handyman",
                url: "https://goodfix.test/door-help",
                markdown: "Our handyman repair service includes door handles, knobs and hinges.",
              },
              {
                title: "Generic Directory",
                url: "https://yellowpages.com/example",
                markdown: "Door repair listings and handyman services.",
              },
              {
                title: "Weak Result",
                url: "https://weak.test/blog/doors",
                markdown: "A door can be made from wood or metal and comes in many styles.",
              },
            ],
          },
        }),
    },
  );

  assert(result.ok, "realistic doorknob search should return candidates");
  if (!result.ok) return;
  assert(result.candidates.length === 2, "duplicate business and weak/directory results should be reduced");
  assert(
    result.candidates[0]?.sourceUrl.startsWith("https://"),
    "every candidate should retain a source URL",
  );
  assert(
    result.candidates.some((candidate) => candidate.email === "hello@tundelocks.test"),
    "public email should be preserved when present",
  );
  assert(
    result.candidates.some((candidate) => candidate.email === undefined),
    "a missing public email must not crash or exclude an otherwise strong candidate",
  );

  const forbidden = /available today|can take this job|₦|verified|best nearby|confirmed|2\s*pm/i;
  for (const candidate of result.candidates) {
    assert(!forbidden.test(candidate.serviceEvidence), "web evidence must not invent reply-only facts");
  }

  const pureSelection = selectCandidates(
    [
      {
        title: "Door Pro",
        url: "https://doorpro.test/services",
        markdown: "We provide door lock repair and handle replacement services.",
      },
    ],
    "repair-2",
    { categoryTerms: ["door", "lock", "handle"], queryTerms: ["door", "lock"] },
    3,
  );
  assert(pureSelection.length === 1, "source-backed candidate selection should work independently");

  const apiFailure = await discoverRepairCandidates(
    { repairId: "repair-3", description: "leaking tap", area: "Gwarinpa, Abuja" },
    { apiKey: "fc-test", fetchImpl: async () => jsonResponse({ error: "boom" }, 500) },
  );
  assert(!apiFailure.ok && apiFailure.code === "firecrawl_error", "API errors should return a useful failure path");

  const noResults = await discoverRepairCandidates(
    { repairId: "repair-4", description: "faulty socket", area: "Maitama, Abuja" },
    {
      apiKey: "fc-test",
      fetchImpl: async () => jsonResponse({ success: true, data: { web: [] } }),
    },
  );
  assert(!noResults.ok && noResults.code === "no_results", "empty search should return no_results without throwing");

  console.log("Firecrawl discovery tests passed");
}

await run();
