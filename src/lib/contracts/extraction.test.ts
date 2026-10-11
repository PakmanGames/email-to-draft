import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmExtraction, ValidatedLlmExtraction } from "./extraction";

type JsonSchema = { [key: string]: unknown };

/** Every object schema reachable from `schema`, following JSON Schema keywords. */
function objectSchemas(schema: JsonSchema): JsonSchema[] {
  const found: JsonSchema[] = [];
  const visit = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const s = node as JsonSchema;
    if (s.type === "object" || "properties" in s) found.push(s);
    for (const key of ["properties", "$defs", "definitions"]) {
      if (s[key]) Object.values(s[key] as JsonSchema).forEach(visit);
    }
    for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
      if (Array.isArray(s[key])) s[key].forEach(visit);
    }
    for (const key of ["items", "additionalProperties", "not"]) visit(s[key]);
  };
  visit(schema);
  return found;
}

describe("LlmExtraction JSON Schema", () => {
  const jsonSchema = z.toJSONSchema(LlmExtraction) as JsonSchema;
  const objects = objectSchemas(jsonSchema);

  it("reaches the root object and the line item object", () => {
    expect(objects.length).toBeGreaterThanOrEqual(2);
  });

  it("meets Groq strict mode: additionalProperties false and every property required", () => {
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      const properties = Object.keys((object.properties ?? {}) as JsonSchema).sort();
      expect([...((object.required ?? []) as string[])].sort()).toEqual(properties);
    }
  });
});

describe("ValidatedLlmExtraction", () => {
  const item = {
    source_text: "MS29513-033, 2 boxes of 100",
    part_number: "MS29513-033",
    nsn: null,
    description: null,
    quantity: 2,
    unit: "boxes",
    pack_size: 100,
  };
  const output = { line_items: [item], no_items_reason: null, superseded_note: null };

  it("accepts output that LlmExtraction accepts and the refinements allow", () => {
    expect(LlmExtraction.safeParse(output).success).toBe(true);
    expect(ValidatedLlmExtraction.safeParse(output).success).toBe(true);
    const nulls = { ...item, quantity: null, pack_size: null };
    expect(ValidatedLlmExtraction.safeParse({ ...output, line_items: [nulls] }).success).toBe(true);
  });

  it.each([
    ["fractional quantity", { quantity: 2.5 }],
    ["zero quantity", { quantity: 0 }],
    ["negative quantity", { quantity: -3 }],
    ["fractional pack size", { pack_size: 0.5 }],
    ["empty source text", { source_text: "" }],
    ["oversized source text", { source_text: "x".repeat(2001) }],
    ["oversized part number", { part_number: "X".repeat(101) }],
  ])("rejects a line item with %s", (_label, change) => {
    const bad = { ...output, line_items: [{ ...item, ...change }] };
    expect(ValidatedLlmExtraction.safeParse(bad).success).toBe(false);
  });

  it.each([
    ["an extra key", { ...output, price: 1 }],
    ["a quantity as text", { ...output, line_items: [{ ...item, quantity: "fifty" }] }],
    ["a missing key", { line_items: [], no_items_reason: null }],
    ["more than 100 line items", { ...output, line_items: Array(101).fill(item) }],
    ["an unknown no_items_reason", { ...output, no_items_reason: "busy" }],
  ])("rejects output with %s", (_label, bad) => {
    expect(ValidatedLlmExtraction.safeParse(bad).success).toBe(false);
  });
});
