"use client";

import {
  Eraser,
  Hand,
  ImagePlus,
  Lasso,
  LineChart,
  MousePointer2,
  PenLine,
  Ruler,
  Shapes,
  Sigma,
  Table,
  Type,
  Zap
} from "lucide-react";
import type { ToolId } from "@/lib/drawing/engine";
import { useEditor } from "@/lib/state/editorStore";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { useEditorApi } from "@/components/editor/editorContext";

const TOOLS: { id: ToolId; icon: typeof PenLine; label: string; shortcut: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "lasso", icon: Lasso, label: "Lasso select", shortcut: "A" },
  { id: "hand", icon: Hand, label: "Pan canvas", shortcut: "H" },
  { id: "pen", icon: PenLine, label: "Pen", shortcut: "P" },
  { id: "eraser", icon: Eraser, label: "Eraser", shortcut: "E" },
  { id: "shape", icon: Shapes, label: "Shape", shortcut: "S" },
  { id: "text", icon: Type, label: "Text", shortcut: "T" },
  { id: "formula", icon: Sigma, label: "Formula", shortcut: "F" },
  { id: "graph", icon: LineChart, label: "Graph", shortcut: "G" },
  { id: "image", icon: ImagePlus, label: "Image", shortcut: "I" },
  { id: "table", icon: Table, label: "Table", shortcut: "B" },
  { id: "laser", icon: Zap, label: "Laser pointer", shortcut: "L" }
];

export function Toolbar({ orientation = "vertical", className }: { orientation?: "vertical" | "horizontal"; className?: string }) {
  const tool = useEditor((state) => state.toolState.tool);
  const rulerActive = useEditor((state) => state.rulerActive);
  const strokeColor = useEditor((state) => state.toolState.strokeStyle.color);
  const api = useEditorApi();

  const selectTool = (id: ToolId) => {
    const engine = api.engine();
    if (!engine) return;
    engine.setTool(id);
  };

  const isPen = tool === "pen";

  return (
    <div
      className={cn(
        orientation === "vertical"
          ? "flex flex-col items-center gap-1 border-r border-line bg-surface px-1.5 py-2"
          : "flex items-center gap-1 rounded-2xl border border-line bg-surface/95 px-2 py-1.5 shadow-pop backdrop-blur",
        className
      )}
      role="toolbar"
      aria-label="Drawing tools"
    >
      {(orientation === "horizontal" ? TOOLS : TOOLS).map((item) => {
        const active = item.id === tool;
        return (
          <Tooltip key={item.id} content={item.label} shortcut={item.shortcut} side={orientation === "vertical" ? "right" : "top"}>
            <button
              type="button"
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => selectTool(item.id)}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                active ? "bg-accent text-accent-contrast shadow-soft" : "text-ink-soft hover:bg-surface-3 hover:text-ink"
              )}
            >
              <item.icon className="size-[18px]" />
            </button>
          </Tooltip>
        );
      })}
      <div className={cn(orientation === "vertical" ? "my-1 h-px w-6 bg-line" : "mx-1 h-6 w-px bg-line")} />
      <Tooltip content="Ruler (straight edge)" shortcut="R" side={orientation === "vertical" ? "right" : "top"}>
        <button
          type="button"
          aria-label="Toggle ruler"
          aria-pressed={rulerActive}
          onClick={() => api.toggleRuler()}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            rulerActive ? "bg-amber-500 text-white shadow-soft" : "text-ink-soft hover:bg-surface-3 hover:text-ink"
          )}
        >
          <Ruler className="size-[18px]" />
        </button>
      </Tooltip>
      {isPen ? (
        <span
          className="mt-1 size-6 shrink-0 rounded-full border-2 border-surface shadow-soft ring-1 ring-line"
          style={{ background: strokeColor }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
