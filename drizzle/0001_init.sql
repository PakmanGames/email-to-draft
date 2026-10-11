CREATE TABLE "extraction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_text" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"duration_ms" integer,
	CONSTRAINT "extraction_status_check" CHECK (status IN ('pending', 'succeeded', 'no_items', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"part_number" text NOT NULL,
	"supplier" text NOT NULL,
	"qty_on_hand" integer NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"lead_time_days" integer NOT NULL,
	CONSTRAINT "offer_pkey" PRIMARY KEY("part_number","supplier"),
	CONSTRAINT "offer_supplier_check" CHECK (supplier <> ''),
	CONSTRAINT "offer_qty_on_hand_check" CHECK (qty_on_hand >= 0),
	CONSTRAINT "offer_unit_cost_check" CHECK (unit_cost > 0),
	CONSTRAINT "offer_lead_time_days_check" CHECK (lead_time_days >= 0)
);
--> statement-breakpoint
CREATE TABLE "part" (
	"part_number" text PRIMARY KEY NOT NULL,
	"part_number_key" text GENERATED ALWAYS AS (regexp_replace(upper(part_number), '[^A-Z0-9]', '', 'g')) STORED NOT NULL,
	"nsn" text,
	"description" text NOT NULL,
	CONSTRAINT "part_part_number_check" CHECK (part_number <> '' AND part_number = btrim(part_number)),
	CONSTRAINT "part_nsn_check" CHECK (nsn ~ '^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$'),
	CONSTRAINT "part_description_check" CHECK (description <> '')
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"markup_bps" integer NOT NULL,
	"total_cents" bigint NOT NULL,
	CONSTRAINT "quote_extraction_id_key" UNIQUE("extraction_id"),
	CONSTRAINT "quote_markup_bps_check" CHECK (markup_bps BETWEEN 0 AND 100000),
	CONSTRAINT "quote_total_cents_check" CHECK (total_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_line" (
	"quote_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"origin" text NOT NULL,
	"edited" boolean NOT NULL,
	"requested_text" text NOT NULL,
	"quantity" integer NOT NULL,
	"match_confidence" text,
	"match_reason" text,
	"suggested_part_number" text,
	"part_number" text,
	"description" text,
	"supplier" text,
	"unit_cost_cents" integer,
	"unit_price_cents" integer,
	"qty_on_hand" integer,
	"lead_time_days" integer,
	CONSTRAINT "quote_line_pkey" PRIMARY KEY("quote_id","position"),
	CONSTRAINT "quote_line_position_check" CHECK (position >= 0),
	CONSTRAINT "quote_line_origin_check" CHECK (origin IN ('extracted', 'manual')),
	CONSTRAINT "quote_line_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "quote_line_match_confidence_check" CHECK (match_confidence IN ('high', 'low', 'none')),
	CONSTRAINT "quote_line_unit_cost_cents_check" CHECK (unit_cost_cents > 0),
	CONSTRAINT "quote_line_unit_price_cents_check" CHECK (unit_price_cents > 0),
	CONSTRAINT "quote_line_qty_on_hand_check" CHECK (qty_on_hand >= 0),
	CONSTRAINT "quote_line_lead_time_days_check" CHECK (lead_time_days >= 0),
	CONSTRAINT "quote_line_snapshot_check" CHECK ((part_number IS NULL AND supplier IS NULL AND unit_cost_cents IS NULL AND unit_price_cents IS NULL AND qty_on_hand IS NULL AND lead_time_days IS NULL) OR (part_number IS NOT NULL AND supplier IS NOT NULL AND unit_cost_cents IS NOT NULL AND unit_price_cents IS NOT NULL AND qty_on_hand IS NOT NULL AND lead_time_days IS NOT NULL)),
	CONSTRAINT "quote_line_price_not_below_cost_check" CHECK (unit_price_cents >= unit_cost_cents)
);
--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_part_number_fkey" FOREIGN KEY ("part_number") REFERENCES "public"."part"("part_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "public"."extraction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_key_idx" ON "part" USING btree ("part_number_key");--> statement-breakpoint
CREATE INDEX "part_nsn_idx" ON "part" USING btree ("nsn");--> statement-breakpoint
CREATE INDEX "part_key_trgm_idx" ON "part" USING gin ("part_number_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "part_desc_trgm_idx" ON "part" USING gin ("description" gin_trgm_ops);