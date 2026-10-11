import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { offer, part } from "@/lib/db/schema";
import { setupTestDb } from "@/test/db";

const db = setupTestDb();

const HEADER = "part_number,nsn,description,supplier,qty_on_hand,unit_cost,lead_time_days";

/**
 * Runs `pnpm db:load` the way an operator does, as its own process. It inherits this
 * test's environment, so DATABASE_URL points at the per-run test database.
 */
async function dbLoad(...args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)("node_modules/.bin/tsx", ["scripts/load-inventory.ts", ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
    return { code, stdout, stderr };
  }
}

async function writeCsv(...rows: string[]): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "inventory-")), "inventory.csv");
  await writeFile(path, [HEADER, ...rows].join("\n") + "\n");
  return path;
}

describe("pnpm db:load", { timeout: 30_000 }, () => {
  it("loads a CSV and reports parts and offers loaded", async () => {
    const path = await writeCsv(
      'GS9174A,5905-01-520-3335,"RESISTOR,FIXED,FILM 4.7K OHM 1/4W",Continental Hose Co,8,1.68,7',
      'GS9174A,5905-01-520-3335,"RESISTOR,FIXED,FILM 4.7K OHM 1/4W",Lakeshore Precision,13,1.30,21',
      'MS29513-037,,"SEAL,NONMETALLIC SPECIAL SHAPED SECTION AS568-012",Ridgeline MRO Supply,0,1.16,70',
    );

    const result = await dbLoad(path);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(new RegExp(`^Loaded 2 parts and 3 offers from ${path} in \\d+\\.\\ds\\.\\n$`));
    expect(await db.$count(offer)).toBe(3);
  });

  it("lists every bad row by line, exits non-zero, and changes nothing", async () => {
    await db.insert(part).values({ partNumber: "AN3-9D", description: "NUT" });
    const path = await writeCsv("AN5-34,,NUT,Blue Ridge Bearings,-1,1.94,14", "AN5-34,8445,NUT,Acme,19,1.94,14");

    const result = await dbLoad(path);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      [
        "Inventory not loaded. The database was not changed.",
        `2 problems in ${path}:`,
        '  Line 2: qty_on_hand "-1" is not a whole number 0 or greater',
        '  Line 3: nsn "8445" is not in ####-##-###-#### format',
        "",
      ].join("\n"),
    );
    expect((await db.select().from(part)).map((p) => p.partNumber)).toEqual(["AN3-9D"]);
  });

  it("explains usage when the path is missing", async () => {
    expect(await dbLoad()).toMatchObject({ code: 2, stderr: "Usage: pnpm db:load <path-to-csv>\n" });
  });

  it("says when the file can't be read", async () => {
    const result = await dbLoad("does/not/exist.csv");
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^Can't read does\/not\/exist\.csv: ENOENT/);
  });
});
