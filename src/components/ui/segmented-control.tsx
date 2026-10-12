"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Segment<Value extends string> = { value: Value; label: ReactNode; count?: number };

type Props<Value extends string> = {
  label: string;
  value: Value;
  segments: Segment<Value>[];
  onChange: (value: Value) => void;
  className?: string;
};

/**
 * A Mac segmented control: exactly one segment is on. Arrow keys move between segments,
 * and pressing the selected one again keeps it selected.
 */
export function SegmentedControl<Value extends string>({ label, value, segments, onChange, className }: Props<Value>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const [selected] = next;
        if (selected) onChange(selected as Value);
      }}
      className={cn("inline-flex h-7 shrink-0 items-center rounded-lg bg-secondary p-0.5", className)}
    >
      {segments.map((segment) => (
        <Toggle
          key={segment.value}
          value={segment.value}
          className="inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-footnote font-medium whitespace-nowrap text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/45 data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
        >
          {segment.label}
          {segment.count !== undefined && <span className="tabular-nums opacity-70">{segment.count}</span>}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
