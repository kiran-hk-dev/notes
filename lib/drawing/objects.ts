import type { Layer, Point, SceneObject, ShapeObject, StrokeObject, TableObject, TextObject, TextStyle } from "@/types";
import { hexToRgba, clamp } from "@/lib/utils";
import { renderStroke } from "@/lib/drawing/pen";
import { buildShapeGeometry } from "@/lib/drawing/shapeGeometry";
import { drawGraph } from "@/lib/graph/render";
import { roundRectPath } from "@/lib/drawing/canvas";
import { objectAABB } from "@/lib/drawing/hit";
import { rectsIntersect } from "@/lib/drawing/geometry";
import type { Rect } from "@/types";

export interface RenderAssets {
  images: Map<string, HTMLImageElement | HTMLCanvasElement | ImageBitmap>;
  formulas: Map<string, HTMLCanvasElement | HTMLImageElement>;
  missingAssets: Set<string>;
}

export function createRenderAssets(): RenderAssets {
  return { images: new Map(), formulas: new Map(), missingAssets: new Set() };
}

export interface ObjectRenderOptions {
  assets: RenderAssets;
  renderScale: number;
  pressureCurve: number;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let line = "";
    for (const word of words) {
      const candidate = line + word;
      if (ctx.measureText(candidate).width > maxWidth && line.trim() !== "") {
        lines.push(line.replace(/\s+$/, ""));
        line = word.replace(/^\s+/, "");
      } else {
        line = candidate;
      }
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines;
}

export function cssFont(style: Pick<TextStyle, "fontFamily" | "fontSize" | "fontWeight" | "italic">) {
  return `${style.italic ? "italic " : ""}${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

export function measureTextObject(text: string, style: TextStyle, maxWidth: number): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return style.fontSize * 2;
  ctx.font = cssFont(style);
  const lines = wrapText(ctx, text || " ", Math.max(20, maxWidth - style.padding * 2));
  return Math.max(style.fontSize * 1.4, lines.length * style.fontSize * style.lineHeight + style.padding * 2);
}

function applyRotation(ctx: CanvasRenderingContext2D, rect: Rect, rotation: number) {
  if (!rotation) return;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.translate(-cx, -cy);
}

function renderTextObject(ctx: CanvasRenderingContext2D, object: TextObject) {
  const rect = { x: object.x, y: object.y, w: object.w, h: object.h };
  ctx.save();
  applyRotation(ctx, rect, object.rotation);
  if (object.style.background) {
    ctx.fillStyle = object.style.background;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.font = cssFont(object.style);
  ctx.fillStyle = object.style.color;
  ctx.textBaseline = "top";
  ctx.textAlign = object.style.align === "left" ? "left" : object.style.align === "center" ? "center" : "right";
  const maxWidth = rect.w - object.style.padding * 2;
  const lines = wrapText(ctx, object.text, maxWidth);
  const lineHeight = object.style.fontSize * object.style.lineHeight;
  const alignX =
    object.style.align === "left" ? rect.x + object.style.padding : object.style.align === "center" ? rect.x + rect.w / 2 : rect.x + rect.w - object.style.padding;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  lines.forEach((line, i) => {
    const y = rect.y + object.style.padding + i * lineHeight;
    ctx.fillText(line, alignX, y);
    if (object.style.underline && line.trim()) {
      const width = ctx.measureText(line).width;
      const startX = object.style.align === "left" ? alignX : object.style.align === "center" ? alignX - width / 2 : alignX - width;
      ctx.fillRect(startX, y + object.style.fontSize * 1.06, width, Math.max(1, object.style.fontSize * 0.06));
    }
  });
  ctx.restore();
  ctx.restore();
}

function renderShapeObject(ctx: CanvasRenderingContext2D, object: ShapeObject) {
  const rect = { x: Math.min(object.x, object.x + object.w), y: Math.min(object.y, object.y + object.h), w: Math.abs(object.w), h: Math.abs(object.h) };
  if (rect.w === 0 && rect.h === 0) return;
  ctx.save();
  applyRotation(ctx, rect, object.rotation);
  const style = object.style;
  ctx.fillStyle = style.fill ? hexToRgba(style.fill, style.fillOpacity) : "transparent";
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = Math.max(0.4, style.strokeWidth);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(style.dash ?? []);

  if (object.shape === "rect-rounded") {
    ctx.beginPath();
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(16, Math.min(rect.w, rect.h) * 0.18));
    if (style.fill) ctx.fill();
    ctx.stroke();
  } else if (object.shape === "terminator") {
    ctx.beginPath();
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(rect.w, rect.h) / 2);
    if (style.fill) ctx.fill();
    ctx.stroke();
  } else {
    const geometry = buildShapeGeometry(object);
    for (const ellipse of geometry.ellipses) {
      ctx.beginPath();
      ctx.ellipse(ellipse.cx, ellipse.cy, Math.max(0.5, ellipse.rx), Math.max(0.5, ellipse.ry), 0, 0, Math.PI * 2);
      if (style.fill) ctx.fill();
      ctx.stroke();
    }
    for (const polygon of geometry.polygons) {
      if (polygon.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i].x, polygon[i].y);
      ctx.closePath();
      if (style.fill) ctx.fill();
      ctx.stroke();
    }
    const arrowLike = ["arrow", "arrow-both", "dimension", "axes", "connector"];
    if (arrowLike.includes(object.shape)) {
      ctx.setLineDash([]);
      ctx.fillStyle = style.stroke;
      for (const polygon of geometry.polygons) {
        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i].x, polygon[i].y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.setLineDash(style.dash ?? []);
    for (const line of geometry.polylines) {
      if (line.pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(line.pts[0].x, line.pts[0].y);
      if (line.smooth) {
        for (let i = 1; i < line.pts.length - 1; i += 1) {
          const mid = { x: (line.pts[i].x + line.pts[i + 1].x) / 2, y: (line.pts[i].y + line.pts[i + 1].y) / 2 };
          ctx.quadraticCurveTo(line.pts[i].x, line.pts[i].y, mid.x, mid.y);
        }
        ctx.lineTo(line.pts[line.pts.length - 1].x, line.pts[line.pts.length - 1].y);
      } else {
        for (let i = 1; i < line.pts.length; i += 1) ctx.lineTo(line.pts[i].x, line.pts[i].y);
      }
      if (line.closed) ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  if (object.text) {
    ctx.font = `${Math.min(18, Math.max(11, rect.h / 6))}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = style.stroke;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, object.text, rect.w - 16);
    const lineHeight = Math.min(18, Math.max(11, rect.h / 6)) * 1.25;
    const startY = rect.y + rect.h / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, rect.x + rect.w / 2, startY + i * lineHeight));
  }
  ctx.restore();
}

function renderImageObject(ctx: CanvasRenderingContext2D, object: SceneObject & { type: "image" }, options: ObjectRenderOptions) {
  const rect = { x: object.x, y: object.y, w: object.w, h: object.h };
  const image = options.assets.images.get(object.assetId);
  ctx.save();
  applyRotation(ctx, rect, object.rotation);
  if (!image) {
    if (!options.assets.missingAssets.has(object.assetId)) options.assets.missingAssets.add(object.assetId);
    ctx.strokeStyle = "#cbd5e1";
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Image", rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  if (object.radius > 0) roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, object.radius);
  else ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  const crop = object.crop;
  const sw = crop ? crop.w : object.naturalWidth;
  const sh = crop ? crop.h : object.naturalHeight;
  const sx = crop ? crop.x : 0;
  const sy = crop ? crop.y : 0;
  ctx.drawImage(image as CanvasImageSource, sx, sy, sw, sh, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function renderFormulaObject(ctx: CanvasRenderingContext2D, object: SceneObject & { type: "formula" }, options: ObjectRenderOptions) {
  const rect = { x: object.x, y: object.y, w: object.w, h: object.h };
  ctx.save();
  applyRotation(ctx, rect, object.rotation);
  if (object.background) {
    ctx.fillStyle = object.background;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  const raster = object.assetId ? options.assets.formulas.get(object.assetId) : undefined;
  if (raster) {
    const width = raster instanceof HTMLImageElement ? raster.naturalWidth : raster.width;
    const height = raster instanceof HTMLImageElement ? raster.naturalHeight : raster.height;
    const scale = Math.min(rect.w / width, rect.h / height);
    const w = width * scale;
    const h = height * scale;
    ctx.drawImage(raster as CanvasImageSource, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
  } else {
    ctx.strokeStyle = "#e2e8f0";
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = object.color;
    ctx.font = `${Math.max(10, object.fontSize * 0.55)}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const preview = object.latex.length > 42 ? `${object.latex.slice(0, 42)}...` : object.latex;
    ctx.fillText(preview, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
  ctx.restore();
}

function renderTableObject(ctx: CanvasRenderingContext2D, object: TableObject) {
  const rect = { x: object.x, y: object.y, w: object.w, h: object.h };
  ctx.save();
  applyRotation(ctx, rect, object.rotation);
  const rows = object.rows.length;
  const cols = Math.max(1, ...object.rows.map((r) => r.length));
  const colWidth = rect.w / cols;
  const rowHeight = rows > 0 ? rect.h / rows : rect.h;
  const style = object.style;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = rect.x + c * colWidth;
      const y = rect.y + r * rowHeight;
      if (object.headerRow && r === 0) {
        ctx.fillStyle = style.headerBg;
        ctx.fillRect(x, y, colWidth, rowHeight);
      }
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.strokeWidth;
      ctx.strokeRect(x, y, colWidth, rowHeight);
      const value = object.rows[r][c] ?? "";
      if (value) {
        ctx.font = `${style.fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = style.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 4, y, colWidth - 8, rowHeight);
        ctx.clip();
        ctx.fillText(value, x + 6, y + rowHeight / 2);
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

export function renderSceneObject(ctx: CanvasRenderingContext2D, object: SceneObject, options: ObjectRenderOptions) {
  switch (object.type) {
    case "stroke":
      renderStroke(ctx, object as StrokeObject, { renderScale: options.renderScale, pressureCurve: options.pressureCurve });
      break;
    case "shape":
      renderShapeObject(ctx, object);
      break;
    case "text":
      renderTextObject(ctx, object);
      break;
    case "image":
      renderImageObject(ctx, object, options);
      break;
    case "formula":
      renderFormulaObject(ctx, object, options);
      break;
    case "graph":
      drawGraph(ctx, object);
      break;
    case "table":
      renderTableObject(ctx, object);
      break;
  }
}

export function renderObjectsToContext(
  ctx: CanvasRenderingContext2D,
  objects: SceneObject[],
  layers: Layer[],
  options: ObjectRenderOptions,
  viewport?: Rect
) {
  const layerOrder = new Map(layers.map((l, i) => [l.id, i]));
  const layerInfo = new Map(layers.map((l) => [l.id, l]));
  const visible = objects.filter((object) => {
    const layer = layerInfo.get(object.layerId);
    if (!layer || !layer.visible || object.hidden) return false;
    if (viewport) {
      const box = objectAABB(object);
      if (!rectsIntersect(box, viewport)) return false;
    }
    return true;
  });
  visible.sort((a, b) => {
    const la = layerOrder.get(a.layerId) ?? 0;
    const lb = layerOrder.get(b.layerId) ?? 0;
    if (la !== lb) return la - lb;
    return a.z - b.z;
  });
  for (const object of visible) {
    const layer = layerInfo.get(object.layerId);
    const layerOpacity = layer?.opacity ?? 1;
    ctx.save();
    ctx.globalAlpha = clamp(object.opacity * layerOpacity, 0, 1);
    renderSceneObject(ctx, object, options);
    ctx.restore();
  }
}

export function pointsToPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
}
