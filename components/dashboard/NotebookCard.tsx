"use client";

import { memo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  FileJson,
  FolderInput,
  History,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Star,
  Trash2
} from "lucide-react";
import type { Notebook } from "@/types";
import { cn, downloadBlob, formatRelativeTime } from "@/lib/utils";
import { exportNotebookJsonFile, exportNotebookZip } from "@/lib/export/bundle";
import { useLibrary } from "@/lib/state/libraryStore";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { CoverView } from "@/components/dashboard/CoverView";
import { RevisionsDialog } from "@/components/dashboard/RevisionsDialog";

export const NotebookCard = memo(function NotebookCard({
  notebook,
  onOpen
}: {
  notebook: Notebook;
  onOpen: (notebook: Notebook) => void;
}) {
  const folders = useLibrary((state) => state.folders);
  const toggleFavorite = useLibrary((state) => state.toggleFavorite);
  const toggleArchive = useLibrary((state) => state.toggleArchive);
  const trash = useLibrary((state) => state.trash);
  const restore = useLibrary((state) => state.restore);
  const deleteForever = useLibrary((state) => state.deleteForever);
  const duplicate = useLibrary((state) => state.duplicate);
  const rename = useLibrary((state) => state.rename);
  const moveToFolder = useLibrary((state) => state.moveToFolder);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(notebook.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const trashed = notebook.trashed;

  const exportNotebook = async (kind: "zip" | "json") => {
    setExportNote("Preparing…");
    try {
      const result = kind === "zip" ? await exportNotebookZip(notebook.id) : await exportNotebookJsonFile(notebook.id);
      if (!result) throw new Error("export-failed");
      downloadBlob(result.blob, result.filename);
      setExportNote(kind === "zip" ? "Archive downloaded" : "JSON downloaded");
    } catch {
      setExportNote("Export failed");
    }
    window.setTimeout(() => setExportNote(null), 3500);
  };

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-pop",
          trashed && "opacity-75"
        )}
      >
        <button
          type="button"
          onClick={() => onOpen(notebook)}
          className="relative block aspect-[4/3] w-full text-left"
          aria-label={`Open ${notebook.title}`}
        >
          {notebook.thumbnail ? (
            <img src={notebook.thumbnail} alt="" className="absolute inset-0 size-full object-cover object-top" />
          ) : (
            <CoverView cover={notebook.cover} className="absolute inset-0 size-full" />
          )}
          {notebook.thumbnail ? (
            <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/25 to-transparent" />
          ) : null}
          {notebook.tags.length > 0 ? (
            <span className="absolute bottom-2 left-2 flex max-w-[80%] gap-1 overflow-hidden">
              {notebook.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
                >
                  #{tag}
                </span>
              ))}
            </span>
          ) : null}
        </button>

        <div className="absolute right-2 top-2 flex gap-1">
          <Tooltip content={notebook.favorite ? "Remove from favorites" : "Add to favorites"}>
            <button
              type="button"
              onClick={() => void toggleFavorite(notebook.id)}
              aria-label="Toggle favorite"
              className={cn(
                "rounded-full bg-black/25 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/40 group-hover:opacity-100",
                notebook.favorite && "opacity-100"
              )}
            >
              <Star className={cn("size-3.5", notebook.favorite && "fill-amber-300 text-amber-300")} />
            </button>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Notebook actions"
                className="rounded-full bg-black/25 p-1.5 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/40 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {trashed ? (
                <>
                  <DropdownMenuItem onSelect={() => void restore(notebook.id)}>
                    <RotateCcw /> Restore
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete forever
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => onOpen(notebook)}>
                    <Pencil /> Open
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setNameDraft(notebook.title);
                      setRenaming(true);
                    }}
                  >
                    <Pencil /> Rename…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void duplicate(notebook.id)}>
                    <Copy /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void toggleFavorite(notebook.id)}>
                    <Star /> {notebook.favorite ? "Unfavorite" : "Favorite"}
                  </DropdownMenuItem>
                  {folders.length > 0 ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[state=open]:bg-surface-3 [&_svg]:size-4 [&_svg]:text-ink-soft">
                        <FolderInput /> Move to folder
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem disabled={notebook.folderId === null} onSelect={() => void moveToFolder(notebook.id, null)}>
                          No folder
                        </DropdownMenuItem>
                        {folders.map((folder) => (
                          <DropdownMenuItem
                            key={folder.id}
                            disabled={notebook.folderId === folder.id}
                            onSelect={() => void moveToFolder(notebook.id, folder.id)}
                          >
                            <span className="size-2.5 rounded-full" style={{ background: folder.color }} />
                            {folder.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : null}
                  <DropdownMenuItem onSelect={() => void toggleArchive(notebook.id)}>
                    {notebook.archived ? <ArchiveRestore /> : <Archive />}
                    {notebook.archived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                    <History /> Version history…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportNotebook("zip")}>
                    <Download /> Export archive (.zip)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportNotebook("json")}>
                    <FileJson /> Export JSON
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => void trash(notebook.id)}>
                    <Trash2 /> Move to trash
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-1 px-3.5 py-3">
          <button type="button" onClick={() => onOpen(notebook)} className="truncate text-left text-sm font-semibold text-ink">
            {notebook.title}
          </button>
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <span>
              {notebook.pageCount} {notebook.pageCount === 1 ? "page" : "pages"}
            </span>
            <span aria-hidden>·</span>
            <span>{formatRelativeTime(notebook.updatedAt)}</span>
          </div>
          {exportNote ? <span className="text-[11px] font-medium text-accent-strong">{exportNote}</span> : null}
        </div>
      </div>

      <RevisionsDialog notebook={notebook} open={historyOpen} onOpenChange={setHistoryOpen} />

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
            <DialogDescription>Give your notebook a clear, memorable name.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && nameDraft.trim()) {
                  void rename(notebook.id, nameDraft);
                  setRenaming(false);
                }
              }}
              placeholder="Notebook title"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!nameDraft.trim()}
              onClick={() => {
                void rename(notebook.id, nameDraft);
                setRenaming(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete “{notebook.title}” permanently?</DialogTitle>
            <DialogDescription>All pages, drawings and notes in this notebook will be removed. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void deleteForever(notebook.id);
                setConfirmDelete(false);
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
