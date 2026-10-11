import { z } from "zod";
import type { SaveQuoteConflict, SaveQuoteResponse } from "@/lib/contracts";
import { ExtractionNotFoundError, OfferMissingError, SaveQuoteBody, saveQuote } from "@/lib/quotes";

/**
 * POST /api/quotes (technical design 5.6 and 9). The rep clicking Save is the only way a
 * quote gets written (FAIL-3). The body has no price field, and the strict schema rejects
 * unknown keys, so a client-sent price is a 400 rather than something to ignore.
 */
export async function POST(request: Request): Promise<Response> {
  // A body that isn't JSON fails the schema like any other bad body.
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = SaveQuoteBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  try {
    const { quoteId, created } = await saveQuote(parsed.data);
    if (created) return Response.json({ quoteId } satisfies SaveQuoteResponse, { status: 201 });
    return Response.json({ code: "ALREADY_SAVED", quoteId } satisfies SaveQuoteConflict, { status: 409 });
  } catch (error) {
    if (error instanceof OfferMissingError) {
      return Response.json(
        { code: "OFFER_MISSING", linePositions: error.linePositions } satisfies SaveQuoteConflict,
        { status: 409 },
      );
    }
    if (error instanceof ExtractionNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
