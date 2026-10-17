"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const CanvasStage = forwardRef<HTMLDivElement, { className?: string }>(function CanvasStage({ className }, ref) {
  return <div ref={ref} className={cn("ks-canvas-stage absolute inset-0 overflow-hidden", className)} />;
});
