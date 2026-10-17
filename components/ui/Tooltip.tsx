"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function TooltipProvider({ children, delayDuration = 350 }: { children: React.ReactNode; delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "bottom",
  align = "center",
  shortcut,
  className
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  shortcut?: string;
  className?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={8}
            className={cn(
              "z-[70] flex items-center gap-2 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-surface shadow-pop dark:bg-surface-3 dark:text-ink",
              className
            )}
          >
            {content}
            {shortcut ? (
              <kbd className="rounded border border-white/20 bg-white/10 px-1 py-0.5 text-[10px] leading-none dark:border-line dark:bg-surface-2 dark:text-ink-soft">
                {shortcut}
              </kbd>
            ) : null}
            <TooltipPrimitive.Arrow className="fill-ink dark:fill-surface-3" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
