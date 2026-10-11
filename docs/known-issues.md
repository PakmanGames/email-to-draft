# Known Issues

Bugs, gaps, and accepted limitations found while building the MVP.
Add new entries at the bottom with the next ID, and update the status instead of deleting an entry.

Status values: **Open** (needs a fix), **Fixed** (say where), **Accepted** (known and left as is, with the reason).
Severity is about the rep's experience: **High** blocks a task or shows a wrong number, **Medium** is a dead end or confusing state with a workaround, **Low** is cosmetic or unlikely.

| ID | Title | Area | Severity | Status |
| --- | --- | --- | --- | --- |
| [KI-001](#ki-001-a-quantity-above-2147483647-fails-the-save-with-a-500) | A quantity above 2,147,483,647 fails the save with a 500 | Contracts, T4, T5 | Medium | Open |
| [KI-002](#ki-002-two-save-rules-live-outside-the-contracts) | Two save rules live outside the contracts | Contracts, T5 | Medium | Open |
| [KI-003](#ki-003-offer_missing-wins-over-already_saved-on-a-retry) | `OFFER_MISSING` wins over `ALREADY_SAVED` on a retry | T5 | Low | Open |
| [KI-004](#ki-004-an-unknown-draft-url-returns-http-200) | An unknown draft URL returns HTTP 200 | T5 | Low | Accepted |
| [KI-005](#ki-005-saved-times-are-blank-until-the-page-hydrates) | Saved times are blank until the page hydrates | T5 | Low | Accepted |
| [KI-006](#ki-006-no-automated-test-renders-the-quote-pages-from-the-database) | No automated test renders the quote pages from the database | T5, T7 | Low | Open |

---

### KI-001. A quantity above 2,147,483,647 fails the save with a 500

**Status:** Open. **Severity:** Medium. **Found in:** T5, PR #5.

`SaveQuoteRequest.lines[].quantity` has no upper bound, but `quote_line.quantity` is a Postgres `integer`.
A larger quantity passes validation, then the insert fails and `POST /api/quotes` answers 500.
Per PRD section 6 the review screen shows "Couldn't save" with Retry, and Retry fails the same way until the rep lowers the quantity.
Very large quantities across many lines could also push `total_cents` past `Number.MAX_SAFE_INTEGER`.

**Proposed fix:** add `.max(2_147_483_647)` (or a lower business cap) to `quantity` in `src/lib/contracts/quote.ts`, so the API answers 400, and cap the quantity input on the review screen to match.
This is a contract change, so it needs the contracts owner.

### KI-002. Two save rules live outside the contracts

**Status:** Open. **Severity:** Medium. **Found in:** T5, PR #5.

1. A save line must have both `partNumber` and `supplier`, or neither. `SaveQuoteRequest` allows one without the other, so T5 enforces the rule with a local refinement (`SaveQuoteBody` in `src/lib/quotes/index.ts`), and the route answers 400.
2. `POST /api/quotes` answers 400 for an invalid body and 404 for an unknown extraction, both with `{ error: string }`. Technical design 5.6 and `src/lib/contracts/api.ts` only describe the 201 and 409 bodies.

A client built from the contracts alone (T4) can't know either rule.

**Proposed fix:** move the refinement into `SaveQuoteRequest`, add the 400 and 404 bodies to `api.ts` and technical design 5.6, then have T5 import them.

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
