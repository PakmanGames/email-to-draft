import type { LlmExtraction } from "@/lib/contracts";
import type { LlmClient, LlmResponse } from "./llm";

/**
 * One scripted call: a response (any HTTP status), a hang until the call is aborted, or a
 * network failure with no response at all.
 */
export type FakeReply = LlmResponse | { hang: true } | { networkError: string };

/** Builders for what a provider can send back. */
export const fakeReply = {
  /** A 200 whose content is `extraction` as JSON. */
  json(extraction: LlmExtraction): LlmResponse {
    return fakeReply.content(JSON.stringify(extraction));
  },
  /** A 200 with any content, including content that isn't JSON. */
  content(content: string | null, finishReason = "stop"): LlmResponse {
    return { httpStatus: 200, content, finishReason, retryAfterSeconds: null };
  },
  /** A 200 cut off at the output token limit. */
  truncated(): LlmResponse {
    return fakeReply.content('{"line_items":[{"source_text":"MS29513-033 qty', "length");
  },
  httpError(httpStatus: number, retryAfterSeconds: number | null = null): LlmResponse {
    const content = JSON.stringify({ error: { message: `Fake HTTP ${httpStatus}` } });
    return { httpStatus, content, finishReason: null, retryAfterSeconds };
  },
  hang: { hang: true } as FakeReply,
  networkError: { networkError: "fetch failed" } as FakeReply,
};

/** The faults the paste page can inject when FAULT_INJECTION is on (FAIL-6). */
export const FAULT_MODES = [
  "malformed_json",
  "schema_violation",
  "hallucinated_part_number",
  "timeout",
  "rate_limited",
] as const;
export type FaultMode = (typeof FAULT_MODES)[number];

/**
 * A scripted `LlmClient` for tests and fault injection. It answers calls with `replies`
 * in order and repeats the last one, so a single faulty reply also fails the retry.
 * It honors `signal` the way the real client does.
 */
export class FakeLlmClient implements LlmClient {
  /** Every call's input, for assertions. */
  readonly calls: { system: string; user: string; jsonSchema: object }[] = [];
  readonly #replies: FakeReply[];

  constructor(...replies: [FakeReply, ...FakeReply[]]) {
    this.#replies = replies;
  }

  /** A fake that fails every call the way `mode` describes. */
  static fault(mode: FaultMode, emailText: string): FakeLlmClient {
    switch (mode) {
      case "malformed_json":
        return new FakeLlmClient(fakeReply.content('{"line_items": [{"source_text": "'));
      case "schema_violation":
        return new FakeLlmClient(
          fakeReply.content(JSON.stringify({ line_items: [{ quantity: "fifty" }], no_items_reason: null })),
        );
      case "hallucinated_part_number": {
        // A real line of the email, paired with a part number that appears nowhere in it.
        const line = emailText.split("\n").find((text) => text.trim() !== "") ?? emailText;
        return new FakeLlmClient(
          fakeReply.json({
            line_items: [
              {
                source_text: line,
                part_number: "ZX-40417-QQ",
                nsn: null,
                description: line,
                quantity: null,
                unit: null,
                pack_size: null,
              },
            ],
            no_items_reason: null,
            superseded_note: null,
          }),
        );
      }
      case "timeout":
        return new FakeLlmClient(fakeReply.hang);
      case "rate_limited":
        return new FakeLlmClient(fakeReply.httpError(429, 7));
    }
  }

  async complete(input: { system: string; user: string; jsonSchema: object; signal: AbortSignal }): Promise<LlmResponse> {
    const { signal, ...call } = input;
    this.calls.push(call);
    const reply = this.#replies[Math.min(this.calls.length, this.#replies.length) - 1];
    signal.throwIfAborted();
    if ("hang" in reply) {
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    if ("networkError" in reply) throw new TypeError(reply.networkError);
    return reply;
  }
}
