/**
 * Matching thresholds (technical design 7). Each is a pg_trgm score from 0 to 1 that only
 * decides which parts become candidates and whether a High is capped. The rep never sees one.
 *
 * Tuned against the full inventory (12,000 parts) and hand-written lines from sample
 * emails 02, 04, 09, 10, and 12, never against the answer keys.
 *
 * Descriptions are compared with `strict_word_similarity`, not `word_similarity`. The
 * plain version matches across word boundaries, so "o-ring" scores 0.57 against
 * "BEARING,ROLLER" and "resistor 4.7k" ranks TRANSISTOR first. The strict version only
 * matches whole words (0.25, and RESISTOR first) and scores the same on every sensible
 * phrase we tried.
 */

/**
 * Minimum `similarity(part_number_key, key)` for a fuzzy part number candidate.
 *
 * Lowered from the starting 0.45. Simulated one-character typos (substitution, deletion,
 * insertion, swap) of 600 inventory part numbers keep the right part among the candidates
 * 97% of the time at 0.40, against 91% at 0.45; swaps score lowest. 1,000 invented part
 * numbers shaped like real ones score at most 0.43 against the inventory, and under 1%
 * clear 0.40, so an unknown part almost always stays "Not in inventory". At 0.30, 4% do.
 */
export const PART_NUMBER_MIN_SIMILARITY = 0.4;

/**
 * Minimum `strict_word_similarity(search text, part.description)` for a description candidate.
 *
 * Kept at the starting 0.40. Of 57 customer-style phrases ("lock washer", "fuel nozzle"),
 * 55 find a description and 53 of those the right kind of item, and 7 of 8 unrelated
 * phrases ("same as last order" 0.12) find nothing. 0.45 would cut the "-6 hose
 * assemblies, 24 inch" line in sample email 12 from five right-size candidates to two, as
 * "HOSE ASSEMBLY,NONMETALLIC -6 X 24 IN" scores 0.44.
 */
export const DESCRIPTION_MIN_SIMILARITY = 0.4;

/**
 * Below this `strict_word_similarity(line description, part.description)`, the line's
 * description contradicts an exact match, which caps the line at Low (High gate check 4).
 *
 * Raised from the starting 0.20, where 3.2% of pairs naming a different kind of item still
 * pass; at 0.30, 1.2% do. Not higher, because shorthand for the right item must still
 * agree: "locknut" scores 0.33 against "NUT,SELF-LOCKING", "lock nut" 0.44, "screws" 0.63
 * against "SCREW,CAP". Synonyms trigrams can't see, such as "o-ring" for
 * "PACKING,PREFORMED" (0.15), fall to Low, which is the cheaper mistake.
 */
export const DESCRIPTION_CONTRADICTION_BELOW = 0.3;

/** Most candidates per line, which is also the `LineMatch.candidates` limit. */
export const MAX_CANDIDATES = 5;
