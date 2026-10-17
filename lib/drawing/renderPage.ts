import type { NotebookPage, SceneObject } from "@/types";
import { createCanvas } from "@/lib/drawing/canvas";
import { renderPageBackground } from "@/lib/drawing/paper";
import { renderObjectsToContext, type RenderAssets } from "@/lib/drawing/objects";

export interface RenderPageOptions {
  scale?: number;
  transparent?: boolean;
  assets: RenderAssets;
  pressureCurve?: number;
  objectIds?: string[];
  background?: boolean;
}

export function renderPageToCanvas(page: Pick<NotebookPage, "width" | "height" | "background" | "layers" | "objects">, options: RenderPageOptions): HTMLCanvasElement {
  const scale = options.scale ?? 1;
  const canvas = createCanvas(page.width * scale, page.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.scale(scale, scale);
  if (options.background !== false) {
    renderPageBackground(ctx, page, options.assets, { transparent: options.transparent });
  }
  const objects = options.objectIds ? page.objects.filter((o: SceneObject) => options.objectIds!.includes(o.id)) : page.objects;
  if (objects.length > 0) {
    renderObjectsToContext(ctx, objects, page.layers, {
      assets: options.assets,
      renderScale: scale,
      pressureCurve: options.pressureCurve ?? 1
    });
  }
  ctx.restore();
  return canvas;
}

export function renderObjectsToCanvas(
  width: number,
  height: number,
  objects: SceneObject[],
  layers: NotebookPage["layers"],
  assets: RenderAssets,
  opts: { scale?: number; pressureCurve?: number } = {}
): HTMLCanvasElement {
  const scale = opts.scale ?? 1;
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.scale(scale, scale);
  renderObjectsToContext(ctx, objects, layers, {
    assets,
    renderScale: scale,
    pressureCurve: opts.pressureCurve ?? 1
  });
  ctx.restore();
  return canvas;
}
