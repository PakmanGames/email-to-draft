import type { Candidate, ExtractedLine, LineMatch } from "@/lib/contracts";
import { db } from "@/lib/db/client";
import { normalizeNsn, partNumberKey } from "@/lib/identifiers";
import { decideMatch, descriptionCandidates, exactCandidates, partNumberCandidates } from "./confidence";
import {
  findExact,
  findSimilarDescriptions,
  findSimilarPartNumbers,
  withThresholds,
  type LineSearch,
  type PartRow,
} from "./queries";

/** Most results `searchParts` returns. */
const MAX_SEARCH_RESULTS = 10;

/**
 * Matches every line to inventory (technical design 7). One match per line, in the same order.
 *
 * Per line, the first rule that finds parts wins: NSN and part number exact (run together,
 * so they can be compared), then part number fuzzy, then description fuzzy. Each rule is
 * one query for all the lines that reach it, so 30 lines cost at most three queries.
 */
export async function matchLines(lines: ExtractedLine[]): Promise<LineMatch[]> {
  if (lines.length === 0) return [];
  const searches = lines.map(toSearch);

  const hits = await withThresholds(db, async (tx) => {
    const exact = byLine(await findExact(tx, searches.filter((s) => s.nsn || s.key)));
    const partNumber = byLine(await findSimilarPartNumbers(tx, searches.filter((s) => s.key && !exact.has(s.line))));
    const description = byLine(
      await findSimilarDescriptions(tx, searches.filter((s) => s.text && !exact.has(s.line) && !partNumber.has(s.line))),
    );
    return { exact, partNumber, description };
  });

  return lines.map((line, i) =>
    decideMatch(line, {
      exact: hits.exact.get(i) ?? [],
      partNumber: hits.partNumber.get(i) ?? [],
      description: hits.description.get(i) ?? [],
    }),
  );
}

/**
 * Free-text lookup by part number, NSN, or description, for adding or re-picking a line.
 *
 * Uses the same rules as `matchLines`, but runs all of them rather than stopping at the
 * first, because a rep typing "nut 6-32" means a description even if some part number
 * looks a little like it. Exact matches come first, then the rest by score.
 */
export async function searchParts(query: string): Promise<Candidate[]> {
  const text = query.trim();
  if (!text) return [];

  // An NSN is never also a part number or a description, so it only runs the NSN rule.
  const nsn = normalizeNsn(text);
  const search: LineSearch = nsn
    ? { line: 0, nsn, key: null, description: null, text: null }
    : { line: 0, nsn: null, key: partNumberKey(text) || null, description: null, text };

  const hits = await withThresholds(db, async (tx) => ({
    exact: await findExact(tx, [search]),
    partNumber: search.key ? await findSimilarPartNumbers(tx, [search]) : [],
    description: search.text ? await findSimilarDescriptions(tx, [search]) : [],
  }));

  const fuzzy = [...partNumberCandidates(hits.partNumber), ...descriptionCandidates(hits.description)].toSorted(
    (a, b) => b.score - a.score,
  );
  // A part found by several rules keeps its first, best-ranked entry.
  const unique = new Map<string, Candidate>();
  for (const candidate of [...exactCandidates({ partNumber: nsn ? null : text, nsn }, hits.exact), ...fuzzy]) {
    if (!unique.has(candidate.partNumber)) unique.set(candidate.partNumber, candidate);
  }
  return [...unique.values()].slice(0, MAX_SEARCH_RESULTS);
}

function toSearch(line: ExtractedLine, position: number): LineSearch {
  const partNumber = line.partNumber?.trim() || null;
  const description = line.description?.trim() || null;
  return {
    line: position,
    nsn: line.nsn,
    key: partNumber ? partNumberKey(partNumber) || null : null,
    description,
    // Customers write spec numbers like "AS568-214" where a part number goes, and those only
    // appear in our descriptions, so the description rule searches with both. Never with a
    // part number alone: a short one like "QQ-1" scores 0.40 against any "1/2-20" description.
    text: description && [partNumber, description].filter(Boolean).join(" "),
  };
}

function byLine<T extends PartRow>(rows: T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const group = groups.get(row.line);
    if (group) group.push(row);
    else groups.set(row.line, [row]);
  }
  return groups;
}
