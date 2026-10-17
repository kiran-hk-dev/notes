"use client";

import { X } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { PropertiesPanel } from "@/components/editor/panels/PropertiesPanel";
import { LayersPanel } from "@/components/editor/panels/LayersPanel";

export function SidePanel() {
  const rightPanel = useEditor((state) => state.rightPanel);
  const setRightPanel = useEditor((state) => state.setRightPanel);
  if (!rightPanel) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/35 lg:hidden"
        onClick={() => setRightPanel(null)}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[88vw] flex-col border-l border-line bg-surface shadow-pop lg:static lg:z-auto lg:w-72 lg:max-w-none lg:shadow-none">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {rightPanel === "properties" ? "Tool options" : rightPanel === "layers" ? "Layers" : "Panel"}
          </span>
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setRightPanel(null)}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="ks-scroll flex-1 overflow-y-auto p-3">
          {rightPanel === "properties" ? <PropertiesPanel /> : rightPanel === "layers" ? <LayersPanel /> : null}
        </div>
      </aside>
    </>
  );
}
