import { FileQuestion, SquarePen } from "lucide-react";
import Link from "next/link";
import { Toolbar } from "@/components/shell/toolbar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ReviewNotFound() {
  return (
    <>
      <Toolbar title="New Quote" />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <FileQuestion aria-hidden className="size-10 text-faint-foreground" strokeWidth={1.5} />
        <h2 className="text-headline font-semibold">There&apos;s no extraction at this link</h2>
        <p className="max-w-md text-footnote text-muted-foreground">
          The link may be incomplete. Paste the email again to start a new quote.
        </p>
        <Link href="/" className={cn(buttonVariants(), "mt-2")}>
          <SquarePen aria-hidden />
          New Quote
        </Link>
      </main>
    </>
  );
}
