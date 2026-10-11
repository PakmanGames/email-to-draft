/**
 * Review screen state (technical design section 8): a pure reducer plus the values derived
 * from it. One ReviewScreen holds this in memory for one extraction. Nothing is written to
 * storage that other tabs can see, so a second tab never affects the first (EXT-4).
 */
import {
  MAX_LINE_QUANTITY,
  type Candidate,
  type LineWarning,
  type LineWarningCode,
  type Offer,
  type ReviewSeed,
  type SaveQuoteRequest,
} from "@/lib/contracts";
// The module itself, not "@/lib/matching", which pulls in the database client.
import { pickDefaultSupplier } from "@/lib/matching/default-supplier";
import { DEFAULT_MARKUP_BPS, unitPriceCents } from "@/lib/pricing";

export type SeedLine = ReviewSeed["lines"][number];

/** Warnings the rep must confirm or answer by editing the quantity before saving (REV-6). */
const QUANTITY_CHECK_CODES: ReadonlySet<LineWarningCode> = new Set([
  "QTY_MISSING",
  "UNIT_UNKNOWN",
  "QTY_NOT_IN_TEXT",
  "LINE_NOT_GROUNDED",
]);

/** REV-9: the rep can set 0% to 1000%. */
const MAX_MARKUP_BPS = 100_000;

export type Selection = { kind: "part"; partNumber: string; supplier: string } | { kind: "unmatched" };

export type ReviewLine = {
  /** Stable React key and DOM id suffix. Survives removals, unlike the display position. */
  key: string;
  /** The extracted line and its match, or null for a line the rep added by hand. */
  seed: SeedLine | null;
  /** What the customer wrote, or the rep's note for a hand-added line. */
  requestedText: string;
  /** Matching's candidates, then any part the rep found by searching inventory. */
  candidates: Candidate[];
  /** Null only while a line still needs the rep's decision (a Low line, at first). */
  selection: Selection | null;
  /** Why the selected supplier was picked, while it is still the automatic pick. */
  supplierReason: string | null;
  /** Raw input, so a half-typed or cleared field stays as the rep left it. */
  quantityText: string;
  /** The rep confirmed or edited a quantity that extraction flagged. */
  quantityConfirmed: boolean;
};

export type ReviewState = {
  lines: ReviewLine[];
  /** Raw markup input in percent. */
  markupText: string;
  /** Last valid markup. Prices keep using it while the input is mid-edit or invalid. */
  markupBps: number;
  /** Counter for hand-added line keys. */
  addedCount: number;
};

export type ReviewAction =
  | { type: "setQuantity"; key: string; text: string }
  | { type: "confirmQuantity"; key: string }
  | { type: "quoteOnHand"; key: string }
  | { type: "pickPart"; key: string; candidate: Candidate }
  | { type: "pickSupplier"; key: string; supplier: string }
  | { type: "keepUnmatched"; key: string }
  | { type: "removeLine"; key: string }
  | { type: "addLine"; requestedText: string; candidate: Candidate | null }
  | { type: "setMarkup"; text: string };

/**
 * A whole number the draft can hold, from 1 to MAX_LINE_QUANTITY, or null. Commas and spaces
 * are ignored ("1,500"). Anything else blocks Save on that line, so the rep fixes it here
 * instead of the save failing (KI-001).
 */
export function parseQuantity(text: string): number | null {
  const digits = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const quantity = Number(digits);
  return quantity >= 1 && quantity <= MAX_LINE_QUANTITY ? quantity : null;
}

/** Percent with up to two decimals ("25", "12.5") to basis points, or null when out of range. */
export function parseMarkupBps(text: string): number | null {
  const match = /^(\d{1,4})(?:\.(\d{0,2}))?$/.exec(text.trim());
  if (!match) return null;
  // Integer math: "12.5" is 12 × 100 + 50, never 12.5 × 100 in floating point.
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bps <= MAX_MARKUP_BPS ? bps : null;
}

/** Basis points as the percent the rep types: 2500 → "25", 1250 → "12.5". */
export function formatMarkupPercent(bps: number): string {
  return String(bps / 100);
}

/**
 * What matching preselected for a line: the default part and supplier of a High match, if
 * both exist in its candidates. Low and None lines get no preselection, so a Low line always
 * needs the rep's explicit decision (REV-6).
 */
function suggestedSelection(seed: SeedLine): Selection | null {
  const { match } = seed;
  if (match.confidence === "none") return { kind: "unmatched" };
  if (match.confidence !== "high" || !match.defaultPartNumber || !match.defaultSupplier) return null;
  const part = match.candidates.find((c) => c.partNumber === match.defaultPartNumber);
  if (!part?.offers.some((o) => o.supplier === match.defaultSupplier)) return null;
  return { kind: "part", partNumber: part.partNumber, supplier: match.defaultSupplier };
}

function suggestedPart(seed: SeedLine | null): Selection & { kind: "part" } | null {
  const selection = seed && suggestedSelection(seed);
  return selection?.kind === "part" ? selection : null;
}

export function initReviewState(seed: ReviewSeed): ReviewState {
  return {
    lines: seed.lines.map((line, i) => {
      const selection = suggestedSelection(line);
      return {
        key: `x${i}`,
        seed: line,
        requestedText: line.extracted.sourceText,
        candidates: line.match.candidates,
        selection,
        supplierReason: selection?.kind === "part" ? line.match.defaultSupplierReason : null,
        quantityText: line.extracted.quantityEach?.toString() ?? "",
        quantityConfirmed: false,
      };
    }),
    markupText: formatMarkupPercent(DEFAULT_MARKUP_BPS),
    markupBps: DEFAULT_MARKUP_BPS,
    addedCount: 0,
  };
}

function selectedPart(line: ReviewLine): Candidate | null {
  const { selection } = line;
  if (selection?.kind !== "part") return null;
  return line.candidates.find((c) => c.partNumber === selection.partNumber) ?? null;
}

function selectedOffer(line: ReviewLine): Offer | null {
  const { selection } = line;
  if (selection?.kind !== "part") return null;
  return selectedPart(line)?.offers.find((o) => o.supplier === selection.supplier) ?? null;
}

/**
 * Selects a part with matching's default supplier rule for the line's quantity, the way a
 * High match comes preselected (KI-009). A part found by search joins the line's candidates.
 */
function withPart(line: ReviewLine, candidate: Candidate): ReviewLine {
  const known = line.candidates.some((c) => c.partNumber === candidate.partNumber);
  const { supplier, reason } = pickDefaultSupplier(candidate.offers, parseQuantity(line.quantityText));
  return {
    ...line,
    candidates: known ? line.candidates : [...line.candidates, candidate],
    selection: { kind: "part", partNumber: candidate.partNumber, supplier },
    supplierReason: reason,
  };
}

/**
 * Sets the quantity, which also answers a quantity flag (REV-6). While the supplier is still
 * the automatic pick, it is re-picked for the new quantity, so it and its reason stay true.
 * A supplier the rep chose stays put.
 */
function withQuantity(line: ReviewLine, text: string): ReviewLine {
  const next = { ...line, quantityText: text, quantityConfirmed: true };
  const part = selectedPart(line);
  const quantity = parseQuantity(text);
  if (!part || line.supplierReason === null || quantity === null) return next;
  const { supplier, reason } = pickDefaultSupplier(part.offers, quantity);
  return { ...next, selection: { kind: "part", partNumber: part.partNumber, supplier }, supplierReason: reason };
}

function updateLine(state: ReviewState, key: string, update: (line: ReviewLine) => ReviewLine): ReviewState {
  return { ...state, lines: state.lines.map((line) => (line.key === key ? update(line) : line)) };
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "setQuantity":
      return updateLine(state, action.key, (line) => withQuantity(line, action.text));
    case "confirmQuantity":
      return updateLine(state, action.key, (line) => ({ ...line, quantityConfirmed: true }));
    case "quoteOnHand":
      return updateLine(state, action.key, (line) => {
        const onHand = selectedOffer(line)?.qtyOnHand ?? 0;
        // Never offered at 0 on hand: a quantity of 0 can't be saved (REV-4).
        return onHand > 0 ? withQuantity(line, String(onHand)) : line;
      });
    case "pickPart":
      return updateLine(state, action.key, (line) => withPart(line, action.candidate));
    case "pickSupplier":
      return updateLine(state, action.key, (line) =>
        line.selection?.kind === "part"
          ? { ...line, selection: { ...line.selection, supplier: action.supplier }, supplierReason: null }
          : line,
      );
    case "keepUnmatched":
      return updateLine(state, action.key, (line) => ({ ...line, selection: { kind: "unmatched" }, supplierReason: null }));
    case "removeLine":
      return { ...state, lines: state.lines.filter((line) => line.key !== action.key) };
    case "addLine": {
      const added: ReviewLine = {
        key: `m${state.addedCount}`,
        seed: null,
        requestedText: action.requestedText,
        candidates: [],
        selection: { kind: "unmatched" },
        supplierReason: null,
        quantityText: "",
        quantityConfirmed: false,
      };
      return {
        ...state,
        lines: [...state.lines, action.candidate ? withPart(added, action.candidate) : added],
        addedCount: state.addedCount + 1,
      };
    }
    case "setMarkup":
      return { ...state, markupText: action.text, markupBps: parseMarkupBps(action.text) ?? state.markupBps };
  }
}

/** Why a line can't be saved yet, beyond needing a part decision. */
export type QuantityIssue = "missing" | "unconfirmed" | null;

export type LineView = {
  line: ReviewLine;
  /** 1-based position on screen and in the saved draft. */
  number: number;
  quantity: number | null;
  part: Candidate | null;
  offer: Offer | null;
  unitPriceCents: number | null;
  extendedCents: number | null;
  /** How far the quantity exceeds the selected supplier's on hand, or 0. */
  shortBy: number;
  /** Flags that make the rep check the quantity (REV-6), whether or not they are answered yet. */
  quantityWarnings: LineWarning[];
  /** Every other extraction warning: informational notes and dropped identifiers. */
  otherWarnings: LineWarning[];
  quantityIssue: QuantityIssue;
  needsChoice: boolean;
  /** Differs from what extraction and matching produced (SAVE-4). Hand-added lines always count. */
  edited: boolean;
};

export function viewLine(line: ReviewLine, index: number, markupBps: number): LineView {
  const quantity = parseQuantity(line.quantityText);
  const offer = selectedOffer(line);
  const unitPrice = offer ? unitPriceCents(offer.unitCostCents, markupBps) : null;
  const warnings = line.seed?.extracted.warnings ?? [];
  const quantityWarnings = warnings.filter((w) => QUANTITY_CHECK_CODES.has(w.code));

  let quantityIssue: QuantityIssue = null;
  if (quantity === null) quantityIssue = "missing";
  else if (quantityWarnings.length > 0 && !line.quantityConfirmed) quantityIssue = "unconfirmed";

  const suggested = suggestedPart(line.seed);
  const chosen = line.selection?.kind === "part" ? line.selection : null;
  const edited =
    line.seed === null ||
    quantity !== line.seed.extracted.quantityEach ||
    (chosen?.partNumber ?? null) !== (suggested?.partNumber ?? null) ||
    (chosen?.supplier ?? null) !== (suggested?.supplier ?? null);

  return {
    line,
    number: index + 1,
    quantity,
    part: selectedPart(line),
    offer,
    unitPriceCents: unitPrice,
    extendedCents: unitPrice !== null && quantity !== null ? unitPrice * quantity : null,
    shortBy: offer && quantity !== null ? Math.max(0, quantity - offer.qtyOnHand) : 0,
    quantityWarnings,
    otherWarnings: warnings.filter((w) => !QUANTITY_CHECK_CODES.has(w.code)),
    quantityIssue,
    needsChoice: line.selection === null,
    edited,
  };
}

export type ReviewSummary = {
  lineCount: number;
  /** A partition of the lines, for the summary bar (REV-2). Each line is counted once. */
  groups: { ready: number; needChoice: number; needQuantity: number; toConfirm: number; unmatched: number };
  /** Everything that blocks Save (REV-6). A line can count under more than one. */
  blockers: { needChoice: number; needQuantity: number; toConfirm: number; markupInvalid: boolean; noLines: boolean };
  /** The first line with something left to do, and which control answers it. */
  firstBlocked: { key: string; number: number; target: "choice" | "quantity" } | null;
  /** Lines quoting more than their supplier has on hand (REV-10). */
  shortCount: number;
  totalCents: number;
  /** Lines without a price, which the total leaves out (REV-5). */
  unpricedCount: number;
  canSave: boolean;
};

export function summarize(state: ReviewState, views: LineView[]): ReviewSummary {
  const groups = { ready: 0, needChoice: 0, needQuantity: 0, toConfirm: 0, unmatched: 0 };
  const blockers = {
    needChoice: 0,
    needQuantity: 0,
    toConfirm: 0,
    markupInvalid: parseMarkupBps(state.markupText) === null,
    noLines: views.length === 0,
  };
  let firstBlocked: ReviewSummary["firstBlocked"] = null;
  let shortCount = 0;
  let totalCents = 0;
  let unpricedCount = 0;

  for (const view of views) {
    if (view.needsChoice) groups.needChoice++;
    else if (view.quantityIssue === "missing") groups.needQuantity++;
    else if (view.quantityIssue === "unconfirmed") groups.toConfirm++;
    else if (view.line.selection?.kind === "unmatched") groups.unmatched++;
    else groups.ready++;

    if (view.needsChoice) blockers.needChoice++;
    if (view.quantityIssue === "missing") blockers.needQuantity++;
    if (view.quantityIssue === "unconfirmed") blockers.toConfirm++;
    if (!firstBlocked && (view.needsChoice || view.quantityIssue)) {
      firstBlocked = { key: view.line.key, number: view.number, target: view.needsChoice ? "choice" : "quantity" };
    }

    if (view.shortBy > 0) shortCount++;
    if (view.unitPriceCents === null) unpricedCount++;
    if (view.extendedCents !== null) totalCents += view.extendedCents;
  }

  const canSave =
    !blockers.noLines &&
    !blockers.markupInvalid &&
    blockers.needChoice + blockers.needQuantity + blockers.toConfirm === 0;
  return { lineCount: views.length, groups, blockers, firstBlocked, shortCount, totalCents, unpricedCount, canSave };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What is left before Save is enabled, in the order the rep should work through it. */
export function describeBlockers(blockers: ReviewSummary["blockers"]): string[] {
  const parts: string[] = [];
  if (blockers.noLines) parts.push("add at least one line");
  if (blockers.needChoice) parts.push(count(blockers.needChoice, "line needs a choice", "lines need a choice"));
  if (blockers.needQuantity) parts.push(count(blockers.needQuantity, "line needs a quantity", "lines need a quantity"));
  if (blockers.toConfirm) parts.push(count(blockers.toConfirm, "quantity to confirm", "quantities to confirm"));
  if (blockers.markupInvalid) parts.push("set a markup from 0 to 1000%");
  return parts;
}

/**
 * The body for POST /api/quotes. Call only when `summarize(...).canSave`. Carries no prices:
 * the server re-prices every line from inventory cost and `markupBps` (SAVE-1).
 */
export function buildSaveRequest(extractionId: string, state: ReviewState, views: LineView[]): SaveQuoteRequest {
  return {
    extractionId,
    markupBps: state.markupBps,
    lines: views.map(({ line, quantity, edited }) => {
      if (quantity === null) throw new Error(`Line ${line.key} has no quantity`);
      const chosen = line.selection?.kind === "part" ? line.selection : null;
      return {
        origin: line.seed ? "extracted" : "manual",
        edited,
        requestedText: line.requestedText,
        quantity,
        matchConfidence: line.seed?.match.confidence ?? null,
        matchReason: line.seed?.match.reason ?? null,
        suggestedPartNumber: suggestedPart(line.seed)?.partNumber ?? null,
        partNumber: chosen?.partNumber ?? null,
        supplier: chosen?.supplier ?? null,
      };
    }),
  };
}
