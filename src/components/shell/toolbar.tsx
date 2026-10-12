import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Before the title, such as a back button. */
  leading?: ReactNode;
  /** Contextual actions on the trailing edge. */
  children?: ReactNode;
  className?: string;
};

/**
 * The window toolbar above every page's content, as in a Mac app: where you are on the
 * leading edge, what you can do here on the trailing edge. It stays put while the
 * content scrolls beneath it.
 */
export function Toolbar({ title, subtitle, leading, children, className }: Props) {
  return (
    <header
      className={cn(
        "z-20 flex h-[3.25rem] shrink-0 items-center gap-3 border-b border-border bg-toolbar px-5 backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-headline font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-footnote text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-3">{children}</div>}
    </header>
  );
}
