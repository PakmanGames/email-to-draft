/** What one model call returned, before any parsing. */
export type LlmResponse = {
  httpStatus: number;
  /**
   * Raw message content. On a non-2xx response, the provider's error body, so the trace
   * shows why it failed. Null when the provider sent none.
   */
  content: string | null;
  /** Provider finish reason, such as "stop" or "length" (which means TRUNCATED). */
  finishReason: string | null;
  /** From the retry-after header, on a 429. */
  retryAfterSeconds: number | null;
};

/**
 * The model behind extraction: the Groq client in production, a fake in tests and fault
 * injection. `complete` resolves for every HTTP response, including 429 and 5xx, so each
 * attempt can be traced. It rejects only when no response arrived: `signal` aborted
 * (timeout or cancel) or the network failed.
 */
export interface LlmClient {
  complete(input: {
    system: string;
    user: string;
    jsonSchema: object;
    signal: AbortSignal;
  }): Promise<LlmResponse>;
}
