import type { NotebookPage, SceneObject } from "@/types";
import { getAsset } from "@/lib/repo";
import type { RenderAssets } from "@/lib/drawing/objects";
import { createRenderAssets } from "@/lib/drawing/objects";

export function collectPageAssetIds(page: Pick<NotebookPage, "objects" | "background">): { images: string[]; rasters: string[] } {
  const images = new Set<string>();
  const rasters = new Set<string>();
  if (page.background.imageAssetId) images.add(page.background.imageAssetId);
  for (const object of page.objects) {
    if (object.type === "image") images.add(object.assetId);
    if (object.type === "formula" && object.assetId) rasters.add(object.assetId);
  }
  return { images: [...images], rasters: [...rasters] };
}

export function collectObjectAssetIds(objects: SceneObject[]): { images: string[]; rasters: string[] } {
  const images = new Set<string>();
  const rasters = new Set<string>();
  for (const object of objects) {
    if (object.type === "image") images.add(object.assetId);
    if (object.type === "formula" && object.assetId) rasters.add(object.assetId);
  }
  return { images: [...images], rasters: [...rasters] };
}

async function decodeImage(blob: Blob): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image-decode-failed"));
      image.src = url;
    });
    if (typeof image.decode === "function") {
      await image.decode().catch(() => undefined);
    }
    return image;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class AssetManager {
  readonly render: RenderAssets = createRenderAssets();
  private pending = new Map<string, Promise<boolean>>();
  private failed = new Set<string>();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  has(assetId: string): boolean {
    return this.render.images.has(assetId) || this.render.formulas.has(assetId);
  }

  ensureImage(assetId: string): Promise<boolean> {
    if (this.render.images.has(assetId)) return Promise.resolve(true);
    if (this.failed.has(assetId)) return Promise.resolve(false);
    const existing = this.pending.get(assetId);
    if (existing) return existing;
    const task = (async () => {
      const record = await getAsset(assetId);
      if (!record) {
        this.failed.add(assetId);
        this.render.missingAssets.add(assetId);
        this.emit();
        return false;
      }
      const image = await decodeImage(record.blob);
      if (!image) {
        this.failed.add(assetId);
        this.render.missingAssets.add(assetId);
        this.emit();
        return false;
      }
      this.render.images.set(assetId, image);
      this.render.missingAssets.delete(assetId);
      this.emit();
      return true;
    })().finally(() => {
      this.pending.delete(assetId);
    });
    this.pending.set(assetId, task);
    return task;
  }

  ensureRaster(assetId: string): Promise<boolean> {
    if (this.render.formulas.has(assetId)) return Promise.resolve(true);
    if (this.failed.has(assetId)) return Promise.resolve(false);
    const existing = this.pending.get(assetId);
    if (existing) return existing;
    const task = (async () => {
      const record = await getAsset(assetId);
      if (!record) {
        this.failed.add(assetId);
        this.render.missingAssets.add(assetId);
        this.emit();
        return false;
      }
      const image = await decodeImage(record.blob);
      if (!image) {
        this.failed.add(assetId);
        this.render.missingAssets.add(assetId);
        this.emit();
        return false;
      }
      this.render.formulas.set(assetId, image);
      this.render.missingAssets.delete(assetId);
      this.emit();
      return true;
    })().finally(() => {
      this.pending.delete(assetId);
    });
    this.pending.set(assetId, task);
    return task;
  }

  async ensureAll(ids: { images: string[]; rasters: string[] }): Promise<void> {
    await Promise.all([
      ...ids.images.map((id) => this.ensureImage(id)),
      ...ids.rasters.map((id) => this.ensureRaster(id))
    ]);
  }

  async ensureForPage(page: Pick<NotebookPage, "objects" | "background">): Promise<void> {
    await this.ensureAll(collectPageAssetIds(page));
  }

  invalidate(assetId: string) {
    this.failed.delete(assetId);
    this.render.images.delete(assetId);
    this.render.formulas.delete(assetId);
    this.render.missingAssets.delete(assetId);
  }

  dispose() {
    this.listeners.clear();
    this.pending.clear();
    this.render.images.clear();
    this.render.formulas.clear();
    this.render.missingAssets.clear();
    this.failed.clear();
  }
}
