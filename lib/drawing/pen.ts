import type { Point, StrokeObject, StrokeStyle } from "@/types";
import { dist, midPoint, mulberry32, smoothPoints, traceSmoothPath } from "@/lib/drawing/geometry";
import { createCanvas } from "@/lib/drawing/canvas";

export interface StrokeRenderOptions {
  renderScale?: number;
  pressureCurve?: number;
}

interface PreparedStroke {
  points: Point[];
  widths: number[];
  bbox: { x: number; y: number; w: number; h: number };
}

const preparedCache = new WeakMap<StrokeObject, Map<string, PreparedStroke>>();

function prepareStroke(stroke: StrokeObject, options: StrokeRenderOptions): PreparedStroke {
  const key = `${options.renderScale ?? 1}:${options.pressureCurve ?? 1}`;
  let cached = preparedCache.get(stroke);
  if (cached) {
    const hit = cached.get(key);
    if (hit) return hit;
  } else {
    cached = new Map();
    preparedCache.set(stroke, cached);
  }

  const style = stroke.style;
  const raw = stroke.points;
  const points = style.smoothing > 0 ? smoothPoints(raw, Math.min(1, style.smoothing)) : raw;
  const widths = computeWidths(points, style, options);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const pad = widths[i] / 2 + 4;
    if (points[i].x - pad < minX) minX = points[i].x - pad;
    if (points[i].y - pad < minY) minY = points[i].y - pad;
    if (points[i].x + pad > maxX) maxX = points[i].x + pad;
    if (points[i].y + pad > maxY) maxY = points[i].y + pad;
  }
  const prepared: PreparedStroke = {
    points,
    widths,
    bbox: { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
  };
  cached.set(key, prepared);
  return prepared;
}

export function computeWidths(points: Point[], style: StrokeStyle, options: StrokeRenderOptions): number[] {
  const base = Math.max(0.4, style.width);
  const curve = Math.max(0.3, Math.min(3, options.pressureCurve ?? 1));
  const n = points.length;
  const widths = new Array<number>(n).fill(base);
  const penType = style.penType;
  const usesPressure = style.pressure && penType !== "calligraphy";
  let hasPressureData = false;
  if (usesPressure) {
    let minP = Infinity;
    let maxP = -Infinity;
    for (const p of points) {
      if (p.p < minP) minP = p.p;
      if (p.p > maxP) maxP = p.p;
    }
    hasPressureData = maxP - minP > 0.02;
  }

  if (penType === "ballpoint" || penType === "mechanical" || penType === "marker" || penType === "highlighter") {
    return widths;
  }
  if (penType === "calligraphy") {
    return widths;
  }

  const velocityFactors = new Array<number>(n).fill(1);
  if (penType === "fountain" || penType === "custom") {
    for (let i = 0; i < n; i += 1) {
      const prev = points[Math.max(0, i - 1)];
      const curr = points[i];
      const dt = Math.max(1, curr.t - prev.t);
      const dl = dist(prev, curr);
      const velocity = dl / dt;
      const vFactor = Math.max(0.55, Math.min(1.35, 1.25 - velocity * 1.6));
      velocityFactors[i] = vFactor;
    }
  }

  const taperPoints = Math.min(Math.floor(n * 0.2), 26);
  for (let i = 0; i < n; i += 1) {
    let factor = 1;
    if (penType === "brush") {
      const pressure = usesPressure && hasPressureData ? points[i].p : 0.5;
      factor = 0.35 + 0.75 * Math.pow(Math.max(0.05, pressure), 1 / curve);
    } else if (usesPressure && hasPressureData) {
      const pressure = points[i].p;
      const adjusted = Math.pow(Math.max(0.05, Math.min(1, pressure)), 1 / curve);
      factor = 0.3 + 0.7 * adjusted;
    } else {
      factor = velocityFactors[i];
      if (penType === "pencil" || penType === "sketch") {
        factor = 0.75 + (i % 7) / 7 * 0.25;
      }
    }
    if (penType === "fountain" || penType === "brush" || penType === "custom") {
      if (i < taperPoints) factor *= 0.35 + 0.65 * (i / Math.max(1, taperPoints));
      if (i >= n - taperPoints) factor *= 0.35 + 0.65 * ((n - 1 - i) / Math.max(1, taperPoints));
    }
    widths[i] = base * factor;
  }

  if (penType === "brush" && style.softness && style.softness > 0.4) {
    const window = 3;
    const smoothed = widths.slice();
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - window); j <= Math.min(n - 1, i + window); j += 1) {
        sum += widths[j];
        count += 1;
      }
      smoothed[i] = sum / count;
    }
    return smoothed;
  }
  return widths;
}

function strokePath(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  traceSmoothPath(ctx, points);
}

function dot(ctx: CanvasRenderingContext2D, point: Point, width: number, style: StrokeStyle) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(0.5, width / 2), 0, Math.PI * 2);
  ctx.fillStyle = style.color;
  ctx.fill();
}

function variableWidthPolygon(ctx: CanvasRenderingContext2D, points: Point[], widths: number[], flatCaps: boolean) {
  const n = points.length;
  if (n < 2) return;
  type Vec2 = { x: number; y: number };
  const left: Vec2[] = new Array(n);
  const right: Vec2[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    if (dx === 0 && dy === 0) {
      dx = 1;
      dy = 0;
    }
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const half = widths[i] / 2;
    left[i] = { x: points[i].x + nx * half, y: points[i].y + ny * half };
    right[i] = { x: points[i].x - nx * half, y: points[i].y - ny * half };
  }
  ctx.beginPath();
  if (!flatCaps) {
    const startAngle = Math.atan2(left[0].y - points[0].y, left[0].x - points[0].x);
    ctx.arc(points[0].x, points[0].y, Math.max(0.5, widths[0] / 2), startAngle, startAngle + Math.PI, true);
  } else {
    ctx.moveTo(left[0].x, left[0].y);
  }
  for (let i = 0; i < n; i += 1) ctx.lineTo(left[i].x, left[i].y);
  if (!flatCaps) {
    const endAngle = Math.atan2(right[n - 1].y - points[n - 1].y, right[n - 1].x - points[n - 1].x);
    ctx.arc(points[n - 1].x, points[n - 1].y, Math.max(0.5, widths[n - 1] / 2), endAngle + Math.PI, endAngle, true);
  } else {
    ctx.lineTo(right[n - 1].x, right[n - 1].y);
  }
  for (let i = n - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
}

function calligraphyPolygon(ctx: CanvasRenderingContext2D, points: Point[], width: number, nibAngleDeg: number) {
  const n = points.length;
  const nib = ((nibAngleDeg ?? 45) * Math.PI) / 180;
  const nibX = Math.cos(nib);
  const nibY = Math.sin(nib);
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const motionX = dx / len;
    const motionY = dy / len;
    const projection = Math.abs(motionX * -nibY + motionY * nibX);
    const m = 0.12 + 0.88 * projection;
    const half = (width * m) / 2;
    left.push({ x: points[i].x + nibX * half, y: points[i].y + nibY * half });
    right.push({ x: points[i].x - nibX * half, y: points[i].y - nibY * half });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i += 1) ctx.lineTo(left[i].x, left[i].y);
  for (let i = n - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
}

const grainCache = new Map<string, HTMLCanvasElement>();

function grainCanvas(seed: number, intensity: number): HTMLCanvasElement {
  const bucket = Math.round(intensity * 10);
  const key = `${seed}:${bucket}`;
  const cached = grainCache.get(key);
  if (cached) return cached;
  const size = 140;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const rng = mulberry32(seed || 1);
  const image = ctx.createImageData(size, size);
  const alphaBase = 60 + Math.round(150 * Math.min(1, intensity));
  for (let i = 0; i < size * size; i += 1) {
    const noise = rng();
    const alpha = noise < 0.35 ? Math.round(noise * alphaBase) : Math.round(noise * noise * alphaBase * 0.5);
    image.data[i * 4 + 3] = alpha;
  }
  ctx.putImageData(image, 0, 0);
  grainCache.set(key, canvas);
  if (grainCache.size > 60) {
    const firstKey = grainCache.keys().next().value;
    if (firstKey !== undefined) grainCache.delete(firstKey);
  }
  return canvas;
}

function strokeWithGrain(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeObject,
  prepared: PreparedStroke,
  options: StrokeRenderOptions,
  grainAmount: number,
  passes: number
) {
  const { points, widths, bbox } = prepared;
  const renderScale = Math.max(1, Math.min(4, options.renderScale ?? 1));
  const pad = 6;
  const w = (bbox.w + pad * 2) * renderScale;
  const h = (bbox.h + pad * 2) * renderScale;
  if (w * h > 36_000_000) return;
  const scratch = createCanvas(w, h);
  const sctx = scratch.getContext("2d")!;
  sctx.scale(renderScale, renderScale);
  sctx.translate(-bbox.x + pad, -bbox.y + pad);
  const style = stroke.style;
  const rng = mulberry32(stroke.seed || 1);
  sctx.strokeStyle = style.color;
  sctx.lineCap = style.lineCap;
  sctx.lineJoin = style.lineJoin;
  for (let pass = 0; pass < passes; pass += 1) {
    const jitter = passes > 1 ? (rng() - 0.5) * style.width * 0.15 : 0;
    sctx.save();
    sctx.translate(jitter, jitter);
    sctx.globalAlpha = passes > 1 ? 1 / Math.max(1, passes - 0.4) : 1;
    sctx.lineWidth = Math.max(0.4, style.width * (passes > 1 ? 1 - pass * 0.12 : 1));
    strokePath(sctx, points);
    sctx.stroke();
    sctx.restore();
  }
  if (grainAmount > 0) {
    sctx.globalCompositeOperation = "destination-out";
    const pattern = sctx.createPattern(grainCanvas(stroke.seed || 1, grainAmount), "repeat");
    if (pattern) {
      sctx.save();
      sctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      sctx.fillStyle = pattern;
      sctx.globalAlpha = Math.min(1, grainAmount * 0.75);
      sctx.fillRect(bbox.x - pad, bbox.y - pad, bbox.w + pad * 2, bbox.h + pad * 2);
      sctx.restore();
    }
    sctx.globalCompositeOperation = "source-over";
  }
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.globalAlpha *= style.opacity;
  ctx.globalCompositeOperation = style.blend === "source-over" ? "source-over" : style.blend;
  ctx.drawImage(scratch, bbox.x - pad, bbox.y - pad, bbox.w + pad * 2, bbox.h + pad * 2);
  ctx.restore();
  void widths;
}

function brushStamp(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeObject,
  prepared: PreparedStroke,
  options: StrokeRenderOptions
) {
  const { points, widths, bbox } = prepared;
  const renderScale = Math.max(1, Math.min(4, options.renderScale ?? 1));
  const pad = 8;
  const w = (bbox.w + pad * 2) * renderScale;
  const h = (bbox.h + pad * 2) * renderScale;
  if (w * h > 36_000_000) return;
  const scratch = createCanvas(w, h);
  const sctx = scratch.getContext("2d")!;
  sctx.scale(renderScale, renderScale);
  sctx.translate(-bbox.x + pad, -bbox.y + pad);
  const style = stroke.style;
  const softness = Math.max(0, Math.min(1, style.softness ?? 0.6));
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const radius = Math.max(0.4, ((widths[i - 1] + widths[i]) / 2) / 2);
    const step = Math.max(0.6, radius * 0.18);
    const d = dist(a, b);
    const count = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= count; k += 1) {
      const t = k / count;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const gradient = sctx.createRadialGradient(x, y, radius * (1 - softness), x, y, radius);
      gradient.addColorStop(0, style.color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = gradient;
      sctx.beginPath();
      sctx.arc(x, y, radius, 0, Math.PI * 2);
      sctx.fill();
    }
  }
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.globalAlpha *= style.opacity;
  ctx.globalCompositeOperation = style.blend === "source-over" ? "source-over" : style.blend;
  ctx.drawImage(scratch, bbox.x - pad, bbox.y - pad, bbox.w + pad * 2, bbox.h + pad * 2);
  ctx.restore();
}

function flatComposite(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeObject,
  prepared: PreparedStroke,
  options: StrokeRenderOptions,
  pen: "marker" | "highlighter"
) {
  const { points, bbox } = prepared;
  const style = stroke.style;
  const renderScale = Math.max(1, Math.min(4, options.renderScale ?? 1));
  const pad = 6;
  const w = (bbox.w + pad * 2) * renderScale;
  const h = (bbox.h + pad * 2) * renderScale;
  if (w * h > 36_000_000) return;
  const scratch = createCanvas(w, h);
  const sctx = scratch.getContext("2d")!;
  sctx.scale(renderScale, renderScale);
  sctx.translate(-bbox.x + pad, -bbox.y + pad);
  sctx.strokeStyle = style.color;
  sctx.lineCap = pen === "highlighter" ? "butt" : style.lineCap;
  sctx.lineJoin = "round";
  sctx.lineWidth = style.width;
  strokePath(sctx, points);
  sctx.stroke();
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.globalAlpha *= style.opacity;
  ctx.globalCompositeOperation = pen === "highlighter" ? "multiply" : style.blend;
  ctx.drawImage(scratch, bbox.x - pad, bbox.y - pad, bbox.w + pad * 2, bbox.h + pad * 2);
  ctx.restore();
}

export function renderStroke(ctx: CanvasRenderingContext2D, stroke: StrokeObject, options: StrokeRenderOptions = {}) {
  if (stroke.hidden) return;
  const style = stroke.style;
  if (stroke.points.length === 0) return;
  const prepared = prepareStroke(stroke, options);
  const { points, widths } = prepared;
  ctx.save();
  ctx.globalAlpha *= stroke.opacity;

  if (points.length === 1) {
    ctx.globalAlpha *= style.opacity;
    dot(ctx, points[0], widths[0] ?? style.width, style);
    ctx.restore();
    return;
  }

  switch (style.penType) {
    case "ballpoint":
    case "mechanical": {
      ctx.globalAlpha *= style.opacity;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = Math.max(0.4, style.width);
      ctx.lineCap = style.lineCap;
      ctx.lineJoin = style.lineJoin;
      ctx.setLineDash(style.dash ?? []);
      strokePath(ctx, points);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "fountain": {
      ctx.globalAlpha *= style.opacity;
      ctx.fillStyle = style.color;
      variableWidthPolygon(ctx, points, widths, false);
      ctx.fill();
      break;
    }
    case "calligraphy": {
      ctx.globalAlpha *= style.opacity;
      ctx.fillStyle = style.color;
      calligraphyPolygon(ctx, points, style.width, style.nibAngle ?? 45);
      ctx.fill();
      break;
    }
    case "custom": {
      if ((style.texture ?? 0) > 0.15) {
        strokeWithGrain(ctx, stroke, prepared, options, style.texture, 1);
      } else {
        ctx.globalAlpha *= style.opacity;
        ctx.fillStyle = style.color;
        variableWidthPolygon(ctx, points, widths, false);
        ctx.fill();
      }
      break;
    }
    case "pencil":
      strokeWithGrain(ctx, stroke, prepared, options, Math.max(0.25, style.texture), 2);
      break;
    case "sketch":
      strokeWithGrain(ctx, stroke, prepared, options, Math.max(0.35, style.texture), 3);
      break;
    case "marker":
      flatComposite(ctx, stroke, prepared, options, "marker");
      break;
    case "highlighter":
      flatComposite(ctx, stroke, prepared, options, "highlighter");
      break;
    case "brush":
      brushStamp(ctx, stroke, prepared, options);
      break;
    default: {
      ctx.globalAlpha *= style.opacity;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = Math.max(0.4, style.width);
      ctx.lineCap = style.lineCap;
      ctx.lineJoin = style.lineJoin;
      strokePath(ctx, points);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function strokePolylinePreview(points: Point[], step = 12): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  const out: { x: number; y: number }[] = [];
  let last = points[0];
  out.push(last);
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    if (dist(last, p) >= step) {
      out.push(midPoint(last, p));
      last = p;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}
