import katex from "katex";
import { katexCss, katexCssSync } from "@/lib/formula/fonts";

export interface FormulaStyle {
  fontSize: number;
  color: string;
  displayMode?: boolean;
  background?: string | null;
  padding?: number;
}

export interface FormulaMetrics {
  width: number;
  height: number;
  html: string;
}

export interface FormulaRaster {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const rasterCache = new Map<string, FormulaRaster>();
const metricsCache = new Map<string, FormulaMetrics>();
let host: HTMLDivElement | null = null;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getHost(): HTMLDivElement {
  if (host && document.body.contains(host)) return host;
  host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = "auto";
  host.style.height = "auto";
  host.style.visibility = "hidden";
  host.style.pointerEvents = "none";
  host.style.contain = "layout style";
  document.body.appendChild(host);
  return host;
}

export function renderLatexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex || "\\;", {
      displayMode,
      throwOnError: false,
      output: "html",
      strict: false,
      trust: false,
      maxSize: 24
    });
  } catch {
    return `<span style="color:#dc2626;font-family:monospace">${escapeHtml(latex)}</span>`;
  }
}

export function measureFormula(latex: string, style: FormulaStyle): FormulaMetrics {
  const displayMode = style.displayMode ?? false;
  const padding = style.padding ?? Math.max(6, Math.round(style.fontSize * 0.4));
  const key = `${latex}|${style.fontSize}|${displayMode ? 1 : 0}|${padding}`;
  const cached = metricsCache.get(key);
  if (cached) return cached;
  const el = getHost();
  el.innerHTML = `<div style="display:inline-block;font-size:${style.fontSize}px;line-height:normal;">${renderLatexHtml(latex, displayMode)}</div>`;
  const content = el.firstElementChild as HTMLElement;
  const rect = content.getBoundingClientRect();
  const width = Math.max(24, Math.ceil(rect.width) + padding * 2);
  const height = Math.max(20, Math.ceil(rect.height) + padding * 2);
  const metrics: FormulaMetrics = { width, height, html: content.innerHTML };
  el.innerHTML = "";
  if (metricsCache.size > 400) metricsCache.clear();
  metricsCache.set(key, metrics);
  return metrics;
}

export function formulaObjectSize(latex: string, fontSize: number, displayMode: boolean): { w: number; h: number } {
  const metrics = measureFormula(latex, { fontSize, color: "#111827", displayMode });
  return { w: metrics.width, h: metrics.height };
}

export async function rasterizeFormula(latex: string, style: FormulaStyle, scale = 3): Promise<FormulaRaster | null> {
  const displayMode = style.displayMode ?? false;
  const key = `${latex}|${style.fontSize}|${style.color}|${displayMode ? 1 : 0}|${style.background ?? ""}|${scale}`;
  const cached = rasterCache.get(key);
  if (cached) return cached;
  const metrics = measureFormula(latex, style);
  const padding = style.padding ?? Math.max(6, Math.round(style.fontSize * 0.4));
  let css: string;
  try {
    css = katexCssSync() ?? (await katexCss());
  } catch {
    return null;
  }
  const background = style.background ? `background:${style.background};` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml" style="width:${metrics.width}px;height:${metrics.height}px;display:flex;align-items:center;justify-content:center;font-size:${style.fontSize}px;color:${style.color};line-height:normal;${background}">
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
<div style="padding:${padding}px;box-sizing:border-box;">${metrics.html}</div>
</div>
</foreignObject>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("svg-raster-failed"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(metrics.width * scale);
    canvas.height = Math.ceil(metrics.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const raster: FormulaRaster = { canvas, width: metrics.width, height: metrics.height };
    if (rasterCache.size > 200) rasterCache.clear();
    rasterCache.set(key, raster);
    return raster;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function rasterizeFormulaToBlob(latex: string, style: FormulaStyle): Promise<{ blob: Blob; width: number; height: number } | null> {
  const raster = await rasterizeFormula(latex, style);
  if (!raster) return null;
  const blob = await new Promise<Blob | null>((resolve) => raster.canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return { blob, width: raster.width, height: raster.height };
}

export function clearFormulaCaches() {
  rasterCache.clear();
  metricsCache.clear();
}
