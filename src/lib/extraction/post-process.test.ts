import { describe, expect, it } from "vitest";
import type { ExtractedLine, LlmExtraction, LlmLineItem } from "@/lib/contracts";
import { postProcess } from "./post-process";

const EMAIL = `Hi team,

Please quote the following:

1. MS29513-033 O-RING  qty 50
2. AN960C10L washer, 2 boxes of 100
3. NSN 5310-01-449-0355 nut, 1,500 EA
4. 5310014490356 nut, a dozen
5. Seal, part M83248/1-317, 3 rolls
6. NSN 5310-01-449-035 bolt qty 4
7. Cotter pin, 25 pcs

Thanks,
Dana
555-0142`;

function item(fields: Partial<LlmLineItem>): LlmLineItem {
  return {
    source_text: "",
    part_number: null,
    nsn: null,
    description: null,
    quantity: null,
    unit: null,
    pack_size: null,
    ...fields,
  };
}

function extraction(lineItems: LlmLineItem[], extra: Partial<LlmExtraction> = {}): LlmExtraction {
  return { line_items: lineItems, no_items_reason: null, superseded_note: null, ...extra };
}

/** Post-processes a single item against EMAIL and returns its line. */
function line(fields: Partial<LlmLineItem>): ExtractedLine {
  const { lines } = postProcess(EMAIL, extraction([item(fields)]));
  expect(lines).toHaveLength(1);
  return lines[0];
}

const codes = (l: ExtractedLine) => l.warnings.map((w) => w.code);

describe("postProcess", () => {
  it("passes a clean line through with no warnings", () => {
    expect(
      line({
        source_text: "1. MS29513-033 O-RING  qty 50",
        part_number: "MS29513-033",
        description: "O-RING",
        quantity: 50,
      }),
    ).toEqual({
      index: 0,
      sourceText: "1. MS29513-033 O-RING  qty 50",
      partNumber: "MS29513-033",
      nsn: null,
      description: "O-RING",
      quantityEach: 50,
      quantityAsWritten: "50",
      warnings: [],
    });
  });

  it("keeps each line's position in the model output", () => {
    const { lines } = postProcess(
      EMAIL,
      extraction([
        item({ source_text: "MS29513-033 O-RING", part_number: "MS29513-033", quantity: 50 }),
        item({ source_text: "AN960C10L washer", part_number: "AN960C10L", quantity: 2 }),
      ]),
    );
    expect(lines.map((l) => l.index)).toEqual([0, 1]);
  });

  it("trims model strings and treats blank ones as missing, not as dropped", () => {
    const l = line({ source_text: "  7. Cotter pin, 25 pcs ", part_number: "  ", description: " Cotter pin ", quantity: 25, unit: "pcs" });
    expect(l).toMatchObject({ sourceText: "7. Cotter pin, 25 pcs", partNumber: null, description: "Cotter pin" });
    expect(codes(l)).toEqual([]);
  });

  describe("identifier grounding", () => {
    it("drops a part number that isn't in the email and keeps the rest of the line", () => {
      const l = line({ source_text: "1. MS29513-033 O-RING  qty 50", part_number: "MS29513-034", description: "O-RING", quantity: 50 });
      expect(l).toMatchObject({ partNumber: null, description: "O-RING", quantityEach: 50 });
      expect(l.warnings).toEqual([
        {
          code: "IDENTIFIER_DROPPED",
          message: 'Ignored a part number the model returned that is not in the email: "MS29513-034".',
        },
      ]);
    });

    it("drops an NSN that isn't in the email", () => {
      const l = line({ source_text: "3. NSN 5310-01-449-0355 nut, 1,500 EA", nsn: "5310-01-449-9999", description: "nut", quantity: 1500, unit: "EA" });
      expect(l.nsn).toBeNull();
      expect(codes(l)).toEqual(["IDENTIFIER_DROPPED"]);
    });

    it("forgives the model reformatting dashes, spaces, and case", () => {
      const l = line({ source_text: "1. MS29513-033 O-RING  qty 50", part_number: "ms29513 033", quantity: 50 });
      expect(l.partNumber).toBe("ms29513 033");
      expect(codes(l)).toEqual([]);
    });

    it("compares NSNs by digits, so an added NSN prefix still counts as written", () => {
      const l = line({ source_text: "4. 5310014490356 nut, a dozen", nsn: "NSN 5310-01-449-0356", quantity: 1, unit: "dozen" });
      expect(l.nsn).toBe("5310-01-449-0356");
      expect(codes(l)).toEqual(["UNIT_CONVERTED"]);
    });

    it("never grounds an identifier with no letters or digits", () => {
      const l = line({ source_text: "7. Cotter pin, 25 pcs", part_number: "--", description: "Cotter pin", quantity: 25, unit: "pcs" });
      expect(l.partNumber).toBeNull();
      expect(codes(l)).toEqual(["IDENTIFIER_DROPPED"]);
    });

    it("discards a line with nothing grounded left and says so", () => {
      const result = postProcess(
        EMAIL,
        extraction([
          item({ source_text: "1. MS29513-033 O-RING  qty 50", part_number: "MS29513-033", quantity: 50 }),
          item({ source_text: "Line 9: ZZ-1234 qty 5", part_number: "ZZ-1234", quantity: 5 }),
          item({ source_text: "Thanks,", quantity: 1 }),
        ]),
      );
      expect(result.lines.map((l) => l.partNumber)).toEqual(["MS29513-033"]);
      expect(result.notices).toEqual([
        {
          code: "LINES_DISCARDED",
          message: "Discarded 2 lines the model returned, because nothing in them was found in the email.",
        },
      ]);
    });

    it("words the discard notice for a single line", () => {
      const { lines, notices } = postProcess(EMAIL, extraction([item({ source_text: "x", part_number: "ZZ-1" })]));
      expect(lines).toEqual([]);
      expect(notices).toEqual([
        {
          code: "LINES_DISCARDED",
          message: "Discarded 1 line the model returned, because nothing in it was found in the email.",
        },
      ]);
    });
  });

  describe("line grounding", () => {
    it("flags a part number taken from another line of the email (LINE_NOT_GROUNDED)", () => {
      // MS29513-033 is in the email, but on line 1, not on the line whose quantity it got.
      const l = line({ source_text: "2. AN960C10L washer, 2 boxes of 100", part_number: "MS29513-033", quantity: 2, unit: "boxes", pack_size: 100 });
      expect(l.partNumber).toBe("MS29513-033");
      expect(codes(l)).toContain("LINE_NOT_GROUNDED");
      expect(l.warnings.find((w) => w.code === "LINE_NOT_GROUNDED")?.message).toBe(
        "Couldn't confirm this line against the email text. Check the part and quantity.",
      );
    });

    it("flags an NSN taken from another line of the email", () => {
      const l = line({ source_text: "7. Cotter pin, 25 pcs", nsn: "5310-01-449-0355", description: "Cotter pin", quantity: 25, unit: "pcs" });
      expect(codes(l)).toEqual(["LINE_NOT_GROUNDED"]);
    });

    it("flags source text that isn't in the email", () => {
      const l = line({ source_text: "MS29513-033 O-RING qty 75", part_number: "MS29513-033", quantity: 75 });
      expect(codes(l)).toEqual(["LINE_NOT_GROUNDED"]);
    });

    it("forgives whitespace differences in the source text", () => {
      const l = line({ source_text: "MS29513-033\tO-RING qty\n50", part_number: "MS29513-033", quantity: 50 });
      expect(codes(l)).toEqual([]);
    });

    it("flags a source text that is only whitespace", () => {
      const l = line({ source_text: "   ", description: "O-RING", quantity: 50 });
      expect(codes(l)).toContain("LINE_NOT_GROUNDED");
    });
  });

  describe("NSN normalization", () => {
    it.each([
      ["NSN 5310-01-449-0355", "3. NSN 5310-01-449-0355 nut, 1,500 EA", 1500],
      ["5310-01-449-0355", "3. NSN 5310-01-449-0355 nut, 1,500 EA", 1500],
      ["5310014490356", "4. 5310014490356 nut, a dozen", 1],
    ])("normalizes %j", (nsn, sourceText, quantity) => {
      const l = line({ source_text: sourceText, nsn, quantity });
      expect(l.nsn).toMatch(/^5310-01-449-035[56]$/);
      expect(codes(l)).toEqual([]);
    });

    it("flags an NSN that doesn't have 13 digits and keeps the line", () => {
      const l = line({ source_text: "6. NSN 5310-01-449-035 bolt qty 4", nsn: "NSN 5310-01-449-035", description: "bolt", quantity: 4 });
      expect(l).toMatchObject({ nsn: null, description: "bolt", quantityEach: 4 });
      expect(l.warnings).toEqual([
        {
          code: "NSN_INVALID",
          message: '"NSN 5310-01-449-035" is not a valid NSN (13 digits), so it isn\'t used for matching.',
        },
      ]);
    });
  });

  describe("quantity and units", () => {
    it("flags a missing quantity", () => {
      const l = line({ source_text: "5. Seal, part M83248/1-317, 3 rolls", part_number: "M83248/1-317" });
      expect(l).toMatchObject({ quantityEach: null, quantityAsWritten: "" });
      expect(l.warnings).toEqual([
        { code: "QTY_MISSING", message: "The email doesn't give a quantity for this line. Enter one." },
      ]);
    });

    it("keeps each as is", () => {
      const l = line({ source_text: "3. NSN 5310-01-449-0355 nut, 1,500 EA", nsn: "NSN 5310-01-449-0355", quantity: 1500, unit: "EA" });
      expect(l).toMatchObject({ quantityEach: 1500, quantityAsWritten: "1500 EA" });
      expect(codes(l)).toEqual([]);
    });

    it("converts a stated pack size", () => {
      const l = line({ source_text: "2. AN960C10L washer, 2 boxes of 100", part_number: "AN960C10L", quantity: 2, unit: "boxes", pack_size: 100 });
      expect(l).toMatchObject({ quantityEach: 200, quantityAsWritten: "2 boxes of 100" });
      expect(l.warnings).toEqual([{ code: "UNIT_CONVERTED", message: "2 boxes of 100 = 200 EA" }]);
    });

    it('converts "a dozen" (quantity 1, unit dozen) without flagging the quantity', () => {
      const l = line({ source_text: "4. 5310014490356 nut, a dozen", nsn: "5310014490356", quantity: 1, unit: "dozen" });
      expect(l).toMatchObject({ quantityEach: 12, quantityAsWritten: "1 dozen" });
      expect(l.warnings).toEqual([{ code: "UNIT_CONVERTED", message: "1 dozen = 12 EA" }]);
    });

    it("converts hundreds", () => {
      const email = "Need MS29513-033 x 3 HD please";
      const { lines } = postProcess(email, extraction([item({ source_text: email, part_number: "MS29513-033", quantity: 3, unit: "HD" })]));
      expect(lines[0]).toMatchObject({ quantityEach: 300, quantityAsWritten: "3 HD" });
      expect(codes(lines[0])).toEqual(["UNIT_CONVERTED"]);
    });

    it("asks the rep to confirm a unit it can't convert", () => {
      const l = line({ source_text: "5. Seal, part M83248/1-317, 3 rolls", part_number: "M83248/1-317", quantity: 3, unit: "rolls" });
      expect(l).toMatchObject({ quantityEach: null, quantityAsWritten: "3 rolls" });
      expect(l.warnings).toEqual([
        { code: "UNIT_UNKNOWN", message: 'Couldn\'t convert "3 rolls" to each. Confirm the quantity.' },
      ]);
    });

    it("asks the rep to confirm a pack without a stated size", () => {
      const email = "AN960C10L washer, 2 boxes";
      const { lines } = postProcess(email, extraction([item({ source_text: email, part_number: "AN960C10L", quantity: 2, unit: "boxes" })]));
      expect(lines[0].quantityEach).toBeNull();
      expect(lines[0].warnings).toEqual([
        { code: "UNIT_UNKNOWN", message: 'Couldn\'t convert "2 boxes" to each without a pack size. Confirm the quantity.' },
      ]);
    });
  });

  describe("quantity grounding", () => {
    it("flags a quantity that isn't in the line's text (QTY_NOT_IN_TEXT)", () => {
      const l = line({ source_text: "1. MS29513-033 O-RING  qty 50", part_number: "MS29513-033", quantity: 500 });
      expect(l.quantityEach).toBe(500);
      expect(l.warnings).toEqual([
        { code: "QTY_NOT_IN_TEXT", message: "Quantity 500 doesn't appear in this line's text. Confirm the quantity." },
      ]);
    });

    it("doesn't let a digit inside the part number vouch for the quantity", () => {
      const l = line({ source_text: "1. MS29513-033 O-RING  qty 50", part_number: "MS29513-033", quantity: 33 });
      expect(codes(l)).toEqual(["QTY_NOT_IN_TEXT"]);
    });

    it("doesn't let a digit inside the NSN vouch for the quantity", () => {
      const l = line({ source_text: "3. NSN 5310-01-449-0355 nut, 1,500 EA", nsn: "NSN 5310-01-449-0355", quantity: 449, unit: "EA" });
      expect(codes(l)).toEqual(["QTY_NOT_IN_TEXT"]);
    });

    it("flags a pack size that isn't in the line's text", () => {
      const l = line({ source_text: "2. AN960C10L washer, 2 boxes of 100", part_number: "AN960C10L", quantity: 2, unit: "boxes", pack_size: 50 });
      expect(l.quantityEach).toBe(100);
      expect(l.warnings[0]).toEqual({
        code: "QTY_NOT_IN_TEXT",
        message: "Pack size 50 doesn't appear in this line's text. Confirm the quantity.",
      });
    });

    it("names both numbers when neither is in the text", () => {
      const l = line({ source_text: "2. AN960C10L washer, 2 boxes of 100", part_number: "AN960C10L", quantity: 3, unit: "boxes", pack_size: 50 });
      expect(l.warnings[0].message).toBe("Quantity 3 and pack size 50 don't appear in this line's text. Confirm the quantity.");
    });

    it.each([
      ["thousands separators", "3. NSN 5310-01-449-0355 nut, 1,500 EA", 1500],
      ["a number word", "Please send two O-RINGS", 2],
      ["the word twelve", "twelve washers", 12],
      ['"an"', "an O-RING", 1],
    ])("accepts %s", (_label, sourceText, quantity) => {
      const { lines } = postProcess(`${EMAIL}\n${sourceText}`, extraction([item({ source_text: sourceText, description: "x", quantity })]));
      expect(codes(lines[0])).toEqual([]);
    });
  });

  describe("notices", () => {
    it.each([
      ["auto_reply", "This looks like an automatic reply, so there is nothing to quote."],
      ["attachment_only", "The request seems to be in an attachment, and attachments aren't read. Add the lines by hand."],
      ["no_request", "This email doesn't ask for any parts."],
      ["other", "No requested items were found in this email."],
      [null, "No requested items were found in this email."],
    ] as const)("explains no items with reason %j", (reason, message) => {
      expect(postProcess(EMAIL, extraction([], { no_items_reason: reason }))).toEqual({
        lines: [],
        notices: [{ code: "NO_ITEMS", message }],
      });
    });

    it("notes a superseded earlier message", () => {
      const { notices } = postProcess(EMAIL, extraction([], { no_items_reason: "other", superseded_note: " The O-ring was withdrawn. " }));
      expect(notices).toContainEqual({
        code: "SUPERSEDED",
        message: "A later message in this thread changes the request: The O-ring was withdrawn.",
      });
    });

    it("has no notices for a plain email with items", () => {
      const result = postProcess(EMAIL, extraction([item({ source_text: "7. Cotter pin, 25 pcs", description: "Cotter pin", quantity: 25, unit: "pcs" })], { no_items_reason: "other" }));
      expect(result.notices).toEqual([]);
    });
  });
});
