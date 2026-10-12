import { describe, expect, it } from "vitest";
import { reviewFixtures } from "@/lib/contracts/fixtures";
import { findSourceRange } from "./source-range";

const slice = (text: string, range: [number, number] | null) => (range ? text.slice(...range) : null);

describe("findSourceRange", () => {
  it("finds every fixture line's source text in its email", () => {
    for (const { emailText, seed } of Object.values(reviewFixtures)) {
      for (const { extracted } of seed.lines) {
        expect(slice(emailText, findSourceRange(emailText, extracted.sourceText))).toBe(extracted.sourceText);
      }
    }
  });

  it("matches across collapsed whitespace and line breaks", () => {
    const email = "Tube union 96F62405-7\n   qty 6, same as our last order";
    expect(slice(email, findSourceRange(email, "Tube union 96F62405-7 qty 6"))).toBe("Tube union 96F62405-7\n   qty 6");
  });

  it("treats the source text literally, not as a pattern", () => {
    const email = "Need (2) x M39029/41-861 [backshell]? yes";
    expect(slice(email, findSourceRange(email, "(2) x M39029/41-861 [backshell]?"))).toBe(
      "(2) x M39029/41-861 [backshell]?",
    );
  });

  it("returns null when the text isn't there or is empty", () => {
    expect(findSourceRange("Please quote 10 x AN3-9D", "MS9556-82")).toBeNull();
    expect(findSourceRange("Please quote", "   ")).toBeNull();
  });
});
