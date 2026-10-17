import { create } from "zustand";
import type { Folder, Notebook, TagDef } from "@/types";
import {
  deleteFolder as repoDeleteFolder,
  deleteNotebookForever,
  duplicateNotebook,
  emptyTrash as repoEmptyTrash,
  listFolders,
  listNotebooks,
  listTags,
  putFolder,
  putTag,
  restoreNotebook,
  trashNotebook,
  updateNotebook
} from "@/lib/repo";

export type LibraryFilter = "all" | "favorites" | "recent" | "archived" | "trash";

interface LibraryState {
  notebooks: Notebook[];
  folders: Folder[];
  tags: TagDef[];
  loading: boolean;
  loadedOnce: boolean;
  query: string;
  filter: LibraryFilter;
  folderId: string | null;
  refresh: () => Promise<void>;
  setQuery: (query: string) => void;
  setFilter: (filter: LibraryFilter) => void;
  setFolderId: (folderId: string | null) => void;
  toggleFavorite: (id: string) => Promise<void>;
  toggleArchive: (id: string) => Promise<void>;
  trash: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  deleteForever: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  duplicate: (id: string) => Promise<Notebook | null>;
  rename: (id: string, title: string) => Promise<void>;
  setTags: (id: string, tags: string[]) => Promise<void>;
  moveToFolder: (id: string, folderId: string | null) => Promise<void>;
  addFolder: (name: string, color: string) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  addTag: (name: string, color: string) => Promise<void>;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  notebooks: [],
  folders: [],
  tags: [],
  loading: false,
  loadedOnce: false,
  query: "",
  filter: "all",
  folderId: null,
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [notebooks, folders, tags] = await Promise.all([listNotebooks(), listFolders(), listTags()]);
      set({ notebooks, folders, tags, loadedOnce: true });
    } finally {
      set({ loading: false });
    }
  },
  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
  setFolderId: (folderId) => set({ folderId }),
  toggleFavorite: async (id) => {
    const notebook = get().notebooks.find((n) => n.id === id);
    if (!notebook) return;
    await updateNotebook(id, { favorite: !notebook.favorite });
    await get().refresh();
  },
  toggleArchive: async (id) => {
    const notebook = get().notebooks.find((n) => n.id === id);
    if (!notebook) return;
    await updateNotebook(id, { archived: !notebook.archived });
    await get().refresh();
  },
  trash: async (id) => {
    await trashNotebook(id);
    await get().refresh();
  },
  restore: async (id) => {
    await restoreNotebook(id);
    await get().refresh();
  },
  deleteForever: async (id) => {
    await deleteNotebookForever(id);
    await get().refresh();
  },
  emptyTrash: async () => {
    await repoEmptyTrash();
    await get().refresh();
  },
  duplicate: async (id) => {
    const copy = await duplicateNotebook(id);
    await get().refresh();
    return copy;
  },
  rename: async (id, title) => {
    const clean = title.trim();
    if (!clean) return;
    await updateNotebook(id, { title: clean });
    await get().refresh();
  },
  setTags: async (id, tags) => {
    await updateNotebook(id, { tags });
    await get().refresh();
  },
  moveToFolder: async (id, folderId) => {
    await updateNotebook(id, { folderId });
    await get().refresh();
  },
  addFolder: async (name, color) => {
    const clean = name.trim();
    if (!clean) return;
    await putFolder({ id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, name: clean, color, createdAt: Date.now() });
    await get().refresh();
  },
  removeFolder: async (id) => {
    await repoDeleteFolder(id);
    await get().refresh();
  },
  addTag: async (name, color) => {
    const clean = name.trim().replace(/^#/, "");
    if (!clean) return;
    await putTag({ name: clean, color });
    await get().refresh();
  }
}));

export function selectVisibleNotebooks(state: Pick<LibraryState, "notebooks" | "filter" | "folderId" | "query">): Notebook[] {
  const { notebooks, filter, folderId, query } = state;
  let items = notebooks;
  if (filter === "trash") {
    items = items.filter((n) => n.trashed);
  } else {
    items = items.filter((n) => !n.trashed);
    if (filter === "favorites") items = items.filter((n) => n.favorite);
    if (filter === "archived") items = items.filter((n) => n.archived);
    if (filter === "recent") items = [...items].sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt)).slice(0, 12);
    else items = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  if (folderId) items = items.filter((n) => n.folderId === folderId);
  const q = query.trim().toLowerCase();
  if (q) {
    items = items.filter((n) => n.title.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)));
  }
  return items;
}
