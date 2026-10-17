import { describe, expect, it } from "vitest";
import type { Point } from "@/types";
import { defaultStrokeStyle } from "@/lib/defaults";
import { computeWidths } from "@/lib/drawing/pen";

function points(count: number, pressure: (index: number) => number): Point[] {
  return Array.from({ length: count }, (_, i) => ({ x: i * 10, y: 0, t: i * 8, p: pressure(i) }));
}

describe("computeWidths", () => {
  it("keeps uniform pens flat", () => {
    const style = defaultStrokeStyle("ballpoint");
    const widths = computeWidths(points(40, () => 0.5), style, {});
    expect(widths).toHaveLength(40);
    expect(new Set(widths)).toEqual(new Set([style.width]));
  });

  it("scales brush strokes with pressure", () => {
    const style = defaultStrokeStyle("brush");
    const low = computeWidths(points(60, (i) => 0.2 + i * 0.001), style, {});
    const high = computeWidths(points(60, (i) => 0.9 + i * 0.001), style, {});
    expect(high[30]).toBeGreaterThan(low[30] * 1.5);
  });

  it("tapers fountain strokes at both ends", () => {
    const style = defaultStrokeStyle("fountain");
    const widths = computeWidths(points(60, () => 0.5), style, {});
    expect(widths[0]).toBeLessThan(widths[10]);
    expect(widths[10]).toBeLessThan(widths[30]);
    expect(widths[59]).toBeLessThan(widths[30]);
  });

  it("treats a flat pressure signal as absent", () => {
    const style = defaultStrokeStyle("brush");
    const flat = computeWidths(points(60, () => 0.5), style, {});
    expect(flat[30]).toBeCloseTo(style.width * (0.35 + 0.75 * 0.5), 6);
  });

  it("uses the pen width as the base for highlighters", () => {
    const style = defaultStrokeStyle("highlighter");
    const widths = computeWidths(points(20, () => 0.5), style, {});
    expect(widths.every((w) => w === style.width)).toBe(true);
  });

  it("respects the pressure curve for brush strokes", () => {
    const style = defaultStrokeStyle("brush");
    const pts = points(60, (i) => 0.2 + i * 0.001);
    const soft = computeWidths(pts, style, { pressureCurve: 2 });
    const hard = computeWidths(pts, style, { pressureCurve: 0.5 });
    expect(soft[30]).toBeGreaterThan(hard[30]);
  });
});
