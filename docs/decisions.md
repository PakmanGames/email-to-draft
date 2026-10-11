# Decision Log

Each entry records a choice, the alternatives considered, and the trade-off accepted.
This doubles as the outline for the 30-minute presentation.
Add new entries at the bottom, and mark superseded ones instead of deleting them.

Status values: **Accepted**, **Proposed** (waiting on an open question in the PRD), **Superseded**.

---

### D-001. Next.js with TypeScript instead of SvelteKit

**Status:** Accepted

**Context:** The brief lists SvelteKit as a plus. The project has a 3-hour budget, and some of the work is done by sub-agents.

**Decision:** Next.js App Router with TypeScript, as one service for both the UI and the API.

**Alternatives:** SvelteKit (preferred by the brief); a separate API server.

**Trade-off:** We give up the SvelteKit bonus in exchange for familiarity and speed, plus the shadcn/ui component library for the review table. One service means one deploy and one place for zod contracts.

### D-002. GroqCloud `openai/gpt-oss-120b` with strict JSON schema, still validated with zod

**Status:** Accepted (provider confirmed and model tested on 2026-10-11)

**Context:** The available key is on a free plan. Strict structured output is supported on Groq only for the `gpt-oss` and `qwen3` models.

**Decision:** `openai/gpt-oss-120b` with `strict: true`, called through the OpenAI-compatible API.

**Alternatives:** The 20B model (same rate limits, less accurate); JSON object mode (valid JSON, but no schema enforcement); the Vercel AI SDK `generateObject` (hides the raw output we want to trace).

**Trade-off:** Strict mode guarantees shape, not meaning, and truncated output can still break JSON, so zod validation is still required. The free plan's 8K tokens per minute limits throughput, which is fine for one rep. A live test returned a 5-line extraction in 1.5 s (technical design section 6, probe results).

### D-003. The model transcribes, code decides

**Status:** Accepted

**Context:** "The model will sometimes return garbage" and "plausible-but-wrong" output must not reach the rep.

**Decision:** The model returns identifiers, quantities, and units exactly as written. Code does NSN normalization, unit conversion, grounding checks, matching, confidence, and pricing.

**Alternatives:** Ask the model to normalize and match directly.

**Trade-off:** More code to write, but every number the rep sees is reproducible and testable, and a confused model can only produce flagged lines, never wrong prices.

### D-004. Grounding check on every extracted identifier

**Status:** Accepted

**Context:** A hallucinated part number that happens to exist in inventory would be a confident, wrong line.

**Decision:** Every part number and NSN must appear (after normalization) in the email text. Ungrounded identifiers are dropped and the line is flagged.

**Trade-off:** A part number split across lines in the email could be falsely dropped. That is acceptable, because the rep sees the warning and the source text.

### D-005. Parts and offers as two tables

**Status:** Accepted

**Context:** The CSV has one row per (part, supplier). The rep picks a part, then a supplier.

**Decision:** A `part` table (part number, NSN, description) and an `offer` table (supplier, stock, cost, lead time), with constraints that encode the clean-data assumptions.

**Alternatives:** One table mirroring the CSV.

**Trade-off:** The loader has to group rows and check consistency, but the domain is clearer and the "one NSN and description per part" assumption is enforced instead of implied.

### D-006. Fuzzy matching inside Postgres with `pg_trgm`

**Status:** Accepted

**Context:** Typos, missing dashes, and description-only requests need fuzzy matching against 12,000 parts.

**Decision:** Trigram similarity on a normalized part number key and on descriptions, with GIN indexes. `levenshtein()` is used only to explain matches in rep-friendly words.

**Alternatives:** In-memory fuzzy search in Node (Fuse.js); embeddings.

**Trade-off:** It ties matching to Postgres, but stays fast, indexed, and free of extra infrastructure. Embeddings are overkill for part numbers.

### D-007. Three confidence levels, each with a reason

**Status:** Accepted

**Context:** "A confidence the rep can understand" that "drives the screen".

**Decision:** High, Low, or None, never a raw score. High only comes from a single unambiguous exact match. Every level carries a one-sentence reason.

**Trade-off:** It hides nuance (a 95% fuzzy match is still Low), but it is honest and maps directly onto what the rep has to do.

### D-008. Server re-prices on save and snapshots the result

**Status:** Accepted

**Context:** "Prices from inventory only", and emails may contain instructions to change prices.

**Decision:** The save request has no price field. The server looks up each offer, copies its details onto the line, and computes the total. Lines do not reference the offer table.

**Trade-off:** Saved drafts do not follow later inventory changes, which is the point of a draft quote. The inventory can be reloaded without breaking old drafts.

### D-009. Client-generated quote ID makes saving idempotent

**Status:** Accepted

**Context:** Double clicks and retries after network errors should not create duplicate drafts.

**Decision:** The review page generates a UUID when it opens. Saving with an existing ID returns the existing draft.

**Trade-off:** None worth noting for a single rep.

### D-010. Every extraction is persisted before the model is called

**Status:** Accepted

**Context:** "You can trace what happened."

**Decision:** An `extraction` row is written as `pending` first, then updated with every attempt's raw output, errors, timing, and the final result.

**Trade-off:** We store email text and raw model output, which is fine for this scope but would need a retention policy in production.

### D-011. Money as integer cents

**Status:** Accepted

**Decision:** `numeric(12,2)` in the database, integer cents in TypeScript, and no floats anywhere money is added up.

### D-012. Drizzle ORM with raw SQL where it matters

**Status:** Accepted

**Decision:** A typed schema and migrations with drizzle-kit. The trigram queries are written as raw `sql`.

**Alternatives:** Prisma (heavier, and awkward with extensions and generated columns); plain SQL files with no types.
