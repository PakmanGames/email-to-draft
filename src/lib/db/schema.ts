import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { ExtractionAttempt, ReviewSeed } from "@/lib/contracts";

/**
 * Technical design section 4. The SQL there is the source of truth: keep this file and
 * the generated migration in step with it. Constraint names follow Postgres's own defaults
 * (`<table>_pkey`, `<table>_<column>_fkey`, `<table>_<column>_key`, `<table>_<column>_check`) so errors read the
 * same as they would for the hand-written DDL.
 *
 * Extensions (pg_trgm, fuzzystrmatch) are created by the first, hand-written migration,
 * because drizzle-kit does not emit CREATE EXTENSION.
 */

// One row per distinct part number. States the assumption that a part has one NSN and description.
export const part = pgTable(
  "part",
  {
    partNumber: text("part_number").primaryKey(),
    // Uppercase, letters and digits only. Must match partNumberKey() in src/lib/identifiers.ts.
    partNumberKey: text("part_number_key")
      .notNull()
      .generatedAlwaysAs(sql`regexp_replace(upper(part_number), '[^A-Z0-9]', '', 'g')`),
    nsn: text("nsn"),
    description: text("description").notNull(),
  },
  (t) => [
    check("part_part_number_check", sql`part_number <> '' AND part_number = btrim(part_number)`),
    check("part_nsn_check", sql`nsn ~ '^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$'`),
    check("part_description_check", sql`description <> ''`),
    index("part_key_idx").on(t.partNumberKey),
    index("part_nsn_idx").on(t.nsn),
    index("part_key_trgm_idx").using("gin", t.partNumberKey.op("gin_trgm_ops")),
    index("part_desc_trgm_idx").using("gin", t.description.op("gin_trgm_ops")),
  ],
);

// One row per (part, supplier). This is what the CSV rows are.
export const offer = pgTable(
  "offer",
  {
    partNumber: text("part_number").notNull(),
    supplier: text("supplier").notNull(),
    qtyOnHand: integer("qty_on_hand").notNull(),
    // numeric comes back as a string; convert to integer cents, never to a float.
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
    leadTimeDays: integer("lead_time_days").notNull(),
  },
  (t) => [
    primaryKey({ name: "offer_pkey", columns: [t.partNumber, t.supplier] }),
    foreignKey({ name: "offer_part_number_fkey", columns: [t.partNumber], foreignColumns: [part.partNumber] }),
    check("offer_supplier_check", sql`supplier <> ''`),
    check("offer_qty_on_hand_check", sql`qty_on_hand >= 0`),
    check("offer_unit_cost_check", sql`unit_cost > 0`),
    check("offer_lead_time_days_check", sql`lead_time_days >= 0`),
  ],
);

export const extraction = pgTable(
  "extraction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    emailText: text("email_text").notNull(),
    status: text("status", { enum: ["pending", "succeeded", "no_items", "failed"] }).notNull(),
    errorCode: text("error_code"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    attempts: jsonb("attempts").$type<ExtractionAttempt[]>().notNull().default([]),
    result: jsonb("result").$type<ReviewSeed>(), // what the review page renders
    durationMs: integer("duration_ms"),
  },
  () => [
    check("extraction_status_check", sql`status IN ('pending', 'succeeded', 'no_items', 'failed')`),
  ],
);

export const quote = pgTable(
  "quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // One draft per extraction. Makes Save idempotent across double clicks, retries, and a second tab.
    extractionId: uuid("extraction_id").notNull().unique("quote_extraction_id_key"),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
  },
  (t) => [
    foreignKey({ name: "quote_extraction_id_fkey", columns: [t.extractionId], foreignColumns: [extraction.id] }),
    check("quote_total_cents_check", sql`total_cents >= 0`),
  ],
);

// Lines are snapshots. They do not reference offer, so reloading inventory never breaks a saved draft.
export const quoteLine = pgTable(
  "quote_line",
  {
    quoteId: uuid("quote_id").notNull(),
    position: integer("position").notNull(),
    origin: text("origin", { enum: ["extracted", "manual"] }).notNull(),
    edited: boolean("edited").notNull(),
    requestedText: text("requested_text").notNull(), // what the customer wrote, or the rep's note for manual lines
    quantity: integer("quantity").notNull(),
    matchConfidence: text("match_confidence", { enum: ["high", "low", "none"] }),
    matchReason: text("match_reason"),
    suggestedPartNumber: text("suggested_part_number"), // what matching preselected; compared with part_number for metric G4
    partNumber: text("part_number"),
    description: text("description"),
    supplier: text("supplier"),
    unitPriceCents: integer("unit_price_cents"),
    qtyOnHand: integer("qty_on_hand"),
    leadTimeDays: integer("lead_time_days"),
  },
  (t) => [
    primaryKey({ name: "quote_line_pkey", columns: [t.quoteId, t.position] }),
    foreignKey({ name: "quote_line_quote_id_fkey", columns: [t.quoteId], foreignColumns: [quote.id] }).onDelete("cascade"),
    check("quote_line_position_check", sql`position >= 0`),
    check("quote_line_origin_check", sql`origin IN ('extracted', 'manual')`),
    check("quote_line_quantity_check", sql`quantity > 0`),
    check("quote_line_match_confidence_check", sql`match_confidence IN ('high', 'low', 'none')`),
    check("quote_line_unit_price_cents_check", sql`unit_price_cents > 0`),
    check("quote_line_qty_on_hand_check", sql`qty_on_hand >= 0`),
    check("quote_line_lead_time_days_check", sql`lead_time_days >= 0`),
    // A line is either fully priced from an offer or fully unmatched.
    check(
      "quote_line_snapshot_check",
      sql`(part_number IS NULL AND supplier IS NULL AND unit_price_cents IS NULL AND qty_on_hand IS NULL AND lead_time_days IS NULL) OR (part_number IS NOT NULL AND supplier IS NOT NULL AND unit_price_cents IS NOT NULL AND qty_on_hand IS NOT NULL AND lead_time_days IS NOT NULL)`,
    ),
  ],
);
