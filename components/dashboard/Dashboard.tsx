"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  BookOpen,
  ChevronDown,
  Clock,
  FileUp,
  Folder,
  FolderPlus,
  LayoutGrid,
  Menu,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X
} from "lucide-react";
import type { Notebook } from "@/types";
import { ensureSeedData, touchNotebook } from "@/lib/repo";
import { requestPersistence } from "@/lib/db";
import { importNotebookFile } from "@/lib/export/bundle";
import { importPdfAsNotebook } from "@/lib/import/pdf";
import { selectVisibleNotebooks, useLibrary, type LibraryFilter } from "@/lib/state/libraryStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { NotebookCard } from "@/components/dashboard/NotebookCard";
import { NewNotebookDialog } from "@/components/dashboard/NewNotebookDialog";
import { SettingsDialog } from "@/components/dashboard/SettingsDialog";

const FILTERS: { id: LibraryFilter; label: string; icon: typeof BookOpen }[] = [
  { id: "all", label: "All notebooks", icon: BookOpen },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 }
];

type SortKey = "updated" | "created" | "title";

export function Dashboard() {
  const router = useRouter();
  const notebooks = useLibrary((state) => state.notebooks);
  const folders = useLibrary((state) => state.folders);
  const tags = useLibrary((state) => state.tags);
  const loadedOnce = useLibrary((state) => state.loadedOnce);
  const filter = useLibrary((state) => state.filter);
  const folderId = useLibrary((state) => state.folderId);
  const query = useLibrary((state) => state.query);
  const setFilter = useLibrary((state) => state.setFilter);
  const setQuery = useLibrary((state) => state.setQuery);
  const setFolderId = useLibrary((state) => state.setFolderId);
  const addFolder = useLibrary((state) => state.addFolder);
  const refresh = useLibrary((state) => state.refresh);
  const emptyTrash = useLibrary((state) => state.emptyTrash);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void (async () => {
      await ensureSeedData();
      await refresh();
      void requestPersistence();
    })();
  }, [refresh]);

  const visible = useMemo(() => {
    const filtered = selectVisibleNotebooks({ notebooks, filter, folderId, query });
    if (filter === "trash" || filter === "recent") return filtered;
    const sorted = [...filtered];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "created") sorted.sort((a, b) => b.createdAt - a.createdAt);
    else sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    return sorted;
  }, [notebooks, filter, folderId, query, sort]);

  const openNotebook = (notebook: Notebook) => {
    void touchNotebook(notebook.id, { opened: true });
    router.push(`/notebook/${notebook.id}`);
  };

  const importFile = async (file: File) => {
    setImporting(true);
    setImportError(null);
    setImportProgress(null);
    try {
      let notebook: Notebook | null = null;
      if (file.name.toLowerCase().endsWith(".pdf")) {
        notebook = await importPdfAsNotebook(file, {
          onProgress: (done, total) => setImportProgress(`Rendering PDF page ${done} of ${total}…`)
        });
      } else {
        notebook = await importNotebookFile(file);
      }
      if (!notebook) {
        setImportError("That file could not be imported. Use an InkSpace .zip, .json or a PDF.");
        return;
      }
      await refresh();
      router.push(`/notebook/${notebook.id}`);
    } catch {
      setImportError("Import failed unexpectedly. The file may be corrupted.");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const counts = useMemo(() => {
    const active = notebooks.filter((n) => !n.trashed);
    return {
      all: active.length,
      favorites: active.filter((n) => n.favorite).length,
      archived: active.filter((n) => n.archived).length,
      trash: notebooks.filter((n) => n.trashed).length
    };
  }, [notebooks]);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <button type="button" onClick={() => router.push("/")} className="flex items-center gap-2.5 px-1.5 pt-1 text-left">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-soft">
          <NotebookPen className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-ink">InkSpace</span>
          <span className="text-[11px] text-ink-faint">Local-first notebook</span>
        </span>
      </button>

      <nav className="flex flex-col gap-0.5">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id);
              setFolderId(null);
              setDrawerOpen(false);
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              filter === item.id && !folderId ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-surface-3 hover:text-ink"
            )}
          >
            <item.icon className="size-4" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === "trash" && counts.trash > 0 ? (
              <span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular-nums text-ink-soft">{counts.trash}</span>
            ) : item.id !== "trash" ? (
              <span className="text-[11px] tabular-nums text-ink-faint">{counts[item.id as "all" | "favorites" | "archived"]}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Folders</span>
          <Tooltip content="New folder">
            <button
              type="button"
              aria-label="New folder"
              className="rounded-md p-1 text-ink-faint hover:bg-surface-3 hover:text-ink"
              onClick={() => {
                setFolderName("");
                setFolderDialog(true);
              }}
            >
              <FolderPlus className="size-3.5" />
            </button>
          </Tooltip>
        </div>
        {folders.length === 0 ? (
          <p className="px-2.5 text-xs text-ink-faint">No folders yet.</p>
        ) : (
          folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                setFolderId(folder.id);
                setFilter("all");
                setDrawerOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                folderId === folder.id ? "bg-accent-soft text-accent-strong" : "text-ink-soft hover:bg-surface-3 hover:text-ink"
              )}
            >
              <Folder className="size-4" style={{ color: folder.color }} />
              <span className="flex-1 truncate text-left">{folder.name}</span>
              <span className="text-[11px] tabular-nums text-ink-faint">
                {notebooks.filter((n) => !n.trashed && n.folderId === folder.id).length}
              </span>
            </button>
          ))
        )}
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Tags</span>
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-1">
            {tags.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() => setQuery(tag.name)}
                className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft transition-colors hover:bg-surface-3"
              >
                <Tag className="size-3" style={{ color: tag.color }} />
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-2">
        <Button variant="primary" onClick={() => setNewOpen(true)}>
          <Plus /> New notebook
        </Button>
        <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
          <Settings /> Settings
        </Button>
        <p className="px-1 text-center text-[11px] leading-relaxed text-ink-faint">
          Stored offline in your browser. Export anytime.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line bg-surface shadow-pop">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-ink-faint hover:bg-surface-3"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
          <div className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
            <button
              type="button"
              aria-label="Open menu"
              className="rounded-lg p-2 text-ink-soft hover:bg-surface-3 lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notebooks and tags…"
                className="pl-9"
              />
            </div>
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              {filter !== "trash" ? (
                <Select
                  value={sort}
                  onValueChange={(value) => setSort(value as SortKey)}
                  size="sm"
                  className="w-36"
                  ariaLabel="Sort notebooks"
                  options={[
                    { value: "updated", label: "Last updated" },
                    { value: "created", label: "Recently created" },
                    { value: "title", label: "Title A–Z" }
                  ]}
                />
              ) : (
                <Button variant="dangerGhost" size="sm" onClick={() => void emptyTrash()}>
                  <Trash2 /> Empty trash
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
                <FileUp /> Import
              </Button>
              <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                <Plus /> New
              </Button>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:hidden">
              <Button variant="outline" size="sm" aria-label="Import" onClick={() => importInputRef.current?.click()}>
                <FileUp />
              </Button>
              <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
                <Plus />
              </Button>
            </div>
          </div>
          <div className="ks-scroll flex items-center gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:hidden">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFilter(item.id);
                  setFolderId(null);
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === item.id && !folderId ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-soft"
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 px-4 py-6 sm:px-6">
          {importError ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">
              <span>{importError}</span>
              <button type="button" aria-label="Dismiss" className="rounded-md p-1 hover:bg-danger/10" onClick={() => setImportError(null)}>
                <X className="size-4" />
              </button>
            </div>
          ) : null}
          {folderId ? (
            <div className="mb-4 flex items-center gap-2 text-sm text-ink-soft">
              <Folder className="size-4" />
              {folders.find((f) => f.id === folderId)?.name}
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setFolderId(null)}>
                Clear
              </button>
            </div>
          ) : null}

          {!loadedOnce && notebooks.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="aspect-[4/3.4] animate-pulse rounded-2xl border border-line bg-surface-3" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
                <Sparkles className="size-6" />
              </span>
              {query || filter !== "all" || folderId ? (
                <>
                  <h2 className="text-base font-semibold text-ink">Nothing matches here</h2>
                  <p className="max-w-sm text-sm text-ink-soft">Try a different search, filter or folder.</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-ink">Your first notebook awaits</h2>
                  <p className="max-w-md text-sm text-ink-soft">
                    Draw with real pen tools, write formulas, plot graphs and keep every note searchable — all offline.
                  </p>
                  <Button variant="primary" size="lg" onClick={() => setNewOpen(true)}>
                    <Plus /> Create a notebook
                  </Button>
                  <p className="text-xs text-ink-faint">or pick a template inside — meeting notes, study, math, sketch.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((notebook) => (
                <NotebookCard key={notebook.id} notebook={notebook} onOpen={openNotebook} />
              ))}
            </div>
          )}
        </div>
      </main>

      <NewNotebookDialog open={newOpen} onOpenChange={setNewOpen} folderId={folderId} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <input
        ref={importInputRef}
        type="file"
        accept=".zip,.json,.pdf,application/zip,application/json,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />

      <Dialog open={importing}>
        <DialogContent size="sm" hideClose>
          <DialogHeader>
            <DialogTitle>Importing notebook…</DialogTitle>
            <DialogDescription>{importProgress ?? "Reading the file and saving it into this browser."}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex justify-center py-6">
            <span className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-label="Importing" />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
              onKeyDown={(event) => {
                if (event.key === "Enter" && folderName.trim()) {
                  void addFolder(folderName, "#6366f1");
                  setFolderDialog(false);
                }
              }}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!folderName.trim()}
              onClick={() => {
                void addFolder(folderName, "#6366f1");
                setFolderDialog(false);
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
