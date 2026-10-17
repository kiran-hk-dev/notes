"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  sideOffset = 8,
  align = "center",
  side,
  children,
  onOpenAutoFocus
}: {
  className?: string;
  sideOffset?: number;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        side={side}
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "ks-popover z-[60] rounded-xl border border-line bg-surface p-3 shadow-pop outline-none",
          className
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
