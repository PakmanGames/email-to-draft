"use client";

import { ArrowRight, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_EMAIL_CHARS } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { postExtraction } from "./extract-request";
import { clientTimeoutFailure, describeFailure, type Failure } from "./failure";

/** EXT-3: the wait never exceeds 30 seconds. The server answers within 28 (technical design 6). */
export const CLIENT_TIME_LIMIT_MS = 30_000;

type PasteState =
  | { status: "idle"; cancelled: boolean }
  | { status: "extracting" }
  | { status: "opening" }
  | { status: "failed"; failure: Failure };

const count = new Intl.NumberFormat("en-US");

/**
 * The paste page form (EXT-1, EXT-3). Each Extract is one request with its own extraction ID,
 * and nothing is kept outside this component, so other tabs never see it (EXT-4).
 */
export function PasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, setState] = useState<PasteState>({ status: "idle", cancelled: false });
  const inFlight = useRef<{ controller: AbortController; reason: "cancel" | "timeout" | null } | null>(null);
  const resetWhenHidden = useRef(false);

  // Next.js keeps this page mounted but hidden after navigating away (Activity). Stop any
  // request then, and after a successful extraction clear the form for the next email.
  useLayoutEffect(() => {
    return () => {
      const request = inFlight.current;
      inFlight.current = null;
      request?.controller.abort();
      if (resetWhenHidden.current) setText("");
      resetWhenHidden.current = false;
      setState({ status: "idle", cancelled: false });
    };
  }, []);

  const length = text.trim().length;
  const tooLong = length > MAX_EMAIL_CHARS;
  const busy = state.status === "extracting" || state.status === "opening";

  async function extract() {
    if (busy || length === 0 || tooLong) return;
    const request = { controller: new AbortController(), reason: null as "cancel" | "timeout" | null };
    inFlight.current = request;
    setState({ status: "extracting" });
    const timer = setTimeout(() => {
      request.reason = "timeout";
      request.controller.abort();
    }, CLIENT_TIME_LIMIT_MS);

    try {
      const outcome = await postExtraction(text, request.controller.signal);
      if (inFlight.current !== request) return;
      if (outcome.kind === "ok") {
        resetWhenHidden.current = true;
        setState({ status: "opening" });
        router.push(`/review/${outcome.extractionId}`);
      } else {
        setState({ status: "failed", failure: describeFailure(outcome) });
      }
    } catch {
      // Only an abort lands here: our own Cancel or time limit, or the page being hidden.
      if (inFlight.current !== request) return;
      setState(
        request.reason === "timeout"
          ? { status: "failed", failure: clientTimeoutFailure }
          : { status: "idle", cancelled: true },
      );
    } finally {
      clearTimeout(timer);
      if (inFlight.current === request) inFlight.current = null;
    }
  }

  function cancel() {
    if (!inFlight.current) return;
    inFlight.current.reason = "cancel";
    inFlight.current.controller.abort();
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void extract();
      }}
    >
      <div className="rounded-lg border border-neutral-200 bg-white shadow-xs focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-400/20">
        <textarea
          aria-label="RFQ email"
          aria-describedby="email-length"
          value={text}
          readOnly={busy}
          spellCheck={false}
          placeholder="Paste the customer's email here, including any tables and forwarded messages."
          onChange={(event) => {
            setText(event.target.value);
            if (state.status !== "extracting") setState({ status: "idle", cancelled: false });
          }}
          className="block h-[50vh] min-h-64 w-full resize-y rounded-t-lg bg-transparent px-4 py-3 font-mono text-[13px] leading-5 text-neutral-900 outline-none placeholder:font-sans placeholder:text-neutral-400 read-only:text-neutral-500"
        />
        <div className="flex min-h-12 items-center gap-3 border-t border-neutral-100 px-3 py-2">
          <p id="email-length" className={cn("text-xs tabular-nums", tooLong ? "text-red-700" : "text-neutral-500")}>
            {count.format(length)} / {count.format(MAX_EMAIL_CHARS)} characters
          </p>
          <div className="ml-auto flex items-center gap-3">
            {busy && <Waiting opening={state.status === "opening"} />}
            {state.status === "extracting" ? (
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel
              </Button>
            ) : (
              <Button type="submit" disabled={busy || length === 0 || tooLong}>
                Extract
              </Button>
            )}
          </div>
        </div>
      </div>

      {tooLong && (
        <p role="alert" className="text-[13px] text-red-700">
          This email is {count.format(length - MAX_EMAIL_CHARS)} characters over the limit. Remove older messages
          or signatures to fit it in.
        </p>
      )}
      {state.status === "idle" && state.cancelled && (
        <p role="status" className="text-[13px] text-neutral-600">
          Extraction cancelled. Your email is still here.
        </p>
      )}
      {state.status === "failed" && <FailurePanel failure={state.failure} onRetry={() => void extract()} />}
    </form>
  );
}

/** Spinner and elapsed seconds while waiting (EXT-3). Ticks on its own, so typing never lags. */
function Waiting({ opening }: { opening: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = performance.now();
    const id = setInterval(() => setSeconds(Math.floor((performance.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="flex items-center gap-2 text-[13px] text-neutral-600">
      <LoaderCircle aria-hidden className="size-4 animate-spin text-neutral-400" />
      <span role="status">{opening ? "Opening review" : "Extracting line items"}</span>
      <span className="w-8 text-neutral-500 tabular-nums">{seconds} s</span>
    </p>
  );
}

function FailurePanel({ failure, onRetry }: { failure: Failure; onRetry: () => void }) {
  const wait = useCountdown(failure.retryAfterSeconds);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg bg-white px-4 py-3 ring-1 ring-neutral-200 ring-inset">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">
          {failure.retryAfterSeconds === null
            ? failure.title
            : wait > 0
              ? `Rate limited, try again in ${wait} seconds.`
              : "Rate limited. You can retry now."}
        </p>
        {failure.detail && <p className="text-[13px] text-neutral-600">{failure.detail}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {failure.retryable && (
            <Button type="button" variant="outline" disabled={wait > 0} onClick={onRetry}>
              {wait > 0 ? `Retry in ${wait} s` : "Retry"}
            </Button>
          )}
          {failure.extractionId && (
            <Link href={`/review/${failure.extractionId}`} className={cn(buttonVariants({ variant: "outline" }))}>
              Continue manually
              <ArrowRight aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Whole seconds left of a wait that starts when the component mounts. */
function useCountdown(seconds: number | null): number {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    if (!seconds) return;
    const endsAt = performance.now() + seconds * 1000;
    const id = setInterval(() => {
      const next = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      setLeft(next);
      if (next === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [seconds]);
  return left;
}
