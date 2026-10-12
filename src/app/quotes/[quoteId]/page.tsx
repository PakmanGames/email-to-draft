import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BackToDrafts } from "@/components/quotes/back-to-drafts";
import { draftTitle } from "@/components/quotes/format";
import { LocalDateTime } from "@/components/quotes/local-date-time";
import { QuoteDetailSkeleton, QuoteDetailView } from "@/components/quotes/quote-detail";
import { Toolbar } from "@/components/shell/toolbar";
import { getQuote } from "@/lib/quotes";

export const metadata: Metadata = { title: "Draft" };

export default function DraftPage({ params }: PageProps<"/quotes/[quoteId]">) {
  return (
    <Suspense
      fallback={
        <>
          <Toolbar title="Draft" leading={<BackToDrafts />} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <QuoteDetailSkeleton />
          </main>
        </>
      }
    >
      <Draft params={params} />
    </Suspense>
  );
}

async function Draft({ params }: Pick<PageProps<"/quotes/[quoteId]">, "params">) {
  const { quoteId } = await params;
  // Read at request time only, never in a build or prefetch prerender.
  await connection();
  const quote = await getQuote(quoteId);
  if (!quote) notFound();
  return (
    <>
      <Toolbar
        leading={<BackToDrafts />}
        title={draftTitle(quote)}
        subtitle={
          <>
            {quote.customer && quote.subject && `${quote.subject} · `}Saved{" "}
            <LocalDateTime iso={quote.createdAt.toISOString()} />
          </>
        }
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <QuoteDetailView quote={quote} />
      </main>
    </>
  );
}
