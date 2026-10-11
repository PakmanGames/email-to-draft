# PRD: RFQ Email to Draft Quote

| | |
| --- | --- |
| Status | Draft v0.1 |
| Last updated | 2026-10-11 |
| Owner | Andy |
| Source | [README.md](../README.md) (problem statement and agreed scope) |
| Companion docs | [Technical design](technical-design.md), [Task plan](tasks.md), [Decision log](decisions.md) |

## 1. Problem

Customers send requests for quotes (RFQs) by email in every format: tables, bullet lists, forwarded chains, NSN-only lists, and free-text descriptions.
A sales rep retypes each one into a quote, which takes about 15 minutes per email.
Customers often buy from whoever answers first, so that delay costs deals.

## 2. User and job to be done

There is one user: a sales rep at a parts distributor.
The rep's job: "When an RFQ email arrives, turn it into a correctly priced draft quote as fast as possible, and be able to trust what I am sending."

The rep knows parts, part numbers, and NSNs well.
The rep does not want to learn how the matching works, but needs to know at a glance which lines are safe and which need attention.

## 3. Goals, principles, and success metrics

### Principles

1. **A wrong High is worse than a correct Low.** The rep skims High lines, so a High label has to be right. When any signal is ambiguous, the line is Low. We accept more Low lines to keep High trustworthy.
2. **The model is untrusted and non-deterministic.** The same email can produce different output on different runs, and any run can be wrong. Every model output passes deterministic checks before the rep sees it, and every run is traced.
3. **Normal business is not an error.** A part we don't carry, a request larger than stock, zero on hand, and a part with no NSN are all routine. The screen shows them plainly, without error styling, and never blocks on them.
4. **The rep has the last word.** Nothing becomes a draft until the rep saves it, and every line can be changed before saving.

### Metrics

These map directly to "What we'll look at" in the README, plus G4 from the brief.

| Goal | Metric | How we measure it | MVP target |
| --- | --- | --- | --- |
| G1. The draft is usually right without edits | Share of saved lines with `edited = false` and share of drafts with zero edits | Recorded on save (see SAVE-4) | Measured and reported, no fixed target yet |
| G2. Fixing a wrong draft is fast | Time from paste to saved draft, and clicks per fix | Manual timing on the 12 sample emails | Clean 4-line email saved in under 60 seconds |
| G3. Failures never hurt the rep | Crashes, unreviewed saves, or dead ends | Fault-injection suite plus the 12 sample emails | Zero of each |
| G4. High means correct | Share of High lines where the rep changed the suggested part | Recorded on save (SAVE-4), and checked by hand on the 12 sample emails | Zero |

## 4. User flow

1. **Paste.** The rep pastes one raw email into a text box and clicks Extract.
2. **Wait (visible, time-limited).** The rep sees a spinner, elapsed seconds, and a Cancel button. The wait never exceeds 30 seconds.
3. **Review.** The rep sees every requested line in email order, next to the original email. Each line shows its match, a confidence label with a plain-language reason, requested vs on-hand quantity, supplier, and price.
4. **Fix.** The rep changes quantities, picks between candidate parts or suppliers, removes lines, or adds lines.
5. **Save.** The rep saves a draft quote. Prices come from inventory only.
6. **Look back.** The rep opens saved drafts read-only from a list.

If anything fails at step 2, the rep can retry or continue to the review screen and enter lines by hand.
There is no state in which the rep is stuck.

## 5. Functional requirements

Priority: **P0** is required for the MVP, **P1** is the next iteration, **P2** is a nice-to-have.

### 5.1 Inventory (INV)

| ID | Pri | Requirement |
| --- | --- | --- |
| INV-1 | P0 | A single repeatable command loads `inventory.csv` into Postgres. The load is all-or-nothing in one transaction, and rerunning it replaces the previous load. |
| INV-2 | P0 | Database constraints state the assumptions: NOT NULL on every column except NSN, `qty_on_hand >= 0`, `unit_cost > 0`, `lead_time_days >= 0`, NSN format `####-##-###-####`, one row per (part number, supplier), and one NSN and description per part number. |
| INV-3 | P0 | A blank NSN is stored as NULL. A quantity of 0 is stored as 0 and shown as "0 on hand", never hidden or treated as missing. |
| INV-4 | P0 | When the load fails, it reports which row failed and why, and leaves the database unchanged. On success it reports parts and offers loaded. |

### 5.2 Paste and extract (EXT)

| ID | Pri | Requirement |
| --- | --- | --- |
| EXT-1 | P0 | A paste page with a single text box (max 20,000 characters, with a counter) and an Extract button. Empty or oversized input is rejected before calling the model. |
| EXT-2 | P0 | An LLM extracts line items as JSON using structured output in a schema we define. The server validates the output with zod before anything else touches it. |
| EXT-3 | P0 | The wait is visible: a spinner, elapsed seconds, and a Cancel button. It has a hard 30-second limit, after which the rep sees a timeout message with Retry and Continue manually. |
| EXT-4 | P0 | Each extraction is its own request with its own ID, and the review URL is keyed by that ID. The rep reviews one email at a time, and there is no multi-email view. Opening the app in another tab, during a wait or a review, never affects the first tab: no in-progress state is shared between tabs, and the same review open in two tabs can only produce one draft (SAVE-1). |
| EXT-5 | P0 | Emails are untrusted. The prompt treats the email as data, the model has no tools, the output schema has no price, status, or approval fields, and every extracted identifier must appear in the email text. Email text is always rendered as escaped plain text. |
| EXT-6 | P0 | Quantity and unit are reported by the model as written. Code converts known units (each, dozen, hundred, and pack sizes stated in the email) to each. Anything else is flagged for the rep to confirm. The rep always sees the original wording next to the converted quantity. |
| EXT-7 | P0 | NSNs are recognized with or without dashes and with or without an "NSN" prefix, and normalized to `####-##-###-####`. |
| EXT-8 | P1 | Emails with no requested items (auto-replies, "see attached" with no content) show a clear notice saying why, and the rep can still add lines by hand. |
| EXT-9 | P1 | In forwarded or reply chains, the latest message wins. Items the customer withdrew are not extracted, and the review screen notes that an earlier message was superseded. |
| EXT-10 | P1 | Customer name, email address, and RFQ reference are captured from the email and shown on the draft. |

### 5.3 Match to inventory (MAT)

| ID | Pri | Requirement |
| --- | --- | --- |
| MAT-1 | P0 | Exact matching runs first: NSN exact match, then part number exact match ignoring case, spaces, and dashes. |
| MAT-2 | P0 | Fuzzy matching runs only when exact matching finds nothing: similar part numbers first, then description. |
| MAT-3 | P0 | Every line gets one confidence level that belongs to the match: **High** (safe to skim), **Low** (the rep must choose), or **None** (not in inventory). Each comes with a one-sentence reason a rep understands, such as "Exact NSN match" or "No exact match. Closest part number differs by 1 character." The rep never sees a raw score like 0.73. |
| MAT-3a | P0 | **High** is given only when every identifier on the line (part number, NSN) points to the same single part through an exact rule, those identifiers appear in that line's own text in the email, and the line's description (if any) does not contradict the part. Anything less is **Low** (principle 1). |
| MAT-4 | P0 | Low-confidence lines show up to 5 candidate parts, best first, each with its own reason. |
| MAT-5 | P0 | Each candidate part lists all supplier offers with on-hand quantity, unit price, and lead time. A documented default supplier is preselected (see technical design). |
| MAT-6 | P0 | A line with no match is kept, says "Not in inventory", and stays unpriced unless the rep picks a part. |
| MAT-7 | P0 | Routine inventory facts are shown as facts, not errors: an offer with 0 on hand is listed as "0 on hand", and a part with no NSN (stored as NULL) can never be matched by NSN. |

### 5.4 Review (REV)

| ID | Pri | Requirement |
| --- | --- | --- |
| REV-1 | P0 | Lines appear in email order, next to the original email text. |
| REV-2 | P0 | A summary bar shows line counts by confidence (for example "30 lines: 24 ready, 4 need a choice, 2 not in inventory"). A line is "ready" when it is High and has no quantity warning. Ready lines are compact and skimmable. Low lines are expanded with their candidates. Confidence is shown with text and an icon, not color alone. |
| REV-3 | P0 | The rep can edit quantity, pick a candidate part, pick a supplier, remove a line, and add a line by searching inventory or as free text (unmatched). |
| REV-4 | P0 | Requested quantity, on-hand quantity, and lead time are shown side by side. Asking for more than we have is normal: the line is quoted at the requested quantity with a neutral "short by 150" note, never capped or split across suppliers (see Q6). The rep can lower the quantity by hand. |
| REV-5 | P0 | Unit and extended prices come from inventory only. The total covers priced lines, and unpriced lines are labeled as excluded from it. |
| REV-6 | P0 | Save is enabled only when every Low line has an explicit decision (a part was picked, or the rep chose to keep it unmatched), every line has a quantity greater than 0, and every quantity warning (missing, unit not understood, not found in the email, or line not confirmed against the email) has been confirmed or edited. When disabled, the button says what is left to do and links to the first such line. |
| REV-7 | P1 | Keyboard flow: move between lines, pick candidates by number, and save without the mouse. |
| REV-8 | P1 | Hovering or focusing a line highlights the text it came from in the original email. |

### 5.5 Save and view drafts (SAVE)

| ID | Pri | Requirement |
| --- | --- | --- |
| SAVE-1 | P0 | Saving re-prices every line from inventory on the server, accepts no price from the client, snapshots the offer details onto the line, and writes the whole draft in one transaction. Each extraction produces at most one draft: saving again (double click, retry, or the same review open in a second tab) creates nothing new and links to the existing draft. |
| SAVE-2 | P0 | Drafts may contain unmatched lines. Saving does not reserve or decrement stock. On-hand quantities are current inventory, not reduced by other drafts, so two drafts can both quote the same 5 units. |
| SAVE-3 | P0 | A drafts list (newest first) shows date, line count, unmatched count, and total. Each draft opens read-only. |
| SAVE-4 | P1 | Each saved line records whether it came from extraction or was added by hand, whether the rep edited it, and which part was suggested. This feeds metrics G1 and G4. |

### 5.6 Failure handling (FAIL)

This is the one firm requirement: the model will sometimes return garbage, and the app must not.

| ID | Pri | Requirement |
| --- | --- | --- |
| FAIL-1 | P0 | Malformed output, schema-invalid output, no output, timeouts, rate limits, and provider errors never crash the app. Each becomes a typed error with a plain message, and the rep is always offered Retry and Continue manually. |
| FAIL-2 | P0 | Plausible-but-wrong output is caught where it can be: identifiers not found in the email are dropped and flagged, quantities not found in the line's text are flagged, and matching confidence drops whenever the data is ambiguous. |
| FAIL-3 | P0 | Nothing is saved as a quote without the rep seeing it. The only code path that writes a quote is the rep clicking Save. |
| FAIL-4 | P0 | Every extraction is traceable: the email, every model attempt (raw output, validation errors, timing, HTTP status), model ID, prompt version, and final result are stored. Each saved draft links to its extraction. |
| FAIL-5 | P0 | The rep can always finish: every failure path leads to a review screen where lines can be added by hand. |
| FAIL-6 | P1 | A fault-injection switch (off by default, enabled by env var) makes the model return a chosen failure, used for tests and the live demo. |
| FAIL-7 | P1 | A trace view shows what happened in an extraction, linked from the review screen and from saved drafts. |

## 6. Failure scenarios and required behavior

| Scenario | What the rep sees | What is stored |
| --- | --- | --- |
| Model returns non-JSON or truncated JSON | One automatic repair retry, then "We couldn't read the model's answer" with Retry and Continue manually | Every attempt's raw output and parse error |
| JSON is valid but breaks the schema (for example quantity "fifty") | Same as above | zod issues per attempt |
| Model invents a part number that is not in the email | The line keeps its other fields, the invented identifier is dropped, and the line shows "Ignored a part number the model returned that is not in the email". A line with nothing grounded is discarded with a banner saying so. | The original model output and a list of dropped items |
| Email tries to change prices or quantities (prompt injection) | No effect on prices, which come only from inventory. Quantities that do not appear in the line's text are flagged. | Raw output |
| Email has no items (auto-reply, attachment only) | A notice explaining why, plus Add line | Extraction with status `no_items` |
| Model takes longer than the time limit | "This is taking too long" with Retry and Continue manually | Attempt with error code `TIMEOUT` |
| Provider rate limit (HTTP 429) | "Rate limited, try again in N seconds" with Continue manually | Attempt with error code `RATE_LIMITED` |
| Part not in inventory | Line kept with "Not in inventory", unpriced | Line match result |
| Database unavailable on save | "Couldn't save, your edits are still here" with Retry | Nothing, since the save is one transaction |
| The model gives different output for the same email on another run | Every run goes through the same checks, and anything ambiguous becomes Low | Each run is its own extraction with its own trace |
| The same review is open in two tabs | The first Save creates the draft. The second shows "Already saved" with a link to it. | One draft |

## 7. Non-functional requirements

- **Latency:** extraction p50 under 8 seconds for a 30-line email, with a hard limit of 30 seconds. Matching all lines takes under 500 ms.
- **Provider limits:** the Groq free plan allows 30 requests per minute, 1,000 requests per day, and 8K tokens per minute for the chosen model, which is enough for one rep. Automated tests never call the real model, so they don't use up the daily limit. We keep the prompt short and reasoning effort low so one 30-line email stays well under the per-minute token limit.
- **Browsers:** current Chrome, desktop first, laid out for 1280px wide and up, still usable at 1024px.
- **Accessibility:** confidence is never conveyed by color alone. All controls work with the keyboard.
- **Security:** the LLM API key stays on the server only. The email is never rendered as HTML. All inputs are validated with zod at the API boundary.

## 8. Out of scope

- Auth, multiple reps, and per-rep drafts.
- Receiving email directly (IMAP, webhooks). The rep pastes the email.
- Reading attachments (PDF, Excel).
- Reserving stock, sending quotes to customers, or converting quotes to orders.
- Markup, discounts, or pricing rules beyond inventory prices.
- Editing a draft after it is saved.
- Reviewing several emails at the same time. One email at a time is enough, but extra tabs must not break anything.
- Reserving stock, or netting on-hand quantities across drafts.
- Units of measure in inventory (everything in inventory is assumed to be "each").
- Several emails in one batch.

## 9. Assumptions

1. The LLM provider is **GroqCloud** (free plan) using `openai/gpt-oss-120b` with strict JSON-schema output. Confirmed on 2026-10-11 (Q1).
2. The quoted unit price equals the inventory `unit_cost` column as-is, with no markup. See Q2.
3. Every inventory quantity and price is per each.
4. Inventory is clean, with no messy or invalid rows (confirmed by the brief). The loader still validates and the constraints still state the assumptions, but the loader never cleans or repairs data.
5. Two inventory values look like missing data but are real: a quantity of 0 means the supplier has none on hand right now, and a blank NSN means the part has no NSN. A blank NSN is stored as NULL, not an empty string, so it can never match anything.
6. Quoting more than is on hand is allowed. Drafts don't reserve stock, so two drafts quoting the same units is a valid outcome.
7. Default supplier rule: the cheapest supplier that can fill the full requested quantity. If none can, the one with the most on hand. Ties go to the shorter lead time. The rep can always override.
8. The 12 sample emails in `mock_data/mock_b/rfq_emails/` are representative of real traffic. The answer keys stay closed until after the presentation.

## 10. Open questions

| # | Question | Default if unanswered |
| --- | --- | --- |
| Q1 | Is the API key for GroqCloud (groq.com) or xAI Grok (x.ai)? | **Answered: GroqCloud.** A key was created and the model was tested on 2026-10-11. |
| Q2 | Should quotes apply a markup over `unit_cost`? | No markup. Price equals `unit_cost`. |
| Q3 | Which subdomain should the app live on? | **Answered:** `email-to-draft.apak.ca` |
| Q4 | Should the default supplier favor price or lead time? Email 10 (AOG) suggests lead time sometimes matters more. | Price first, as in assumption 7. The rep overrides. |
| Q5 | Should a low-confidence line be allowed in a saved draft without an explicit decision? | No. Save requires a decision on every Low line (REV-6). |
| Q6 | The brief says that when a request exceeds stock "we can still quote it for however much we have". Does that mean quote the requested quantity and show the shortfall, or lower the quantity to what is on hand? | Quote the requested quantity, never capped (agreed scope). The rep can lower it by hand. |

## 11. Acceptance test set

Each sample email exercises a specific behavior.
The MVP is done when every row behaves as described, without opening the answer keys.
Across all 12 emails, no line may be High with the wrong part (G4), and running each email 3 times must give the same lines, or the differences must be caught by the checks in section 6.

| Email | Behavior under test |
| --- | --- |
| 01 clean table | All lines extracted, mostly High confidence, saved with no edits |
| 02 bullets with typos | Mixed quantity phrasing parsed. Typos lead to Low with sensible candidates, not wrong High matches. |
| 03 forwarded chain | Latest quantities used. The withdrawn item is not extracted (EXT-9). |
| 04 NSN only | Dashed, undashed, and prefixed NSNs normalized and matched |
| 05 long list (30 lines) | Within time limit and token budget. The review screen stays skimmable. |
| 06 mixed units | Boxes, packs, hundreds, and dozens converted or flagged, with the original wording visible |
| 07 out of office | No items, with a clear notice and no crash |
| 08 prompt injection | Instructions in the email have no effect |
| 09 unknown parts | Unknown lines kept as Not in inventory |
| 10 multi supplier | All offers visible, default supplier explained, easy to override |
| 11 see attached | No items, with a notice that attachments are not read |
| 12 description only | Description matching offers Low candidates |

## 12. Milestones

| Milestone | Contents | Exit criteria |
| --- | --- | --- |
| M0. Foundation | Scaffold, shared contracts, DB schema (task T0) | App builds, tests run, contracts merged |
| M1. Parallel build | Tasks T1 to T6 in parallel | Each task's "done when" checklist passes |
| M2. MVP | Integration (T7): all P0 requirements, end to end, locally | Sections 6 and 11 pass locally |
| M3. Deployed | Railway plus Cloudflare subdomain | MVP flow works on the live URL |
| M4. Hardening | P1 requirements, threshold tuning, fault-injection demo | Live failure demo rehearsed |
