"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import type { Offer } from "@/lib/contracts";
import { unitPriceCents } from "@/lib/pricing";
import { formatCents, formatCount } from "./format";

type Props = {
  offers: Offer[];
  supplier: string;
  markupBps: number;
  label: string;
  onChange: (supplier: string) => void;
};

const columns = "grid grid-cols-[1rem_minmax(10rem,1fr)_4.5rem_4.5rem_3.5rem] items-center gap-x-3";

/**
 * Picks one supplier offer for a part (MAT-5), as a Mac pop-up button. The button shows
 * only the supplier, to keep rows compact. The menu lists every offer with on hand, unit
 * price at the current markup, and lead time, so the rep compares them side by side.
 */
export function SupplierSelect({ offers, supplier, markupBps, label, onChange }: Props) {
  return (
    <Select.Root value={supplier} onValueChange={(value) => value && onChange(value)}>
      <Select.Trigger
        aria-label={label}
        title={supplier}
        className="inline-flex h-6 w-full min-w-0 items-center gap-1 rounded-md border border-input bg-background pr-1 pl-2 text-footnote shadow-xs outline-none select-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/45 data-popup-open:bg-accent"
      >
        <Select.Value className="min-w-0 flex-1 truncate text-left" />
        <Select.Icon className="shrink-0 text-muted-foreground">
          <ChevronsUpDown aria-hidden className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} side="bottom" align="start" sideOffset={4} className="z-50">
          <Select.Popup className="max-h-[var(--available-height)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg bg-popover p-1 text-footnote text-popover-foreground shadow-float outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <div aria-hidden className={`${columns} px-2 pt-1 pb-1.5 text-caption font-semibold text-muted-foreground`}>
              <span />
              <span>Supplier</span>
              <span className="text-right">On Hand</span>
              <span className="text-right">Unit Price</span>
              <span className="text-right">Lead</span>
            </div>
            <Select.List>
              {offers.map((offer) => (
                <Select.Item
                  key={offer.supplier}
                  value={offer.supplier}
                  label={offer.supplier}
                  // Highlighted rows use the accent, like a Mac menu.
                  className={`${columns} group cursor-default rounded-[5px] px-2 py-1 tabular-nums outline-none select-none data-highlighted:bg-primary data-highlighted:text-primary-foreground`}
                >
                  <Select.ItemIndicator>
                    <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 truncate">{offer.supplier}</Select.ItemText>
                  <span className="text-right">
                    {formatCount(offer.qtyOnHand)}
                    <span className="sr-only"> on hand</span>
                  </span>
                  <span className="text-right">{formatCents(unitPriceCents(offer.unitCostCents, markupBps))}</span>
                  <span className="text-right text-muted-foreground group-data-highlighted:text-primary-foreground">
                    {offer.leadTimeDays} d<span className="sr-only">ays lead time</span>
                  </span>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
