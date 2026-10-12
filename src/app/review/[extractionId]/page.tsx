import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { draftTitle } from "@/components/quotes/format";
import { ReviewScreen } from "@/components/review/review-screen";
import { Toolbar } from "@/components/shell/toolbar";
import { summarizeEmail } from "@/lib/email-summary";
import { loadReview } from "./load-review";

// Reviewing is the second step of a new quote, so the tab keeps that name.
export const metadata: Metadata = { title: "New Quote" };

// The extraction ID is only known per request, so the screen streams in behind a fallback
// while the static shell is served at once (Cache Components).
export default function ReviewPage({ params }: PageProps<"/review/[extractionId]">) {
  return (
    <Suspense
      fallback={
        <>
          <Toolbar title="New Quote" subtitle="Loading review…" />
          <main aria-busy className="min-h-0 flex-1" />
        </>
      }
    >
      {params.then(({ extractionId }) => (
        <Review extractionId={extractionId} />
      ))}
    </Suspense>
  );
}

async function Review({ extractionId }: { extractionId: string }) {
  const review = await loadReview(extractionId);
  if (!review) notFound();
  const summary = summarizeEmail(review.emailText);
  const title = summary.customer === null && summary.subject === null ? "New Quote" : draftTitle(summary);
  return (
    <ReviewScreen
      key={extractionId}
      extractionId={extractionId}
      emailText={review.emailText}
      title={title}
      seed={review.seed}
    />
  );
}
