"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function DropdownMenuSubContent({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        sideOffset={4}
        className={cn(
          "ks-popover z-[60] min-w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop",
          className
        )}
      >
        {children}
      </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  children
}: {
  className?: string;
  sideOffset?: number;
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "ks-popover z-[60] min-w-52 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop",
          className
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger = false,
  disabled = false,
  onSelect,
  children
}: {
  className?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      onSelect={(event) => {
        if (onSelect) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-surface-3 [&_svg]:size-4 [&_svg]:text-ink-soft",
        danger && "text-danger data-[highlighted]:bg-danger/10 [&_svg]:text-danger",
        className
      )}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </DropdownMenuPrimitive.Label>
  );
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />;
}

export function DropdownMenuCheckboxItem({
  checked,
  onCheckedChange,
  children
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(event) => event.preventDefault()}
      className="flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-3"
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded border border-line-strong",
          checked && "border-accent bg-accent text-accent-contrast"
        )}
      >
        {checked ? <span className="text-[10px] leading-none">✓</span> : null}
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
