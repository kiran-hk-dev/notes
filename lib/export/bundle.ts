import type { AssetRecord, Notebook, NotebookPage } from "@/types";
import { getNotebook, getPages, listAssets, putAsset, putNotebookWithPages } from "@/lib/repo";
import type { RenderAssets } from "@/lib/drawing/objects";
import { pageToRasterBlob } from "@/lib/export/png";
import { dataURLToBlob, deepClone, now, readFileAsDataURL, sanitizeFilename, uid } from "@/lib/utils";

export interface BundleAsset {
  id: string;
  kind: AssetRecord["kind"];
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: number;
  dataUrl: string;
}

export interface BundleAssetMeta extends Omit<BundleAsset, "dataUrl"> {
  ext: string;
}

export interface NotebookBundle {
  app: "inkspace";
  version: 1;
  exportedAt: number;
  notebook: Notebook;
  pages: NotebookPage[];
  assets: BundleAsset[];
}

interface BundleManifest {
  app: "inkspace";
  version: 1;
  exportedAt: number;
  notebook: Pick<Notebook, "id" | "title" | "cover" | "settings" | "tags" | "createdAt" | "updatedAt">;
  pageCount: number;
  pages: { id: string; index: number; title: string }[];
  assets: BundleAssetMeta[];
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/octet-stream": "bin"
};

function extForAsset(asset: { mimeType: string; name: string }): string {
  const byMime = EXT_BY_MIME[asset.mimeType];
  if (byMime) return byMime;
  const dot = asset.name.lastIndexOf(".");
  if (dot > 0 && dot < asset.name.length - 1) return asset.name.slice(dot + 1).toLowerCase();
  return "bin";
}

export async function buildBundle(notebookId: string, opts: { assets?: boolean } = {}): Promise<NotebookBundle | null> {
  const notebook = await getNotebook(notebookId);
  if (!notebook) return null;
  const pages = await getPages(notebookId);
  const includeAssets = opts.assets !== false;
  const assetRecords = includeAssets ? await listAssets(notebookId) : [];
  const assets: BundleAsset[] = [];
  for (const record of assetRecords) {
    assets.push({
      id: record.id,
      kind: record.kind,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      width: record.width,
      height: record.height,
      createdAt: record.createdAt,
      dataUrl: await readFileAsDataURL(record.blob)
    });
  }
  return {
    app: "inkspace",
    version: 1,
    exportedAt: now(),
    notebook: { ...deepClone(notebook), thumbnail: null },
    pages: pages.map((page) => deepClone(page)),
    assets
  };
}

export function bundleToJsonBlob(bundle: NotebookBundle): Blob {
  return new Blob([JSON.stringify(bundle)], { type: "application/json" });
}

export function bundleToJsonFile(bundle: NotebookBundle): { blob: Blob; filename: string } {
  return {
    blob: bundleToJsonBlob(bundle),
    filename: `${sanitizeFilename(bundle.notebook.title)}.inkspace.json`
  };
}

export async function bundleToZipBlob(
  bundle: NotebookBundle,
  opts: { preview?: RenderAssets; pressureCurve?: number } = {}
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const manifest: BundleManifest = {
    app: "inkspace",
    version: 1,
    exportedAt: bundle.exportedAt,
    notebook: {
      id: bundle.notebook.id,
      title: bundle.notebook.title,
      cover: bundle.notebook.cover,
      settings: bundle.notebook.settings,
      tags: bundle.notebook.tags,
      createdAt: bundle.notebook.createdAt,
      updatedAt: bundle.notebook.updatedAt
    },
    pageCount: bundle.pages.length,
    pages: bundle.pages.map((page) => ({ id: page.id, index: page.index, title: page.title })),
    assets: bundle.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      ext: extForAsset(asset)
    }))
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("notebook.json", JSON.stringify(bundle.notebook, null, 2));
  bundle.pages.forEach((page, index) => {
    zip.file(`pages/page-${String(index).padStart(3, "0")}.json`, JSON.stringify(page));
  });
  for (const asset of bundle.assets) {
    try {
      zip.file(`assets/${asset.id}.${extForAsset(asset)}`, dataURLToBlob(asset.dataUrl));
    } catch {
      continue;
    }
  }
  if (opts.preview && bundle.pages.length > 0) {
    try {
      const first = bundle.pages[0];
      const blob = await pageToRasterBlob(first, {
        assets: opts.preview,
        scale: Math.min(0.5, 480 / Math.max(1, first.width)),
        pressureCurve: opts.pressureCurve
      }, "image/jpeg");
      zip.file("previews/cover.jpg", blob);
    } catch {
      // previews are best-effort
    }
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function exportNotebookZip(
  notebookId: string,
  opts: { preview?: RenderAssets; pressureCurve?: number } = {}
): Promise<{ blob: Blob; filename: string } | null> {
  const bundle = await buildBundle(notebookId);
  if (!bundle) return null;
  const blob = await bundleToZipBlob(bundle, opts);
  return { blob, filename: `${sanitizeFilename(bundle.notebook.title)}.inkspace.zip` };
}

export async function exportNotebookJsonFile(notebookId: string): Promise<{ blob: Blob; filename: string } | null> {
  const bundle = await buildBundle(notebookId);
  if (!bundle) return null;
  return bundleToJsonFile(bundle);
}

export async function bundleFromJson(text: string): Promise<NotebookBundle | null> {
  try {
    const parsed = JSON.parse(text) as NotebookBundle;
    if (parsed.app !== "inkspace" || !parsed.notebook || !Array.isArray(parsed.pages)) return null;
    if (!Array.isArray(parsed.assets)) parsed.assets = [];
    return parsed;
  } catch {
    return null;
  }
}

export async function bundleFromZip(file: Blob): Promise<NotebookBundle | null> {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file("manifest.json");
    const notebookFile = zip.file("notebook.json");
    if (!manifestFile || !notebookFile) return null;
    const manifest = JSON.parse(await manifestFile.async("text")) as BundleManifest;
    if (manifest.app !== "inkspace") return null;
    const notebook = JSON.parse(await notebookFile.async("text")) as Notebook;
    const pages: NotebookPage[] = [];
    const pageFiles = zip.folder("pages")?.filter((name) => name.endsWith(".json")) ?? [];
    if (pageFiles.length > 0) {
      const sorted = [...pageFiles].sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of sorted) {
        pages.push(JSON.parse(await entry.async("text")) as NotebookPage);
      }
    }
    const assets: BundleAsset[] = [];
    for (const meta of manifest.assets ?? []) {
      const entry = zip.file(`assets/${meta.id}.${meta.ext}`) ?? zip.file(new RegExp(`^assets/${meta.id}\\.[a-z0-9]+$`))[0];
      if (!entry) continue;
      const blob = await entry.async("blob");
      assets.push({
        id: meta.id,
        kind: meta.kind,
        name: meta.name,
        mimeType: meta.mimeType,
        size: blob.size,
        width: meta.width,
        height: meta.height,
        createdAt: meta.createdAt,
        dataUrl: await readFileAsDataURL(blob)
      });
    }
    return { app: "inkspace", version: 1, exportedAt: manifest.exportedAt ?? now(), notebook, pages, assets };
  } catch {
    return null;
  }
}

export async function importBundle(bundle: NotebookBundle): Promise<Notebook> {
  const notebookId = uid();
  const timestamp = now();
  const pages: NotebookPage[] = bundle.pages
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((page, index) => ({
      ...deepClone(page),
      id: uid(),
      notebookId,
      index,
      revision: 1,
      createdAt: page.createdAt ?? timestamp,
      updatedAt: timestamp
    }));
  const notebook: Notebook = {
    ...deepClone(bundle.notebook),
    id: notebookId,
    folderId: null,
    tags: bundle.notebook.tags ?? [],
    favorite: false,
    archived: false,
    trashed: false,
    trashedAt: null,
    thumbnail: null,
    pageCount: pages.length,
    revision: 1,
    createdAt: bundle.notebook.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastOpenedAt: null
  };
  for (const asset of bundle.assets) {
    let blob: Blob;
    try {
      blob = dataURLToBlob(asset.dataUrl);
    } catch {
      continue;
    }
    await putAsset({
      id: asset.id,
      notebookId: null,
      kind: asset.kind,
      name: asset.name,
      mimeType: asset.mimeType || blob.type || "application/octet-stream",
      size: blob.size,
      width: asset.width,
      height: asset.height,
      blob,
      createdAt: asset.createdAt ?? timestamp
    });
  }
  await putNotebookWithPages(notebook, pages);
  return notebook;
}

export async function importNotebookFile(file: File): Promise<Notebook | null> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) {
    const bundle = await bundleFromZip(file);
    return bundle ? importBundle(bundle) : null;
  }
  if (name.endsWith(".json")) {
    const bundle = await bundleFromJson(await file.text());
    return bundle ? importBundle(bundle) : null;
  }
  return null;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeSharePayload(bundle: NotebookBundle): Promise<string> {
  const json = JSON.stringify(bundle);
  const bytes = new TextEncoder().encode(json);
  const deflated = await deflateRaw(bytes);
  if (deflated) return `v1.${bytesToBase64Url(deflated)}`;
  return `v1u.${bytesToBase64Url(bytes)}`;
}

export async function decodeSharePayload(encoded: string): Promise<NotebookBundle | null> {
  try {
    if (encoded.startsWith("v1.")) {
      const bytes = base64UrlToBytes(encoded.slice(3));
      const inflated = await inflateRaw(bytes);
      if (!inflated) return null;
      return bundleFromJson(new TextDecoder().decode(inflated));
    }
    if (encoded.startsWith("v1u.")) {
      const bytes = base64UrlToBytes(encoded.slice(4));
      return bundleFromJson(new TextDecoder().decode(bytes));
    }
    return null;
  } catch {
    return null;
  }
}
