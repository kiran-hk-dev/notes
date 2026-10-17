"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Maximize, Minus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { useEditor } from "@/lib/state/editorStore";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { useEditorApi } from "@/components/editor/editorContext";

export function PageStrip() {
  const pages = useEditor((state) => state.pages);
  const activePageId = useEditor((state) => state.activePageId);
  const viewport = useEditor((state) => state.viewport);
  const pointer = useEditor((state) => state.pointer);
  const saveState = useEditor((state) => state.saveState);
  const lastSavedAt = useEditor((state) => state.lastSavedAt);
  const api = useEditorApi();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const index = pages.findIndex((page) => page.id === activePageId);

  const saveText =
    saveState === "dirty"
      ? "Unsaved"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "error"
          ? "Not saved"
          : lastSavedAt
            ? `Saved ${formatRelativeTime(lastSavedAt)}`
            : "";

  return (
    <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-line bg-surface px-2 sm:px-3">
      <span className="hidden w-28 shrink-0 text-[11px] tabular-nums text-ink-faint sm:block">
        {pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}` : ""}
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Button
          variant="ghost"
          size="iconSm"
          aria-label="Previous page"
          disabled={index <= 0}
          onClick={() => index > 0 && void api.goToPage(pages[index - 1].id)}
        >
          <ChevronLeft />
        </Button>
        <div className="ks-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
          {pages.map((page, pageIndex) => (
            <button
              key={page.id}
              type="button"
              onClick={() => void api.goToPage(page.id)}
              className={
                page.id === activePageId
                  ? "flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-semibold text-accent-contrast"
                  : "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs text-ink-soft transition-colors hover:bg-surface-3"
              }
              title={page.title || `Page ${pageIndex + 1}`}
            >
              <span className="tabular-nums">{pageIndex + 1}</span>
              {page.title ? <span className="max-w-24 truncate font-normal opacity-90">{page.title}</span> : null}
            </button>
          ))}
        </div>
        <Tooltip content="Add page">
          <Button variant="ghost" size="iconSm" aria-label="Add page" onClick={() => void api.addPage()}>
            <Plus />
          </Button>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Page actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => activePageId && void api.duplicatePage(activePageId)}>
              <Copy /> Duplicate page
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => index > 0 && activePageId && void api.movePage(activePageId, -1)}>
              <ChevronLeft /> Move page left
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => index < pages.length - 1 && activePageId && void api.movePage(activePageId, 1)}
            >
              <ChevronRight /> Move page right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Delete page
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip content="Zoom out">
          <Button variant="ghost" size="iconSm" aria-label="Zoom out" onClick={() => api.engine()?.zoomBy(0.8)}>
            <Minus />
          </Button>
        </Tooltip>
        <span className="w-12 text-center text-xs tabular-nums text-ink-soft">{Math.round(viewport.scale * 100)}%</span>
        <Tooltip content="Zoom in">
          <Button variant="ghost" size="iconSm" aria-label="Zoom in" onClick={() => api.engine()?.zoomBy(1.25)}>
            <Plus />
          </Button>
        </Tooltip>
        <Tooltip content="Fit page">
          <Button variant="ghost" size="iconSm" aria-label="Fit page" onClick={() => api.engine()?.fitToPage()}>
            <Maximize />
          </Button>
        </Tooltip>
      </div>
      <span className="hidden w-28 shrink-0 text-right text-[11px] text-ink-faint lg:block">{saveText}</span>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete this page?</DialogTitle>
            <DialogDescription>The page and everything on it will be removed from this notebook.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (activePageId) void api.deletePage(activePageId);
                setConfirmDelete(false);
              }}
            >
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  );
}
