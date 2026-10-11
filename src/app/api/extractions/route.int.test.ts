import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/env";
import { CreateExtractionResponse, type LlmExtraction, MAX_EMAIL_CHARS, ReviewSeed } from "@/lib/contracts";
import { extraction } from "@/lib/db/schema";
import { FakeLlmClient, type FakeReply, fakeReply, type LlmClient, PROMPT_VERSION } from "@/lib/extraction";
import { matchLines } from "@/lib/matching";
import { setupTestDb } from "@/test/db";
import { POST } from "./route";

// The route builds a GroqLlmClient at load time. Swap it for whatever fake the test sets,
// so no test can reach the real model.
const llm = vi.hoisted(() => ({ current: null as LlmClient | null }));
vi.mock("@/lib/extraction/groq", () => ({
  GroqLlmClient: class {
    complete(input: Parameters<LlmClient["complete"]>[0]) {
      if (!llm.current) throw new Error("The test didn't set a fake LLM client.");
      return llm.current.complete(input);
    }
  },
}));

vi.mock("@/lib/matching", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/matching")>();
  return { ...actual, matchLines: vi.fn(actual.matchLines) };
});

const db = setupTestDb();

const EMAIL = `Please quote:
MS29513-033 O-RING qty 50
AN960C10L washer, 2 boxes of 100`;

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

function useFake(...replies: [FakeReply, ...FakeReply[]]): FakeLlmClient {
  const fake = new FakeLlmClient(...replies);
  llm.current = fake;
  return fake;
}

async function post(body: unknown, signal?: AbortSignal) {
  const response = await POST(
    new Request("http://localhost/api/extractions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal,
    }),
  );
  return { status: response.status, body: CreateExtractionResponse.parse(await response.json()) };
}

async function storedRow(id: string | null) {
  expect(id).not.toBeNull();
  const [row] = await db.select().from(extraction).where(eq(extraction.id, id!));
  return row;
}

afterEach(() => {
  llm.current = null;
  vi.useRealTimers();
});

describe("POST /api/extractions", () => {
  it("extracts, matches, and stores the review seed", async () => {
    const fake = useFake(fakeReply.json(GOOD));
    const { status, body } = await post({ emailText: `\n  ${EMAIL}  \n` });

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, extractionId: expect.any(String), status: "succeeded" });
    expect(fake.calls[0].user).toContain(`<email>\n${EMAIL}\n</email>`);

    const row = await storedRow(body.extractionId);
    expect(row).toMatchObject({
      emailText: EMAIL,
      status: "succeeded",
      errorCode: null,
      model: env.LLM_MODEL,
      promptVersion: PROMPT_VERSION,
      attempts: [expect.objectContaining({ httpStatus: 200, errorCode: null })],
    });
    expect(row.durationMs).toEqual(expect.any(Number));
    const seed = ReviewSeed.parse(row.result);
    expect(seed.lines.map((l) => [l.extracted.partNumber, l.extracted.quantityEach])).toEqual([
      ["MS29513-033", 50],
      ["AN960C10L", 200],
    ]);
    expect(seed.notices).toEqual([]);
  });

  it("stores no_items with the notice when the email requests nothing", async () => {
    useFake(fakeReply.json({ line_items: [], no_items_reason: "auto_reply", superseded_note: null }));
    const { status, body } = await post({ emailText: "I'm out of the office until Monday." });

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: "no_items" });
    const row = await storedRow(body.extractionId);
    expect(row.status).toBe("no_items");
    expect(ReviewSeed.parse(row.result)).toEqual({ lines: [], notices: [expect.objectContaining({ code: "NO_ITEMS" })] });
  });

  it("stores no_items when every line was discarded by grounding", async () => {
    const invented = { ...GOOD, line_items: [{ ...GOOD.line_items[0], part_number: "ZZ-1", description: null }] };
    useFake(fakeReply.json(invented));
    const { body } = await post({ emailText: EMAIL });

    expect(body).toMatchObject({ ok: true, status: "no_items" });
    const row = await storedRow(body.extractionId);
    expect(row.result?.notices).toEqual([expect.objectContaining({ code: "LINES_DISCARDED" })]);
  });

  describe("input validation", () => {
    it.each([
      ["blank text", { emailText: " \n\t " }],
      ["no emailText", { text: EMAIL }],
      ["a body that isn't JSON", "emailText=hello"],
    ])("rejects %s as EMPTY_INPUT without a trace", async (_label, body) => {
      const fake = useFake(fakeReply.json(GOOD));
      expect(await post(body)).toEqual({
        status: 400,
        body: {
          ok: false,
          extractionId: null,
          error: { code: "EMPTY_INPUT", message: "Paste an email first.", retryable: false, retryAfterSeconds: null },
        },
      });
      expect(fake.calls).toHaveLength(0);
      expect(await db.$count(extraction)).toBe(0);
    });

    it("rejects more than 20,000 characters as INPUT_TOO_LARGE without a trace", async () => {
      const fake = useFake(fakeReply.json(GOOD));
      const { status, body } = await post({ emailText: "x".repeat(MAX_EMAIL_CHARS + 1) });

      expect(status).toBe(413);
      expect(body).toMatchObject({ ok: false, extractionId: null, error: { code: "INPUT_TOO_LARGE", retryable: false } });
      expect(fake.calls).toHaveLength(0);
      expect(await db.$count(extraction)).toBe(0);
    });

    it("accepts exactly 20,000 characters after trimming", async () => {
      useFake(fakeReply.json({ line_items: [], no_items_reason: "other", superseded_note: null }));
      const { body } = await post({ emailText: ` ${"x".repeat(MAX_EMAIL_CHARS)} ` });
      expect(body.ok).toBe(true);
    });
  });

  describe("failures leave a failed row with every attempt", () => {
    const UNREADABLE = "We couldn't read the model's answer.";
    it.each<[string, FakeReply, string, number, string, number]>([
      ["malformed JSON", fakeReply.content("{not json"), "INVALID_JSON", 502, UNREADABLE, 2],
      ["a schema mismatch", fakeReply.content('{"line_items": 3}'), "SCHEMA_MISMATCH", 502, UNREADABLE, 2],
      ["truncated output", fakeReply.truncated(), "TRUNCATED", 502, UNREADABLE, 2],
      ["a 5xx", fakeReply.httpError(503), "PROVIDER_ERROR", 502, "The model provider had a problem.", 2],
      ["a network failure", fakeReply.networkError, "PROVIDER_ERROR", 502, "The model provider had a problem.", 2],
      ["a 404", fakeReply.httpError(404), "MODEL_UNAVAILABLE", 503, "The model isn't available right now.", 1],
    ])("%s answers %s", async (_label, reply, code, httpStatus, message, attemptCount) => {
      useFake(reply);
      const { status, body } = await post({ emailText: EMAIL });

      expect(status).toBe(httpStatus);
      expect(body).toEqual({
        ok: false,
        extractionId: expect.any(String),
        error: { code, message, retryable: code !== "MODEL_UNAVAILABLE", retryAfterSeconds: null },
      });
      const row = await storedRow(body.extractionId);
      expect(row).toMatchObject({ status: "failed", errorCode: code });
      expect(row.attempts.map((a) => a.errorCode)).toEqual(Array(attemptCount).fill(code));
      expect(row.durationMs).toEqual(expect.any(Number));
      // So "Continue manually" opens a review page with no lines and the reason.
      expect(row.result).toEqual({ lines: [], notices: [{ code: "EXTRACTION_FAILED", message }] });
    });

    it("tells the rep when to retry after a 429", async () => {
      useFake(fakeReply.httpError(429, 7));
      const { status, body } = await post({ emailText: EMAIL });

      expect(status).toBe(429);
      expect(body).toMatchObject({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Rate limited, try again in 7 seconds.", retryable: true, retryAfterSeconds: 7 },
      });
      const row = await storedRow(body.extractionId);
      expect(row).toMatchObject({ status: "failed", errorCode: "RATE_LIMITED", attempts: [expect.objectContaining({ httpStatus: 429 })] });
    });

    it("times out a hung model call", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const fake = useFake(fakeReply.hang);
      const pending = post({ emailText: EMAIL });
      await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(20_000);

      const { status, body } = await pending;
      expect(status).toBe(504);
      expect(body).toMatchObject({ ok: false, error: { code: "TIMEOUT", message: "This is taking too long.", retryable: true } });
      const row = await storedRow(body.extractionId);
      expect(row).toMatchObject({ status: "failed", errorCode: "TIMEOUT", attempts: [expect.objectContaining({ errorCode: "TIMEOUT" })] });
    });

    it("is pending while the model runs, and records a cancel", async () => {
      const controller = new AbortController();
      const fake = useFake(fakeReply.hang);
      const pending = post({ emailText: EMAIL }, controller.signal);
      await vi.waitFor(() => expect(fake.calls).toHaveLength(1));

      const [running] = await db.select().from(extraction);
      expect(running).toMatchObject({ status: "pending", attempts: [], result: null, durationMs: null });

      controller.abort();
      const { status, body } = await pending;
      expect(status).toBe(499);
      expect(body).toMatchObject({ ok: false, extractionId: running.id, error: { code: "CANCELLED" } });
      const row = await storedRow(running.id);
      expect(row).toMatchObject({ status: "failed", errorCode: "CANCELLED", attempts: [expect.objectContaining({ errorCode: "CANCELLED" })] });
    });

    it("keeps the model's attempts when matching fails", async () => {
      useFake(fakeReply.json(GOOD));
      vi.mocked(matchLines).mockRejectedValueOnce(new Error("database is down"));

      await expect(post({ emailText: EMAIL })).rejects.toThrow("database is down");
      const [row] = await db.select().from(extraction);
      expect(row).toMatchObject({ status: "failed", errorCode: null, result: null, attempts: [expect.objectContaining({ httpStatus: 200 })] });
    });
  });
});
