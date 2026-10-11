"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SearchPartsResponse, type Candidate } from "@/lib/contracts";
import { CandidateSummary } from "./candidate-summary";

type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; query: string; candidates: Candidate[] }
  | { status: "unavailable" };

type Props = {
  /** Accessible name for the search box, such as "Search inventory for line 3". */
  label: string;
  placeholder: string;
  markupBps: number;
  onPick: (candidate: Candidate, query: string) => void;
  /** Extra actions next to the search button, given the current query. */
  actions?: (query: string) => ReactNode;
  inputId?: string;
};

/**
 * Free-text inventory lookup through GET /api/parts (the same matcher extraction uses), for
 * picking a part matching didn't offer or adding a line (REV-3). Any response that isn't a valid
 * candidate list, including the 501 before matching lands, reads as "search unavailable", so the
 * rep can still keep the line unmatched or add it as free text.
 */
export function PartSearch({ label, placeholder, markupBps, onPick, actions, inputId }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  async function search() {
    const q = query.trim();
    if (!q) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: "searching" });
    try {
      const res = await fetch(`/api/parts?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      const parsed = SearchPartsResponse.safeParse(res.ok ? await res.json() : null);
      setState(parsed.success ? { status: "done", query: q, candidates: parsed.data.candidates } : { status: "unavailable" });
    } catch {
      if (!controller.signal.aborted) setState({ status: "unavailable" });
    }
  }

  function pick(candidate: Candidate) {
    onPick(candidate, query.trim());
    setQuery("");
    setState({ status: "idle" });
  }

  return (
    <div className="space-y-1.5">
      <form
        role="search"
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="relative min-w-48 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            id={inputId}
            type="search"
            aria-label={label}
            value={query}
            maxLength={2000}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            className="h-7 w-full rounded-md border border-neutral-200 bg-white pr-2 pl-7 text-[13px] text-neutral-900 shadow-xs outline-none placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-400/30"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || state.status === "searching"}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-800 shadow-xs hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none disabled:opacity-50"
        >
          {state.status === "searching" && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
          Search
        </button>
        {actions?.(query.trim())}
      </form>

      <div aria-live="polite">
        {state.status === "unavailable" && (
          <p className="text-xs text-neutral-500">Inventory search isn&apos;t available right now.</p>
        )}
        {state.status === "done" && state.candidates.length === 0 && (
          <p className="text-xs text-neutral-500">No parts found for &ldquo;{state.query}&rdquo;.</p>
        )}
        {state.status === "done" && state.candidates.length > 0 && (
          <ul aria-label={`Inventory results for ${state.query}`} className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
            {state.candidates.map((candidate) => (
              <li key={candidate.partNumber} className="flex items-start gap-3 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <CandidateSummary candidate={candidate} markupBps={markupBps} />
                </div>
                <button
                  type="button"
                  onClick={() => pick(candidate)}
                  aria-label={`Use ${candidate.partNumber}`}
                  className="h-6 shrink-0 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-800 shadow-xs hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
