"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-contrast hover:bg-accent-strong shadow-soft",
        soft: "bg-accent-soft text-accent-strong hover:brightness-95 dark:hover:brightness-110",
        ghost: "text-ink-soft hover:bg-surface-3 hover:text-ink",
        outline: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        danger: "bg-danger text-white hover:opacity-90",
        dangerGhost: "text-danger hover:bg-danger/10",
        plain: "text-ink hover:bg-surface-3"
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        md: "h-9 px-3.5 [&_svg]:size-4",
        lg: "h-11 px-5 text-base [&_svg]:size-5",
        icon: "size-9 [&_svg]:size-4",
        iconSm: "size-8 [&_svg]:size-3.5",
        iconLg: "size-11 [&_svg]:size-5"
      }
    },
    defaultVariants: {
      variant: "ghost",
      size: "md"
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
