-- Hand-written: drizzle-kit does not emit CREATE EXTENSION. Runs before the tables,
-- because the trigram indexes need pg_trgm's gin_trgm_ops.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
