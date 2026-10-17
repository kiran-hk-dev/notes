import { describe, expect, it } from "vitest";
import type { Point } from "@/types";
import { defaultLayers, defaultStrokeStyle } from "@/lib/defaults";
import { createStroke } from "@/lib/drawing/factory";
import { recognizeStroke } from "@/lib/drawing/recognize";

const layers = defaultLayers();

function strokeOf(points: [number, number][]) {
  const pts: Point[] = points.map(([x, y], i) => ({ x, y, p: 0.5, t: i * 10 }));
  return createStroke(pts, defaultStrokeStyle("ballpoint"), layers);
}

function linePoints(from: [number, number], to: [number, number], count: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  });
}

function circlePoints(radius: (angle: number) => number, samples: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < samples; i += 1) {
    const angle = (i / samples) * Math.PI * 2;
    const r = radius(angle);
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }
  pts.push(pts[0]);
  return pts;
}

describe("recognizeStroke", () => {
  it("detects straight lines", () => {
    const result = recognizeStroke(strokeOf(linePoints([0, 0], [200, 0], 21)));
    expect(result?.shape).toBe("line");
    expect(result?.confidence).toBeGreaterThan(0.94);
  });

  it("rejects strokes that are too short", () => {
    expect(recognizeStroke(strokeOf([[0, 0], [5, 0], [10, 0]]))).toBeNull();
    expect(recognizeStroke(strokeOf(linePoints([0, 0], [18, 0], 8)))).toBeNull();
  });

  it("detects axis-aligned rectangles", () => {
    const perimeter: [number, number][] = [
      ...linePoints([0, 0], [200, 0], 21),
      ...linePoints([200, 10], [200, 120], 12),
      ...linePoints([190, 120], [0, 120], 20),
      ...linePoints([0, 110], [0, 0], 12)
    ];
    const result = recognizeStroke(strokeOf(perimeter));
    expect(result?.shape).toBe("rect");
  });

  it("detects hand-drawn circles as ellipses", () => {
    const wobbly = circlePoints((angle) => 100 + 20 * Math.sin(2 * angle), 36);
    const result = recognizeStroke(strokeOf(wobbly));
    expect(result?.shape).toBe("ellipse");
    expect(result?.confidence).toBeGreaterThan(0.84);
  });

  it("detects triangles", () => {
    const triangle: [number, number][] = [
      [0, 0],
      [60, 0],
      [150, 0],
      [200, 0],
      [100, 100],
      [0, 200],
      [0, 100],
      [0, 40],
      [0, 0]
    ];
    const result = recognizeStroke(strokeOf(triangle));
    expect(result?.shape).toBe("triangle");
  });

  it("returns null for open squiggles", () => {
    const squiggle: [number, number][] = Array.from({ length: 30 }, (_, i) => [i * 8, Math.sin(i / 2) * 40]);
    const result = recognizeStroke(strokeOf(squiggle));
    expect(result === null || result.shape === "line").toBe(true);
  });
});
