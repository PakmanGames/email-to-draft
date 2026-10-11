import { sql } from "drizzle-orm";
import type { Offer } from "@/lib/contracts";
import type { Db } from "@/lib/db/client";
import { DESCRIPTION_MIN_SIMILARITY, MAX_CANDIDATES, PART_NUMBER_MIN_SIMILARITY } from "./thresholds";

/**
 * The matching rules as SQL (technical design 7). Each function is one round trip for any
 * number of lines: the lines go in as one JSON parameter, are unpacked with
 * `json_to_recordset`, and each hit comes back tagged with its line's position.
 *
 * Run them inside `withThresholds`, because the trigram operators read their thresholds
 * from transaction-local settings.
 */

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** What one line (or one search query) is matched on. Null fields skip that rule. */
export type LineSearch = {
  line: number;
  /** Normalized NSN. */
  nsn: string | null;
  /** `partNumberKey` of the part number, never empty. */
  key: string | null;
  /** The line's own description, for the contradiction check. */
  description: string | null;
  /** Text for the description rule: the description, after the part number if any. */
  text: string | null;
};

export type PartRow = {
  line: number;
  partNumber: string;
  nsn: string | null;
  description: string;
  offers: Offer[];
};

export type ExactHit = PartRow & {
  nsnHit: boolean;
  keyHit: boolean;
  /** Null when the line has no description. */
  descriptionSimilarity: number | null;
};

export type PartNumberHit = PartRow & { score: number; distance: number };

export type DescriptionHit = PartRow & { score: number };

/**
 * Runs `work` in one read-only transaction with our thresholds set for it alone. The `%`
 * and `<<%` operators are what the GIN trigram indexes serve, and they compare against
 * these settings, so setting them is what lets the fuzzy rules use the indexes.
 */
export function withThresholds<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`
        SELECT set_config('pg_trgm.similarity_threshold', ${String(PART_NUMBER_MIN_SIMILARITY)}, true),
               set_config('pg_trgm.strict_word_similarity_threshold', ${String(DESCRIPTION_MIN_SIMILARITY)}, true)`);
      return work(tx);
    },
    { accessMode: "read only" },
  );
}

// Each part's offers as `Offer` objects, cheapest first. A part without offers can't be
// quoted, so callers drop it. unit_cost is numeric(12,2), so × 100 is exact integer cents.
const PART_OFFERS = sql`
  CROSS JOIN LATERAL (
    SELECT json_agg(json_build_object(
      'supplier', o.supplier,
      'qtyOnHand', o.qty_on_hand,
      'unitCostCents', (o.unit_cost * 100)::bigint,
      'leadTimeDays', o.lead_time_days
    ) ORDER BY o.unit_cost, o.lead_time_days, o.supplier) AS offers
    FROM offer o
    WHERE o.part_number = p.part_number
  ) po`;

/**
 * Rules 1 and 2 together: parts whose NSN or part number key equals the line's. Each hit
 * says which identifiers it matched, so the High gate can compare them.
 *
 * A NULL on either side of `=` is never true, so a line without an NSN never matches a
 * part whose NSN is NULL.
 */
export async function findExact(tx: Tx, searches: LineSearch[]): Promise<ExactHit[]> {
  if (searches.length === 0) return [];
  const { rows } = await tx.execute<ExactHit>(sql`
    SELECT q.line, p.part_number AS "partNumber", p.nsn, p.description, po.offers,
           coalesce(p.nsn = q.nsn, false) AS "nsnHit",
           coalesce(p.part_number_key = q.key, false) AS "keyHit",
           strict_word_similarity(q.description, p.description) AS "descriptionSimilarity"
    FROM json_to_recordset(${JSON.stringify(searches)}::json) AS q(line int, nsn text, key text, description text)
    JOIN part p ON p.nsn = q.nsn OR p.part_number_key = q.key
    ${PART_OFFERS}
    WHERE po.offers IS NOT NULL`);
  return rows;
}

/** Rule 3: the most similar part number keys, with their edit distance for the reason. */
export async function findSimilarPartNumbers(tx: Tx, searches: LineSearch[]): Promise<PartNumberHit[]> {
  if (searches.length === 0) return [];
  const { rows } = await tx.execute<PartNumberHit>(sql`
    SELECT q.line, p.part_number AS "partNumber", p.nsn, p.description, po.offers, p.score,
           levenshtein(p.part_number_key, q.key) AS distance
    FROM json_to_recordset(${JSON.stringify(searches)}::json) AS q(line int, key text)
    CROSS JOIN LATERAL (
      SELECT part_number, nsn, description, part_number_key, similarity(part_number_key, q.key) AS score
      FROM part
      WHERE part_number_key % q.key
      ORDER BY score DESC, part_number
      LIMIT ${MAX_CANDIDATES}
    ) p
    ${PART_OFFERS}
    WHERE po.offers IS NOT NULL`);
  return rows;
}

/**
 * Rule 4: parts whose description best contains the search text, best first.
 *
 * Only 558 descriptions are shared by 12,000 parts, so ties are common. Whole-string
 * similarity breaks them in favor of descriptions with fewer extra words, which puts
 * "-6 X 24 IN" hoses ahead of "-10 X 24 IN" ones for "-6 hose assemblies, 24 inch".
 */
export async function findSimilarDescriptions(tx: Tx, searches: LineSearch[]): Promise<DescriptionHit[]> {
  if (searches.length === 0) return [];
  const { rows } = await tx.execute<DescriptionHit>(sql`
    SELECT q.line, p.part_number AS "partNumber", p.nsn, p.description, po.offers, p.score
    FROM json_to_recordset(${JSON.stringify(searches)}::json) AS q(line int, text text)
    CROSS JOIN LATERAL (
      SELECT part_number, nsn, description, strict_word_similarity(q.text, description) AS score,
             row_number() OVER (
               ORDER BY strict_word_similarity(q.text, description) DESC, similarity(q.text, description) DESC, part_number
             ) AS rank
      FROM part
      WHERE q.text <<% description
      ORDER BY rank
      LIMIT ${MAX_CANDIDATES}
    ) p
    ${PART_OFFERS}
    WHERE po.offers IS NOT NULL
    ORDER BY q.line, p.rank`);
  return rows;
}
