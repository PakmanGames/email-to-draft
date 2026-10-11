import { describe, expect, it } from "vitest";
import { ReviewSeed } from "./extraction";
import { reviewFixtures } from "./fixtures";

describe.each(Object.entries(reviewFixtures))("fixture %s", (_name, fixture) => {
  it("parses as a ReviewSeed", () => {
    expect(ReviewSeed.parse(fixture.seed)).toEqual(fixture.seed);
  });

  it("copies every line's source text from the email", () => {
    for (const { extracted } of fixture.seed.lines) {
      expect(fixture.emailText).toContain(extracted.sourceText);
    }
  });
});

describe("mixedEmail", () => {
  const { lines, notices } = reviewFixtures.mixedEmail.seed;
  const warningCodes = lines.flatMap((line) => line.extracted.warnings.map((w) => w.code));
  const isShort = ({ extracted, match }: (typeof lines)[number]) => {
    const offers = match.candidates.find((c) => c.partNumber === match.defaultPartNumber)?.offers ?? [];
    const onHand = offers.find((o) => o.supplier === match.defaultSupplier)?.qtyOnHand ?? Infinity;
    return extracted.quantityEach !== null && onHand < extracted.quantityEach;
  };

  it("shows every state the review screen handles", () => {
    expect(new Set(lines.map((line) => line.match.confidence))).toEqual(new Set(["high", "low", "none"]));
    expect(lines.some((line) => line.match.confidence === "low" && line.match.candidates.length === 3)).toBe(true);
    expect(lines.some(isShort)).toBe(true);
    expect(warningCodes).toEqual(expect.arrayContaining(["UNIT_CONVERTED", "UNIT_UNKNOWN", "LINE_NOT_GROUNDED"]));
    expect(notices.map((notice) => notice.code)).toContain("SUPERSEDED");
  });

  it("has a line that is Low only because it isn't grounded", () => {
    const line = lines.find((l) => l.extracted.warnings.some((w) => w.code === "LINE_NOT_GROUNDED"));
    expect(line?.match.confidence).toBe("low");
    expect(line?.match.candidates).toHaveLength(1);
    expect(line?.match.candidates[0]).toMatchObject({ kind: "part_number", score: 1 });
    expect(line?.extracted.sourceText).not.toContain(line?.extracted.partNumber);
  });
});
