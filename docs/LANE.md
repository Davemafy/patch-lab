# Chat 5 — Frontend / Consumer Experience

Repository:
https://github.com/Davemafy/patch-lab.git

Branch:
`lane/frontend`

You own everything a normal person sees.

Before changing code, read:
- docs/PRODUCT.md
- docs/TEAM.md
- src/domain/patch.ts
- hackathon.md

Do not redesign Patch.

## Mission

Make Patch understandable in about five seconds and make the entire repair journey feel like a polished consumer utility rather than a hackathon dashboard.

Core journey:

**tell Patch what broke → find people → ask for price/time → receive replies → choose someone**

## Required states

### Home
Immediate understanding.

A direction such as:
> Something broke?

> Tell Patch what happened. We’ll get you real prices and times from people who can fix it.

Primary action:
> Tell Patch what broke

### Report
Only ask for what matters:
- description
- area/location
- optional photo

Do not make a long form.

### Looking
Human progress state such as:
> Finding people who handle this kind of repair

No fake percentages or pretend progress.

### People found
Show a few candidates with honest source-backed evidence.

Example:
> Door and lock repairs listed on their website.

Make source inspectable.

Do not show availability or price yet.

Primary action:
> Ask for price and time

### Waiting
Example:
> We’ve asked 3 people.

Replies should be able to appear one by one without the page feeling broken.

### Replies / options
Real reply-derived facts become the main material.

Example:

**Tunde**  
Today, around 2 PM  
₦12,000

If price or time was not stated, say so naturally rather than inventing it.

Let the user inspect the original reply if useful.

### Choose
Question:
> Who should take the job?

Do not frame this like an admin approval panel.

### Done
Example:
> Tunde is coming today around 2 PM.

Keep it satisfying and simple.

## Writing standard

Human. Specific. Calm. Confident.

Avoid user-facing words such as:
- provider
- workflow
- webhook
- mutation
- extraction
- orchestration
- inference
- pipeline
- state machine
- agent

Bad:
> Provider response received

Good:
> Tunde can come today around 2 PM.

Bad:
> Outreach initiated

Good:
> We’ve asked 3 people.

Bad:
> Select provider

Good:
> Who should take the job?

## Visual direction

Mobile-first, polished consumer utility.

Aim for:
- excellent typography
- strong hierarchy
- generous spacing
- restrained surfaces
- obvious primary action
- clear difference between web evidence and real-person replies
- good waiting/error/empty states
- desktop that feels intentionally composed, not just stretched mobile

Avoid:
- gradient soup
- glowing blobs
- card-on-card layouts
- pills everywhere
- fake live indicators
- tiny grey copy
- generic SaaS dashboard
- decorative metrics/charts
- unnecessary sidebar
- all-caps microcopy everywhere
- excessive explanations

## Integration boundary

Build against the shared domain vocabulary.

Where backend functions are not merged yet:
- isolate temporary adapters/mocks cleanly
- do not fake the final external loop as if it were real
- make it easy for the lead to replace temporary data with live Convex calls

Do not create a second backend model.

## Do not build

- payments
- maps
- contractor accounts
- landlord dashboard
- ratings/reviews marketplace
- generic AI chat
- analytics dashboard

## QA

At minimum check:
- mobile viewport
- desktop viewport
- long repair description
- no candidates
- candidates without email
- waiting with zero replies
- one reply while others are pending
- reply with no price
- reply with vague timing
- chosen state
- refresh behavior once live backend is connected
- no important text is tiny
- no placeholder copy visible to judges

## Handoff

End with:
1. What I built
2. Files changed
3. Screens/states covered
4. Any temporary adapters/mocks the lead must replace
5. What works
6. What still does not
7. Latest commit SHA

Ship working code to `lane/frontend`. Do not return only a plan.
