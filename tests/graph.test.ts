import { describe, expect, it } from "vitest";
import {
  compileGraphFunction,
  formatAxisValue,
  graphToWorld,
  niceStep,
  sampleCartesian,
  samplePolar,
  worldToGraph
} from "@/lib/graph/plot";
import { compileNumeric } from "@/lib/math/mathjs";

describe("niceStep", () => {
  it("snaps to 1/2/5 decade steps", () => {
    expect(niceStep(100, 10)).toBe(10);
    expect(niceStep(95, 10)).toBe(5);
    expect(niceStep(3, 10)).toBeCloseTo(0.2, 10);
    expect(niceStep(2000, 8)).toBe(200);
  });
});

describe("formatAxisValue", () => {
  it("trims values cleanly", () => {
    expect(formatAxisValue(0, 1)).toBe("0");
    expect(formatAxisValue(2.5, 0.5)).toBe("2.5");
    expect(formatAxisValue(-3, 1)).toBe("-3");
  });

  it("uses exponential for extreme magnitudes", () => {
    expect(formatAxisValue(1000000, 100000)).toBe("1.00e+6");
    expect(formatAxisValue(0.00001, 0.00001)).toBe("1.00e-5");
  });
});

describe("worldToGraph / graphToWorld", () => {
  const rect = { x: 100, y: 50, w: 200, h: 100 };
  const viewport = { xMin: -10, xMax: 10, yMin: -5, yMax: 5 };

  it("maps corners to viewport extremes", () => {
    expect(worldToGraph({ x: 100, y: 50 }, rect, viewport)).toEqual({ x: -10, y: 5 });
    expect(worldToGraph({ x: 300, y: 150 }, rect, viewport)).toEqual({ x: 10, y: -5 });
  });

  it("round-trips the origin", () => {
    const world = graphToWorld({ x: 0, y: 0 }, rect, viewport);
    expect(world).toEqual({ x: 200, y: 100 });
    const back = worldToGraph(world, rect, viewport);
    expect(back.x).toBeCloseTo(0, 10);
    expect(back.y).toBeCloseTo(0, 10);
  });
});

describe("sampleCartesian", () => {
  it("samples continuous functions in one segment", () => {
    const fn = compileNumeric("x^2", "x").fn!;
    const segments = sampleCartesian(fn, { xMin: -2, xMax: 2, yMin: -2, yMax: 4 }, 240);
    expect(segments).toHaveLength(1);
    expect(segments[0].pts).toHaveLength(241);
    expect(segments[0].pts[0].x).toBe(-2);
    expect(segments[0].pts[0].y).toBe(4);
  });

  it("splits around discontinuities", () => {
    const fn = compileNumeric("1/x", "x").fn!;
    const segments = sampleCartesian(fn, { xMin: -1, xMax: 1, yMin: -10, yMax: 10 }, 240);
    expect(segments).toHaveLength(2);
    expect(segments[0].pts[0].y).toBeLessThan(0);
    expect(segments[1].pts[0].y).toBeGreaterThan(0);
  });
});

describe("samplePolar", () => {
  it("produces points at the right radius", () => {
    const fn = () => 2;
    const segments = samplePolar(fn, 0, Math.PI * 2, 240);
    expect(segments).toHaveLength(1);
    expect(segments[0].pts).toHaveLength(241);
    for (const p of segments[0].pts) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(2, 10);
    }
  });
});

describe("compileGraphFunction", () => {
  it("compiles plain cartesian functions", () => {
    const compiled = compileGraphFunction("f1", "sin(x)", false);
    expect(compiled.error).toBeNull();
    expect(compiled.fn?.(0)).toBeCloseTo(0, 10);
    expect(compiled.polar).toBe(false);
  });

  it("compiles polar functions against theta", () => {
    const compiled = compileGraphFunction("f2", "theta", true);
    expect(compiled.error).toBeNull();
    expect(compiled.fn?.(2)).toBe(2);
    expect(compiled.polar).toBe(true);
  });

  it("interprets y-inequalities as shading", () => {
    const below = compileGraphFunction("f3", "y < x + 1", false);
    expect(below.shade?.kind).toBe("below");
    expect(below.fn?.(2)).toBe(3);
    const above = compileGraphFunction("f4", "y >= x", false);
    expect(above.shade?.kind).toBe("above");
  });

  it("flags non-y inequalities as unsupported", () => {
    const compiled = compileGraphFunction("f5", "x >= 2", false);
    expect(compiled.fn).toBeNull();
    expect(compiled.error).toBe("Unsupported inequality");
    expect(compiled.shade?.kind).toBe("above");
  });
});
