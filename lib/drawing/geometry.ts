import type { Point, Rect } from "@/types";

export interface Vec {
  x: number;
  y: number;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function distToSegment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function projectPointOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function distToPolyline(p: Vec, points: { x: number; y: number }[], tolerance = 6) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const d = distToSegment(p, points[i - 1], points[i]);
    if (d < best) best = d;
    if (best <= tolerance) break;
  }
  return best;
}

export function smoothPoints(points: Point[], amount: number): Point[] {
  if (amount <= 0 || points.length < 3) return points;
  const passes = amount > 0.66 ? 3 : amount > 0.33 ? 2 : 1;
  const strength = 0.4 + amount * 0.5;
  let current = points.map((p) => ({ ...p }));
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((p) => ({ ...p }));
    for (let i = 1; i < current.length - 1; i += 1) {
      next[i].x = lerp(current[i].x, (current[i - 1].x + current[i + 1].x) / 2, strength);
      next[i].y = lerp(current[i].y, (current[i - 1].y + current[i + 1].y) / 2, strength);
      next[i].p = lerp(current[i].p, (current[i - 1].p + current[i + 1].p) / 2, strength * 0.5);
    }
    current = next;
  }
  return current;
}

export function simplifyIndices(points: Point[], tolerance: number): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const keep: boolean[] = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = distToSegment(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) result.push(i);
  return result;
}

export function simplifyPoints(points: Point[], tolerance: number): Point[] {
  const indices = simplifyIndices(points, tolerance);
  return indices.map((i) => points[i]);
}

export function filterByDistance(points: Point[], minDistance: number): Point[] {
  if (points.length === 0) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (dist(points[i], out[out.length - 1]) >= minDistance || i === points.length - 1) {
      out.push(points[i]);
    }
  }
  return out;
}

export function pointsBBox(points: { x: number; y: number }[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function expandRect(rect: Rect, pad: number): Rect {
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

export function rectsIntersect(a: Rect, b: Rect) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function rectContains(outer: Rect, inner: Rect) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function rectContainsPoint(rect: Rect, p: Vec, pad = 0) {
  return p.x >= rect.x - pad && p.x <= rect.x + rect.w + pad && p.y >= rect.y - pad && p.y <= rect.y + rect.h + pad;
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function rotatePoint(p: Vec, origin: Vec, angle: number): Vec {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

export function rectCorners(rect: Rect, rotation = 0, origin?: Vec): Vec[] {
  const cx = origin?.x ?? rect.x + rect.w / 2;
  const cy = origin?.y ?? rect.y + rect.h / 2;
  const corners: Vec[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h }
  ];
  if (rotation === 0) return corners;
  return corners.map((c) => rotatePoint(c, { x: cx, y: cy }, rotation));
}

export function rectAABB(rect: Rect, rotation = 0): Rect {
  if (rotation === 0) return rect;
  return pointsBBox(rectCorners(rect, rotation));
}

export function pointInRotatedRect(p: Vec, rect: Rect, rotation: number) {
  if (rotation === 0) return rectContainsPoint(rect, p);
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const local = rotatePoint(p, center, -rotation);
  return rectContainsPoint(rect, local);
}

export function pointInPolygon(p: Vec, polygon: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonArea(points: { x: number; y: number }[]) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(area / 2);
}

export function polygonCentroid(points: { x: number; y: number }[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function polygonPerimeter(points: { x: number; y: number }[]) {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    total += dist(points[i], points[(i + 1) % points.length]);
  }
  return total;
}

export function fitLine(points: { x: number; y: number }[]) {
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? Infinity : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function straightness(points: { x: number; y: number }[]) {
  if (points.length < 3) return 1;
  const start = points[0];
  const end = points[points.length - 1];
  const length = dist(start, end);
  if (length < 1) return 0;
  let maxDeviation = 0;
  for (const p of points) maxDeviation = Math.max(maxDeviation, distToSegment(p, start, end));
  return Math.max(0, 1 - maxDeviation / (length * 0.15));
}

export function circularity(points: { x: number; y: number }[]) {
  const center = polygonCentroid(points);
  const distances = points.map((p) => dist(p, center));
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  if (mean === 0) return 0;
  const variance = distances.reduce((acc, d) => acc + (d - mean) ** 2, 0) / distances.length;
  const std = Math.sqrt(variance);
  return Math.max(0, 1 - std / mean);
}

export function rectangularity(points: { x: number; y: number }[]) {
  const box = pointsBBox(points);
  if (box.w === 0 || box.h === 0) return 0;
  const area = polygonArea(points);
  return Math.min(1, area / (box.w * box.h));
}

export function midPoint(a: { x: number; y: number }, b: { x: number; y: number }): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function traceSmoothPath(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
  if (points.length === 0) return;
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) return;
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const mid = midPoint(points[i], points[i + 1]);
    ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

export function outlinePolygonFromStraightPath(points: { x: number; y: number }[], offset: number): Vec[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push({ x: points[i].x + nx * offset, y: points[i].y + ny * offset });
    right.push({ x: points[i].x - nx * offset, y: points[i].y - ny * offset });
  }
  return [...left, ...right.reverse()];
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
