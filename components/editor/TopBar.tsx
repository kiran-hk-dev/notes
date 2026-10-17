"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, ChevronLeft, Download, Layers, LayoutTemplate, Redo2, Settings, SlidersHorizontal, Undo2 } from "lucide-react";
import { updateNotebook } from "@/lib/repo";
import { useEditor } from "@/lib/state/editorStore";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { SettingsDialog } from "@/components/dashboard/SettingsDialog";
import { useEditorApi } from "@/components/editor/editorContext";

function SaveIndicator() {
  const saveState = useEditor((state) => state.saveState);
  const lastSavedAt = useEditor((state) => state.lastSavedAt);
  const text =
    saveState === "dirty"
      ? "Unsaved changes"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "error"
          ? "Save failed"
          : saveState === "saved" && lastSavedAt
            ? `Saved ${formatRelativeTime(lastSavedAt)}`
            : "";
  if (!text) return null;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        saveState === "error" ? "text-danger" : "text-ink-faint"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          saveState === "dirty" && "bg-amber-500",
          saveState === "saving" && "animate-pulse bg-sky-500",
          saveState === "error" && "bg-danger",
          saveState === "saved" && "bg-success"
        )}
      />
      {text}
    </span>
  );
}

export function TopBar() {
  const router = useRouter();
  const notebook = useEditor((state) => state.notebook);
  const canUndo = useEditor((state) => state.canUndo);
  const canRedo = useEditor((state) => state.canRedo);
  const rightPanel = useEditor((state) => state.rightPanel);
  const setRightPanel = useEditor((state) => state.setRightPanel);
  const api = useEditorApi();
  const [titleDraft, setTitleDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setTitleDraft(notebook?.title ?? "");
  }, [notebook?.id, notebook?.title]);

  const commitTitle = () => {
    const clean = titleDraft.trim();
    if (!notebook || !clean || clean === notebook.title) {
      setTitleDraft(notebook?.title ?? "");
      return;
    }
    void updateNotebook(notebook.id, { title: clean });
    useEditor.setState((state) => (state.notebook ? { notebook: { ...state.notebook, title: clean } } : {}));
  };

  const togglePanel = (panel: "properties" | "layers") => {
    setRightPanel(rightPanel === panel ? null : panel);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2.5 sm:gap-2 sm:px-4">
      <Tooltip content="Back to library">
        <Button variant="ghost" size="icon" aria-label="Back to library" onClick={() => router.push("/")}>
          <ChevronLeft />
        </Button>
      </Tooltip>
      <input
        value={titleDraft}
        onChange={(event) => setTitleDraft(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setTitleDraft(notebook?.title ?? "");
        }}
        aria-label="Notebook title"
        className="min-w-0 max-w-56 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-ink outline-none transition-colors hover:border-line focus:border-accent sm:max-w-xs"
      />
      <div className="hidden sm:block">
        <SaveIndicator />
      </div>
      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        <Tooltip content="Undo" shortcut="Ctrl+Z">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => api.engine()?.undo()}
          >
            <Undo2 />
          </Button>
        </Tooltip>
        <Tooltip content="Redo" shortcut="Ctrl+Shift+Z">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => api.engine()?.redo()}
          >
            <Redo2 />
          </Button>
        </Tooltip>
        <div className="mx-0.5 h-6 w-px bg-line sm:mx-1.5" />
        <Tooltip content="Export & share">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Export and share"
            onClick={() => useEditor.getState().openDialog({ kind: "export" })}
          >
            <Download />
          </Button>
        </Tooltip>
        <Tooltip content="Page templates">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Page templates"
            onClick={() => useEditor.getState().openDialog({ kind: "templates" })}
          >
            <LayoutTemplate />
          </Button>
        </Tooltip>
        <Tooltip content="Calculator">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Calculator"
            onClick={() => useEditor.getState().openDialog({ kind: "calc" })}
          >
            <Calculator />
          </Button>
        </Tooltip>
        <Tooltip content="Tool options">
          <Button
            variant={rightPanel === "properties" ? "soft" : "ghost"}
            size="icon"
            aria-label="Tool options"
            onClick={() => togglePanel("properties")}
          >
            <SlidersHorizontal />
          </Button>
        </Tooltip>
        <Tooltip content="Layers">
          <Button
            variant={rightPanel === "layers" ? "soft" : "ghost"}
            size="icon"
            aria-label="Layers"
            onClick={() => togglePanel("layers")}
          >
            <Layers />
          </Button>
        </Tooltip>
        <Tooltip content="Settings">
          <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </Button>
        </Tooltip>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
