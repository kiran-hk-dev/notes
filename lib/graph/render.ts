import type { GraphObject } from "@/types";
import { compileGraphFunction, formatAxisValue, niceStep, sampleCartesian, samplePolar, type CompiledGraphFunction } from "@/lib/graph/plot";
import { roundRectPath } from "@/lib/drawing/canvas";

const compileCache = new Map<string, CompiledGraphFunction>();

function compiledFor(id: string, expression: string, polar: boolean): CompiledGraphFunction {
  const key = `${polar ? "p" : "c"}|${expression}`;
  const cached = compileCache.get(key);
  if (cached) return cached;
  const compiled = compileGraphFunction(id, expression, polar);
  if (compileCache.size > 120) compileCache.clear();
  compileCache.set(key, compiled);
  return compiled;
}

export function normalizeGraphRect(graph: Pick<GraphObject, "x" | "y" | "w" | "h">) {
  return {
    x: Math.min(graph.x, graph.x + graph.w),
    y: Math.min(graph.y, graph.y + graph.h),
    w: Math.abs(graph.w),
    h: Math.abs(graph.h)
  };
}

export interface DrawGraphOptions {
  transparent?: boolean;
  gridColor?: string;
  axisColor?: string;
  labelColor?: string;
}

export function drawGraph(ctx: CanvasRenderingContext2D, graph: GraphObject, options: DrawGraphOptions = {}) {
  const rect = normalizeGraphRect(graph);
  const { viewport } = graph;
  const gridColor = options.gridColor ?? "#e2e8f0";
  const axisColor = options.axisColor ?? "#475569";
  const labelColor = options.labelColor ?? "#64748b";

  ctx.save();
  if (graph.rotation) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(graph.rotation);
    ctx.translate(-cx, -cy);
  }
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  if (!options.transparent) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  const xRange = viewport.xMax - viewport.xMin;
  const yRange = viewport.yMax - viewport.yMin;
  const xStep = niceStep(xRange, Math.max(2, Math.round(rect.w / 70)));
  const yStep = niceStep(yRange, Math.max(2, Math.round(rect.h / 50)));
  const toPx = (gx: number) => rect.x + ((gx - viewport.xMin) / xRange) * rect.w;
  const toPy = (gy: number) => rect.y + ((viewport.yMax - gy) / yRange) * rect.h;

  if (graph.showGrid) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const xStart = Math.ceil(viewport.xMin / xStep) * xStep;
    for (let gx = xStart; gx <= viewport.xMax; gx += xStep) {
      const px = toPx(gx);
      ctx.moveTo(px, rect.y);
      ctx.lineTo(px, rect.y + rect.h);
    }
    const yStart = Math.ceil(viewport.yMin / yStep) * yStep;
    for (let gy = yStart; gy <= viewport.yMax; gy += yStep) {
      const py = toPy(gy);
      ctx.moveTo(rect.x, py);
      ctx.lineTo(rect.x + rect.w, py);
    }
    ctx.stroke();
  }

  const xAxisY = viewport.yMin <= 0 && viewport.yMax >= 0 ? toPy(0) : viewport.yMax >= 0 ? rect.y + rect.h : rect.y;
  const yAxisX = viewport.xMin <= 0 && viewport.xMax >= 0 ? toPx(0) : viewport.xMax >= 0 ? rect.x : rect.x + rect.w;

  if (graph.showAxes) {
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rect.x, xAxisY);
    ctx.lineTo(rect.x + rect.w, xAxisY);
    ctx.moveTo(yAxisX, rect.y);
    ctx.lineTo(yAxisX, rect.y + rect.h);
    ctx.stroke();
  }

  if (graph.showLabels) {
    ctx.fillStyle = labelColor;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xStart = Math.ceil(viewport.xMin / xStep) * xStep;
    for (let gx = xStart; gx <= viewport.xMax; gx += xStep) {
      if (Math.abs(gx) < xStep * 1e-6) continue;
      const px = toPx(gx);
      if (px < rect.x + 12 || px > rect.x + rect.w - 4) continue;
      const label = formatAxisValue(gx, xStep);
      const labelY = Math.min(rect.y + rect.h - 14, Math.max(rect.y, xAxisY + 3));
      ctx.fillText(label, px, labelY);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yStart = Math.ceil(viewport.yMin / yStep) * yStep;
    for (let gy = yStart; gy <= viewport.yMax; gy += yStep) {
      if (Math.abs(gy) < yStep * 1e-6) continue;
      const py = toPy(gy);
      if (py < rect.y + 6 || py > rect.y + rect.h - 6) continue;
      const label = formatAxisValue(gy, yStep);
      const labelX = Math.max(rect.x + 26, Math.min(rect.x + rect.w - 2, yAxisX - 4));
      ctx.fillText(label, labelX, py);
    }
    ctx.fillStyle = labelColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("x", rect.x + rect.w - 4, xAxisY + 3);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("y", yAxisX + 4, rect.y + 2);
  }

  for (const fn of graph.functions) {
    if (fn.hidden || !fn.expression.trim()) continue;
    const compiled = compiledFor(fn.id, fn.expression, fn.kind === "polar");
    if (!compiled.fn) continue;
    const segments =
      fn.kind === "polar"
        ? samplePolar(compiled.fn, viewport.xMin, viewport.xMax, Math.round(rect.w * 1.6))
        : sampleCartesian(compiled.fn, viewport, Math.round(rect.w * 1.6));
    ctx.strokeStyle = fn.color;
    ctx.lineWidth = fn.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const segment of segments) {
      ctx.beginPath();
      for (let i = 0; i < segment.pts.length; i += 1) {
        const p = segment.pts[i];
        const px = toPx(p.x);
        const py = toPy(p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    if (compiled.shade && compiled.shade.upper) {
      const shadeSegments = sampleCartesian(compiled.shade.upper, viewport, Math.round(rect.w));
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = fn.color;
      for (const segment of shadeSegments) {
        if (segment.pts.length < 2) continue;
        ctx.beginPath();
        const edgeY = compiled.shade.kind === "below" ? rect.y : rect.y + rect.h;
        ctx.moveTo(toPx(segment.pts[0].x), edgeY);
        for (const p of segment.pts) ctx.lineTo(toPx(p.x), toPy(p.y));
        ctx.lineTo(toPx(segment.pts[segment.pts.length - 1].x), edgeY);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  ctx.restore();

  ctx.save();
  if (graph.rotation) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(graph.rotation);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 8);
  ctx.stroke();
  ctx.restore();
}

export function graphFunctionErrors(graph: GraphObject): { id: string; error: string; expression: string }[] {
  const errors: { id: string; error: string; expression: string }[] = [];
  for (const fn of graph.functions) {
    if (!fn.expression.trim()) continue;
    const compiled = compiledFor(fn.id, fn.expression, fn.kind === "polar");
    if (compiled.error) errors.push({ id: fn.id, expression: fn.expression, error: compiled.error });
  }
  return errors;
}
