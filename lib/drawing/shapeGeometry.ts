import type { ShapeObject } from "@/types";
import { dist, distToPolyline, distToSegment, pointInPolygon, pointsBBox, rotatePoint } from "@/lib/drawing/geometry";

export interface Vec2 {
  x: number;
  y: number;
}

export interface ShapeGeometry {
  polygons: Vec2[][];
  polylines: { pts: Vec2[]; closed: boolean; smooth: boolean }[];
  ellipses: { cx: number; cy: number; rx: number; ry: number }[];
}

export function normalizeShapeRect(shape: ShapeObject) {
  const x = Math.min(shape.x, shape.x + shape.w);
  const y = Math.min(shape.y, shape.y + shape.h);
  return { x, y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
}

function rectPoints(x: number, y: number, w: number, h: number): Vec2[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ];
}

function polygonPoints(cx: number, cy: number, radius: number, sides: number, rotation = -Math.PI / 2): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return pts;
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): Vec2[] {
  const pts: Vec2[] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * step;
    pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return pts;
}

function arrowHead(tip: Vec2, from: Vec2, strokeWidth: number): Vec2[] {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const length = Math.max(9, strokeWidth * 4.5);
  const half = length * 0.42;
  const base = { x: tip.x - Math.cos(angle) * length, y: tip.y - Math.sin(angle) * length };
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  return [
    { x: tip.x, y: tip.y },
    { x: base.x + normal.x * half, y: base.y + normal.y * half },
    { x: base.x - normal.x * half, y: base.y - normal.y * half }
  ];
}

export function buildShapeGeometry(shape: ShapeObject): ShapeGeometry {
  const { x, y, w, h } = normalizeShapeRect(shape);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = Math.min(w, h) / 2;
  const geometry: ShapeGeometry = { polygons: [], polylines: [], ellipses: [] };
  const sw = shape.style.strokeWidth;

  switch (shape.shape) {
    case "line":
      geometry.polylines.push({ pts: [{ x, y }, { x: x + w, y: y + h }], closed: false, smooth: false });
      break;
    case "arrow": {
      const a = { x, y };
      const b = { x: x + w, y: y + h };
      geometry.polylines.push({ pts: [a, b], closed: false, smooth: false });
      geometry.polygons.push(arrowHead(b, a, sw));
      break;
    }
    case "arrow-both": {
      const a = { x, y };
      const b = { x: x + w, y: y + h };
      geometry.polylines.push({ pts: [a, b], closed: false, smooth: false });
      geometry.polygons.push(arrowHead(b, a, sw));
      geometry.polygons.push(arrowHead(a, b, sw));
      break;
    }
    case "rect":
    case "rect-rounded":
    case "process":
    case "terminator":
      geometry.polygons.push(rectPoints(x, y, w, h));
      break;
    case "speech": {
      const tail = Math.min(30, h * 0.35, w * 0.2);
      geometry.polygons.push([
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x: x + w * 0.4, y: y + h },
        { x: x + w * 0.32, y: y + h + tail },
        { x: x + w * 0.26, y: y + h },
        { x, y: y + h }
      ]);
      break;
    }
    case "thought": {
      geometry.ellipses.push({ cx, cy, rx: w / 2, ry: h / 2 });
      const r = Math.max(5, Math.min(14, w * 0.07, h * 0.16));
      geometry.ellipses.push({ cx: x + w * 0.3, cy: y + h + r * 1.2, rx: r, ry: r * 0.82 });
      geometry.ellipses.push({ cx: x + w * 0.2, cy: y + h + r * 2.9, rx: r * 0.58, ry: r * 0.48 });
      break;
    }
    case "ellipse":
      geometry.ellipses.push({ cx, cy, rx: w / 2, ry: h / 2 });
      break;
    case "triangle":
      geometry.polygons.push([
        { x: cx, y },
        { x: x + w, y: y + h },
        { x, y: y + h }
      ]);
      break;
    case "diamond":
    case "decision":
      geometry.polygons.push([
        { x: cx, y },
        { x: x + w, y: cy },
        { x: cx, y: y + h },
        { x, y: cy }
      ]);
      break;
    case "pentagon":
      geometry.polygons.push(polygonPoints(cx, cy, radius, 5));
      break;
    case "hexagon":
      geometry.polygons.push(polygonPoints(cx, cy, radius, 6, 0));
      break;
    case "data":
      geometry.polygons.push([
        { x: x + w * 0.18, y },
        { x: x + w, y },
        { x: x + w - w * 0.18, y: y + h },
        { x, y: y + h }
      ]);
      break;
    case "star":
      geometry.polygons.push(starPoints(cx, cy, radius, radius * 0.45, shape.sides ?? 5));
      break;
    case "polyline":
      geometry.polylines.push({
        pts: (shape.points ?? []).map((p) => ({ x: p.x, y: p.y })),
        closed: false,
        smooth: false
      });
      break;
    case "freeform":
      geometry.polylines.push({
        pts: (shape.points ?? []).map((p) => ({ x: p.x, y: p.y })),
        closed: true,
        smooth: false
      });
      break;
    case "curve":
      geometry.polylines.push({
        pts: (shape.points ?? []).map((p) => ({ x: p.x, y: p.y })),
        closed: false,
        smooth: true
      });
      break;
    case "connector": {
      const a = { x, y: cy };
      const b = { x: x + w, y: cy };
      geometry.polylines.push({ pts: [a, b], closed: false, smooth: false });
      geometry.polygons.push(arrowHead(b, a, sw));
      break;
    }
    case "dimension": {
      const tick = Math.max(8, h * 0.4);
      geometry.polylines.push(
        { pts: [{ x, y: cy }, { x: x + w, y: cy }], closed: false, smooth: false },
        { pts: [{ x, y: cy - tick / 2 }, { x, y: cy + tick / 2 }], closed: false, smooth: false },
        { pts: [{ x: x + w, y: cy - tick / 2 }, { x: x + w, y: cy + tick / 2 }], closed: false, smooth: false }
      );
      geometry.polygons.push(arrowHead({ x: x + w * 0.08, y: cy }, { x: x + w, y: cy }, sw));
      geometry.polygons.push(arrowHead({ x: x + w * 0.92, y: cy }, { x, y: cy }, sw));
      break;
    }
    case "axes": {
      geometry.polylines.push(
        { pts: [{ x, y: cy }, { x: x + w, y: cy }], closed: false, smooth: false },
        { pts: [{ x: cx, y: y + h }, { x: cx, y }], closed: false, smooth: false }
      );
      geometry.polygons.push(arrowHead({ x: x + w, y: cy }, { x, y: cy }, sw));
      geometry.polygons.push(arrowHead({ x: cx, y }, { x: cx, y: y + h }, sw));
      break;
    }
    case "grid": {
      const spacing = Math.max(12, Math.min(w, h) / 10);
      for (let gx = x + spacing; gx < x + w - 1; gx += spacing) {
        geometry.polylines.push({ pts: [{ x: gx, y }, { x: gx, y: y + h }], closed: false, smooth: false });
      }
      for (let gy = y + spacing; gy < y + h - 1; gy += spacing) {
        geometry.polylines.push({ pts: [{ x, y: gy }, { x: x + w, y: gy }], closed: false, smooth: false });
      }
      break;
    }
  }
  return geometry;
}

export interface RotatedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

function normalizedBox(box: RotatedBox) {
  return {
    x: Math.min(box.x, box.x + box.w),
    y: Math.min(box.y, box.y + box.h),
    w: Math.abs(box.w),
    h: Math.abs(box.h),
    rotation: box.rotation
  };
}

export function shapeLocalToWorld(shape: RotatedBox, p: Vec2): Vec2 {
  if (!shape.rotation) return p;
  const { x, y, w, h } = normalizedBox(shape);
  return rotatePoint(p, { x: x + w / 2, y: y + h / 2 }, shape.rotation);
}

export function shapeWorldToLocal(shape: RotatedBox, p: Vec2): Vec2 {
  if (!shape.rotation) return p;
  const { x, y, w, h } = normalizedBox(shape);
  return rotatePoint(p, { x: x + w / 2, y: y + h / 2 }, -shape.rotation);
}

export function shapeBoundsWithRotation(shape: RotatedBox) {
  const rect = normalizedBox(shape);
  if (!shape.rotation) return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const corners = rectPoints(rect.x, rect.y, rect.w, rect.h).map((p) => rotatePoint(p, center, shape.rotation));
  return pointsBBox(corners);
}

export function pointInShapeGeometry(geometry: ShapeGeometry, p: Vec2, tolerance: number): boolean {
  for (const ellipse of geometry.ellipses) {
    const norm = ((p.x - ellipse.cx) / (ellipse.rx + tolerance)) ** 2 + ((p.y - ellipse.cy) / (ellipse.ry + tolerance)) ** 2;
    if (norm <= 1) return true;
  }
  for (const poly of geometry.polygons) {
    if (pointInPolygon(p, poly)) return true;
    if (distToPolyline(p, [...poly, poly[0]], tolerance) <= tolerance) return true;
  }
  for (const line of geometry.polylines) {
    const pts = line.closed && line.pts.length > 1 ? [...line.pts, line.pts[0]] : line.pts;
    if (pts.length === 1) {
      if (dist(p, pts[0]) <= tolerance) return true;
    } else if (pts.length >= 2 && distToPolyline(p, pts, tolerance) <= tolerance) {
      return true;
    }
  }
  void distToSegment;
  return false;
}
