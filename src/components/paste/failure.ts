import type { ExtractionErrorCode } from "@/lib/contracts";
import type { ExtractOutcome } from "./extract-request";

/** What the paste page shows when extraction doesn't produce a review (PRD section 6, FAIL-1). */
export type Failure = {
  title: string;
  detail: string | null;
  retryable: boolean;
  /** Seconds to wait before Retry is enabled, for a rate limit. */
  retryAfterSeconds: number | null;
  /** Set when the server recorded the attempt, so "Continue manually" can open its review. */
  extractionId: string | null;
};

const unreadable = "We couldn't read the model's answer.";

const copy: Record<ExtractionErrorCode, { title: string; detail: string | null }> = {
  EMPTY_INPUT: { title: "Paste an email first.", detail: null },
  INPUT_TOO_LARGE: { title: "This email is too long.", detail: "Remove older messages or signatures, then retry." },
  TIMEOUT: { title: "This is taking too long.", detail: "The model didn't answer within the time limit." },
  RATE_LIMITED: { title: "Rate limited, try again shortly.", detail: null },
  PROVIDER_ERROR: { title: "The model provider returned an error.", detail: null },
  MODEL_UNAVAILABLE: { title: "The model is unavailable right now.", detail: null },
  INVALID_JSON: { title: unreadable, detail: "It wasn't valid JSON, even after a repair attempt." },
  SCHEMA_MISMATCH: { title: unreadable, detail: "It didn't match the expected format, even after a repair attempt." },
  TRUNCATED: { title: unreadable, detail: "It was cut off before the end." },
  CANCELLED: { title: "Extraction cancelled.", detail: null },
  // A 500 past the model (KI-012). It usually still carries an extraction ID, so the rep can
  // continue manually with the email that was recorded.
  INTERNAL_ERROR: { title: "Something went wrong on the server.", detail: "It failed after the model answered." },
};

export function describeFailure(outcome: Exclude<ExtractOutcome, { kind: "ok" }>): Failure {
  switch (outcome.kind) {
    case "error": {
      const { code, retryable, retryAfterSeconds } = outcome.error;
      const wait = code === "RATE_LIMITED" && retryAfterSeconds ? Math.ceil(retryAfterSeconds) : null;
      return {
        ...copy[code],
        title: wait ? `Rate limited, try again in ${wait} seconds.` : copy[code].title,
        retryable,
        retryAfterSeconds: wait,
        extractionId: outcome.extractionId,
      };
    }
    case "unexpected":
      return {
        title: "Something went wrong on the server.",
        detail: `It answered with HTTP ${outcome.httpStatus} instead of a result.`,
        retryable: true,
        retryAfterSeconds: null,
        extractionId: null,
      };
    case "network":
      return {
        title: "Couldn't reach the server.",
        detail: "Check your connection, then retry.",
        retryable: true,
        retryAfterSeconds: null,
        extractionId: null,
      };
  }
}

/** The client's own 30-second limit (EXT-3), for when the server hasn't answered at all. */
export const clientTimeoutFailure: Failure = {
  title: "This is taking too long.",
  detail: "No answer within 30 seconds.",
  retryable: true,
  retryAfterSeconds: null,
  extractionId: null,
};
