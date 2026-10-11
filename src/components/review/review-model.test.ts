import { describe, expect, it } from "vitest";
import type { Candidate } from "@/lib/contracts";
import { reviewFixtures } from "@/lib/contracts/fixtures";
import { unitPriceCents } from "@/lib/pricing";
import {
  buildSaveRequest,
  describeBlockers,
  initReviewState,
  parseMarkupBps,
  parseQuantity,
  reviewReducer,
  summarize,
  viewLine,
  type ReviewAction,
  type ReviewState,
} from "./review-model";

const mixed = reviewFixtures.mixedEmail.seed;

function run(state: ReviewState, ...actions: ReviewAction[]): ReviewState {
  return actions.reduce(reviewReducer, state);
}

function derive(state: ReviewState) {
  const views = state.lines.map((line, i) => viewLine(line, i, state.markupBps));
  return { views, summary: summarize(state, views) };
}

const searched: Candidate = {
  partNumber: "AN960C10L",
  nsn: null,
  description: "WASHER,FLAT",
  kind: "part_number",
  score: 1,
  reason: "Exact part number match",
  offers: [
    { supplier: "Slow Cheap", qtyOnHand: 500, unitCostCents: 10, leadTimeDays: 90 },
    { supplier: "Fast Cheap", qtyOnHand: 500, unitCostCents: 10, leadTimeDays: 5 },
    { supplier: "Small Stock", qtyOnHand: 3, unitCostCents: 8, leadTimeDays: 1 },
  ],
};

describe("parseQuantity", () => {
  it.each([
    ["40", 40],
    ["1,500", 1500],
    [" 12 ", 12],
    ["2147483647", 2_147_483_647],
  ])("reads %j as %i", (text, quantity) => {
    expect(parseQuantity(text)).toBe(quantity);
  });

  it.each(["", "0", "-3", "2.5", "1e3", "abc", "2147483648"])("rejects %j", (text) => {
    expect(parseQuantity(text)).toBeNull();
  });
});

describe("parseMarkupBps", () => {
  it.each([
    ["25", 2500],
    ["0", 0],
    ["12.5", 1250],
    ["12.05", 1205],
    ["1000", 100_000],
    ["7.", 700],
  ])("reads %j as %i bps", (text, bps) => {
    expect(parseMarkupBps(text)).toBe(bps);
  });

  it.each(["", "-1", "1000.01", "12.345", "abc", "25%"])("rejects %j", (text) => {
    expect(parseMarkupBps(text)).toBeNull();
  });
});

describe("initial state from the mixed fixture", () => {
  const { views, summary } = derive(initReviewState(mixed));

  it("preselects High lines, leaves Low lines undecided, and keeps None lines unmatched", () => {
    expect(views.map((v) => v.line.selection?.kind ?? null)).toEqual([
      "part",
      null,
      "unmatched",
      "part",
      "part",
      "part",
      null,
    ]);
    expect(views.every((v) => !v.edited)).toBe(true);
  });

  it("prices with the default 25% markup through unitPriceCents", () => {
    expect(views[0].unitPriceCents).toBe(unitPriceCents(461, 2500));
    expect(views[0].extendedCents).toBe(unitPriceCents(461, 2500) * 40);
  });

  it("flags short stock and quantity checks", () => {
    expect(views[3].shortBy).toBe(18);
    expect(views[5].quantityIssue).toBe("missing");
    expect(views[6].quantityIssue).toBe("unconfirmed");
    expect(views[4].quantityIssue).toBeNull();
    expect(views[4].otherWarnings.map((w) => w.code)).toEqual(["UNIT_CONVERTED"]);
  });

  it("groups each line once for the summary bar", () => {
    expect(summary.lineCount).toBe(7);
    expect(summary.groups).toEqual({ ready: 3, needChoice: 2, needQuantity: 1, toConfirm: 0, unmatched: 1 });
    expect(summary.shortCount).toBe(1);
    expect(summary.unpricedCount).toBe(3);
  });

  it("blocks Save and says what is left, starting at the first such line", () => {
    expect(summary.canSave).toBe(false);
    expect(describeBlockers(summary.blockers)).toEqual([
      "2 lines need a choice",
      "1 line needs a quantity",
      "1 quantity to confirm",
    ]);
    expect(summary.firstBlocked).toEqual({ key: "x1", number: 2, target: "choice" });
  });
});

describe("reviewReducer", () => {
  const initial = initReviewState(mixed);

  it("counts a quantity edit and a supplier change as edits, but not a confirmation", () => {
    const state = run(
      initial,
      { type: "setQuantity", key: "x0", text: "41" },
      { type: "pickSupplier", key: "x3", supplier: "Harbor Point Industrial" },
      { type: "confirmQuantity", key: "x6" },
    );
    const { views } = derive(state);
    expect(views[0].edited).toBe(true);
    expect(views[3].edited).toBe(true);
    expect(views[3].line.supplierReason).toBeNull();
    expect(views[6].edited).toBe(false);
    expect(views[6].quantityIssue).toBeNull();
  });

  it("re-picks the automatic supplier for a new quantity, and keeps one the rep chose", () => {
    const automatic = derive(run(initial, { type: "setQuantity", key: "x4", text: "300" })).views[4];
    expect(automatic.line.selection).toMatchObject({ supplier: "Bridgewater Avionics" });
    expect(automatic.line.supplierReason).toBe("Cheapest supplier that can fill 300");

    const chosen = run(
      initial,
      { type: "pickSupplier", key: "x4", supplier: "Orion Microcircuits" },
      { type: "setQuantity", key: "x4", text: "300" },
    ).lines[4];
    expect(chosen.selection).toMatchObject({ supplier: "Orion Microcircuits" });
    expect(chosen.supplierReason).toBeNull();
  });

  it("does not count typing the original quantity back as an edit", () => {
    const state = run(initial, { type: "setQuantity", key: "x0", text: "4" }, { type: "setQuantity", key: "x0", text: "40" });
    expect(derive(state).views[0].edited).toBe(false);
  });

  it("quotes the selected supplier's on hand and counts it as an edit", () => {
    const { views } = derive(run(initial, { type: "quoteOnHand", key: "x3" }));
    expect(views[3].quantity).toBe(32);
    expect(views[3].shortBy).toBe(0);
    expect(views[3].edited).toBe(true);
  });

  it("does nothing for quote on hand at 0 on hand", () => {
    const state = run(
      initial,
      { type: "pickSupplier", key: "x3", supplier: "Harbor Point Industrial" },
      { type: "quoteOnHand", key: "x3" },
    );
    expect(derive(state).views[3].quantity).toBe(50);
  });

  it("picks a candidate with the default supplier rule for the line's quantity", () => {
    const [, second] = mixed.lines[1].match.candidates;
    const { views } = derive(run(initial, { type: "pickPart", key: "x1", candidate: second }));
    expect(views[1].line.selection).toEqual({
      kind: "part",
      partNumber: "MS29513-032",
      supplier: "Granite State Fasteners",
    });
    expect(views[1].line.supplierReason).toBe("No supplier can fill 12. Most on hand: 10");
    expect(views[1].needsChoice).toBe(false);
    expect(views[1].edited).toBe(true);
  });

  it("adds a part found by search to the line's candidates", () => {
    const state = run(initial, { type: "pickPart", key: "x2", candidate: searched });
    expect(state.lines[2].candidates).toEqual([searched]);
    // Quantity 2: "Small Stock" can fill it and is cheapest.
    expect(derive(state).views[2].unitPriceCents).toBe(unitPriceCents(8, 2500));
  });

  it("keeps a Low line unmatched as an explicit decision", () => {
    const { views } = derive(run(initial, { type: "keepUnmatched", key: "x1" }));
    expect(views[1].needsChoice).toBe(false);
    expect(views[1].unitPriceCents).toBeNull();
    expect(views[1].edited).toBe(false);
  });

  it("removes lines and renumbers the rest", () => {
    const { views } = derive(run(initial, { type: "removeLine", key: "x0" }));
    expect(views).toHaveLength(6);
    expect(views[0]).toMatchObject({ number: 1, line: { key: "x1" } });
  });

  it("adds hand lines with unique keys, priced when a part was found", () => {
    const state = run(
      initial,
      { type: "addLine", requestedText: "washers", candidate: searched },
      { type: "addLine", requestedText: "Custom bracket per drawing 7", candidate: null },
    );
    const { views } = derive(state);
    expect(views.slice(7).map((v) => [v.line.key, v.line.selection?.kind, v.quantityIssue, v.edited])).toEqual([
      ["m0", "part", "missing", true],
      ["m1", "unmatched", "missing", true],
    ]);
  });

  it("re-prices every line when the markup changes, and keeps the last valid markup while invalid", () => {
    const repriced = derive(run(initial, { type: "setMarkup", text: "10" }));
    expect(repriced.views[0].unitPriceCents).toBe(unitPriceCents(461, 1000));

    const invalid = run(initial, { type: "setMarkup", text: "10" }, { type: "setMarkup", text: "" });
    expect(invalid.markupBps).toBe(1000);
    expect(derive(invalid).summary.blockers.markupInvalid).toBe(true);
  });
});

describe("buildSaveRequest", () => {
  it("sends every line in screen order with edits, decisions, and no prices", () => {
    const [first] = mixed.lines[1].match.candidates;
    const state = run(
      initReviewState(mixed),
      { type: "pickPart", key: "x1", candidate: first },
      { type: "setQuantity", key: "x5", text: "1500" },
      { type: "keepUnmatched", key: "x6" },
      { type: "confirmQuantity", key: "x6" },
      { type: "removeLine", key: "x2" },
      { type: "setMarkup", text: "30" },
    );
    const { views, summary } = derive(state);
    expect(summary.canSave).toBe(true);

    const request = buildSaveRequest("00000000-0000-4000-8000-000000000002", state, views);
    expect(request.markupBps).toBe(3000);
    expect(request.lines.map((l) => [l.partNumber, l.supplier, l.quantity, l.edited])).toEqual([
      ["AL14720-1", "Frontier Turbine Parts", 40, false],
      ["MS29513-033", "Delta Wire & Cable", 12, true],
      ["M39029/41-861", "Ironclad Industrial Supply", 50, false],
      ["MS21044-243P", "Vanguard Aviation Spares", 200, false],
      ["M22759/13-12-3", "Copperline Electronics", 1500, true],
      [null, null, 6, false],
    ]);
    expect(request.lines[1]).toMatchObject({
      origin: "extracted",
      requestedText: "2. MS29513-034 o-ring, 12 ea",
      matchConfidence: "low",
      suggestedPartNumber: null,
    });
    expect(request.lines[0].suggestedPartNumber).toBe("AL14720-1");
    expect(JSON.stringify(request)).not.toMatch(/price|cost/i);
  });
});
