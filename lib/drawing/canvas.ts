export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return ctx;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to encode canvas"));
      },
      type,
      quality
    );
  });
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImageElement(src: string, cacheKey?: string): Promise<HTMLImageElement> {
  const key = cacheKey ?? src;
  const cached = imageCache.get(key);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
  imageCache.set(key, promise);
  return promise;
}

export function loadImageFromBlob(blob: Blob, cacheKey?: string): Promise<HTMLImageElement> {
  if (cacheKey) {
    const cached = imageCache.get(cacheKey);
    if (cached) return cached;
  }
  const url = URL.createObjectURL(blob);
  const promise = loadImageElement(url, cacheKey).finally(() => {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  if (cacheKey) imageCache.set(cacheKey, promise);
  return promise;
}

export function clearImageCacheEntry(key: string) {
  imageCache.delete(key);
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number
) {
  const step = Math.PI / points;
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + i * step;
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.closePath();
}

export function regularPolygonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, sides: number) {
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
