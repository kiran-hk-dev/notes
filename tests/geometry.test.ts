import { describe, expect, it } from "vitest";
import type { Point } from "@/types";
import {
  circularity,
  dist,
  distToSegment,
  expandRect,
  filterByDistance,
  fitLine,
  lerp,
  mulberry32,
  pointInPolygon,
  pointInRotatedRect,
  pointsBBox,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  projectPointOnSegment,
  rectAABB,
  rectContains,
  rectContainsPoint,
  rectangularity,
  rectsIntersect,
  rotatePoint,
  simplifyPoints,
  smoothPoints,
  straightness,
  unionRects
} from "@/lib/drawing/geometry";

function points(xys: [number, number][]): Point[] {
  return xys.map(([x, y], i) => ({ x, y, p: 0.5, t: i * 10 }));
}

describe("dist and lerp", () => {
  it("computes euclidean distance", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("lerps between values", () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(10, 0, 1)).toBe(0);
  });
});

describe("distToSegment / projectPointOnSegment", () => {
  it("measures perpendicular distance", () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("clamps to segment endpoints", () => {
    expect(distToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("projects onto the segment", () => {
    expect(projectPointOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 0 });
    expect(projectPointOnSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("pointsBBox / expandRect / unionRects", () => {
  it("computes bounding boxes", () => {
    expect(pointsBBox([{ x: 5, y: 8 }, { x: -2, y: 3 }, { x: 10, y: -4 }])).toEqual({ x: -2, y: -4, w: 12, h: 12 });
    expect(pointsBBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("expands rects and unions them", () => {
    expect(expandRect({ x: 10, y: 20, w: 100, h: 50 }, 5)).toEqual({ x: 5, y: 15, w: 110, h: 60 });
    expect(unionRects([{ x: 10, y: 20, w: 100, h: 50 }, { x: 200, y: 0, w: 10, h: 10 }])).toEqual({
      x: 10,
      y: 0,
      w: 200,
      h: 70
    });
    expect(unionRects([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("rect predicates", () => {
  const rect = { x: 10, y: 20, w: 100, h: 50 };

  it("detects intersections including touching edges", () => {
    expect(rectsIntersect(rect, { x: 100, y: 60, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect(rect, { x: 111, y: 20, w: 10, h: 10 })).toBe(false);
  });

  it("detects containment", () => {
    expect(rectContains(rect, { x: 20, y: 30, w: 10, h: 10 })).toBe(true);
    expect(rectContains(rect, { x: 20, y: 30, w: 100, h: 10 })).toBe(false);
  });

  it("detects points with padding", () => {
    expect(rectContainsPoint(rect, { x: 10, y: 20 })).toBe(true);
    expect(rectContainsPoint(rect, { x: 9.5, y: 20 })).toBe(false);
    expect(rectContainsPoint(rect, { x: 9.5, y: 20 }, 1)).toBe(true);
  });
});

describe("rotation helpers", () => {
  it("rotates points around an origin", () => {
    const rotated = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0, 10);
    expect(rotated.y).toBeCloseTo(10, 10);
  });

  it("computes the axis-aligned box of a rotated rect", () => {
    const box = rectAABB({ x: -10, y: -10, w: 20, h: 20 }, Math.PI / 4);
    expect(box.x).toBeCloseTo(-Math.SQRT2 * 10, 6);
    expect(box.w).toBeCloseTo(Math.SQRT2 * 20, 6);
  });

  it("tests points in rotated rects", () => {
    const rect = { x: -10, y: -10, w: 20, h: 10 };
    expect(pointInRotatedRect({ x: 0, y: -14 }, rect, Math.PI / 2)).toBe(true);
    expect(pointInRotatedRect({ x: 0, y: -14 }, rect, 0)).toBe(false);
    expect(pointInRotatedRect({ x: 0, y: -5 }, rect, 0)).toBe(true);
  });
});

describe("polygon helpers", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ];

  it("measures area, centroid and perimeter", () => {
    expect(polygonArea(square)).toBe(100);
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
    expect(polygonPerimeter(square)).toBe(40);
  });

  it("tests point in polygon", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });
});

describe("fitLine", () => {
  it("fits a sloped line", () => {
    const line = fitLine([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 }
    ]);
    expect(line.slope).toBeCloseTo(2, 10);
    expect(line.intercept).toBeCloseTo(1, 10);
  });

  it("returns an infinite slope for vertical lines", () => {
    const line = fitLine([
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 5, y: 9 }
    ]);
    expect(line.slope).toBe(Infinity);
  });
});

describe("stroke scores", () => {
  it("scores straight strokes near 1", () => {
    const line = points([[0, 0], [10, 0], [20, 0], [30, 0]]);
    expect(straightness(line)).toBe(1);
  });

  it("scores deviation lower", () => {
    const bent = points([[0, 0], [50, 2], [100, 0]]);
    expect(straightness(bent)).toBeCloseTo(1 - 2 / 15, 6);
  });

  it("scores circles higher than squares on circularity", () => {
    const circle: Point[] = Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      return { x: 100 + Math.cos(angle) * 50, y: 100 + Math.sin(angle) * 50, p: 0.5, t: i * 10 };
    });
    expect(circularity(circle)).toBeGreaterThan(0.999);
  });

  it("scores outlines on rectangularity", () => {
    const outline = points([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]);
    expect(rectangularity(outline)).toBeCloseTo(1, 6);
  });
});

describe("simplifyPoints / filterByDistance / smoothPoints", () => {
  it("collapses collinear runs to endpoints", () => {
    const line = points(Array.from({ length: 20 }, (_, i) => [i * 10, 0] as [number, number]));
    expect(simplifyPoints(line, 1)).toHaveLength(2);
  });

  it("keeps meaningful corners", () => {
    const corner = points([[0, 0], [50, 0], [100, 0], [100, 50], [100, 100]]);
    const simplified = simplifyPoints(corner, 1);
    expect(simplified).toHaveLength(3);
  });

  it("filters points by spacing", () => {
    const filtered = filterByDistance(points([[0, 0], [1, 1], [10, 0]]), 5);
    expect(filtered).toHaveLength(2);
    expect(filtered[1]).toEqual({ x: 10, y: 0, p: 0.5, t: 20 });
  });

  it("smooths without changing point count", () => {
    const jagged = points([[0, 0], [10, 10], [20, 0], [30, 10], [40, 0]]);
    const smoothed = smoothPoints(jagged, 0.5);
    expect(smoothed).toHaveLength(5);
    expect(smoothed[1].y).toBeLessThan(10);
  });
});

describe("mulberry32", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = [a(), a(), a()];
    const second = [b(), b(), b()];
    expect(first).toEqual(second);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("differs across seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});
