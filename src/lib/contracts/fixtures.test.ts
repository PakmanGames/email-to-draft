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
