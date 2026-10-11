import {
  type ExtractedLine,
  type ExtractionAttempt,
  type ExtractionErrorCode,
  type LlmExtraction,
  type Notice,
  ValidatedLlmExtraction,
} from "@/lib/contracts";
import type { LlmClient, LlmResponse } from "./llm";
import { postProcess } from "./post-process";
import { EXTRACTION_JSON_SCHEMA, SYSTEM_PROMPT, userMessage } from "./prompt";

/** One model call is abandoned as TIMEOUT after this long. */
export const ATTEMPT_TIMEOUT_MS = 20_000;

/**
 * All attempts together. The paste page gives up at 30 seconds, so this leaves time for
 * matching and the final database write and the rep still gets a real answer.
 */
export const TOTAL_BUDGET_MS = 28_000;

/** A retry with less time left than this would likely time out, so the error is returned instead. */
const MIN_RETRY_MS = 5_000;

const MAX_ATTEMPTS = 2;

export type ExtractLinesResult =
  | { ok: true; lines: ExtractedLine[]; notices: Notice[]; attempts: ExtractionAttempt[] }
  | {
      ok: false;
      code: ExtractionErrorCode;
      attempts: ExtractionAttempt[];
      /** Set for RATE_LIMITED, so the route can tell the rep when to retry. */
      retryAfterSeconds: number | null;
    };

/**
 * Asks the model for the email's line items and runs every deterministic check on the
 * answer (technical design 6, steps 3 to 7).
 *
 * Unreadable output and provider errors get one retry if the time budget allows, and a
 * repair retry tells the model what was wrong. Every attempt is returned for the trace,
 * whatever the outcome. `signal` is the rep's Cancel.
 */
export async function extractLines(
  emailText: string,
  deps: { llm: LlmClient; signal: AbortSignal },
): Promise<ExtractLinesResult> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const attempts: ExtractionAttempt[] = [];
  let repairNote: string | null = null;
  for (;;) {
    const timeoutMs = Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now());
    const outcome = await runAttempt(emailText, repairNote, deps, timeoutMs);
    attempts.push(outcome.attempt);
    if (outcome.ok) return { ok: true, ...postProcess(emailText, outcome.extraction), attempts };

    const canRetry = outcome.retry && attempts.length < MAX_ATTEMPTS && deadline - Date.now() >= MIN_RETRY_MS;
    if (!canRetry) {
      return { ok: false, code: outcome.code, attempts, retryAfterSeconds: outcome.retryAfterSeconds };
    }
    repairNote = outcome.repairNote;
  }
}

type Failure = {
  code: ExtractionErrorCode;
  issues: string[];
  /** Whether another attempt could plausibly succeed. */
  retry: boolean;
  /** Added to the next attempt's message, when the model itself was at fault. */
  repairNote: string | null;
  retryAfterSeconds: number | null;
};

type AttemptOutcome =
  | { ok: true; attempt: ExtractionAttempt; extraction: LlmExtraction }
  | ({ ok: false; attempt: ExtractionAttempt } & Failure);

async function runAttempt(
  emailText: string,
  repairNote: string | null,
  { llm, signal }: { llm: LlmClient; signal: AbortSignal },
  timeoutMs: number,
): Promise<AttemptOutcome> {
  const startedAt = new Date();
  const finish = (
    response: LlmResponse | null,
    result: { ok: true; extraction: LlmExtraction } | ({ ok: false } & Failure),
  ): AttemptOutcome => {
    const attempt: ExtractionAttempt = {
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      httpStatus: response?.httpStatus ?? null,
      finishReason: response?.finishReason ?? null,
      rawOutput: response?.content ?? null,
      errorCode: result.ok ? null : result.code,
      issues: result.ok ? [] : result.issues,
    };
    return { ...result, attempt };
  };

  // A plain timer rather than AbortSignal.timeout, so tests can drive it with fake timers.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  let response: LlmResponse;
  try {
    response = await llm.complete({
      system: SYSTEM_PROMPT,
      user: userMessage(emailText, repairNote),
      jsonSchema: EXTRACTION_JSON_SCHEMA,
      signal: AbortSignal.any([signal, timeout.signal]),
    });
  } catch (error) {
    // No response arrived. Which signal fired says why; neither means the network failed.
    if (signal.aborted) return finish(null, failure("CANCELLED", ["Cancelled before the model answered."]));
    if (timeout.signal.aborted) {
      return finish(null, failure("TIMEOUT", [`No answer within ${Math.round(timeoutMs / 1000)} seconds.`]));
    }
    const reason = error instanceof Error ? error.message : String(error);
    return finish(null, failure("PROVIDER_ERROR", [`No response from the model provider: ${reason}`], { retry: true }));
  } finally {
    clearTimeout(timer);
  }
  return finish(response, readResponse(response));
}

function failure(code: ExtractionErrorCode, issues: string[], extra: Partial<Failure> = {}): { ok: false } & Failure {
  return { ok: false, code, issues, retry: false, repairNote: null, retryAfterSeconds: null, ...extra };
}

/** Classifies one response, and parses and validates its content (technical design 6, steps 4 to 6). */
function readResponse(response: LlmResponse): { ok: true; extraction: LlmExtraction } | ({ ok: false } & Failure) {
  const { httpStatus, content, finishReason } = response;
  const http = `HTTP ${httpStatus} from the model provider.`;
  if (httpStatus === 429) return failure("RATE_LIMITED", [http], { retryAfterSeconds: response.retryAfterSeconds });
  if (httpStatus === 404) return failure("MODEL_UNAVAILABLE", [http]);
  // Only a 5xx is worth retrying. Any other 4xx is a request the provider will reject again.
  if (httpStatus < 200 || httpStatus > 299) return failure("PROVIDER_ERROR", [http], { retry: httpStatus >= 500 });

  if (finishReason === "length") {
    return failure("TRUNCATED", ["The answer was cut off at the output token limit."], {
      retry: true,
      repairNote: "Your previous answer was cut off because it was too long. Answer again, more briefly.",
    });
  }

  let json: unknown;
  try {
    if (!content) throw new Error("The model returned no content.");
    json = JSON.parse(content);
  } catch (error) {
    const issue = error instanceof Error ? error.message : String(error);
    return failure("INVALID_JSON", [issue], {
      retry: true,
      repairNote: `Your previous answer was not valid JSON (${issue}). Answer again with only JSON that matches the schema.`,
    });
  }

  const parsed = ValidatedLlmExtraction.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return failure("SCHEMA_MISMATCH", issues, {
      retry: true,
      repairNote: [
        "Your previous answer did not match the schema:",
        ...issues.slice(0, 5).map((issue) => `- ${issue}`),
        "Answer again with JSON that matches the schema.",
      ].join("\n"),
    });
  }
  return { ok: true, extraction: parsed.data };
}
