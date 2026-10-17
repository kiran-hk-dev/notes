import type { Layer, Point, ShapeKind, ShapeObject, StrokeObject } from "@/types";
import {
  circularity,
  dist,
  pointsBBox,
  polygonArea,
  rectangularity,
  simplifyPoints,
  straightness
} from "@/lib/drawing/geometry";
import { createShape, defaultShapeStyle } from "@/lib/drawing/factory";

export interface RecognitionResult {
  shape: ShapeKind;
  rect: { x: number; y: number; w: number; h: number };
  confidence: number;
}

function axisAlignedScore(points: Point[], rect: { x: number; y: number; w: number; h: number }) {
  let onEdge = 0;
  const tolerance = Math.max(6, Math.min(rect.w, rect.h) * 0.12);
  for (const p of points) {
    const dLeft = Math.abs(p.x - rect.x);
    const dRight = Math.abs(p.x - (rect.x + rect.w));
    const dTop = Math.abs(p.y - rect.y);
    const dBottom = Math.abs(p.y - (rect.y + rect.h));
    const min = Math.min(dLeft, dRight, dTop, dBottom);
    if (min <= tolerance) onEdge += 1;
  }
  return onEdge / points.length;
}

export function recognizeStroke(stroke: StrokeObject): RecognitionResult | null {
  const points = stroke.points;
  if (points.length < 6) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const box = pointsBBox(points);
  const diagonal = Math.hypot(box.w, box.h);
  if (diagonal < 24) return null;
  const closed = dist(first, last) < diagonal * 0.18;

  const lineScore = straightness(points);
  if (!closed && lineScore > 0.94) {
    return {
      shape: "line",
      rect: { x: first.x, y: first.y, w: last.x - first.x, h: last.y - first.y },
      confidence: lineScore
    };
  }

  if (!closed) return null;

  const rectScore = rectangularity(points);
  const edgeScore = axisAlignedScore(points, box);
  if (rectScore > 0.74 && edgeScore > 0.82) {
    return { shape: "rect", rect: box, confidence: rectScore * edgeScore };
  }

  const circleScore = circularity(points);
  if (circleScore > 0.84 && rectScore < 0.85) {
    return { shape: "ellipse", rect: { x: box.x, y: box.y, w: box.w, h: box.h }, confidence: circleScore };
  }

  const simplified = simplifyPoints(points, diagonal * 0.06);
  const corners = simplified.length - 1;
  if (corners === 3) {
    return { shape: "triangle", rect: box, confidence: 0.7 };
  }
  if (corners === 4 && rectScore > 0.6 && edgeScore < 0.8) {
    return { shape: "diamond", rect: box, confidence: 0.62 };
  }
  if (corners >= 5 && corners <= 7 && polygonArea(points) > 0.55 * box.w * box.h) {
    const sides = Math.min(6, Math.max(5, corners));
    return { shape: sides === 5 ? "pentagon" : "hexagon", rect: box, confidence: 0.55 };
  }
  return null;
}

export function recognizedShapeObject(stroke: StrokeObject, layers: Layer[]): ShapeObject | null {
  const result = recognizeStroke(stroke);
  if (!result || result.confidence < 0.62) return null;
  const style = defaultShapeStyle({
    stroke: stroke.style.color,
    strokeWidth: Math.max(1.4, stroke.style.width),
    fill: null,
    dash: null
  });
  const rect = { x: result.rect.x, y: result.rect.y, w: result.rect.w, h: result.rect.h };
  if (result.shape === "line") {
    rect.w = result.rect.w;
    rect.h = result.rect.h;
  } else {
    rect.w = Math.abs(result.rect.w);
    rect.h = Math.abs(result.rect.h);
  }
  const shape = createShape(result.shape, rect, style, layers);
  shape.z = stroke.z;
  shape.opacity = stroke.opacity;
  shape.groupId = stroke.groupId;
  return shape;
}
