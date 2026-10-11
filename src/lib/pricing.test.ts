import { describe, expect, it } from "vitest";
import { DEFAULT_MARKUP_BPS, unitPriceCents } from "./pricing";

describe("unitPriceCents", () => {
  it("defaults to a 25% markup", () => {
    expect(DEFAULT_MARKUP_BPS).toBe(2500);
  });

  it.each([
    [1833, 2500, 2291], // 2291.25 rounds down
    [100, 2500, 125], // exact
    [34, 2500, 43], // 42.5 rounds half up
    [2, 2500, 3], // 2.5 rounds half up
    [1, 2500, 1], // 1.25 rounds down
    [3, 3333, 4], // 3.9999 rounds up
    [13569, 1250, 15265], // 15265.125
    [21, 100_000, 231], // 1000%, the maximum
    [938234, 2500, 1172793], // 1172792.5 rounds half up
  ])("prices %i cents at %i bps as %i", (cost, bps, expected) => {
    expect(unitPriceCents(cost, bps)).toBe(expected);
  });

  it("returns the cost unchanged at 0 bps", () => {
    for (const cost of [1, 34, 1833, 938234]) expect(unitPriceCents(cost, 0)).toBe(cost);
  });

  it("never prices below cost", () => {
    for (let cost = 1; cost <= 500; cost++) {
      for (const bps of [0, 1, 49, 50, 2500, 9999]) {
        expect(unitPriceCents(cost, bps)).toBeGreaterThanOrEqual(cost);
      }
    }
  });

  it.each([
    ["a zero cost", 0, 2500],
    ["a negative cost", -5, 2500],
    ["a fractional cost", 12.5, 2500],
    ["a negative markup", 100, -1],
    ["a markup over 1000%", 100, 100_001],
    ["a fractional markup", 100, 2500.5],
    ["a cost too large to price exactly", Number.MAX_SAFE_INTEGER, 2500],
  ])("rejects %s", (_label, cost, bps) => {
    expect(() => unitPriceCents(cost, bps)).toThrow(RangeError);
  });
});
