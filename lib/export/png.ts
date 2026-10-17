import type { NotebookPage } from "@/types";
import { canvasToBlob } from "@/lib/drawing/canvas";
import type { RenderAssets } from "@/lib/drawing/objects";
import { renderPageToCanvas } from "@/lib/drawing/renderPage";

export interface RasterExportOptions {
  assets: RenderAssets;
  scale?: number;
  quality?: number;
  transparent?: boolean;
  pressureCurve?: number;
}

const MAX_CANVAS_EDGE = 8192;

export function clampExportScale(width: number, height: number, requested: number): number {
  const edge = Math.max(width, height);
  if (edge <= 0) return requested;
  return Math.max(0.1, Math.min(requested, MAX_CANVAS_EDGE / edge));
}

export async function pageToRasterBlob(
  page: Pick<NotebookPage, "width" | "height" | "background" | "layers" | "objects">,
  options: RasterExportOptions,
  type: "image/png" | "image/jpeg" = "image/png"
): Promise<Blob> {
  const scale = clampExportScale(page.width, page.height, options.scale ?? 2);
  const canvas = renderPageToCanvas(page, {
    assets: options.assets,
    scale,
    transparent: options.transparent,
    pressureCurve: options.pressureCurve
  });
  return canvasToBlob(canvas, type, type === "image/jpeg" ? (options.quality ?? 0.92) : undefined);
}

export async function pagesToRasterBlobs(
  pages: Pick<NotebookPage, "width" | "height" | "background" | "layers" | "objects">[],
  options: RasterExportOptions,
  type: "image/png" | "image/jpeg" = "image/png",
  onProgress?: (done: number, total: number) => void
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    blobs.push(await pageToRasterBlob(pages[i], options, type));
    onProgress?.(i + 1, pages.length);
  }
  return blobs;
}
