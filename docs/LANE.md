# Chat 2 — Core / Convex

Repository:
https://github.com/Davemafy/patch-lab.git

Branch:
`lane/core-convex`

You own Patch's durable repair truth and live state.

Before changing code, read:
- docs/PRODUCT.md
- docs/TEAM.md
- src/domain/patch.ts
- hackathon.md

Do not redesign Patch. Do not touch frontend or sponsor integration files unless required to expose a clean contract.

## Mission

Build the smallest reliable Convex core that supports the frozen journey:

**report → looking → waiting → options_ready → chosen**

## Own these responsibilities

- schema
- repair creation
- repair retrieval
- live query shape for the frontend
- storing discovered repair candidates
- storing source evidence
- storing outreach attempts
- storing inbound replies
- storing extracted reply facts
- choosing a repair person
- repair history/events where useful
- photo storage support if it remains simple
- deterministic demo reset

## Required behavior

Implement public operations with clear names. The exact file layout is yours, but the lead should be able to call capabilities equivalent to:

- create repair
- get repair
- save discovered candidates
- mark outreach started/sent/failed
- record inbound reply
- choose repair person
- generate upload URL if photo support is included
- reset demo data

## Reliability rules

1. Duplicate inbound replies must not create duplicate records.
2. Duplicate outreach attempts must not create a second sendable outreach record for the same repair/candidate.
3. A late reply may be stored after the user chooses someone, but it must never undo or replace the chosen person.
4. Repair state must survive refresh.
5. Missing or partial candidate/reply data must not crash the live query.
6. Keep enough IDs to support idempotency from AgentMail event/message identifiers.

## Shared data contract

Keep the vocabulary in `src/domain/patch.ts` unless a real implementation constraint requires a change.

If you must change it:
- make the smallest change
- update all types you own
- document the reason in your handoff
- tell the lead before expecting another lane to depend on it

## Do not build

- email sending
- Firecrawl search
- OpenAI extraction
- consumer UI
- payments
- booking automation
- contractor accounts

## Testing

At minimum verify:
- Convex code typechecks
- repair can be created
- repair query returns a coherent view
- candidates can be added
- duplicate outreach is blocked
- duplicate reply is ignored or safely folded
- selection persists
- late reply cannot undo selection
- reset works without removing external configuration

## Handoff

End with:
1. What I built
2. Files changed
3. Public functions/actions/queries the other lanes should call
4. What works
5. What still does not
6. Setup/env required
7. Latest commit SHA

Ship working code to `lane/core-convex`. Do not return only a plan.
