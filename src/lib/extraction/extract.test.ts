import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmExtraction } from "@/lib/contracts";
import { ATTEMPT_TIMEOUT_MS, extractLines } from "./extract";
import { FakeLlmClient, type FakeReply, fakeReply } from "./fake";
import type { LlmClient, LlmResponse } from "./llm";
import { EXTRACTION_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompt";

const EMAIL = `Please quote:
MS29513-033 O-RING qty 50
AN960C10L washer, 2 boxes of 100

Thanks, Dana`;

const GOOD: LlmExtraction = {
  line_items: [
    {
      source_text: "MS29513-033 O-RING qty 50",
      part_number: "MS29513-033",
      nsn: null,
      description: "O-RING",
      quantity: 50,
      unit: null,
      pack_size: null,
    },
    {
      source_text: "AN960C10L washer, 2 boxes of 100",
      part_number: "AN960C10L",
      nsn: null,
      description: "washer",
      quantity: 2,
      unit: "boxes",
      pack_size: 100,
    },
  ],
  no_items_reason: null,
  superseded_note: null,
};

const SCHEMA_VIOLATION = fakeReply.content(
  JSON.stringify({ ...GOOD, line_items: [{ ...GOOD.line_items[0], quantity: "fifty" }] }),
);

function run(llm: LlmClient, signal = new AbortController().signal) {
  return extractLines(EMAIL, { llm, signal });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("extractLines", () => {
  it("returns checked lines and one traced attempt for a good answer", async () => {
    const llm = new FakeLlmClient(fakeReply.json(GOOD));
    const result = await run(llm);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.map((l) => [l.partNumber, l.quantityEach])).toEqual([
      ["MS29513-033", 50],
      ["AN960C10L", 200],
    ]);
    expect(result.notices).toEqual([]);
    expect(result.attempts).toEqual([
      {
        startedAt: new Date().toISOString(),
        durationMs: 0,
        httpStatus: 200,
        finishReason: "stop",
        rawOutput: JSON.stringify(GOOD),
        errorCode: null,
        issues: [],
      },
    ]);
  });

  it("sends the system prompt, the email as data, and the strict schema", async () => {
    const llm = new FakeLlmClient(fakeReply.json(GOOD));
    await run(llm);
    expect(llm.calls).toEqual([{ system: SYSTEM_PROMPT, user: `<email>\n${EMAIL}\n</email>`, jsonSchema: EXTRACTION_JSON_SCHEMA }]);
  });

  it("returns no lines and a notice for an email with no items", async () => {
    const llm = new FakeLlmClient(fakeReply.json({ line_items: [], no_items_reason: "auto_reply", superseded_note: null }));
    const result = await run(llm);
    expect(result).toMatchObject({ ok: true, lines: [], notices: [{ code: "NO_ITEMS" }] });
  });

  it("drops a hallucinated identifier and keeps the line", async () => {
    const invented = { ...GOOD, line_items: [{ ...GOOD.line_items[0], part_number: "MS29513-999" }] };
    const result = await run(new FakeLlmClient(fakeReply.json(invented)));
    expect(result).toMatchObject({ ok: true, lines: [{ partNumber: null, description: "O-RING" }] });
    if (result.ok) expect(result.lines[0].warnings.map((w) => w.code)).toEqual(["IDENTIFIER_DROPPED"]);
  });

  describe("unreadable answers", () => {
    it.each<[string, LlmResponse, string, string]>([
      ["malformed JSON", fakeReply.content('{"line_items": [{"source_text": "'), "INVALID_JSON", "not valid JSON"],
      ["no content", fakeReply.content(null), "INVALID_JSON", "The model returned no content."],
      ["a schema mismatch", SCHEMA_VIOLATION, "SCHEMA_MISMATCH", "did not match the schema"],
      ["truncated output", fakeReply.truncated(), "TRUNCATED", "cut off"],
    ])("retries %s once with a repair note, then fails", async (_label, reply, code, note) => {
      const llm = new FakeLlmClient(reply);
      const result = await run(llm);

      expect(result).toMatchObject({ ok: false, code, retryAfterSeconds: null });
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts.map((a) => a.errorCode)).toEqual([code, code]);
      expect(result.attempts[0].rawOutput).toBe(reply.content);
      expect(result.attempts[0].issues.length).toBeGreaterThan(0);
      expect(llm.calls).toHaveLength(2);
      expect(llm.calls[0].user).not.toContain("previous answer");
      expect(llm.calls[1].user).toContain(`<email>\n${EMAIL}\n</email>\n\n`);
      expect(llm.calls[1].user).toContain(note);
    });

    it("traces zod issues by path and lists them in the repair note", async () => {
      const llm = new FakeLlmClient(SCHEMA_VIOLATION);
      const result = await run(llm);
      expect(result.attempts[0].issues).toEqual(["line_items.0.quantity: Invalid input: expected number, received string"]);
      expect(llm.calls[1].user).toContain("- line_items.0.quantity: Invalid input: expected number, received string");
    });

    it("rejects output the JSON Schema allows but the refinements don't", async () => {
      const fractional = { ...GOOD, line_items: [{ ...GOOD.line_items[0], quantity: 2.5 }] };
      const result = await run(new FakeLlmClient(fakeReply.json(fractional)));
      expect(result).toMatchObject({ ok: false, code: "SCHEMA_MISMATCH" });
    });

    it("succeeds when the repair retry works", async () => {
      const llm = new FakeLlmClient(fakeReply.content("not json"), fakeReply.json(GOOD));
      const result = await run(llm);
      expect(result.ok).toBe(true);
      expect(result.attempts.map((a) => a.errorCode)).toEqual(["INVALID_JSON", null]);
    });
  });

  describe("provider errors", () => {
    it("doesn't retry a 429 and passes retry-after through", async () => {
      const llm = new FakeLlmClient(fakeReply.httpError(429, 12));
      const result = await run(llm);
      expect(result).toEqual({
        ok: false,
        code: "RATE_LIMITED",
        retryAfterSeconds: 12,
        attempts: [expect.objectContaining({ httpStatus: 429, errorCode: "RATE_LIMITED", issues: ["HTTP 429 from the model provider."] })],
      });
      expect(llm.calls).toHaveLength(1);
    });

    it("keeps the provider's error body in the trace", async () => {
      const result = await run(new FakeLlmClient(fakeReply.httpError(429)));
      expect(result.attempts[0].rawOutput).toBe('{"error":{"message":"Fake HTTP 429"}}');
    });

    it("retries a 5xx without a repair note", async () => {
      const llm = new FakeLlmClient(fakeReply.httpError(503), fakeReply.json(GOOD));
      const result = await run(llm);
      expect(result.ok).toBe(true);
      expect(result.attempts.map((a) => [a.httpStatus, a.errorCode])).toEqual([
        [503, "PROVIDER_ERROR"],
        [200, null],
      ]);
      expect(llm.calls[1].user).toBe(llm.calls[0].user);
    });

    it("fails with PROVIDER_ERROR after two 5xx", async () => {
      const result = await run(new FakeLlmClient(fakeReply.httpError(500)));
      expect(result).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
      expect(result.attempts).toHaveLength(2);
    });

    it("doesn't retry a 4xx", async () => {
      const llm = new FakeLlmClient(fakeReply.httpError(401));
      const result = await run(llm);
      expect(result).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
      expect(llm.calls).toHaveLength(1);
    });

    it("reports a 404 as MODEL_UNAVAILABLE", async () => {
      const llm = new FakeLlmClient(fakeReply.httpError(404));
      expect(await run(llm)).toMatchObject({ ok: false, code: "MODEL_UNAVAILABLE" });
      expect(llm.calls).toHaveLength(1);
    });

    it("retries a network failure", async () => {
      const llm = new FakeLlmClient(fakeReply.networkError, fakeReply.json(GOOD));
      const result = await run(llm);
      expect(result.ok).toBe(true);
      expect(result.attempts[0]).toMatchObject({
        httpStatus: null,
        rawOutput: null,
        errorCode: "PROVIDER_ERROR",
        issues: ["No response from the model provider: fetch failed"],
      });
    });
  });

  describe("time budget", () => {
    it("times out an attempt after 20 seconds and doesn't retry", async () => {
      const llm = new FakeLlmClient(fakeReply.hang);
      const pending = run(llm);
      await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS - 1);
      expect(llm.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);

      const result = await pending;
      expect(result).toEqual({
        ok: false,
        code: "TIMEOUT",
        retryAfterSeconds: null,
        attempts: [
          expect.objectContaining({
            durationMs: ATTEMPT_TIMEOUT_MS,
            httpStatus: null,
            errorCode: "TIMEOUT",
            issues: ["No answer within 20 seconds."],
          }),
        ],
      });
      expect(llm.calls).toHaveLength(1);
    });

    /** A fake whose first answer takes `ms`, with the clock moved rather than waited on. */
    function slowFirstAnswer(ms: number, ...replies: [FakeReply, ...FakeReply[]]) {
      const fake = new FakeLlmClient(...replies);
      const llm: LlmClient = {
        complete(input) {
          if (fake.calls.length === 0) vi.setSystemTime(Date.now() + ms);
          return fake.complete(input);
        },
      };
      return { llm, calls: fake.calls };
    }

    it("skips the retry when too little of the 28-second budget is left", async () => {
      const { llm, calls } = slowFirstAnswer(24_000, fakeReply.content("not json"));
      const result = await run(llm);
      expect(result).toMatchObject({ ok: false, code: "INVALID_JSON" });
      expect(calls).toHaveLength(1);
    });

    it("gives the retry only what is left of the budget", async () => {
      const { llm } = slowFirstAnswer(15_000, fakeReply.content("not json"), fakeReply.hang);
      const pending = run(llm);
      await vi.advanceTimersByTimeAsync(13_000);

      const result = await pending;
      expect(result).toMatchObject({ ok: false, code: "TIMEOUT" });
      expect(result.attempts.map((a) => a.errorCode)).toEqual(["INVALID_JSON", "TIMEOUT"]);
      expect(result.attempts[1]).toMatchObject({ durationMs: 13_000, issues: ["No answer within 13 seconds."] });
    });
  });

  describe("cancel", () => {
    it("stops the call and reports CANCELLED", async () => {
      const controller = new AbortController();
      const llm = new FakeLlmClient(fakeReply.hang);
      const pending = run(llm, controller.signal);
      await vi.advanceTimersByTimeAsync(3_000);
      controller.abort();

      const result = await pending;
      expect(result).toMatchObject({ ok: false, code: "CANCELLED" });
      expect(result.attempts).toEqual([
        expect.objectContaining({ durationMs: 3_000, errorCode: "CANCELLED", issues: ["Cancelled before the model answered."] }),
      ]);
      expect(llm.calls).toHaveLength(1);
    });

    it("never calls the model once already cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await run(new FakeLlmClient(fakeReply.json(GOOD)), controller.signal);
      expect(result).toMatchObject({ ok: false, code: "CANCELLED" });
    });
  });

  describe("FakeLlmClient.fault", () => {
    it.each([
      ["malformed_json", "INVALID_JSON"],
      ["schema_violation", "SCHEMA_MISMATCH"],
      ["rate_limited", "RATE_LIMITED"],
    ] as const)("%s fails with %s", async (mode, code) => {
      expect(await run(FakeLlmClient.fault(mode, EMAIL))).toMatchObject({ ok: false, code });
    });

    it("timeout hangs until the attempt times out", async () => {
      const pending = run(FakeLlmClient.fault("timeout", EMAIL));
      await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS);
      expect(await pending).toMatchObject({ ok: false, code: "TIMEOUT" });
    });

    it("hallucinated_part_number gets its invented part number dropped", async () => {
      const result = await run(FakeLlmClient.fault("hallucinated_part_number", EMAIL));
      expect(result).toMatchObject({ ok: true, lines: [{ partNumber: null, description: "Please quote:" }] });
      if (result.ok) expect(result.lines[0].warnings.map((w) => w.code)).toContain("IDENTIFIER_DROPPED");
    });
  });
});
