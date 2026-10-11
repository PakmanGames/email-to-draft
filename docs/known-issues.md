# Known Issues

Bugs, gaps, and accepted limitations found while building the MVP.
Add new entries at the bottom with the next ID, and update the status instead of deleting an entry.

Status values: **Open** (needs a fix), **Fixed** (say where), **Accepted** (known and left as is, with the reason).
Severity is about the rep's experience: **High** blocks a task or shows a wrong number, **Medium** is a dead end or confusing state with a workaround, **Low** is cosmetic or unlikely.

| ID | Title | Area | Severity | Status |
| --- | --- | --- | --- | --- |
| [KI-001](#ki-001-a-quantity-above-2147483647-fails-the-save-with-a-500) | A quantity above 2,147,483,647 fails the save with a 500 | Contracts, T4, T5 | Medium | Fixed |
| [KI-002](#ki-002-two-save-rules-live-outside-the-contracts) | Two save rules live outside the contracts | Contracts, T4, T5 | Medium | Open |
| [KI-003](#ki-003-offer_missing-wins-over-already_saved-on-a-retry) | `OFFER_MISSING` wins over `ALREADY_SAVED` on a retry | T5 | Low | Open |
| [KI-004](#ki-004-an-unknown-draft-url-returns-http-200) | An unknown draft URL returns HTTP 200 | T5 | Low | Accepted |
| [KI-005](#ki-005-saved-times-are-blank-until-the-page-hydrates) | Saved times are blank until the page hydrates | T5 | Low | Accepted |
| [KI-006](#ki-006-no-automated-test-renders-the-quote-pages-from-the-database) | No automated test renders the quote pages from the database | T5, T7 | Low | Open |
| [KI-007](#ki-007-description-candidates-can-all-share-one-description) | Description candidates can all share one description | T3 | Medium | Open |
| [KI-008](#ki-008-extra-words-in-a-description-can-make-a-part-we-carry-show-as-not-in-inventory) | Extra words in a description can make a part we carry show as Not in inventory | T2, T3 | Medium | Open |
| [KI-009](#ki-009-low-lines-have-no-default-supplier-for-their-candidates) | Low lines have no default supplier for their candidates | Contracts, T3, T4 | Medium | Fixed |
| [KI-010](#ki-010-technical-design-section-7-doesnt-describe-three-matching-choices) | Technical design section 7 doesn't describe three matching choices | Docs, T3 | Low | Open |
| [KI-011](#ki-011-the-500-ms-matching-budget-is-checked-by-hand) | The 500 ms matching budget is checked by hand | T3, T7 | Low | Open |
| [KI-012](#ki-012-a-failure-after-the-model-answers-is-a-500-with-no-extraction-id) | A failure after the model answers is a 500 with no extraction ID | Contracts, T2, T4 | Medium | Fixed |
| [KI-013](#ki-013-a-malformed-extraction-request-answers-empty_input) | A malformed extraction request answers `EMPTY_INPUT` | Contracts, T2 | Low | Accepted |
| [KI-014](#ki-014-an-email-with-a-nul-character-can-never-be-extracted) | An email with a NUL character can never be extracted | T2 | Medium | Fixed |

---

### KI-001. A quantity above 2,147,483,647 fails the save with a 500

**Status:** Fixed in the API (PR #9) and the review screen (T4, PR #10). **Severity:** Medium. **Found in:** T5, PR #5.

`SaveQuoteRequest.lines[].quantity` had no upper bound, but `quote_line.quantity` is a Postgres `integer`.
A larger quantity passed validation, then the insert failed and `POST /api/quotes` answered 500 with no body, on every retry.
Extraction doesn't bound quantities either, so an injected "qty 99999999999" or a misread PO number could reach Save this way.

**Fix:** `MAX_LINE_QUANTITY` (2,147,483,647) in `src/lib/contracts/quote.ts` caps `quantity`, so the API answers 400 with an error that names the line, like `lines[1].quantity`.

**Fixed in T4:** the review screen's save gate (REV-6) treats a quantity above `MAX_LINE_QUANTITY` like a quantity of 0.
The line counts as needing a quantity, so Save stays disabled and the rep fixes it before saving, the same as an empty quantity box.

**Not fixed:** at the 1000% markup cap, a line at the maximum quantity of a part costing more than about $3,800 can push `total_cents` past `Number.MAX_SAFE_INTEGER`, so the stored total could be off by a few cents.
The draft would already show a total in the hundreds of trillions of dollars, so this is left as is.

### KI-002. Two save rules live outside the contracts

**Status:** Open for the contracts. The review screen follows both rules (T4, PR #10). **Severity:** Medium. **Found in:** T5, PR #5.

1. A save line must have both `partNumber` and `supplier`, or neither. `SaveQuoteRequest` allows one without the other, so T5 enforces the rule with a local refinement (`SaveQuoteBody` in `src/lib/quotes/index.ts`), and the route answers 400.
2. `POST /api/quotes` answers 400 for an invalid body and 404 for an unknown extraction, both with `{ error: string }`. Technical design 5.6 and `src/lib/contracts/api.ts` only describe the 201 and 409 bodies.

A client built from the contracts alone (T4) can't know either rule.

**Handled in T4:** a review line can only name a part and a supplier together, and a test checks the save requests it builds against `SaveQuoteBody`.
The review screen reads the `{ error }` body of a 400 or 404 with its own schema in `src/components/review/save-draft.ts`.
A 400 says the server rejected the draft and logs the server's reason, without offering a retry that would get the same answer.
A 404 says the extraction no longer exists, links to the paste page, and stops further saves.

**Proposed fix:** move the refinement into `SaveQuoteRequest`, add the 400 and 404 bodies to `api.ts` and technical design 5.6, then have T5 import them.
T4 then replaces its local error schema with the contract one.

### KI-003. `OFFER_MISSING` wins over `ALREADY_SAVED` on a retry

**Status:** Open. **Severity:** Low. **Found in:** T5, PR #5.

`saveQuote` follows the order in technical design 9: it checks offers first, then inserts with `ON CONFLICT (extraction_id) DO NOTHING`.
Suppose a save succeeds, inventory is reloaded without one of its offers, and the same review is saved again (a double click or a second tab).
The second save answers `OFFER_MISSING` instead of `ALREADY_SAVED`, even though a draft exists.
It is not a dead end: after the rep fixes the line and saves again, the answer is `ALREADY_SAVED` with a link to the draft.

**Proposed fix:** look up an existing draft for the extraction before checking offers, and update technical design 9 to match.

### KI-004. An unknown draft URL returns HTTP 200

**Status:** Accepted. **Severity:** Low. **Found in:** T5, PR #5.

`/quotes/[quoteId]` streams its static header before the draft is read, so when `notFound()` runs inside the `<Suspense>` boundary, the status code is already 200.
The page still shows "Draft not found", and Next.js adds a `noindex` tag.
This is documented Next.js 16 behavior (see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`).

**Reason for accepting:** it is an internal tool with no crawlers, and no client relies on the status code of this page.
If it ever matters, check that the draft exists in Proxy before the page renders.

### KI-005. Saved times are blank until the page hydrates

**Status:** Accepted. **Severity:** Low. **Found in:** T5, PR #5.

The server doesn't know the rep's timezone, so `LocalDateTime` (`src/components/quotes/local-date-time.tsx`) renders no text on the server and fills in local time during hydration.
On a full page load, the Saved column is briefly empty.
Client-side navigations render the time straight away.

**Reason for accepting:** showing server time (UTC on Railway) would be wrong for the rep, and the gap only lasts until hydration.
If it becomes a problem, store the browser's timezone in a cookie and format on the server.

### KI-006. No automated test renders the quote pages from the database

**Status:** Open. **Severity:** Low. **Found in:** T5, PR #5.

The T5 card asks for the list and detail pages to render from seeded data and show the short-stock warning.
Component tests cover the views with data in the shape the queries return, and the pages were checked by hand against a production build with a seeded database.
No automated test loads `/quotes` or `/quotes/[quoteId]` from a real database, because `e2e/` belongs to T7.

**Proposed fix:** T7's Playwright suite should seed a draft with a short-stock line and assert both pages show the warning.

### KI-007. Description candidates can all share one description

**Status:** Open. **Severity:** Medium. **Found in:** T3, PR #8.

Only 558 descriptions cover the 12,000 parts, about 21 parts each.
The description rule returns the top 5 parts, so all five slots often hold the same description.
For "AS568-214 o-rings" in sample email 12, all five candidates are "GASKET AS568-214", and "PACKING,PREFORMED AS568-214" (the actual o-ring) only turns up with a search.
For the hose line in the same email, the repeats help: all five candidates are the right -6 x 24 size.

**Proposed fix:** decide in T7, with the full email set, whether to show one part per description (or at most two), and which part to show for each, for example the one whose offers best fill the quantity.

### KI-008. Extra words in a description can make a part we carry show as Not in inventory

**Status:** Open. **Severity:** Medium. **Found in:** T3, PR #8.

The description rule scores how much of the customer's text appears in our description, so words that aren't about the part pull the score down.
"-6 hose assemblies, 24 inch" scores 0.51 and finds the right hoses, but "-6 hose assemblies, 24 inch, same as last order" scores 0.36, below the 0.40 threshold, and the line shows "Not in inventory".
Whether it happens depends on what the model puts in `description`.
The rep can still find the part with the search box, but "Not in inventory" is routine, neutral styling, so nothing prompts them to look.

**Proposed fix:** either a prompt rule in T2 that `description` holds only what describes the item, or also score the reverse direction (how much of our description appears in the customer's text) and take the higher score.
Measure either one against the sample emails before choosing.

### KI-009. Low lines have no default supplier for their candidates

**Status:** Fixed in T4, PR #10. **Severity:** Medium. **Found in:** T3, PR #8.

`LineMatch` has one `defaultSupplier`, and matching sets it only for High lines, because a Low line has no chosen part yet.
When the rep picks a candidate on a Low line, the review screen has to choose a supplier itself, or the line stays unpriced until the rep picks one.
Likewise, when the rep changes the quantity on a High line, the default supplier and its reason ("Cheapest supplier that can fill 10") no longer match the new quantity.
`pickDefaultSupplier(offers, quantityEach)` in `src/lib/matching/default-supplier.ts` is the same rule, pure and safe to import in client components.

**Fix:** the review screen calls `pickDefaultSupplier` when the rep picks a candidate or a part found by search, and when the quantity changes, including through "Quote N on hand".
Once the rep picks a supplier, a quantity change leaves it alone, so the line keeps the rep's choice.
Each automatic pick shows its reason next to the supplier, so the reason always matches the current quantity.
A default supplier on each `Candidate` was the alternative, but it is a contract change and still goes stale when the quantity changes.

### KI-010. Technical design section 7 doesn't describe three matching choices

**Status:** Open. **Severity:** Low. **Found in:** T3, PR #8.

1. Descriptions are compared with `strict_word_similarity`, not `word_similarity`. The plain version matches across word boundaries: "o-ring" scored 0.57 against "BEARING,ROLLER", and "resistor 4.7k" ranked TRANSISTOR first.
2. When a line has a description, the description rule searches with the part number in front of it, so spec numbers like "AS568-214", which only appear in our descriptions, find parts. A part number alone is never searched against descriptions, because a short one like "QQ-1" scores 0.40 against any "1/2-20" description.
3. When a part number and a shared NSN together point to exactly one part, the line is High. An NSN alone that covers several parts is still Low.

The final thresholds also differ from the starting values in section 7: part number fuzzy 0.40 and description contradiction 0.30.
`src/lib/matching/thresholds.ts` gives the measurements behind each.

**Proposed fix:** update section 7 when PR #8 merges.

### KI-011. The 500 ms matching budget is checked by hand

**Status:** Open. **Severity:** Low. **Found in:** T3, PR #8.

The budget was checked by hand on the shared dev database: 30 description-only lines, the worst case, took about 197 ms, and 30 exact lines took about 2 ms.
No automated test checks it, because the full inventory isn't in git.
Production runs Postgres 18 on Railway, where the timing hasn't been measured.
If it's slower, scoring the 558 distinct descriptions once instead of all 12,000 parts measured 84 ms for the same worst case.

**Proposed fix:** T7 times `matchLines` in `pnpm eval:emails` or on the deployed app.

### KI-012. A failure after the model answers is a 500 with no extraction ID

**Status:** Fixed in T2, PR #7, and on the paste page (T4, PR #10). **Severity:** Medium. **Found in:** T2, PR #7.

If `matchLines` or the final database write threw, `POST /api/extractions` marked the row `failed`, kept the model's attempts in it, and rethrew, so Next.js answered 500 with no JSON body.
Without an extraction ID, the paste page couldn't offer Continue manually, which FAIL-5 requires.
`ExtractionErrorCode` had no code for a failure past the model, so the route had nothing typed to answer with.

**Fix:** `ExtractionErrorCode` has a new `INTERNAL_ERROR` code (contracts and technical design 5.5).
The route catches any failure after input validation, logs it, and answers 500 `INTERNAL_ERROR` with the extraction ID.
When the database allows it, the row is stored as `failed` with the model's attempts and the same zero-line `EXTRACTION_FAILED` seed as for other failures.
Only a failed insert answers without an ID, since nothing was recorded.
The paste page shows `INTERNAL_ERROR` as "Something went wrong on the server." with Retry, plus Continue manually when the answer has an extraction ID.

### KI-013. A malformed extraction request answers `EMPTY_INPUT`

**Status:** Accepted. **Severity:** Low. **Found in:** T2, PR #7.

A `POST /api/extractions` body that isn't JSON, or has no `emailText` string, is treated as an email with no text and answers 400 `EMPTY_INPUT`.
`ExtractionErrorCode` has no code for a malformed request.

**Reason for accepting:** the only client is the paste page, which always sends `{ emailText }`, and the answer is still a typed 400.
Technical design 6, step 1 documents it.

### KI-014. An email with a NUL character can never be extracted

**Status:** Fixed in T2, PR #7. **Severity:** Medium. **Found in:** T2, PR #7.

Postgres `text` can't store a NUL character (`invalid byte sequence for encoding "UTF8": 0x00`), so inserting the extraction row failed for any email containing one, and every retry failed the same way.
Nothing was recorded, so there was no Continue manually, and the rep can't see the character to delete it.
Text copied from some PDFs and older systems can carry one.

**Fix:** `POST /api/extractions` drops NUL characters along with the surrounding whitespace before validating, so the email is extracted normally (technical design 6, step 1).
