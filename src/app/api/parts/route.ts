import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SearchPartsResponse } from "@/lib/contracts";
import { searchParts } from "@/lib/matching";

/** Longer than any part number, NSN, or description a rep would type. */
const MAX_QUERY_CHARS = 200;

const Query = z.string().trim().max(MAX_QUERY_CHARS);

/**
 * GET /api/parts?q= (technical design 5.6): candidates for a part number, NSN, or
 * description, from the same matcher as extraction. A missing or blank `q` finds nothing.
 */
export async function GET(request: NextRequest) {
  const query = Query.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!query.success) {
    return Response.json({ error: `q must be at most ${MAX_QUERY_CHARS} characters` }, { status: 400 });
  }
  const body: SearchPartsResponse = { candidates: await searchParts(query.data) };
  return Response.json(body);
}
