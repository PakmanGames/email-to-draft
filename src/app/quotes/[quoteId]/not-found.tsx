import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { BackToDrafts } from "@/components/quotes/back-to-drafts";
import { Toolbar } from "@/components/shell/toolbar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Replaces the whole page, so it brings its own toolbar.
export default function DraftNotFound() {
  return (
    <>
      <Toolbar title="Draft Not Found" leading={<BackToDrafts />} />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <FileQuestion aria-hidden className="size-10 text-faint-foreground" strokeWidth={1.5} />
        <h2 className="text-headline font-semibold">Draft not found</h2>
        <p className="text-footnote text-muted-foreground">This link doesn&apos;t match a saved draft.</p>
        <Link href="/quotes" className={cn(buttonVariants({ variant: "outline" }), "mt-2")}>
          Show All Drafts
        </Link>
      </main>
    </>
  );
}
