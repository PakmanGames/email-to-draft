import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ReviewNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-50 px-4 text-center">
      <h1 className="text-base font-semibold text-neutral-900">There&apos;s no extraction at this link</h1>
      <p className="max-w-md text-[13px] text-neutral-600">
        The link may be incomplete. Paste the email again to start a new review.
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        Paste an email
      </Link>
    </main>
  );
}
