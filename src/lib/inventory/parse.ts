// Both from the sync entry point, so `instanceof CsvError` matches the errors it throws.
import { CsvError, type Info, parse } from "csv-parse/sync";
import { z } from "zod";

/** The exact header the loader accepts, in order (technical design section 4). */
export const INVENTORY_COLUMNS = [
  "part_number",
  "nsn",
  "description",
  "supplier",
  "qty_on_hand",
  "unit_cost",
  "lead_time_days",
] as const;

export type InventoryPart = { partNumber: string; nsn: string | null; description: string };

export type InventoryOffer = {
  partNumber: string;
  supplier: string;
  qtyOnHand: number;
  unitCostCents: number;
  leadTimeDays: number;
};

/** Parsed and validated inventory, ready to load: one part per part number, one offer per CSV row. */
export type Inventory = { parts: InventoryPart[]; offers: InventoryOffer[] };

/** One problem, with the 1-based line of the CSV file it was found on (the header is line 1). */
export type InventoryProblem = { line: number; message: string };

/** The CSV can't be loaded as is. Lists every problem found, so they can all be fixed in one pass. */
export class InventoryError extends Error {
  constructor(readonly problems: InventoryProblem[]) {
    const lines = problems.map((p) => `  Line ${p.line}: ${p.message}`).join("\n");
    super(`Inventory CSV has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n${lines}`);
    this.name = "InventoryError";
  }
}

// Every quantity, price, and lead time ends up in an `integer` column, in cents for prices.
const INT4_MAX = 2_147_483_647;
const NSN_FORMAT = /^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$/;

type Ctx = z.core.$RefinementCtx<string>;

function reject(ctx: Ctx, value: string, message: string): typeof z.NEVER {
  ctx.issues.push({ code: "custom", message, input: value });
  return z.NEVER;
}

const quoted = (value: string) => JSON.stringify(value);

// The brief confirms the inventory is clean, so these check and never repair:
// nothing is trimmed, reformatted, or rounded.

const required = (column: string) =>
  z.string().transform((value, ctx) => (value === "" ? reject(ctx, value, `${column} is blank`) : value));

const partNumber = z.string().transform((value, ctx) => {
  if (value === "") return reject(ctx, value, "part_number is blank");
  if (value !== value.trim()) {
    return reject(ctx, value, `part_number ${quoted(value)} has leading or trailing spaces`);
  }
  return value;
});

// A blank NSN means the part has none. It becomes NULL, never "", so it can't match anything.
const nsn = z.string().transform((value, ctx) => {
  if (value === "") return null;
  if (!NSN_FORMAT.test(value)) {
    return reject(ctx, value, `nsn ${quoted(value)} is not in ####-##-###-#### format`);
  }
  return value;
});

const wholeNumber = (column: string) =>
  z.string().transform((value, ctx) => {
    if (!/^[0-9]+$/.test(value)) {
      return reject(ctx, value, `${column} ${quoted(value)} is not a whole number 0 or greater`);
    }
    const number = Number(value);
    if (number > INT4_MAX) return reject(ctx, value, `${column} ${quoted(value)} is too large`);
    return number;
  });

// Dollars with exactly 2 decimals, to integer cents without going through a float.
// Number() of a digit string is exact here: any value large enough to lose precision is
// already far above INT4_MAX and rejected.
const unitCostCents = z.string().transform((value, ctx) => {
  const match = /^([0-9]+)\.([0-9]{2})$/.exec(value);
  if (!match) return reject(ctx, value, `unit_cost ${quoted(value)} is not dollars with 2 decimals, like 12.34`);
  const cents = Number(match[1]) * 100 + Number(match[2]);
  if (cents === 0) return reject(ctx, value, `unit_cost ${quoted(value)} must be greater than 0`);
  if (cents > INT4_MAX) return reject(ctx, value, `unit_cost ${quoted(value)} is too large`);
  return cents;
});

const InventoryRow = z.strictObject({
  part_number: partNumber,
  nsn,
  description: required("description"),
  supplier: required("supplier"),
  qty_on_hand: wholeNumber("qty_on_hand"),
  unit_cost: unitCostCents,
  lead_time_days: wholeNumber("lead_time_days"),
});

/**
 * Parses and validates inventory CSV text. Throws `InventoryError` listing every bad row,
 * or a part number whose rows disagree on NSN or description, or a repeated (part, supplier).
 */
export function parseInventoryCsv(text: string): Inventory {
  let records: { info: Info; record: string[] }[];
  try {
    // csv-parse's types don't model `info: true`, which wraps each record with its position.
    records = parse(text, { bom: true, info: true }) as unknown as typeof records;
  } catch (error) {
    if (error instanceof CsvError) {
      // csv-parse puts the line on every parse error; drop it from the text to avoid saying it twice.
      const message = error.message.replace(/ (on|at) line \d+$/, "");
      throw new InventoryError([{ line: error.lines as number, message: `malformed CSV: ${message}` }]);
    }
    throw error;
  }

  const [header, ...rows] = records;
  if (!header || header.record.join(",") !== INVENTORY_COLUMNS.join(",")) {
    const found = header ? quoted(header.record.join(",")) : "nothing";
    throw new InventoryError([
      { line: 1, message: `expected the header ${INVENTORY_COLUMNS.join(",")}, found ${found}` },
    ]);
  }
  if (rows.length === 0) {
    throw new InventoryError([{ line: 2, message: "no inventory rows after the header" }]);
  }

  const problems: InventoryProblem[] = [];
  const parts = new Map<string, InventoryPart & { line: number }>();
  const offerLines = new Map<string, number>();
  const offers: InventoryOffer[] = [];

  let previousEnd = header.info.lines;
  for (const { info, record } of rows) {
    // csv-parse reports the line a record ends on. A quoted field can span lines, so the
    // record starts right after the previous one ended.
    const line = previousEnd + 1;
    previousEnd = info.lines;

    const parsed = InventoryRow.safeParse(Object.fromEntries(INVENTORY_COLUMNS.map((c, i) => [c, record[i]])));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) problems.push({ line, message: issue.message });
      continue;
    }
    const row = parsed.data;

    const part = parts.get(row.part_number);
    if (!part) {
      parts.set(row.part_number, { partNumber: row.part_number, nsn: row.nsn, description: row.description, line });
    } else {
      if (part.nsn !== row.nsn) {
        problems.push({
          line,
          message: `part ${row.part_number} has nsn ${describeNsn(row.nsn)} here but ${describeNsn(part.nsn)} on line ${part.line}`,
        });
      }
      if (part.description !== row.description) {
        problems.push({
          line,
          message: `part ${row.part_number} has description ${quoted(row.description)} here but ${quoted(part.description)} on line ${part.line}`,
        });
      }
    }

    const offerKey = JSON.stringify([row.part_number, row.supplier]);
    const firstLine = offerLines.get(offerKey);
    if (firstLine !== undefined) {
      problems.push({
        line,
        message: `part ${row.part_number} from supplier ${quoted(row.supplier)} is already on line ${firstLine}`,
      });
      continue;
    }
    offerLines.set(offerKey, line);
    offers.push({
      partNumber: row.part_number,
      supplier: row.supplier,
      qtyOnHand: row.qty_on_hand,
      unitCostCents: row.unit_cost,
      leadTimeDays: row.lead_time_days,
    });
  }

  if (problems.length > 0) throw new InventoryError(problems);
  return {
    parts: [...parts.values()].map(({ partNumber, nsn, description }) => ({ partNumber, nsn, description })),
    offers,
  };
}

function describeNsn(value: string | null): string {
  return value === null ? "blank" : value;
}
