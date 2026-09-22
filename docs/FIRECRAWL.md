# Firecrawl discovery lane

Server-side discovery for Patch. This lane only establishes public evidence that a business appears to handle the reported repair. It never establishes current availability, price, acceptance, or arrival time.

## Callable entry point

```ts
import { discoverRepairCandidates } from "./src/firecrawl/discovery";

const result = await discoverRepairCandidates({
  repairId: repair.id,
  description: repair.description,
  area: repair.area,
  // Optional narrow phrase supplied by the caller, e.g. "locksmith door handle repair".
  searchContext,
  limit: 3,
});
```

`discoverRepairCandidates` returns a discriminated result and does not throw for ordinary Firecrawl/search failures.

Success:

```ts
{
  ok: true,
  query: string,
  candidates: Array<{
    id: string,
    repairId: string,
    name: string,
    website: string,
    email?: string,
    serviceEvidence: string,
    sourceUrl: string,
  }>
}
```

Failure:

```ts
{
  ok: false,
  candidates: [],
  query: string,
  code: "invalid_input" | "not_configured" | "firecrawl_error" | "no_results",
  message: string,
}
```

## Environment

Set this on the server only:

```bash
FIRECRAWL_API_KEY=fc-...
```

Do not expose it as a `VITE_` variable or call this module directly from browser code.

## Behavior

- Uses Firecrawl v2 search with web results and markdown content.
- Keeps a maximum of five strong candidates.
- Requires service evidence from returned page content before accepting a candidate.
- Deduplicates multiple pages from the same business/domain.
- Keeps a public email only when one is actually present in the returned content.
- Filters low-signal social/directory hosts.
- Converts source text into a service-fit-only evidence sentence so website copy about hours, price, or availability cannot become a Patch availability claim.
- Returns readable failure states for empty results, bad responses, and API errors.

## Local lane test

No new test dependency is required. From the repository root, compile and run the focused test with an installed TypeScript compiler:

```bash
rm -rf .firecrawl-test
tsc --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --strict --skipLibCheck --outDir .firecrawl-test src/firecrawl/discovery.ts src/firecrawl/discovery.test.ts
node .firecrawl-test/firecrawl/discovery.test.js
```

The test uses a mocked Firecrawl response; a real API key is only needed for live discovery.
