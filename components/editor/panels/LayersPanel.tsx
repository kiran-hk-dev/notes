"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  MoreHorizontal,
  Plus,
  Trash2
} from "lucide-react";
import type { Layer } from "@/types";
import { useEditor } from "@/lib/state/editorStore";
import { cn, uid } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { useEditorApi } from "@/components/editor/editorContext";

export function LayersPanel() {
  const docVersion = useEditor((state) => state.docVersion);
  const api = useEditorApi();
  const engine = api.engine();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  void docVersion;
  if (!engine) return null;

  const layers = engine.getLayers();
  const objects = engine.getObjects();
  const display = [...layers].reverse();

  const counts = new Map<string, number>();
  for (const object of objects) counts.set(object.layerId, (counts.get(object.layerId) ?? 0) + 1);

  const addLayer = () => {
    engine.addLayer({
      id: uid(),
      name: `Layer ${layers.length + 1}`,
      kind: "ink",
      visible: true,
      locked: false,
      opacity: 1
    });
  };

  const commitRename = (layerId: string) => {
    const name = draft.trim();
    setRenamingId(null);
    if (name) engine.renameLayer(layerId, name);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="outline" onClick={addLayer}>
        <Plus /> New layer
      </Button>
      <ul className="flex flex-col gap-1">
        {display.map((layer: Layer, displayIndex) => {
          const arrayIndex = layers.length - 1 - displayIndex;
          const isTop = arrayIndex === layers.length - 1;
          const isBottom = arrayIndex === 0;
          const count = counts.get(layer.id) ?? 0;
          return (
            <li key={layer.id} className="rounded-xl border border-line bg-surface">
              <div className="flex items-center gap-1 px-1.5 py-1.5">
                <Button
                  size="iconSm"
                  variant="ghost"
                  aria-label={layer.visible ? "Hide layer" : "Show layer"}
                  onClick={() => engine.updateLayer(layer.id, { visible: !layer.visible })}
                >
                  {layer.visible ? <Eye /> : <EyeOff className="text-ink-faint" />}
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                  onClick={() => engine.updateLayer(layer.id, { locked: !layer.locked })}
                >
                  {layer.locked ? <Lock className="text-amber-500" /> : <LockOpen />}
                </Button>
                {renamingId === layer.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => commitRename(layer.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(layer.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    className="h-7 min-w-0 flex-1 rounded-md border border-accent bg-surface px-2 text-sm outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === layer.id ? null : layer.id)}
                    onDoubleClick={() => {
                      setDraft(layer.name);
                      setRenamingId(layer.id);
                    }}
                    className={cn("min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-sm", !layer.visible && "text-ink-faint")}
                    title="Double-click to rename"
                  >
                    {layer.name}
                    <span className="ml-1.5 text-[11px] tabular-nums text-ink-faint">{count}</span>
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="iconSm" variant="ghost" aria-label={`Layer actions for ${layer.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onSelect={() => {
                        setDraft(layer.name);
                        setRenamingId(layer.id);
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => engine.duplicateLayer(layer.id)}>
                      <Copy /> Duplicate layer
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isTop} onSelect={() => engine.reorderLayer(layer.id, 1)}>
                      <ChevronUp /> Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isBottom} onSelect={() => engine.reorderLayer(layer.id, -1)}>
                      <ChevronDown /> Move down
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger disabled={layers.length <= 1} onSelect={() => engine.removeLayer(layer.id)}>
                      <Trash2 /> Delete layer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {expandedId === layer.id ? (
                <div className="flex items-center gap-3 border-t border-line px-3 py-2">
                  <span className="text-[11px] text-ink-faint">Opacity</span>
                  <Slider
                    value={Math.round(layer.opacity * 100)}
                    min={10}
                    max={100}
                    onValueChange={(value) => engine.updateLayer(layer.id, { opacity: value / 100 })}
                    ariaLabel={`${layer.name} opacity`}
                  />
                  <span className="w-9 text-right text-[11px] tabular-nums text-ink-faint">{Math.round(layer.opacity * 100)}%</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
        Layers stack top to bottom. New ink, shapes, text, formulas, graphs and images go to their matching layer.
      </p>
    </div>
  );
}
