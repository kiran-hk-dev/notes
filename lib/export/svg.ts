import type { Layer, NotebookPage, SceneObject, TableObject, TextObject } from "@/types";
import { drawGraph } from "@/lib/graph/render";
import { simplifyPoints } from "@/lib/drawing/geometry";
import { buildShapeGeometry } from "@/lib/drawing/shapeGeometry";
import { cssFont, wrapText, type RenderAssets } from "@/lib/drawing/objects";
import { createCanvas } from "@/lib/drawing/canvas";
import { escapeXml, hexToRgba } from "@/lib/utils";

export interface SvgExportOptions {
  assets: RenderAssets;
  includeBackground?: boolean;
  pressureCurve?: number;
}

const n = (value: number) => Math.round(value * 100) / 100;

function layersOrdered(objects: SceneObject[], layers: Layer[]): { object: SceneObject; opacity: number }[] {
  const layerOrder = new Map(layers.map((layer, index) => [layer.id, index]));
  const layerInfo = new Map(layers.map((layer) => [layer.id, layer]));
  return objects
    .filter((object) => {
      const layer = layerInfo.get(object.layerId);
      return !!layer && layer.visible && !object.hidden;
    })
    .sort((a, b) => {
      const la = layerOrder.get(a.layerId) ?? 0;
      const lb = layerOrder.get(b.layerId) ?? 0;
      if (la !== lb) return la - lb;
      return a.z - b.z;
    })
    .map((object) => ({
      object,
      opacity: object.opacity * (layerInfo.get(object.layerId)?.opacity ?? 1)
    }));
}

function rotationAttr(rect: { x: number; y: number; w: number; h: number }, rotation: number): string {
  if (!rotation) return "";
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return ` transform="rotate(${n((rotation * 180) / Math.PI)} ${n(cx)} ${n(cy)})"`;
}

function pathFromPoints(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length; i += 1) d += ` L ${n(points[i].x)} ${n(points[i].y)}`;
  return d;
}

function svgStroke(object: SceneObject & { type: "stroke" }, opacity: number): string {
  const points = simplifyPoints(object.points, 0.6);
  const d = pathFromPoints(points);
  if (!d) return "";
  const style = object.style;
  const dash = style.dash && style.dash.length > 0 ? ` stroke-dasharray="${style.dash.map(n).join(" ")}"` : "";
  const blend = style.blend === "multiply" ? ' style="mix-blend-mode:multiply"' : "";
  return `<path d="${d}" fill="none" stroke="${escapeXml(style.color)}" stroke-width="${n(style.width)}" stroke-linecap="${style.lineCap}" stroke-linejoin="${style.lineJoin}" opacity="${n(style.opacity * opacity)}"${dash}${blend}/>`;
}

function svgShape(object: SceneObject & { type: "shape" }, opacity: number): string {
  const geometry = buildShapeGeometry(object);
  const style = object.style;
  const rect = {
    x: Math.min(object.x, object.x + object.w),
    y: Math.min(object.y, object.y + object.h),
    w: Math.abs(object.w),
    h: Math.abs(object.h)
  };
  const transform = rotationAttr(rect, object.rotation);
  const strokeAttrs = `fill="none" stroke="${escapeXml(style.stroke)}" stroke-width="${n(style.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round" opacity="${n(opacity)}"`;
  const fillValue = style.fill ? hexToRgba(style.fill, style.fillOpacity) : "none";
  const parts: string[] = [];
  for (const polygon of geometry.polygons) {
    const d = `M ${polygon.map((p) => `${n(p.x)} ${n(p.y)}`).join(" L ")} Z`;
    parts.push(`<path d="${d}" fill="${fillValue}" ${strokeAttrs}/>`);
  }
  for (const polyline of geometry.polylines) {
    const d = `${pathFromPoints(polyline.pts)}${polyline.closed ? " Z" : ""}`;
    parts.push(`<path d="${d}" fill="${polyline.closed ? fillValue : "none"}" ${strokeAttrs}/>`);
  }
  for (const ellipse of geometry.ellipses) {
    parts.push(
      `<ellipse cx="${n(ellipse.cx)}" cy="${n(ellipse.cy)}" rx="${n(Math.abs(ellipse.rx))}" ry="${n(Math.abs(ellipse.ry))}" fill="${fillValue}" ${strokeAttrs}/>`
    );
  }
  if (object.text && object.text.trim()) {
    parts.push(
      `<text x="${n(rect.x + rect.w / 2)}" y="${n(rect.y + rect.h / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="${escapeXml(style.stroke)}">${escapeXml(object.text)}</text>`
    );
  }
  return `<g${transform}>${parts.join("")}</g>`;
}

function wrappedTextLines(object: TextObject): string[] {
  const canvas = createCanvas(8, 8);
  const ctx = canvas.getContext("2d");
  if (!ctx) return object.text.split("\n");
  ctx.font = cssFont(object.style);
  const lines: string[] = [];
  for (const paragraph of object.text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const wrapped = wrapText(ctx, paragraph, Math.max(24, object.w - object.style.padding * 2));
    lines.push(...wrapped);
  }
  return lines;
}

function svgText(object: TextObject, opacity: number): string {
  const style = object.style;
  const rect = {
    x: Math.min(object.x, object.x + object.w),
    y: Math.min(object.y, object.y + object.h),
    w: Math.abs(object.w),
    h: Math.abs(object.h)
  };
  const lines = wrappedTextLines(object);
  const lineHeight = style.fontSize * style.lineHeight;
  const anchor = style.align === "center" ? "middle" : style.align === "right" ? "end" : "start";
  const baseX =
    style.align === "center" ? rect.x + rect.w / 2 : style.align === "right" ? rect.x + rect.w - style.padding : rect.x + style.padding;
  const startY = rect.y + style.padding + style.fontSize * 0.9;
  const tspans = lines
    .map((line, index) => `<tspan x="${n(baseX)}" y="${n(startY + index * lineHeight)}">${escapeXml(line) || " "}</tspan>`)
    .join("");
  const background = style.background
    ? `<rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}" fill="${escapeXml(style.background)}" rx="4"/>`
    : "";
  const decoration = style.underline ? ' text-decoration="underline"' : "";
  return `<g${rotationAttr(rect, object.rotation)} opacity="${n(opacity)}">${background}<text font-family="${escapeXml(style.fontFamily)}" font-size="${n(style.fontSize)}" font-weight="${style.fontWeight}" fill="${escapeXml(style.color)}" text-anchor="${anchor}"${decoration}${style.italic ? ' font-style="italic"' : ""}>${tspans}</text></g>`;
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function rasterToDataUrl(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap): string {
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!width || !height) return "";
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source as CanvasImageSource, 0, 0);
  return canvasToDataUrl(canvas);
}

function svgImage(object: SceneObject & { type: "image" }, opacity: number, assets: RenderAssets): string {
  const image = assets.images.get(object.assetId);
  if (!image) return "";
  const href = rasterToDataUrl(image);
  if (!href) return "";
  const rect = {
    x: Math.min(object.x, object.x + object.w),
    y: Math.min(object.y, object.y + object.h),
    w: Math.abs(object.w),
    h: Math.abs(object.h)
  };
  return `<g${rotationAttr(rect, object.rotation)} opacity="${n(opacity)}"><image href="${href}" x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}" preserveAspectRatio="none"/></g>`;
}

function svgFormula(object: SceneObject & { type: "formula" }, opacity: number, assets: RenderAssets): string {
  const raster = object.assetId ? assets.formulas.get(object.assetId) : undefined;
  const rect = {
    x: Math.min(object.x, object.x + object.w),
    y: Math.min(object.y, object.y + object.h),
    w: Math.abs(object.w),
    h: Math.abs(object.h)
  };
  const background = object.background
    ? `<rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}" fill="${escapeXml(object.background)}"/>`
    : "";
  if (!raster) {
    return `<g${rotationAttr(rect, object.rotation)} opacity="${n(opacity)}">${background}<text x="${n(rect.x + rect.w / 2)}" y="${n(rect.y + rect.h / 2)}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${n(Math.max(10, object.fontSize * 0.55))}" fill="${escapeXml(object.color)}">${escapeXml(object.latex)}</text></g>`;
  }
  const width = raster instanceof HTMLImageElement ? raster.naturalWidth : raster.width;
  const height = raster instanceof HTMLImageElement ? raster.naturalHeight : raster.height;
  const scale = Math.min(rect.w / width, rect.h / height);
  const w = width * scale;
  const h = height * scale;
  const href = rasterToDataUrl(raster);
  return `<g${rotationAttr(rect, object.rotation)} opacity="${n(opacity)}">${background}<image href="${href}" x="${n(rect.x + (rect.w - w) / 2)}" y="${n(rect.y + (rect.h - h) / 2)}" width="${n(w)}" height="${n(h)}"/></g>`;
}

function svgGraph(object: SceneObject & { type: "graph" }, opacity: number): string {
  const rect = {
    x: Math.min(object.x, object.x + object.w),
    y: Math.min(object.y, object.y + object.h),
    w: Math.abs(object.w),
    h: Math.abs(object.h)
  };
  const scale = 2;
  const canvas = createCanvas(Math.max(1, rect.w * scale), Math.max(1, rect.h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  drawGraph(ctx, { ...object, x: 0, y: 0 });
  const href = canvasToDataUrl(canvas);
  return `<g${rotationAttr(rect, object.rotation)} opacity="${n(opacity)}"><image href="${href}" x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}"/></g>`;
}

function svgTable(object: TableObject, opacity: number): string {
  const rect = {
    x: Math.min(object.x, object.x + object.w),
    y: Math.min(object.y, object.y + object.h),
    w: Math.abs(object.w),
    h: Math.abs(object.h)
  };
  const rows = object.rows.length;
  const cols = Math.max(1, ...object.rows.map((row) => row.length));
  const colWidth = rect.w / cols;
  const rowHeight = rows > 0 ? rect.h / rows : rect.h;
  const parts: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = rect.x + c * colWidth;
      const y = rect.y + r * rowHeight;
      if (object.headerRow && r === 0) {
        parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(colWidth)}" height="${n(rowHeight)}" fill="${escapeXml(object.style.headerBg)}"/>`);
      }
      parts.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(colWidth)}" height="${n(rowHeight)}" fill="none" stroke="${escapeXml(object.style.stroke)}" stroke-width="${n(object.style.strokeWidth)}"/>`
      );
      const cell = object.rows[r]?.[c] ?? "";
      if (cell) {
        parts.push(
          `<text x="${n(x + 6)}" y="${n(y + rowHeight / 2)}" dominant-baseline="middle" font-size="${n(object.style.fontSize)}" fill="${escapeXml(object.style.color)}" font-weight="${object.headerRow && r === 0 ? 600 : 400}">${escapeXml(cell)}</text>`
        );
      }
    }
  }
  return `<g${rotationAttr(rect, object.rotation)} opacity="${n(opacity)}">${parts.join("")}</g>`;
}

function backgroundSvg(page: Pick<NotebookPage, "width" | "height" | "background">, assets: RenderAssets): string {
  const { width, height, background } = page;
  const parts: string[] = [`<rect width="${n(width)}" height="${n(height)}" fill="${escapeXml(background.color)}"/>`];
  const spacing = background.spacing;
  const color = background.patternColor;
  const line = `stroke="${escapeXml(color)}" stroke-width="1"`;
  if (background.paper === "college" || background.paper === "wide") {
    for (let y = spacing; y < height; y += spacing) parts.push(`<line x1="0" y1="${n(y)}" x2="${n(width)}" y2="${n(y)}" ${line}/>`);
  } else if (background.paper === "grid") {
    for (let x = spacing; x < width; x += spacing) parts.push(`<line x1="${n(x)}" y1="0" x2="${n(x)}" y2="${n(height)}" ${line}/>`);
    for (let y = spacing; y < height; y += spacing) parts.push(`<line x1="0" y1="${n(y)}" x2="${n(width)}" y2="${n(y)}" ${line}/>`);
  } else if (background.paper === "dots") {
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="1.3" fill="${escapeXml(color)}"/>`);
      }
    }
  } else if (background.paper === "isometric") {
    const step = spacing * Math.sqrt(3);
    for (let x = -height; x < width + height; x += step) {
      parts.push(`<line x1="${n(x)}" y1="${n(height)}" x2="${n(x + height)}" y2="0" ${line}/>`);
      parts.push(`<line x1="${n(x)}" y1="0" x2="${n(x + height)}" y2="${n(height)}" ${line}/>`);
    }
  } else if (background.paper === "music") {
    for (let y = spacing; y < height; y += spacing) {
      for (let staff = 0; staff < 5; staff += 1) {
        const ly = y + (staff * spacing) / 7;
        parts.push(`<line x1="0" y1="${n(ly)}" x2="${n(width)}" y2="${n(ly)}" ${line}/>`);
      }
    }
  }
  if (background.paper === "custom-image" && background.imageAssetId) {
    const image = assets.images.get(background.imageAssetId);
    if (image) {
      const href = rasterToDataUrl(image);
      if (href) {
        parts.push(
          `<image href="${href}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="xMidYMid slice" opacity="${n(background.imageOpacity)}"/>`
        );
      }
    }
  }
  return parts.join("");
}

export function pageToSvg(page: Pick<NotebookPage, "width" | "height" | "background" | "layers" | "objects">, options: SvgExportOptions): string {
  const parts: string[] = [];
  if (options.includeBackground !== false) parts.push(backgroundSvg(page, options.assets));
  for (const { object, opacity } of layersOrdered(page.objects, page.layers)) {
    switch (object.type) {
      case "stroke":
        parts.push(svgStroke(object, opacity));
        break;
      case "shape":
        parts.push(svgShape(object, opacity));
        break;
      case "text":
        parts.push(svgText(object, opacity));
        break;
      case "image":
        parts.push(svgImage(object, opacity, options.assets));
        break;
      case "formula":
        parts.push(svgFormula(object, opacity, options.assets));
        break;
      case "graph":
        parts.push(svgGraph(object, opacity));
        break;
      case "table":
        parts.push(svgTable(object, opacity));
        break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(page.width)}" height="${n(page.height)}" viewBox="0 0 ${n(page.width)} ${n(page.height)}">${parts.join("")}</svg>`;
}
