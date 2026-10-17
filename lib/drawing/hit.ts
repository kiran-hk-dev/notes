import type { Rect, SceneObject } from "@/types";
import { dist, distToPolyline, pointInPolygon, rectContains, rectContainsPoint, rectsIntersect, rectAABB } from "@/lib/drawing/geometry";
import { buildShapeGeometry, pointInShapeGeometry, shapeBoundsWithRotation, shapeWorldToLocal } from "@/lib/drawing/shapeGeometry";
import { objectBBox } from "@/lib/drawing/factory";

export class SpatialIndex {
  private cells = new Map<string, Set<string>>();
  private boxes = new Map<string, Rect>();
  constructor(private cellSize = 240) {}

  private cellKey(cx: number, cy: number) {
    return `${cx}:${cy}`;
  }

  private forEachCell(rect: Rect, cb: (key: string) => void) {
    const x0 = Math.floor(rect.x / this.cellSize);
    const y0 = Math.floor(rect.y / this.cellSize);
    const x1 = Math.floor((rect.x + rect.w) / this.cellSize);
    const y1 = Math.floor((rect.y + rect.h) / this.cellSize);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        cb(this.cellKey(cx, cy));
      }
    }
  }

  insert(id: string, box: Rect) {
    this.boxes.set(id, box);
    this.forEachCell(box, (key) => {
      let set = this.cells.get(key);
      if (!set) {
        set = new Set();
        this.cells.set(key, set);
      }
      set.add(id);
    });
  }

  remove(id: string) {
    const box = this.boxes.get(id);
    if (!box) return;
    this.forEachCell(box, (key) => {
      const set = this.cells.get(key);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.cells.delete(key);
      }
    });
    this.boxes.delete(id);
  }

  update(id: string, box: Rect) {
    const existing = this.boxes.get(id);
    if (existing && existing.x === box.x && existing.y === box.y && existing.w === box.w && existing.h === box.h) return;
    this.remove(id);
    this.insert(id, box);
  }

  query(box: Rect): Set<string> {
    const result = new Set<string>();
    this.forEachCell(box, (key) => {
      const set = this.cells.get(key);
      if (set) for (const id of set) result.add(id);
    });
    return result;
  }

  clear() {
    this.cells.clear();
    this.boxes.clear();
  }

  get size() {
    return this.boxes.size;
  }
}

export function objectAABB(object: SceneObject): Rect {
  if (object.type === "shape") {
    const box = shapeBoundsWithRotation(object);
    const pad = object.style.strokeWidth + 2;
    return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  }
  const box = objectBBox(object);
  const pad = 2;
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

export function hitTestObject(object: SceneObject, p: { x: number; y: number }, tolerance = 4): boolean {
  if (object.hidden) return false;
  switch (object.type) {
    case "stroke": {
      const bbox = objectBBox(object);
      if (!rectContainsPoint(bbox, p, tolerance)) return false;
      const tol = tolerance + object.style.width / 2;
      return distToPolyline(p, object.points, tol) <= tol;
    }
    case "shape": {
      const box = shapeBoundsWithRotation(object);
      if (!rectContainsPoint(box, p, tolerance + object.style.strokeWidth)) return false;
      const local = shapeWorldToLocal(object, p);
      const geometry = buildShapeGeometry(object);
      const tol = tolerance + object.style.strokeWidth / 2;
      if (object.style.fill) return pointInShapeGeometry(geometry, local, tol);
      for (const ellipse of geometry.ellipses) {
        const norm = Math.hypot((local.x - ellipse.cx) / (ellipse.rx + tol), (local.y - ellipse.cy) / (ellipse.ry + tol));
        if (Math.abs(norm - 1) < 0.35) return true;
      }
      for (const poly of geometry.polygons) {
        if (distToPolyline(local, [...poly, poly[0]], tol) <= tol) return true;
      }
      for (const line of geometry.polylines) {
        if (line.pts.length === 1) {
          if (dist(local, line.pts[0]) <= tol) return true;
        } else if (distToPolyline(local, line.pts, tol) <= tol) return true;
      }
      return false;
    }
    default: {
      const rect: Rect = { x: object.x, y: object.y, w: object.w, h: object.h };
      if (object.rotation) {
        const local = shapeWorldToLocal(object, p);
        return rectContainsPoint(rect, local, tolerance);
      }
      return rectContainsPoint(rect, p, tolerance);
    }
  }
}

export function objectsInRect(objects: SceneObject[], rect: Rect): string[] {
  const ids: string[] = [];
  for (const object of objects) {
    if (object.hidden || object.locked) continue;
    if (rectsIntersect(objectAABB(object), rect)) ids.push(object.id);
  }
  return ids;
}

export function objectIntersectsLasso(object: SceneObject, polygon: { x: number; y: number }[]): boolean {
  if (object.hidden || object.locked) return false;
  const box = objectAABB(object);
  if (object.type === "stroke") {
    for (const point of object.points) {
      if (pointInPolygon(point, polygon)) return true;
    }
    const lassoBox = {
      x: Math.min(...polygon.map((p) => p.x)),
      y: Math.min(...polygon.map((p) => p.y)),
      w: Math.max(...polygon.map((p) => p.x)) - Math.min(...polygon.map((p) => p.x)),
      h: Math.max(...polygon.map((p) => p.y)) - Math.min(...polygon.map((p) => p.y))
    };
    return rectsIntersect(box, lassoBox) && rectContains(lassoBox, box);
  }
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h }
  ];
  for (const corner of corners) {
    if (pointInPolygon(corner, polygon)) return true;
  }
  return pointInPolygon({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, polygon) || false;
}

export function pickTopmost(objects: SceneObject[], layers: { id: string; visible: boolean; locked: boolean }[], p: { x: number; y: number }, tolerance = 4): SceneObject | null {
  const layerIndex = new Map(layers.map((l, i) => [l.id, i]));
  const layerInfo = new Map(layers.map((l) => [l.id, l]));
  const sorted = [...objects].sort((a, b) => {
    const la = layerIndex.get(a.layerId) ?? 0;
    const lb = layerIndex.get(b.layerId) ?? 0;
    if (la !== lb) return la - lb;
    return a.z - b.z;
  });
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const object = sorted[i];
    const layer = layerInfo.get(object.layerId);
    if (!layer || !layer.visible) continue;
    if (hitTestObject(object, p, tolerance)) return object;
  }
  return null;
}

export function aabbOfObjects(objects: SceneObject[]): Rect | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const object of objects) {
    const box = objectAABB(object);
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.w > maxX) maxX = box.x + box.w;
    if (box.y + box.h > maxY) maxY = box.y + box.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function rotatedAabbFor(rect: Rect, rotation: number) {
  return rotation ? rectAABB(rect, rotation) : rect;
}
