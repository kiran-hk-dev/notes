import { getDB, getMeta, setMeta } from "@/lib/db";
import { uid, now, deepClone } from "@/lib/utils";
import {
  defaultBackground,
  defaultCover,
  defaultLayers,
  defaultNotebookSettings,
  resolvePageSize
} from "@/lib/defaults";
import type {
  AssetRecord,
  CalcHistoryEntry,
  Folder,
  Notebook,
  NotebookPage,
  NotebookRevisionSnapshot,
  PageBackground,
  RevisionRecord,
  SceneObject,
  TagDef
} from "@/types";

const MAX_AUTO_REVISIONS = 20;

export interface CreateNotebookInput {
  title?: string;
  folderId?: string | null;
  tags?: string[];
  cover?: Notebook["cover"];
  settings?: Partial<Notebook["settings"]>;
  pageCount?: number;
  label?: string;
}

function pageTextDigest(page: NotebookPage): string {
  const parts: string[] = [page.title, `page ${page.index + 1}`];
  for (const object of page.objects) {
    if (object.type === "text") parts.push(object.text);
    else if (object.type === "formula") parts.push(object.latex);
    else if (object.type === "shape" && object.text) parts.push(object.text);
    else if (object.type === "table") {
      for (const row of object.rows) parts.push(row.join(" | "));
    } else if (object.type === "graph") {
      for (const fn of object.functions) parts.push(fn.expression);
    }
  }
  return parts.join("\n").toLowerCase();
}

async function writeSearchDigest(page: NotebookPage) {
  const db = await getDB();
  await db.put("searchIndex", {
    pageId: page.id,
    notebookId: page.notebookId,
    text: pageTextDigest(page),
    updatedAt: now()
  });
}

export async function listNotebooks(opts: { trashed?: boolean; archived?: boolean } = {}): Promise<Notebook[]> {
  const db = await getDB();
  const all = await db.getAll("notebooks");
  return all
    .filter((nb) => (opts.trashed ? nb.trashed : !nb.trashed))
    .filter((nb) => (opts.archived === undefined ? true : nb.archived === opts.archived))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getNotebook(id: string): Promise<Notebook | null> {
  const db = await getDB();
  return (await db.get("notebooks", id)) ?? null;
}

export async function getPages(notebookId: string): Promise<NotebookPage[]> {
  const db = await getDB();
  const pages = await db.getAllFromIndex("pages", "by-notebook", notebookId);
  return pages.sort((a, b) => a.index - b.index);
}

export async function getPage(id: string): Promise<NotebookPage | null> {
  const db = await getDB();
  return (await db.get("pages", id)) ?? null;
}

export function createPageRecord(
  notebookId: string,
  index: number,
  settings: Pick<Notebook["settings"], "pageSize" | "customWidth" | "customHeight" | "orientation" | "defaultBackground">
): NotebookPage {
  const size = resolvePageSize(settings);
  const width = settings.orientation === "portrait" ? size.width : size.height;
  const height = settings.orientation === "portrait" ? size.height : size.width;
  const t = now();
  return {
    id: uid(),
    notebookId,
    index,
    title: "",
    width,
    height,
    background: deepClone(settings.defaultBackground),
    layers: defaultLayers(),
    objects: [],
    revision: 1,
    createdAt: t,
    updatedAt: t
  };
}

export async function createNotebook(input: CreateNotebookInput = {}): Promise<{ notebook: Notebook; pages: NotebookPage[] }> {
  const db = await getDB();
  const settings = { ...defaultNotebookSettings(), ...(input.settings ?? {}) };
  const t = now();
  const notebook: Notebook = {
    id: uid(),
    title: input.title?.trim() || "Untitled notebook",
    cover: input.cover ?? defaultCover(),
    folderId: input.folderId ?? null,
    tags: input.tags ?? [],
    favorite: false,
    archived: false,
    trashed: false,
    trashedAt: null,
    settings,
    thumbnail: null,
    pageCount: 0,
    revision: 1,
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: null
  };
  const pageTotal = Math.max(1, input.pageCount ?? 1);
  const pages: NotebookPage[] = [];
  for (let i = 0; i < pageTotal; i += 1) {
    pages.push(createPageRecord(notebook.id, i, settings));
  }
  notebook.pageCount = pages.length;
  const tx = db.transaction(["notebooks", "pages"], "readwrite");
  await tx.objectStore("notebooks").put(notebook);
  for (const page of pages) await tx.objectStore("pages").put(page);
  await tx.done;
  for (const page of pages) await writeSearchDigest(page);
  return { notebook, pages };
}

export async function putNotebookWithPages(notebook: Notebook, pages: NotebookPage[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["notebooks", "pages"], "readwrite");
  await tx.objectStore("notebooks").put(notebook);
  for (const page of pages) await tx.objectStore("pages").put(page);
  await tx.done;
  for (const page of pages) await writeSearchDigest(page);
}

export async function updateNotebook(id: string, patch: Partial<Notebook>): Promise<Notebook | null> {
  const db = await getDB();
  const nb = await db.get("notebooks", id);
  if (!nb) return null;
  const next: Notebook = {
    ...nb,
    ...patch,
    id: nb.id,
    revision: nb.revision + 1,
    updatedAt: now()
  };
  await db.put("notebooks", next);
  return next;
}

export async function touchNotebook(id: string, { opened }: { opened?: boolean } = {}): Promise<void> {
  const db = await getDB();
  const nb = await db.get("notebooks", id);
  if (!nb) return;
  nb.updatedAt = now();
  if (opened) nb.lastOpenedAt = now();
  await db.put("notebooks", nb);
}

export async function setNotebookThumbnail(id: string, thumbnail: string): Promise<void> {
  const db = await getDB();
  const nb = await db.get("notebooks", id);
  if (!nb) return;
  nb.thumbnail = thumbnail;
  await db.put("notebooks", nb);
}

export async function trashNotebook(id: string): Promise<void> {
  const db = await getDB();
  const nb = await db.get("notebooks", id);
  if (!nb) return;
  nb.trashed = true;
  nb.trashedAt = now();
  nb.updatedAt = now();
  await db.put("notebooks", nb);
}

export async function restoreNotebook(id: string): Promise<void> {
  const db = await getDB();
  const nb = await db.get("notebooks", id);
  if (!nb) return;
  nb.trashed = false;
  nb.trashedAt = null;
  nb.updatedAt = now();
  await db.put("notebooks", nb);
}

export async function deleteNotebookForever(id: string): Promise<void> {
  const db = await getDB();
  const pages = await db.getAllFromIndex("pages", "by-notebook", id);
  const assets = await db.getAllFromIndex("assets", "by-notebook", id);
  const revisions = await db.getAllFromIndex("revisions", "by-notebook", id);
  const searchEntries = await db.getAllFromIndex("searchIndex", "by-notebook", id);
  const tx = db.transaction(["notebooks", "pages", "assets", "revisions", "searchIndex"], "readwrite");
  await tx.objectStore("notebooks").delete(id);
  for (const p of pages) await tx.objectStore("pages").delete(p.id);
  for (const a of assets) await tx.objectStore("assets").delete(a.id);
  for (const r of revisions) await tx.objectStore("revisions").delete(r.id);
  for (const s of searchEntries) await tx.objectStore("searchIndex").delete(s.pageId);
  await tx.done;
}

export async function emptyTrash(): Promise<string[]> {
  const db = await getDB();
  const trashed = (await db.getAll("notebooks")).filter((nb) => nb.trashed);
  for (const nb of trashed) await deleteNotebookForever(nb.id);
  return trashed.map((nb) => nb.id);
}

export async function cleanupTrashOlderThan(days: number): Promise<number> {
  const db = await getDB();
  const cutoff = now() - days * 86400000;
  const trashed = (await db.getAll("notebooks")).filter((nb) => nb.trashed && (nb.trashedAt ?? 0) < cutoff);
  for (const nb of trashed) await deleteNotebookForever(nb.id);
  return trashed.length;
}

function remapObjectsAssets(objects: SceneObject[], assetMap: Map<string, string>): SceneObject[] {
  return objects.map((object) => {
    const copy = deepClone(object);
    if (copy.type === "image" && copy.assetId) {
      copy.assetId = assetMap.get(copy.assetId) ?? copy.assetId;
    } else if (copy.type === "formula" && copy.assetId) {
      copy.assetId = assetMap.get(copy.assetId) ?? copy.assetId;
    }
    return copy;
  });
}

export async function duplicateNotebook(
  id: string,
  opts: { title?: string; folderId?: string | null; isTemplate?: boolean } = {}
): Promise<Notebook | null> {
  const db = await getDB();
  const source = await db.get("notebooks", id);
  if (!source) return null;
  const pages = await getPages(id);
  const assets = await db.getAllFromIndex("assets", "by-notebook", id);
  const t = now();

  const assetMap = new Map<string, string>();
  const newAssets: AssetRecord[] = assets.map((asset) => {
    const newId = uid();
    assetMap.set(asset.id, newId);
    return { ...asset, id: newId, createdAt: t };
  });

  const notebook: Notebook = {
    ...deepClone(source),
    id: uid(),
    title: opts.title ?? (opts.isTemplate ? `${source.title} template` : `${source.title} copy`),
    folderId: opts.folderId !== undefined ? opts.folderId : source.folderId,
    favorite: false,
    trashed: false,
    trashedAt: null,
    thumbnail: source.thumbnail,
    revision: 1,
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: null,
    cover: deepClone(source.cover)
  };
  if (notebook.cover.assetId) {
    notebook.cover.assetId = assetMap.get(notebook.cover.assetId) ?? notebook.cover.assetId;
  }

  const newPages: NotebookPage[] = pages.map((page) => {
    const layerMap = new Map<string, string>();
    const layers = page.layers.map((layer) => {
      const newId = uid();
      layerMap.set(layer.id, newId);
      return { ...layer, id: newId };
    });
    const objects = remapObjectsAssets(page.objects, assetMap).map((o) => ({
      ...o,
      layerId: layerMap.get(o.layerId) ?? layers[0].id
    }));
    const background: PageBackground = {
      ...deepClone(page.background),
      imageAssetId: page.background.imageAssetId
        ? assetMap.get(page.background.imageAssetId) ?? page.background.imageAssetId
        : null
    };
    return {
      ...deepClone(page),
      id: uid(),
      notebookId: notebook.id,
      layers,
      objects,
      background,
      revision: 1,
      createdAt: t,
      updatedAt: t
    };
  });

  const tx = db.transaction(["notebooks", "pages", "assets"], "readwrite");
  await tx.objectStore("notebooks").put(notebook);
  for (const page of newPages) await tx.objectStore("pages").put(page);
  for (const asset of newAssets) await tx.objectStore("assets").put({ ...asset, notebookId: notebook.id });
  await tx.done;
  for (const page of newPages) await writeSearchDigest(page);
  return notebook;
}

export async function savePage(
  page: NotebookPage,
  expectedRevision?: number
): Promise<{ ok: true; stored: NotebookPage } | { ok: false; conflict: true; stored: NotebookPage }> {
  const db = await getDB();
  const stored = await db.get("pages", page.id);
  if (stored && expectedRevision !== undefined && stored.revision > expectedRevision) {
    return { ok: false, conflict: true, stored };
  }
  const next: NotebookPage = {
    ...page,
    revision: (stored?.revision ?? page.revision) + 1,
    updatedAt: now()
  };
  const tx = db.transaction(["pages", "notebooks"], "readwrite");
  await tx.objectStore("pages").put(next);
  const nb = await tx.objectStore("notebooks").get(page.notebookId);
  if (nb) {
    nb.updatedAt = now();
    const pageCount = (await db.getAllFromIndex("pages", "by-notebook", page.notebookId)).length;
    nb.pageCount = pageCount;
    await tx.objectStore("notebooks").put(nb);
  }
  await tx.done;
  await writeSearchDigest(next);
  return { ok: true, stored: next };
}

export async function createPage(
  notebookId: string,
  opts: { index?: number; background?: PageBackground; title?: string; width?: number; height?: number; objects?: SceneObject[]; layers?: NotebookPage["layers"] } = {}
): Promise<NotebookPage | null> {
  const db = await getDB();
  const nb = await db.get("notebooks", notebookId);
  if (!nb) return null;
  const pages = await getPages(notebookId);
  const index = opts.index ?? pages.length;
  const record = createPageRecord(notebookId, index, nb.settings);
  if (opts.background) record.background = deepClone(opts.background);
  if (opts.title) record.title = opts.title;
  if (opts.width && opts.height) {
    record.width = opts.width;
    record.height = opts.height;
  }
  if (opts.layers) record.layers = opts.layers;
  if (opts.objects) record.objects = opts.objects;

  const tx = db.transaction(["pages", "notebooks"], "readwrite");
  for (const page of pages) {
    if (page.index >= index) {
      page.index += 1;
      await tx.objectStore("pages").put(page);
    }
  }
  await tx.objectStore("pages").put(record);
  nb.pageCount = pages.length + 1;
  nb.updatedAt = now();
  await tx.objectStore("notebooks").put(nb);
  await tx.done;
  await writeSearchDigest(record);
  return record;
}

export async function deletePage(pageId: string): Promise<void> {
  const db = await getDB();
  const page = await db.get("pages", pageId);
  if (!page) return;
  const pages = await getPages(page.notebookId);
  if (pages.length <= 1) return;
  const tx = db.transaction(["pages", "notebooks", "searchIndex"], "readwrite");
  await tx.objectStore("pages").delete(pageId);
  await tx.objectStore("searchIndex").delete(pageId);
  let i = 0;
  for (const p of pages) {
    if (p.id === pageId) continue;
    p.index = i;
    i += 1;
    await tx.objectStore("pages").put(p);
  }
  const nb = await tx.objectStore("notebooks").get(page.notebookId);
  if (nb) {
    nb.pageCount = i;
    nb.updatedAt = now();
    await tx.objectStore("notebooks").put(nb);
  }
  await tx.done;
}

export async function duplicatePage(pageId: string): Promise<NotebookPage | null> {
  const db = await getDB();
  const page = await db.get("pages", pageId);
  if (!page) return null;
  const t = now();
  const layerMap = new Map<string, string>();
  const layers = page.layers.map((layer) => {
    const newId = uid();
    layerMap.set(layer.id, newId);
    return { ...layer, id: newId };
  });
  const objects = page.objects.map((object) => {
    const copy = deepClone(object);
    copy.id = uid();
    copy.layerId = layerMap.get(copy.layerId) ?? layers[0].id;
    copy.createdAt = t;
    copy.updatedAt = t;
    if (copy.groupId) copy.groupId = uid();
    return copy;
  });
  const copy: NotebookPage = {
    ...deepClone(page),
    id: uid(),
    index: page.index + 1,
    layers,
    objects,
    revision: 1,
    createdAt: t,
    updatedAt: t
  };
  const pages = await getPages(page.notebookId);
  const tx = db.transaction(["pages", "notebooks"], "readwrite");
  for (const p of pages) {
    if (p.index >= copy.index) {
      p.index += 1;
      await tx.objectStore("pages").put(p);
    }
  }
  await tx.objectStore("pages").put(copy);
  const nb = await tx.objectStore("notebooks").get(page.notebookId);
  if (nb) {
    nb.pageCount = pages.length + 1;
    nb.updatedAt = now();
    await tx.objectStore("notebooks").put(nb);
  }
  await tx.done;
  await writeSearchDigest(copy);
  return copy;
}

export async function reorderPages(notebookId: string, orderedIds: string[]): Promise<void> {
  const db = await getDB();
  const pages = await getPages(notebookId);
  const map = new Map(pages.map((p) => [p.id, p]));
  const tx = db.transaction("pages", "readwrite");
  orderedIds.forEach((id, index) => {
    const page = map.get(id);
    if (page) {
      page.index = index;
      tx.objectStore("pages").put(page);
    }
  });
  await tx.done;
}

export async function updatePageProps(
  pageId: string,
  patch: Partial<Pick<NotebookPage, "title" | "background" | "width" | "height" | "layers">>
): Promise<NotebookPage | null> {
  const db = await getDB();
  const page = await db.get("pages", pageId);
  if (!page) return null;
  const next: NotebookPage = { ...page, ...patch, revision: page.revision + 1, updatedAt: now() };
  await db.put("pages", next);
  await writeSearchDigest(next);
  return next;
}

export async function putAsset(asset: AssetRecord): Promise<void> {
  const db = await getDB();
  await db.put("assets", asset);
}

export async function getAsset(id: string): Promise<AssetRecord | null> {
  const db = await getDB();
  return (await db.get("assets", id)) ?? null;
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("assets", id);
}

export async function listAssets(notebookId: string): Promise<AssetRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("assets", "by-notebook", notebookId);
}

export async function collectUsedAssetIds(notebookId: string): Promise<Set<string>> {
  const pages = await getPages(notebookId);
  const used = new Set<string>();
  const nb = await getNotebook(notebookId);
  if (nb?.cover.assetId) used.add(nb.cover.assetId);
  for (const page of pages) {
    if (page.background.imageAssetId) used.add(page.background.imageAssetId);
    for (const object of page.objects) {
      if ((object.type === "image" || object.type === "formula") && object.assetId) used.add(object.assetId);
    }
  }
  return used;
}

export async function gcAssets(notebookId: string): Promise<number> {
  const db = await getDB();
  const used = await collectUsedAssetIds(notebookId);
  const assets = await db.getAllFromIndex("assets", "by-notebook", notebookId);
  let removed = 0;
  for (const asset of assets) {
    if (!used.has(asset.id)) {
      await db.delete("assets", asset.id);
      removed += 1;
    }
  }
  return removed;
}

export async function snapshotNotebook(notebookId: string): Promise<NotebookRevisionSnapshot | null> {
  const notebook = await getNotebook(notebookId);
  if (!notebook) return null;
  const pages = await getPages(notebookId);
  return { notebook: deepClone(notebook), pages: deepClone(pages) };
}

export async function createRevision(
  notebookId: string,
  opts: { label?: string; kind?: RevisionRecord["kind"]; pageId?: string | null } = {}
): Promise<RevisionRecord | null> {
  const db = await getDB();
  const snapshot = await snapshotNotebook(notebookId);
  if (!snapshot) return null;
  const record: RevisionRecord = {
    id: uid(),
    notebookId,
    pageId: opts.pageId ?? null,
    label: opts.label ?? "Autosave snapshot",
    kind: opts.kind ?? "auto",
    snapshot,
    createdAt: now()
  };
  await db.put("revisions", record);
  const all = (await db.getAllFromIndex("revisions", "by-notebook", notebookId)).sort((a, b) => b.createdAt - a.createdAt);
  const autos = all.filter((r) => r.kind === "auto");
  for (const stale of autos.slice(MAX_AUTO_REVISIONS)) {
    await db.delete("revisions", stale.id);
  }
  return record;
}

export async function listRevisions(notebookId: string): Promise<RevisionRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("revisions", "by-notebook", notebookId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function restoreRevision(revisionId: string): Promise<Notebook | null> {
  const db = await getDB();
  const revision = await db.get("revisions", revisionId);
  if (!revision) return null;
  await createRevision(revision.notebookId, { kind: "auto", label: "Before restore" });
  const snapshot = revision.snapshot;
  const tx = db.transaction(["notebooks", "pages", "searchIndex"], "readwrite");
  const existingPages = await db.getAllFromIndex("pages", "by-notebook", revision.notebookId);
  for (const p of existingPages) await tx.objectStore("pages").delete(p.id);
  const notebook: Notebook = {
    ...deepClone(snapshot.notebook),
    revision: revision.snapshot.notebook.revision + 1,
    updatedAt: now()
  };
  await tx.objectStore("notebooks").put(notebook);
  for (const page of snapshot.pages) {
    await tx.objectStore("pages").put(deepClone(page));
  }
  await tx.done;
  for (const page of snapshot.pages) await writeSearchDigest(page);
  await createRevision(revision.notebookId, { kind: "restore", label: `Restored "${revision.label}"` });
  return notebook;
}

export async function addCalcHistory(entry: CalcHistoryEntry): Promise<void> {
  const db = await getDB();
  await db.put("calcHistory", entry);
  const all = (await db.getAllFromIndex("calcHistory", "by-created")).sort((a, b) => b.createdAt - a.createdAt);
  for (const stale of all.slice(500)) {
    await db.delete("calcHistory", stale.id);
  }
}

export async function listCalcHistory(notebookId?: string): Promise<CalcHistoryEntry[]> {
  const db = await getDB();
  const all = notebookId
    ? await db.getAllFromIndex("calcHistory", "by-notebook", notebookId)
    : await db.getAll("calcHistory");
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCalcHistoryEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("calcHistory", id);
}

export async function clearCalcHistory(): Promise<void> {
  const db = await getDB();
  await db.clear("calcHistory");
}

export async function toggleCalcFavorite(id: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get("calcHistory", id);
  if (!entry) return;
  entry.favorite = !entry.favorite;
  await db.put("calcHistory", entry);
}

export async function listFolders(): Promise<Folder[]> {
  const db = await getDB();
  const all = await db.getAll("folders");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function putFolder(folder: Folder): Promise<void> {
  const db = await getDB();
  await db.put("folders", folder);
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("folders", id);
  const txs = await db.getAll("notebooks");
  const tx = db.transaction("notebooks", "readwrite");
  for (const nb of txs) {
    if (nb.folderId === id) {
      nb.folderId = null;
      await tx.objectStore("notebooks").put(nb);
    }
  }
  await tx.done;
}

export async function listTags(): Promise<TagDef[]> {
  const db = await getDB();
  const all = await db.getAll("tags");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function putTag(tag: TagDef): Promise<void> {
  const db = await getDB();
  await db.put("tags", tag);
}

export async function deleteTag(name: string): Promise<void> {
  const db = await getDB();
  await db.delete("tags", name);
  const notebooks = await db.getAll("notebooks");
  const tx = db.transaction("notebooks", "readwrite");
  for (const nb of notebooks) {
    if (nb.tags.includes(name)) {
      nb.tags = nb.tags.filter((t) => t !== name);
      await tx.objectStore("notebooks").put(nb);
    }
  }
  await tx.done;
}

export interface SearchMatch {
  notebook: Notebook;
  pageMatches: { pageId: string; pageTitle: string; pageIndex: number; snippet: string }[];
}

export async function searchNotebooks(query: string, opts: { includeTrashed?: boolean } = {}): Promise<SearchMatch[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const db = await getDB();
  const notebooks = (await db.getAll("notebooks")).filter((nb) => opts.includeTrashed || !nb.trashed);
  const results: SearchMatch[] = [];
  const indexEntries = await db.getAll("searchIndex");
  const indexByNotebook = new Map<string, typeof indexEntries>();
  for (const entry of indexEntries) {
    const list = indexByNotebook.get(entry.notebookId) ?? [];
    list.push(entry);
    indexByNotebook.set(entry.notebookId, list);
  }
  for (const notebook of notebooks) {
    const pageMatches: SearchMatch["pageMatches"] = [];
    const titleHit = notebook.title.toLowerCase().includes(q);
    const tagHit = notebook.tags.some((t) => t.toLowerCase().includes(q));
    const entries = indexByNotebook.get(notebook.id) ?? [];
    if (entries.length > 0) {
      const pages = await getPages(notebook.id);
      const pageById = new Map(pages.map((p) => [p.id, p]));
      for (const entry of entries) {
        const idx = entry.text.indexOf(q);
        if (idx >= 0) {
          const snippet = entry.text
            .slice(Math.max(0, idx - 60), Math.min(entry.text.length, idx + q.length + 60))
            .replace(/\s+/g, " ")
            .trim();
          const page = pageById.get(entry.pageId);
          pageMatches.push({
            pageId: entry.pageId,
            pageTitle: page?.title || `Page ${(page?.index ?? 0) + 1}`,
            pageIndex: page?.index ?? 0,
            snippet
          });
        }
        if (pageMatches.length >= 8) break;
      }
    }
    if (titleHit || tagHit || pageMatches.length > 0) {
      results.push({ notebook, pageMatches });
    }
  }
  return results.sort((a, b) => b.notebook.updatedAt - a.notebook.updatedAt);
}

export async function getStorageStats(): Promise<{ notebooks: number; pages: number; assets: number; assetBytes: number; trashed: number }> {
  const db = await getDB();
  const notebooks = await db.getAll("notebooks");
  const pages = await db.getAll("pages");
  const assets = await db.getAll("assets");
  return {
    notebooks: notebooks.filter((nb) => !nb.trashed).length,
    pages: pages.length,
    assets: assets.length,
    assetBytes: assets.reduce((sum, a) => sum + a.size, 0),
    trashed: notebooks.filter((nb) => nb.trashed).length
  };
}

const FIRST_RUN_KEY = "inkspace.initialized";

export async function ensureSeedData(): Promise<void> {
  const done = await getMeta<boolean>(FIRST_RUN_KEY);
  if (done) return;
  await setMeta(FIRST_RUN_KEY, true);
}
