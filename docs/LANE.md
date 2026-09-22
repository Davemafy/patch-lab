# Chat 3 — AgentMail + OpenAI

Repository:
https://github.com/Davemafy/patch-lab.git

Branch:
`lane/mail-openai`

You own the real conversation with repair people.

Before changing code, read:
- docs/PRODUCT.md
- docs/TEAM.md
- src/domain/patch.ts
- hackathon.md

Do not redesign Patch.

## Mission

A repair person should receive an ordinary email, reply normally, and have that reply appear back in Patch without needing a Patch account.

## AgentMail responsibilities

Build the real outbound/inbound path.

Outbound message should sound human, for example:

> Hi, someone nearby needs help with a bedroom doorknob. The handle turns but the door isn’t opening properly.
>
> Are you available today or tomorrow?
>
> If so, please reply with when you could come and roughly what you’d charge.

Do not leak internal language into the message.

Track enough identity to correlate:
- repair
- candidate
- AgentMail thread/message
- inbound event/message

## OpenAI responsibilities

Use OpenAI narrowly to extract only facts actually present in an inbound reply.

Return fields equivalent to:

- canTakeJob: true | false | null
- arrivalText: string | null
- priceAmount: number | null
- currency: string | null
- note: string | null

Rules:
- never invent a price
- never invent a time
- never turn vague wording into stronger certainty
- preserve the raw reply
- if extraction fails, keep the raw reply and leave structured facts empty or explicitly failed

Example:

Reply:
> Yes, around 2 should work. Callout is 12k.

Good:
- canTakeJob: true
- arrivalText: "around 2"
- priceAmount: 12000
- currency: "NGN"

Reply:
> I should be able to help. Call me tomorrow.

Do not manufacture a price. Preserve the ambiguity.

## Webhook/inbound path

Implement the actual AgentMail inbound mechanism.

Validate webhook input appropriately.
If AgentMail provides a signing mechanism, verify it.
Do not trust arbitrary browser requests as repair-person replies.

Deduplicate by stable inbound identifiers.

## Integration boundary

Use the core lane's repair operations when available.

If the core lane is not merged yet:
- keep your adapter boundaries small
- document exactly what function signature the lead must connect
- do not recreate a parallel database model

## Do not build

- Firecrawl discovery
- the main consumer UI
- contractor accounts
- in-app chat
- auto-booking
- payments

## Environment

Document every required server-side variable in your handoff.
Never put sponsor secrets in browser-exposed variables.

Likely examples:
- AGENTMAIL_API_KEY
- AGENTMAIL_INBOX_ID
- AGENTMAIL_WEBHOOK_SECRET
- OPENAI_API_KEY
- OPENAI_MODEL if needed

## Testing

At minimum verify:
- outbound request can be created from real repair/candidate data
- repeated send is safely rejected or idempotent
- inbound payload can be correlated
- duplicate inbound event/message is ignored
- raw reply is preserved
- extraction returns null rather than guessing missing values
- extraction failure still preserves the message
- a reply can be handed to the core repair store

## Handoff

End with:
1. What I built
2. Files changed
3. Exact callable entry points
4. Required env vars
5. Webhook setup instructions
6. What works
7. What still does not
8. Latest commit SHA

Ship working code to `lane/mail-openai`. Do not return only a plan.
