# Patch Lab team contract

Five chats, one product, one merge authority.

## Branches

- `main` — Chat 1 lead / integrator
- `lane/core-convex` — Chat 2
- `lane/mail-openai` — Chat 3
- `lane/firecrawl` — Chat 4
- `lane/frontend` — Chat 5

Every lane starts from the same commit. Do not redesign Patch.

## Ownership

### Chat 1 — Lead / integrator
Owns shared contracts, package/config, README, hackathon.md, final merges, deployment, and fixes between lanes.

### Chat 2 — Core / Convex
Owns repair state, candidates, outreach records, replies, selection, demo reset, and live query behavior.

Required behavior:
- duplicate reply does not create duplicate data
- duplicate send does not send twice
- a late reply cannot undo a user's chosen repair person

### Chat 3 — AgentMail + OpenAI
Owns sending ordinary emails, receiving replies, conservative extraction of price/time/availability, and preserving the original reply.

### Chat 4 — Firecrawl
Owns finding plausible repair businesses and source-backed evidence that they publicly handle the relevant repair.

Never claim availability, price, or acceptance from website content.

### Chat 5 — Frontend
Owns the consumer experience:
report → looking → people found → waiting → replies → choose → done.

No technical language in the UI.

## Handoff format

Every lane ends with:
1. What I built
2. Files changed
3. What works
4. What still does not
5. Setup/env required
6. Branch name + latest commit SHA

Ship code, not a prose-only plan.
