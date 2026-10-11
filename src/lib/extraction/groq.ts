import OpenAI, { APIError } from "openai";
import type { LlmClient, LlmResponse } from "./llm";

/**
 * Output cap per call. gpt-oss counts its reasoning against this, so it covers about 40
 * lines at the probe's ~75 tokens per line plus low-effort reasoning. A longer answer
 * comes back with finish_reason "length" (TRUNCATED) instead of eating the 8K
 * tokens-per-minute free-plan limit.
 */
const MAX_COMPLETION_TOKENS = 4096;

/**
 * GroqCloud through its OpenAI-compatible API, with strict JSON-schema output
 * (technical design 6, step 4).
 */
export class GroqLlmClient implements LlmClient {
  readonly #openai: OpenAI;
  readonly #model: string;

  constructor(options: { apiKey: string; baseURL: string; model: string; fetch?: typeof fetch }) {
    // No SDK retries: extractLines owns retries and the time budget, and traces every attempt.
    this.#openai = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL, maxRetries: 0, fetch: options.fetch });
    this.#model = options.model;
  }

  async complete(input: { system: string; user: string; jsonSchema: object; signal: AbortSignal }): Promise<LlmResponse> {
    try {
      const { data, response } = await this.#openai.chat.completions
        .create(
          {
            model: this.#model,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.user },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "rfq_extraction", strict: true, schema: input.jsonSchema as Record<string, unknown> },
            },
            reasoning_effort: "low",
            // Reduces run-to-run variation. It doesn't remove it, so every answer is still checked.
            temperature: 0,
            max_completion_tokens: MAX_COMPLETION_TOKENS,
          },
          { signal: input.signal },
        )
        .withResponse();
      const choice = data.choices[0];
      return {
        httpStatus: response.status,
        content: choice?.message.content ?? null,
        finishReason: choice?.finish_reason ?? null,
        retryAfterSeconds: null,
      };
    } catch (error) {
      // An HTTP error is still a response, so it goes back for the trace. Only aborts and
      // network failures, which have no status, reject.
      if (error instanceof APIError && error.status !== undefined) {
        return {
          httpStatus: error.status,
          content: error.error === undefined ? error.message : JSON.stringify({ error: error.error }),
          finishReason: null,
          retryAfterSeconds: parseRetryAfter(error.headers?.get("retry-after") ?? null),
        };
      }
      throw error;
    }
  }
}

/** Delay-seconds, rounded up. Groq never sends the HTTP-date form, so that reads as unknown. */
function parseRetryAfter(value: string | null): number | null {
  const seconds = value === null ? NaN : Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
}
