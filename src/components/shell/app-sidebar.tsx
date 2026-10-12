"use client";

import { Files, Mail, SquarePen, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { formatCents } from "@/components/quotes/format";
import { LocalDateTime } from "@/components/quotes/local-date-time";
import { cn } from "@/lib/utils";

export type SidebarDraft = { id: string; title: string; createdAt: string; totalCents: number };

type Props = {
  /** Newest first, a handful at most. Null while the drafts are loading. */
  recent: SidebarDraft[] | null;
  draftCount: number | null;
  /** The drafts couldn't be read. Navigation still works. */
  failed?: boolean;
};

/**
 * The source list on every page (D-020): New Quote, Drafts with a count, and the most
 * recent drafts by customer or subject. Exactly one row is selected, so the rep always
 * sees where they are, and anything here is one click away.
 */
export function AppSidebar(props: Props) {
  return <AppSidebarView {...props} pathname={usePathname()} />;
}

/**
 * The sidebar for a known path, or with nothing selected when `pathname` is null. The
 * prerendered shell uses null, because the path of a dynamic route is only known at request
 * time and reading it there would block the shell.
 */
export function AppSidebarView({
  recent,
  draftCount,
  failed = false,
  pathname,
}: Props & { pathname: string | null }) {
  pathname ??= "";
  const inNewQuote = pathname === "/" || pathname.startsWith("/review/");
  const openDraft = /^\/quotes\/([^/]+)$/.exec(pathname)?.[1] ?? null;
  const openDraftListed = recent?.some((draft) => draft.id === openDraft) ?? false;

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-[3.25rem] shrink-0 items-center gap-2 px-4">
        <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground shadow-xs">
          <Mail className="size-3.5" strokeWidth={2.25} />
        </span>
        <span className="text-body font-semibold">Email to Draft</span>
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col px-2.5 pb-3">
        <ul className="space-y-0.5">
          <li>
            <SidebarItem href="/" icon={SquarePen} selected={inNewQuote} prominent>
              New Quote
            </SidebarItem>
          </li>
          <li>
            <SidebarItem
              href="/quotes"
              icon={Files}
              selected={pathname === "/quotes" || (openDraft !== null && !openDraftListed)}
              trailing={draftCount === null ? null : <span className="tabular-nums">{draftCount}</span>}
            >
              Drafts
            </SidebarItem>
          </li>
        </ul>

        <h2 className="mt-5 mb-1 px-2 text-caption font-semibold text-muted-foreground">Recent Drafts</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {failed ? (
            <p className="px-2 py-1 text-footnote text-muted-foreground">Drafts couldn&apos;t be loaded.</p>
          ) : recent === null ? (
            <RecentSkeleton />
          ) : recent.length === 0 ? (
            <p className="px-2 py-1 text-footnote text-muted-foreground">Saved drafts appear here.</p>
          ) : (
            <ul className="space-y-0.5">
              {recent.map((draft) => (
                <li key={draft.id}>
                  <Link
                    href={`/quotes/${draft.id}`}
                    aria-current={draft.id === openDraft ? "page" : undefined}
                    className={cn(itemClass, "block py-1.5", draft.id === openDraft && selectedClass)}
                  >
                    <span className="block truncate text-body font-medium">{draft.title}</span>
                    <span className="flex justify-between gap-2 text-footnote text-muted-foreground tabular-nums">
                      <LocalDateTime iso={draft.createdAt} short />
                      <span>{formatCents(draft.totalCents)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}

const itemClass =
  "rounded-md px-2 outline-none hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/45 focus-visible:ring-inset";
const selectedClass = "bg-sidebar-accent hover:bg-sidebar-accent";

function SidebarItem({
  href,
  icon: Icon,
  selected,
  prominent = false,
  trailing,
  children,
}: {
  href: string;
  icon: LucideIcon;
  selected: boolean;
  prominent?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn(itemClass, "flex h-7 items-center gap-2 text-body", selected && selectedClass, prominent && "font-semibold")}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", prominent || selected ? "text-sidebar-primary" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && <span className="text-footnote text-muted-foreground">{trailing}</span>}
    </Link>
  );
}

function RecentSkeleton() {
  return (
    <div aria-busy aria-label="Loading recent drafts" className="space-y-2 px-2 pt-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-1.5 py-1">
          <div className="h-3 w-3/4 animate-pulse rounded bg-hover" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-hover" />
        </div>
      ))}
    </div>
  );
}
