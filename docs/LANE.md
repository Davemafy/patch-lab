# Chat 4 — Firecrawl Discovery

Repository:
https://github.com/Davemafy/patch-lab.git

Branch:
`lane/firecrawl`

You own finding a small number of plausible repair people/businesses from the public web with source-backed evidence.

Before changing code, read:
- docs/PRODUCT.md
- docs/TEAM.md
- src/domain/patch.ts
- hackathon.md

Do not redesign Patch.

## Mission

Given:
- the user's repair description
- useful repair/search context
- the user's area/location

return a small set of strong candidates that publicly appear to handle that kind of repair.

## Required output per candidate

Return fields equivalent to:

- name
- website
- contact email if publicly available
- serviceEvidence
- sourceUrl

Optional extra fields are fine only when they genuinely help the core flow.

## Truth boundary

Firecrawl can support claims such as:

> Door and lock repairs listed on their website.

It must NOT create claims such as:

- available today
- can take this job
- ₦12,000
- verified
- best nearby
- confirmed
- will arrive at 2 PM

Those facts only exist after a real reply.

## Search quality

Prefer:
- official business/service pages
- a few strong matches
- evidence text that a normal user can understand
- direct public contact details when available

Avoid:
- giant noisy directories when an official page is available
- made-up emails
- scraped claims with no source URL
- fake ranking language

If no public email is available, the candidate may still be useful as evidence, but clearly return email as missing.

## Integration

Expose one clean discovery entry point for the lead/core to call.

Do not create your own duplicate repair database.

If OpenAI-generated search context is useful, keep that dependency narrow and document it. Do not turn this lane into a second general AI agent.

## Failure behavior

Handle:
- no results
- Firecrawl API error
- malformed/partial pages
- candidate with no email
- duplicate business appearing from multiple URLs
- weak evidence

Return a graceful result the consumer UI can understand rather than throwing an opaque error.

## Do not build

- AgentMail
- inbound reply parsing
- consumer UI
- contractor accounts
- availability inference
- price inference

## Environment

Document required server-side env variables.
Do not expose Firecrawl credentials to the browser.

## Testing

At minimum verify:
- one realistic broken-doorknob search
- output is source-backed
- duplicate businesses are reduced
- missing email does not crash the result
- no candidate is marked available or quoted from web evidence
- API failure produces a useful error path

## Handoff

End with:
1. What I built
2. Files changed
3. Exact callable entry point
4. Output shape
5. Required env vars
6. What works
7. What still does not
8. Latest commit SHA

Ship working code to `lane/firecrawl`. Do not return only a plan.
