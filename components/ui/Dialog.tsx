"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[min(96vw,1200px)]"
} as const;

export function DialogContent({
  className,
  children,
  size = "md",
  hideClose = false
}: {
  className?: string;
  children: React.ReactNode;
  size?: keyof typeof sizeClasses;
  hideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ks-overlay fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "ks-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop",
          sizeClasses[size],
          className
        )}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex flex-col gap-1 border-b border-line px-5 py-4 pr-12", className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Title className={cn("text-base font-semibold text-ink", className)}>{children}</DialogPrimitive.Title>
  );
}

export function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <DialogPrimitive.Description className={cn("text-sm text-ink-soft", className)}>{children}</DialogPrimitive.Description>;
}

export function DialogBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("ks-scroll flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 border-t border-line px-5 py-3.5", className)}>{children}</div>
  );
}
