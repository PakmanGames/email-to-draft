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

**Context:** "A confidence the rep can understand" that "drives the screen". A raw score like 0.73 means nothing to a rep. The brief adds that a wrong High costs more than a Low on a line that was already right, because the rep skims High lines.

**Decision:** High, Low, or None, never a raw score, each with a one-sentence reason. High is a gate: exactly one part from an exact rule, every identifier on the line agreeing, the line confirmed against its own email text, and no contradicting description. Anything else is Low.

**Trade-off:** More correct lines land in Low and cost the rep a click to confirm, which is the cheaper mistake. A 95% fuzzy match is still Low. We track how often reps change a High suggestion (PRD metric G4) to check that the gate is tight enough.

### D-008. Server re-prices on save and snapshots the result

**Status:** Accepted

**Context:** "Prices from inventory only", and emails may contain instructions to change prices.

**Decision:** The save request has no price field. The server looks up each offer, prices it from cost and the draft's markup (D-016), copies cost, price, and offer details onto the line, and computes the total. Lines do not reference the offer table.

**Trade-off:** Saved drafts do not follow later inventory changes, which is the point of a draft quote. The inventory can be reloaded without breaking old drafts.

### D-009. Client-generated quote ID makes saving idempotent

**Status:** Superseded by D-013

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

### D-013. One draft per extraction

**Status:** Accepted

**Context:** The brief requires that nothing breaks when the rep opens another tab. With a client-generated quote ID (D-009), the same review open in two tabs would save two drafts of one email.

**Decision:** `quote.extraction_id` is NOT NULL and UNIQUE. A second save for the same extraction returns `ALREADY_SAVED` with a link to the existing draft. The client no longer generates IDs.

**Alternatives:** Client-generated ID (D-009); locking a review to one tab.

**Trade-off:** To quote the same email again, the rep pastes it again, which creates a new extraction. That is rare, and it keeps every draft tied to exactly one trace.

### D-014. Treat the model as non-deterministic

**Status:** Accepted

**Context:** The same email can produce different output on different runs, and any run can be wrong.

**Decision:** `temperature: 0` to reduce variation, the same deterministic checks on every run (zod, grounding, the High gate), and a separate trace per run. The eval script runs each sample email 3 times and reports whether the runs agree.

**Alternatives:** Self-consistency: run every email twice and flag lines where the runs disagree.

**Trade-off:** Self-consistency would catch more errors, but it doubles latency and token use, and the free plan's 8K tokens per minute would allow only about one 30-line email per minute. Deferred to P2. Two test runs on sample email 03 at `temperature: 0` gave identical output.

### D-015. Requests above stock are quoted at the requested quantity

**Status:** Accepted (PRD Q6 answered)

**Context:** The brief says a request above on-hand is normal and "we can still quote it for however much we have". The agreed scope says requested and on-hand are "never capped or split".

**Decision:** Quote the requested quantity, never capped or split. The line shows a "short by N" warning, the draft shows how many lines are short (on screen and once saved), and a one-click "Quote N on hand" action lets the rep choose to quote only what we hold.

**Alternatives:** Cap automatically at on hand; quote the requested quantity with no shortcut.

**Trade-off:** One more control on short lines. In return both readings of the brief are covered, the system never changes the customer's number on its own, and quoting stock only is one click.

### D-016. One markup per draft, 25% by default

**Status:** Accepted (PRD Q2 answered)

**Context:** Inventory holds `unit_cost`, and quoting at cost earns nothing. The brief requires prices from inventory only.

**Decision:** Unit price is cost plus markup. There is one markup per draft, 25% by default and editable by the rep, stored as integer basis points and rounded half up to the cent. A single shared function prices lines on both the review screen and the server. The rep never types a price.

**Alternatives:** No markup (price equals cost); a fixed markup the rep cannot change; letting the rep type prices.

**Trade-off:** The 25% default is our assumption, not the brief's. Per-line overrides are deferred to P1. Sharing one pricing function means the price the rep sees is exactly the price saved.

### D-017. Railway Infrastructure as Code instead of railway.json

**Status:** Accepted

**Context:** The task plan called for a `railway.json`. Railway has since deprecated config as code: new services cannot use it, and existing files stop working on 2026-12-01.

**Decision:** Declare the project in `.railway/railway.ts` with Railway's TypeScript SDK and apply it with `railway config apply`. The custom domain is attached with the CLI, because IaC cannot register custom domains yet.

**Alternatives:** `railway.json` (not available for new services); settings made by hand in the dashboard (not reviewable, and drift silently).

**Trade-off:** The file is applied by hand, not on deploy, so a change to it does nothing until someone applies it. In return the whole project (services, database, commands, variables) is reviewable in git, and `railway config plan` shows drift.

### D-018. Postgres stays private, and inventory loads from inside the app container

**Status:** Accepted

**Context:** The original plan loaded inventory from a laptop over the database's public URL. Railway creates databases without a public endpoint, and opening one, even briefly, exposes the database to the internet.

**Decision:** Keep Postgres reachable only on Railway's private network. Load inventory by copying the CSV into the running `web` container and running `pnpm db:load` there over SSH.

**Alternatives:** A temporary public TCP proxy; committing the CSV and loading it during deploy.

**Trade-off:** Loading needs an SSH key registered with Railway, which is a one-time step. The database is never on the public internet, and a leaked database password is useless outside Railway.

### D-020. A Mac-style app shell with a sidebar on every page

**Status:** Accepted

**Context:** The live site had no consistent navigation.
The paste page had a small "Drafts" link, the review screen only "← New email", and the drafts list no header at all.
Drafts showed only a timestamp, and pages used different names for the same things ("New quote", "New email", "Review quote", "Draft quotes").
A rep works in this app all day, so they need to see where they are and reach anything in one click.

**Decision:** Every page shares one app shell modeled on Mac apps like Mail and Notes.
A sidebar (source list) holds New Quote, Drafts with a count, and the most recent drafts named by customer or subject, with date and total.
Above each page's content, a toolbar shows where you are on the leading edge and that page's actions on the trailing edge.
One vocabulary everywhere: New Quote, Drafts, Draft, Save Draft.
The look comes from theme tokens in `globals.css` (system font, macOS system colors, hairline separators), and dark mode follows the system setting.
Drafts are labeled from their extraction's email (From and Subject lines, else the first line), derived on the server with no schema change.

**Alternatives:** A top navigation bar (the web convention, but it competes with the toolbar for the row that holds Save Draft, and it has no room for recent drafts); per-page headers with more links (each page reinvents navigation); an inspector pane for Low lines on the review screen instead of inline candidates.

**Trade-off:** The sidebar takes 208px, so below 1280px the original email starts hidden and opens over the lines rather than beside them.
Low lines expand their candidates inline, not in an inspector: the choice stays next to the line's quantity and prices, and the email pane stays visible, at the cost of taller rows for lines that need a decision.
The sidebar's drafts are read on each page load and refreshed after a save, so a draft saved in another tab shows up after the next reload.
