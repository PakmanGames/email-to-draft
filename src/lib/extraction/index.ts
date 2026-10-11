// T0 stub with the final signatures (technical design 5.7). T2 replaces the body.
import type { ExtractedLine, ExtractionAttempt, ExtractionErrorCode, Notice } from "@/lib/contracts";
import { NotImplementedError } from "@/lib/not-implemented";

/** What one model call returned, before any parsing. */
export type LlmResponse = {
  httpStatus: number;
  /** Raw message content. Null when the provider sent none. */
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

export type ExtractLinesResult =
  | { ok: true; lines: ExtractedLine[]; notices: Notice[]; attempts: ExtractionAttempt[] }
  | {
      ok: false;
      code: ExtractionErrorCode;
      attempts: ExtractionAttempt[];
      /** Set for RATE_LIMITED, so the route can tell the rep when to retry. */
      retryAfterSeconds: number | null;
    };

export async function extractLines(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until T2 lands
  emailText: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until T2 lands
  deps: { llm: LlmClient; signal: AbortSignal },
): Promise<ExtractLinesResult> {
  throw new NotImplementedError("extractLines");
}
