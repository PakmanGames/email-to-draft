import { describe, expect, it, vi } from "vitest";
import { GroqLlmClient } from "./groq";

const SCHEMA = { type: "object", properties: {}, required: [], additionalProperties: false };

function client(fetch: typeof globalThis.fetch) {
  return new GroqLlmClient({ apiKey: "test-key", baseURL: "https://groq.test/openai/v1", model: "test-model", fetch });
}

function complete(llm: GroqLlmClient, signal = new AbortController().signal) {
  return llm.complete({ system: "SYSTEM", user: "USER", jsonSchema: SCHEMA, signal });
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const COMPLETION = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 0,
  model: "test-model",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"line_items":[]}' } }],
};

describe("GroqLlmClient", () => {
  it("sends one strict JSON-schema request with low reasoning effort and temperature 0", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, COMPLETION));
    await complete(client(fetch));

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://groq.test/openai/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "test-model",
      messages: [
        { role: "system", content: "SYSTEM" },
        { role: "user", content: "USER" },
      ],
      response_format: { type: "json_schema", json_schema: { name: "rfq_extraction", strict: true, schema: SCHEMA } },
      reasoning_effort: "low",
      temperature: 0,
      max_completion_tokens: 4096,
    });
  });

  it("returns the content and finish reason of a 200", async () => {
    const length = { ...COMPLETION, choices: [{ ...COMPLETION.choices[0], finish_reason: "length" }] };
    expect(await complete(client(async () => json(200, length)))).toEqual({
      httpStatus: 200,
      content: '{"line_items":[]}',
      finishReason: "length",
      retryAfterSeconds: null,
    });
  });

  it("resolves a 429 with its retry-after and error body instead of throwing", async () => {
    const error = { error: { message: "Rate limit reached", type: "tokens", code: "rate_limit_exceeded" } };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json(429, error, { "retry-after": "7" }));
    expect(await complete(client(fetch))).toEqual({
      httpStatus: 429,
      content: JSON.stringify(error),
      finishReason: null,
      retryAfterSeconds: 7,
    });
    // The SDK's own retries are off: extractLines decides.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["2.5", 3],
    ["0", 0],
    ["Wed, 21 Oct 2026 07:28:00 GMT", null],
    [null, null],
  ])("reads retry-after %j as %j seconds", async (header, seconds) => {
    const headers: Record<string, string> = header === null ? {} : { "retry-after": header };
    const response = await complete(client(async () => json(429, { error: { message: "slow down" } }, headers)));
    expect(response.retryAfterSeconds).toBe(seconds);
  });

  it("resolves a 5xx once, without retrying", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json(503, { error: { message: "over capacity" } }));
    expect(await complete(client(fetch))).toMatchObject({ httpStatus: 503, content: '{"error":{"message":"over capacity"}}' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a non-JSON error body as text", async () => {
    const fetch = async () => new Response("<html>Bad gateway</html>", { status: 502 });
    expect(await complete(client(fetch))).toMatchObject({ httpStatus: 502, content: "502 <html>Bad gateway</html>" });
  });

  it("rejects when the network fails", async () => {
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(complete(client(fetch))).rejects.toThrow();
  });

  it("rejects when the signal aborts, and passes the signal to fetch", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = complete(client(fetch), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
