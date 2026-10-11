import { eq } from "drizzle-orm";
import { env } from "@/env";
import {
  CreateExtractionRequest,
  type CreateExtractionResponse,
  type ExtractionAttempt,
  type ExtractionErrorCode,
  MAX_EMAIL_CHARS,
  type ReviewSeed,
} from "@/lib/contracts";
import { db } from "@/lib/db/client";
import { extraction } from "@/lib/db/schema";
import { extractLines, GroqLlmClient, PROMPT_VERSION } from "@/lib/extraction";
import { matchLines } from "@/lib/matching";

const llm = new GroqLlmClient({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL, model: env.LLM_MODEL });

/**
 * POST /api/extractions (technical design 5.6 and 6): extracts and matches one email's
 * lines and stores them as the review seed.
 *
 * Every failure after input validation still answers with a typed error and, once the row
 * is written, the extraction's ID. That row holds every model attempt, so the rep can
 * always continue manually (FAIL-5) and the run can always be traced (FAIL-4).
 */
export async function POST(request: Request): Promise<Response> {
  const emailText = await readEmailText(request);
  if (emailText === "") return failed(null, "EMPTY_INPUT", null);
  if (emailText.length > MAX_EMAIL_CHARS) return failed(null, "INPUT_TOO_LARGE", null);

  const startedAt = Date.now();
  // Async, so even a synchronous throw becomes a rejection the best-effort write below can catch.
  const finish = async (id: string, values: Partial<typeof extraction.$inferInsert>) => {
    await db
      .update(extraction)
      .set({ ...values, durationMs: Date.now() - startedAt })
      .where(eq(extraction.id, id));
  };
  let extractionId: string | null = null;
  let attempts: ExtractionAttempt[] = [];

  try {
    // Inserted before the model is called, so even a crash mid-call leaves a trace.
    const [row] = await db
      .insert(extraction)
      .values({ emailText, status: "pending", model: env.LLM_MODEL, promptVersion: PROMPT_VERSION })
      .returning({ id: extraction.id });
    extractionId = row.id;

    // request.signal aborts when the rep cancels and the browser drops the connection.
    const result = await extractLines(emailText, { llm, signal: request.signal });
    attempts = result.attempts;
    if (!result.ok) {
      await finish(row.id, failedRow(result.code, result.retryAfterSeconds, attempts));
      return failed(row.id, result.code, result.retryAfterSeconds);
    }

    const matches = await matchLines(result.lines);
    const seed: ReviewSeed = {
      lines: result.lines.map((extracted, i) => ({ extracted, match: matches[i] })),
      notices: result.notices,
    };
    const status = seed.lines.length === 0 ? "no_items" : "succeeded";
    await finish(row.id, { status, attempts, result: seed });
    return Response.json({ ok: true, extractionId: row.id, status } satisfies CreateExtractionResponse);
  } catch (error) {
    // Matching, the database, or a bug. Nothing rethrows, so log it here for the server logs.
    console.error(`POST /api/extractions failed (extraction ${extractionId ?? "not recorded"}):`, error);
    if (extractionId !== null) {
      // Best effort, since the database may be what failed.
      await finish(extractionId, failedRow("INTERNAL_ERROR", null, attempts)).catch(() => {});
    }
    return failed(extractionId, "INTERNAL_ERROR", null);
  }
}

/** A failed row: its code, its attempts, and a seed with no lines and a notice saying why. */
function failedRow(code: ExtractionErrorCode, retryAfterSeconds: number | null, attempts: ExtractionAttempt[]) {
  const { message } = describeError(code, retryAfterSeconds);
  const seed: ReviewSeed = { lines: [], notices: [{ code: "EXTRACTION_FAILED", message }] };
  return { status: "failed", errorCode: code, attempts, result: seed } as const;
}

/**
 * The trimmed email, without NUL characters: Postgres text can't store one, and the rep
 * can't see one to delete it, so leaving it in would fail every retry. A body that isn't
 * `{ emailText: string }` carries no email, so it reads as empty.
 */
async function readEmailText(request: Request): Promise<string> {
  const body = CreateExtractionRequest.safeParse(await request.json().catch(() => null));
  return body.success ? body.data.emailText.replaceAll("\0", "").trim() : "";
}

function failed(extractionId: string | null, code: ExtractionErrorCode, retryAfterSeconds: number | null): Response {
  const { status, retryable, message } = describeError(code, retryAfterSeconds);
  const body: CreateExtractionResponse = {
    ok: false,
    extractionId,
    error: { code, message, retryable, retryAfterSeconds },
  };
  return Response.json(body, { status });
}

const UNREADABLE = { status: 502, retryable: true, message: "We couldn't read the model's answer." };

const ERRORS: Record<ExtractionErrorCode, { status: number; retryable: boolean; message: string }> = {
  EMPTY_INPUT: { status: 400, retryable: false, message: "Paste an email first." },
  INPUT_TOO_LARGE: {
    status: 413,
    retryable: false,
    message: `This email is longer than ${MAX_EMAIL_CHARS.toLocaleString("en-US")} characters. Shorten it and try again.`,
  },
  TIMEOUT: { status: 504, retryable: true, message: "This is taking too long." },
  RATE_LIMITED: { status: 429, retryable: true, message: "Rate limited, try again shortly." },
  PROVIDER_ERROR: { status: 502, retryable: true, message: "The model provider had a problem." },
  MODEL_UNAVAILABLE: { status: 503, retryable: false, message: "The model isn't available right now." },
  INVALID_JSON: UNREADABLE,
  SCHEMA_MISMATCH: UNREADABLE,
  TRUNCATED: UNREADABLE,
  // Nobody reads this response, since the client has gone. 499 is the usual "client closed request".
  CANCELLED: { status: 499, retryable: true, message: "Extraction cancelled." },
  INTERNAL_ERROR: { status: 500, retryable: true, message: "Something went wrong on the server." },
};

function describeError(code: ExtractionErrorCode, retryAfterSeconds: number | null) {
  if (code === "RATE_LIMITED" && retryAfterSeconds !== null) {
    const wait = retryAfterSeconds === 1 ? "1 second" : `${retryAfterSeconds} seconds`;
    return { ...ERRORS.RATE_LIMITED, message: `Rate limited, try again in ${wait}.` };
  }
  return ERRORS[code];
}
