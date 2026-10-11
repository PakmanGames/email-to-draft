import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReviewScreen } from "@/components/review/review-screen";
import { loadReview } from "./load-review";

export const metadata: Metadata = { title: "Review quote" };

// The extraction ID is only known per request, so the screen streams in behind a fallback
// while the static shell is served at once (Cache Components).
export default function ReviewPage({ params }: PageProps<"/review/[extractionId]">) {
  return (
    <Suspense fallback={<p className="p-6 text-[13px] text-neutral-500">Loading review…</p>}>
      {params.then(({ extractionId }) => (
        <Review extractionId={extractionId} />
      ))}
    </Suspense>
  );
}

async function Review({ extractionId }: { extractionId: string }) {
  const review = await loadReview(extractionId);
  if (!review) notFound();
  return <ReviewScreen key={extractionId} extractionId={extractionId} emailText={review.emailText} seed={review.seed} />;
}
