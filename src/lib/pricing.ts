/**
 * Quote pricing (technical design 4 and 5.7). Shared by the review screen and
 * `saveQuote`, so the price the rep sees is exactly the price that gets saved.
 * Pure and dependency-free, so it is safe to import from client components.
 */

/** 25%. Markup is integer basis points: 2500 = 25%. */
export const DEFAULT_MARKUP_BPS = 2500;

const BPS = 10_000;

/**
 * Unit price for a cost plus markup: `cost × (10000 + bps) / 10000`, rounded half up
 * to the cent. Integer math only, so there is no floating point error to round away.
 */
export function unitPriceCents(unitCostCents: number, markupBps: number): number {
  if (!Number.isSafeInteger(unitCostCents) || unitCostCents <= 0) {
    throw new RangeError(`unitCostCents must be a positive integer, got ${unitCostCents}`);
  }
  if (!Number.isInteger(markupBps) || markupBps < 0 || markupBps > 100_000) {
    throw new RangeError(`markupBps must be an integer from 0 to 100000, got ${markupBps}`);
  }
  // Adding half the divisor before an exact integer division rounds half up.
  const scaled = unitCostCents * (BPS + markupBps) + BPS / 2;
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError(`unitCostCents ${unitCostCents} is too large to price exactly`);
  }
  return (scaled - (scaled % BPS)) / BPS;
}
