# Mock B

## Context

Customers send requests for quotes by email in every format you can imagine: tables, bullet lists, forwarded chains, NSNs only. A sales rep retypes each one into a quote, about 15 minutes per email, and the customer often buys from whoever answers first.

## Build

- Load the inventory into Postgres.
- A page where a rep pastes a raw email.
- Use an LLM to pull out the line items as JSON in a schema you define, validated with zod.
- Match each line item to inventory, exact first and then fuzzy, with a confidence the rep can understand.
- A review screen where the rep fixes quantities, picks between candidate parts or suppliers, removes or adds lines, then saves a draft quote priced from our inventory.

## One firm requirement

- The model will sometimes return garbage. Your app must not.

## What we'll look at

- How often the draft is right without edits.
- How quickly a rep can fix it when it isn't.
- What happens when things go wrong.

## Agreed scope

- One rep, clean inventory. No auth or per-rep drafts. Load inventory.csv with constraints that state the assumptions (NOT NULL, qty_on_hand >= 0). Qty 0 and a blank NSN (stored as NULL) are real values.
- Paste, extract, validate. One email at a time. Any LLM with structured output, validated with zod in TypeScript. The wait is visible and has a time limit. Each extraction is its own request, so a second tab can't interfere. Stack is your choice; SvelteKit is a plus.
- Match with a confidence the rep understands. Exact, then fuzzy, per line. The confidence belongs to the match, says why, and drives the screen: high is safe to skim, low makes the rep choose, no match says so and keeps the line.
- Review and save. Fix quantities, pick parts or suppliers, remove or add lines. Requested and on-hand shown side by side, never capped or split. Prices from inventory only. Drafts can hold unmatched lines, don't reserve stock, and open read-only from a list.
- Garbage never reaches the rep or the database. Malformed, plausible-but-wrong, or no output: no crash, nothing saved without a human seeing it, the rep can always finish, and you can trace what happened. Emails are untrusted. One failure handled live in the demo.