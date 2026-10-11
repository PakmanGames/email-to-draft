// T0 stub with the final signatures (technical design 5.7). T3 replaces the bodies.
import type { Candidate, ExtractedLine, LineMatch } from "@/lib/contracts";

/** One match per line, in the same order. The stub matches nothing. */
export async function matchLines(lines: ExtractedLine[]): Promise<LineMatch[]> {
  return lines.map(() => ({
    confidence: "none",
    reason: "Matching is not implemented yet.",
    candidates: [],
    defaultPartNumber: null,
    defaultSupplier: null,
    defaultSupplierReason: null,
  }));
}

/** Free-text lookup by part number, NSN, or description, for adding or re-picking a line. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until T3 lands
export async function searchParts(query: string): Promise<Candidate[]> {
  return [];
}
