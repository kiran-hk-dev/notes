"use client";

import type { CoverDesign } from "@/types";
import { cn } from "@/lib/utils";

export const COVER_PATTERNS = [
  { id: "none", name: "Plain" },
  { id: "dots", name: "Dots" },
  { id: "grid", name: "Grid" },
  { id: "diagonal", name: "Diagonal" },
  { id: "waves", name: "Waves" }
] as const;

function patternStyle(pattern: string): React.CSSProperties {
  switch (pattern) {
    case "dots":
      return {
        backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 1.5px, transparent 1.5px)",
        backgroundSize: "14px 14px"
      };
    case "grid":
      return {
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)",
        backgroundSize: "18px 18px"
      };
    case "diagonal":
      return {
        backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 2px, transparent 2px 12px)"
      };
    case "waves":
      return {
        backgroundImage:
          "repeating-radial-gradient(circle at 0 100%, transparent 0 16px, rgba(255,255,255,0.18) 16px 18px, transparent 18px 32px)"
      };
    default:
      return {};
  }
}

export function coverBackground(cover: CoverDesign): React.CSSProperties {
  if (cover.style === "gradient") {
    return { background: `linear-gradient(135deg, ${cover.color} 0%, ${cover.color2} 100%)` };
  }
  return { background: cover.color };
}

export function CoverView({
  cover,
  className,
  children
}: {
  cover: CoverDesign;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden", className)} style={coverBackground(cover)}>
      <div className="absolute inset-0" style={patternStyle(cover.pattern)} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
      {cover.emoji ? <div className="relative select-none text-5xl drop-shadow-sm">{cover.emoji}</div> : null}
      {children}
    </div>
  );
}

export function CoverSwatch({ cover, selected, className }: { cover: CoverDesign; selected?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "relative size-9 shrink-0 overflow-hidden rounded-lg border",
        selected ? "border-accent ring-2 ring-accent/40" : "border-line",
        className
      )}
      style={coverBackground(cover)}
    >
      <div className="absolute inset-0" style={patternStyle(cover.pattern)} />
    </div>
  );
}
