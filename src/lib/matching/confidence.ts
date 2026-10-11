import type { Candidate, ExtractedLine, LineMatch } from "@/lib/contracts";
import { partNumberKey } from "@/lib/identifiers";
import { pickDefaultSupplier } from "./default-supplier";
import type { DescriptionHit, ExactHit, PartNumberHit, PartRow } from "./queries";
import { DESCRIPTION_CONTRADICTION_BELOW, MAX_CANDIDATES } from "./thresholds";

/**
 * Confidence and reasons (technical design 7). Pure: the SQL rules find parts, and this
 * decides what they mean for the rep.
 *
 * A wrong High costs more than a correct Low (PRD principle 1), so High is a gate every
 * check must pass, and every other outcome is Low with the first failed check as its reason.
 */

/** The identifiers a line was matched on. */
export type Identifiers = Pick<ExtractedLine, "partNumber" | "nsn">;

/** Each rule's hits for one line. Later rules are empty when an earlier one found parts. */
export type RuleHits = {
  exact: ExactHit[];
  partNumber: PartNumberHit[];
  description: DescriptionHit[];
};

export function decideMatch(line: ExtractedLine, hits: RuleHits): LineMatch {
  if (hits.exact.length > 0) return decideExact(line, hits.exact);

  if (hits.partNumber.length > 0) {
    const closest = Math.min(...hits.partNumber.map((hit) => hit.distance));
    return low(
      `No exact match. Closest part number differs by ${characters(closest)}.`,
      partNumberCandidates(hits.partNumber),
    );
  }

  if (hits.description.length > 0) {
    const ids = identifiersOn(line);
    const reason = ids
      ? `${capitalize(ids.name)} not in inventory, matched on description only`
      : "Matched on description only";
    return low(reason, descriptionCandidates(hits.description));
  }

  return {
    confidence: "none",
    reason: "Not in inventory",
    candidates: [],
    defaultPartNumber: null,
    defaultSupplier: null,
    defaultSupplierReason: null,
  };
}

/** Applies the four High checks to the exact rules' hits, in order. */
function decideExact(line: ExtractedLine, hits: ExactHit[]): LineMatch {
  const candidates = exactCandidates(line, hits);
  const agreeing = hits.filter((hit) => agreesWithLine(line, hit));

  // Checks 1 and 2: exactly one part, and every identifier on the line points to it.
  if (agreeing.length > 1) {
    return low(
      hasPartNumber(line)
        ? `Part number matches ${agreeing.length} parts, ignoring dashes and case. Pick one.`
        : `NSN ${line.nsn} covers ${agreeing.length} part numbers. Pick one.`,
      candidates,
    );
  }
  if (agreeing.length === 0) {
    const nsnHit = hits.some((hit) => hit.nsnHit);
    const keyHit = hits.some((hit) => hit.keyHit);
    return low(
      nsnHit && keyHit
        ? "Part number and NSN point to different parts"
        : nsnHit
          ? "NSN matches, but the part number doesn't"
          : "Part number matches, but the NSN doesn't",
      candidates,
    );
  }

  // An exact hit means the line has at least one identifier.
  const ids = identifiersOn(line)!;

  // Check 3: the identifiers were found in this line's own text in the email.
  if (line.warnings.some((warning) => warning.code === "LINE_NOT_GROUNDED")) {
    return low(`Couldn't confirm this ${ids.name} ${ids.plural ? "belong" : "belongs"} to this line`, candidates);
  }

  // Check 4: the line's description, if any, doesn't contradict the part's.
  const part = agreeing[0];
  if (part.descriptionSimilarity !== null && part.descriptionSimilarity < DESCRIPTION_CONTRADICTION_BELOW) {
    return low(`${capitalize(ids.name)} ${ids.plural ? "match" : "matches"}, but the description doesn't`, candidates);
  }

  const supplier = pickDefaultSupplier(part.offers, line.quantityEach);
  return {
    confidence: "high",
    reason: exactReason(line, part),
    candidates,
    defaultPartNumber: part.partNumber,
    defaultSupplier: supplier.supplier,
    defaultSupplierReason: supplier.reason,
  };
}

/**
 * Exact hits as candidates: parts every identifier agrees with first, then part number
 * hits, then NSN hits, with an exact spelling ahead of one that differs in dashes or case.
 */
export function exactCandidates(line: Identifiers, hits: ExactHit[]): Candidate[] {
  const rank = (hit: ExactHit) =>
    (agreesWithLine(line, hit) ? 0 : hit.keyHit ? 2 : 4) + (isSpelledAsWritten(line, hit) ? 0 : 1);
  return hits
    .toSorted((a, b) => rank(a) - rank(b) || compareText(a.partNumber, b.partNumber))
    .slice(0, MAX_CANDIDATES)
    .map((hit) => {
      const reason = agreesWithLine(line, hit)
        ? exactReason(line, hit)
        : hit.keyHit
          ? "Part number matches, but the NSN doesn't"
          : "NSN matches, but the part number doesn't";
      return candidate(hit, hit.keyHit ? "part_number" : "nsn", 1, reason);
    });
}

/** Fuzzy part number hits, fewest differing characters first. */
export function partNumberCandidates(hits: PartNumberHit[]): Candidate[] {
  return sortByDistance(hits).map((hit, i) =>
    candidate(
      hit,
      "part_number_fuzzy",
      hit.score,
      `${i === 0 ? "Closest" : "Similar"} part number, differs by ${characters(hit.distance)}`,
    ),
  );
}

/** Description hits, in the order the query ranked them. */
export function descriptionCandidates(hits: DescriptionHit[]): Candidate[] {
  return hits.map((hit) => candidate(hit, "description_fuzzy", hit.score, "Similar description"));
}

function exactReason(line: Identifiers, part: ExactHit): string {
  if (!hasPartNumber(line)) return "Exact NSN match";
  const spelled = isSpelledAsWritten(line, part);
  if (line.nsn) return spelled ? "Exact part number and NSN match" : "Part number and NSN match, ignoring dashes and case";
  return spelled ? "Exact part number match" : "Part number matches, ignoring dashes and case";
}

/** True when every identifier on the line matched this part. */
function agreesWithLine(line: Identifiers, hit: ExactHit): boolean {
  return (!line.nsn || hit.nsnHit) && (!hasPartNumber(line) || hit.keyHit);
}

function isSpelledAsWritten(line: Identifiers, part: PartRow): boolean {
  return line.partNumber?.trim() === part.partNumber;
}

// A part number with no letters or digits has an empty key, which the SQL never matches.
function hasPartNumber(line: Identifiers): boolean {
  return partNumberKey(line.partNumber ?? "") !== "";
}

/** How a reason names the line's identifiers, or null when it has none. */
function identifiersOn(line: Identifiers): { name: string; plural: boolean } | null {
  if (hasPartNumber(line) && line.nsn) return { name: "part number and NSN", plural: true };
  if (hasPartNumber(line)) return { name: "part number", plural: false };
  if (line.nsn) return { name: "NSN", plural: false };
  return null;
}

function capitalize(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}

function sortByDistance(hits: PartNumberHit[]): PartNumberHit[] {
  return hits.toSorted((a, b) => a.distance - b.distance || b.score - a.score || compareText(a.partNumber, b.partNumber));
}

function candidate(part: PartRow, kind: Candidate["kind"], score: number, reason: string): Candidate {
  return {
    partNumber: part.partNumber,
    nsn: part.nsn,
    description: part.description,
    kind,
    score,
    reason,
    offers: part.offers,
  };
}

function low(reason: string, candidates: Candidate[]): LineMatch {
  return {
    confidence: "low",
    reason,
    candidates,
    defaultPartNumber: null,
    defaultSupplier: null,
    defaultSupplierReason: null,
  };
}

function characters(n: number): string {
  return `${n} character${n === 1 ? "" : "s"}`;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
