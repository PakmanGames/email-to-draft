import { z } from "zod";

// Technical design 5.3: match result for one extracted line.

export const Confidence = z.enum(["high", "low", "none"]);
export type Confidence = z.infer<typeof Confidence>;

export const MatchKind = z.enum(["nsn", "part_number", "part_number_fuzzy", "description_fuzzy"]);
export type MatchKind = z.infer<typeof MatchKind>;

export const Offer = z.strictObject({
  supplier: z.string(),
  qtyOnHand: z.number().int().nonnegative(),
  unitCostCents: z.number().int().positive(),
  leadTimeDays: z.number().int().nonnegative(),
});
export type Offer = z.infer<typeof Offer>;

export const Candidate = z.strictObject({
  partNumber: z.string(),
  nsn: z.string().nullable(),
  description: z.string(),
  kind: MatchKind,
  score: z.number().min(0).max(1), // 1 for exact, similarity for fuzzy; for sorting only
  reason: z.string(), // "Closest part number, differs by 1 character"
  offers: z.array(Offer).min(1),
});
export type Candidate = z.infer<typeof Candidate>;

export const LineMatch = z.strictObject({
  confidence: Confidence,
  reason: z.string(), // one sentence for the rep
  candidates: z.array(Candidate).max(5), // best first; empty when confidence is "none"
  defaultPartNumber: z.string().nullable(), // preselected; set only for "high"
  defaultSupplier: z.string().nullable(),
  defaultSupplierReason: z.string().nullable(), // "Cheapest supplier that can fill 250"
});
export type LineMatch = z.infer<typeof LineMatch>;
