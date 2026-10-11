/**
 * `pnpm db:load <path-to-csv>`: replaces the inventory in DATABASE_URL with the CSV (INV-1).
 *
 * Validates the whole file first and lists every bad row by line number. Nothing is written
 * unless the file is valid, and the write is one transaction, so a failure at any point
 * leaves the previous inventory in place (INV-4).
 */
import { readFile } from "node:fs/promises";
import { db } from "@/lib/db/client";
import { InventoryError, parseInventoryCsv, replaceInventory } from "@/lib/inventory";

const MAX_PROBLEMS_SHOWN = 20;
const count = new Intl.NumberFormat("en-US");

async function main(): Promise<number> {
  const path = process.argv[2];
  if (!path || process.argv.length > 3) {
    console.error("Usage: pnpm db:load <path-to-csv>");
    return 2;
  }

  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    console.error(`Can't read ${path}: ${(error as Error).message}`);
    return 1;
  }

  const started = performance.now();
  try {
    const inventory = parseInventoryCsv(text);
    const loaded = await replaceInventory(db, inventory);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`Loaded ${count.format(loaded.parts)} parts and ${count.format(loaded.offers)} offers from ${path} in ${seconds}s.`);
    return 0;
  } catch (error) {
    console.error(`Inventory not loaded. The database was not changed.\n${describe(error, path)}`);
    return 1;
  }
}

function describe(error: unknown, path: string): string {
  if (error instanceof InventoryError) {
    const { problems } = error;
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN).map((p) => `  Line ${p.line}: ${p.message}`);
    if (problems.length > shown.length) shown.push(`  ...and ${problems.length - shown.length} more`);
    return [`${count.format(problems.length)} problem${problems.length === 1 ? "" : "s"} in ${path}:`, ...shown].join("\n");
  }
  // Drizzle wraps the driver error with the full query and every bound parameter, which is
  // thousands of values per batch. The driver's own message and detail are what matter.
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  if (cause?.message) return [cause.message, cause.detail].filter(Boolean).join("\n");
  return error instanceof Error ? error.message : String(error);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => db.$client.end());
