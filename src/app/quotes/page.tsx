import { SquarePen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { QuotesTable, QuotesTableSkeleton } from "@/components/quotes/quotes-table";
import { Toolbar } from "@/components/shell/toolbar";
import { buttonVariants } from "@/components/ui/button";
import { listQuotes } from "@/lib/quotes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Drafts" };

export default function DraftsPage() {
  return (
    <Suspense
      fallback={
        <>
          <DraftsToolbar subtitle={null} showNewQuote />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <QuotesTableSkeleton />
          </main>
        </>
      }
    >
      <Drafts />
    </Suspense>
  );
}

async function Drafts() {
  // Every save adds a draft, so read the list per request. connection() also keeps the
  // query out of the build-time prerender, which would otherwise freeze the list.
  await connection();
  const quotes = await listQuotes();
  return (
    <>
      {/* With no drafts, the empty state offers New Quote itself. */}
      <DraftsToolbar
        subtitle={quotes.length === 0 ? "No drafts" : `${quotes.length} ${quotes.length === 1 ? "draft" : "drafts"}`}
        showNewQuote={quotes.length > 0}
      />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <QuotesTable quotes={quotes} />
      </main>
    </>
  );
}

function DraftsToolbar({ subtitle, showNewQuote }: { subtitle: string | null; showNewQuote: boolean }) {
  return (
    <Toolbar title="Drafts" subtitle={subtitle}>
      {showNewQuote && (
        // cva output isn't merged, so cn() lets the outline border win over the base border-transparent.
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          <SquarePen aria-hidden />
          New Quote
        </Link>
      )}
    </Toolbar>
  );
}
