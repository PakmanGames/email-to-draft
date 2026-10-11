import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { QuotesTable, QuotesTableSkeleton } from "@/components/quotes/quotes-table";
import { buttonVariants } from "@/components/ui/button";
import { listQuotes } from "@/lib/quotes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Draft quotes" };

export default function QuotesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Draft quotes</h1>
        {/* cva output isn't merged, so cn() lets the outline border win over the base border-transparent. */}
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          New quote
        </Link>
      </header>
      <Suspense fallback={<QuotesTableSkeleton />}>
        <Drafts />
      </Suspense>
    </main>
  );
}

async function Drafts() {
  // Every save adds a draft, so read the list per request. connection() also keeps the
  // query out of the build-time prerender, which would otherwise freeze the list.
  await connection();
  return <QuotesTable quotes={await listQuotes()} />;
}
