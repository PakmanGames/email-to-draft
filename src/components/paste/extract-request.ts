import { CreateExtractionResponse, type ExtractionError } from "@/lib/contracts";

export type ExtractOutcome =
  | { kind: "ok"; extractionId: string }
  /** A typed failure from the route (technical design 5.6). */
  | { kind: "error"; error: ExtractionError; extractionId: string | null }
  /** A response outside the contract, such as the 501 stub or an HTML error page. */
  | { kind: "unexpected"; httpStatus: number }
  | { kind: "network" };

/**
 * POST /api/extractions. Resolves to an outcome for every response, and rejects only when
 * `signal` aborts, so the caller can tell its own Cancel or time limit apart from a failure.
 */
export async function postExtraction(emailText: string, signal: AbortSignal): Promise<ExtractOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/extractions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailText }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { kind: "network" };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch (error) {
    if (signal.aborted) throw error;
  }
  const parsed = CreateExtractionResponse.safeParse(body);
  if (!parsed.success) return { kind: "unexpected", httpStatus: res.status };
  return parsed.data.ok
    ? { kind: "ok", extractionId: parsed.data.extractionId }
    : { kind: "error", error: parsed.data.error, extractionId: parsed.data.extractionId };
}
