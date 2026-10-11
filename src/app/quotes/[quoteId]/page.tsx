import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { QuoteDetailSkeleton, QuoteDetailView } from "@/components/quotes/quote-detail";
import { getQuote } from "@/lib/quotes";

export const metadata: Metadata = { title: "Draft quote" };

export default function QuotePage({ params }: PageProps<"/quotes/[quoteId]">) {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-8">
      <header className="space-y-2">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Draft quotes
        </Link>
        <h1 className="text-2xl font-semibold">Draft quote</h1>
      </header>
      <Suspense fallback={<QuoteDetailSkeleton />}>
        <Draft params={params} />
      </Suspense>
    </main>
  );
}

async function Draft({ params }: Pick<PageProps<"/quotes/[quoteId]">, "params">) {
  const { quoteId } = await params;
  // Read at request time only, never in a build or prefetch prerender.
  await connection();
  const quote = await getQuote(quoteId);
  if (!quote) notFound();
  return <QuoteDetailView quote={quote} />;
}
