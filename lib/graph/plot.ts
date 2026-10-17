import type { GraphViewport } from "@/types";
import { compileNumeric, isInequality, type CompiledFunction } from "@/lib/math/mathjs";

export interface SampledSegment {
  pts: { x: number; y: number }[];
}

export interface ShadeRegion {
  upper: CompiledFunction | null;
  lower: CompiledFunction | null;
  kind: "above" | "below";
}

export interface CompiledGraphFunction {
  id: string;
  expression: string;
  normalized: string;
  fn: CompiledFunction | null;
  error: string | null;
  polar: boolean;
  shade: ShadeRegion | null;
}

export function compileGraphFunction(id: string, expression: string, polar: boolean): CompiledGraphFunction {
  const inequality = !polar ? isInequality(expression) : null;
  if (inequality) {
    const leftCompiled = compileNumeric(inequality.left, "x");
    const rightCompiled = compileNumeric(inequality.right, "x");
    const yLeft = /^\s*y\s*$/.test(inequality.left);
    const yRight = /^\s*y\s*$/.test(inequality.right);
    const variant = inequality.kind === "lt" || inequality.kind === "lte" ? "below" : "above";
    if (yLeft && !yRight) {
      return {
        id,
        expression,
        normalized: expression,
        fn: rightCompiled.fn,
        error: rightCompiled.error,
        polar: false,
        shade: { upper: rightCompiled.fn, lower: null, kind: variant }
      };
    }
    if (yRight && !yLeft) {
      return {
        id,
        expression,
        normalized: expression,
        fn: leftCompiled.fn,
        error: leftCompiled.error,
        polar: false,
        shade: { upper: leftCompiled.fn, lower: null, kind: variant }
      };
    }
    const a = leftCompiled;
    const b = rightCompiled;
    return {
      id,
      expression,
      normalized: expression,
      fn: null,
      error: a.error ?? b.error ?? "Unsupported inequality",
      polar: false,
      shade: { upper: a.fn, lower: b.fn, kind: "above" }
    };
  }
  const compiled = compileNumeric(expression, polar ? "theta" : "x");
  return {
    id,
    expression,
    normalized: compiled.normalized,
    fn: compiled.fn,
    error: compiled.error,
    polar,
    shade: null
  };
}

export function sampleCartesian(fn: CompiledFunction, viewport: GraphViewport, samples: number): SampledSegment[] {
  const segments: SampledSegment[] = [];
  let current: { x: number; y: number }[] = [];
  const jumpLimit = (viewport.yMax - viewport.yMin) * 6;
  let prevY: number | null = null;
  const steps = Math.max(120, Math.min(6000, samples));
  for (let i = 0; i <= steps; i += 1) {
    const x = viewport.xMin + ((viewport.xMax - viewport.xMin) * i) / steps;
    let y: number;
    try {
      y = fn(x);
    } catch {
      y = NaN;
    }
    if (!Number.isFinite(y)) {
      if (current.length > 1) segments.push({ pts: current });
      current = [];
      prevY = null;
      continue;
    }
    if (prevY !== null && Math.abs(y - prevY) > jumpLimit) {
      if (current.length > 1) segments.push({ pts: current });
      current = [];
    }
    current.push({ x, y });
    prevY = y;
  }
  if (current.length > 1) segments.push({ pts: current });
  return segments;
}

export function samplePolar(fn: CompiledFunction, thetaMin: number, thetaMax: number, samples: number): SampledSegment[] {
  const segments: SampledSegment[] = [];
  let current: { x: number; y: number }[] = [];
  const steps = Math.max(120, Math.min(6000, samples));
  for (let i = 0; i <= steps; i += 1) {
    const theta = thetaMin + ((thetaMax - thetaMin) * i) / steps;
    let r: number;
    try {
      r = fn(theta);
    } catch {
      r = NaN;
    }
    if (!Number.isFinite(r)) {
      if (current.length > 1) segments.push({ pts: current });
      current = [];
      continue;
    }
    current.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
  }
  if (current.length > 1) segments.push({ pts: current });
  return segments;
}

export function niceStep(range: number, targetDivisions: number): number {
  const rough = range / Math.max(1, targetDivisions);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rough) || 1)));
  const residual = rough / magnitude;
  let step = 1;
  if (residual >= 5) step = 5;
  else if (residual >= 2) step = 2;
  return step * magnitude;
}

export function formatAxisValue(value: number, step: number): string {
  if (Math.abs(value) < step * 1e-6) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4) return value.toExponential(2);
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step)) + (step < 1 ? 0 : 0)));
  return Number(value.toFixed(decimals + 1)).toString();
}

export function worldToGraph(p: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }, viewport: GraphViewport) {
  const gx = viewport.xMin + ((p.x - rect.x) / rect.w) * (viewport.xMax - viewport.xMin);
  const gy = viewport.yMax - ((p.y - rect.y) / rect.h) * (viewport.yMax - viewport.yMin);
  return { x: gx, y: gy };
}

export function graphToWorld(g: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }, viewport: GraphViewport) {
  const px = rect.x + ((g.x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * rect.w;
  const py = rect.y + ((viewport.yMax - g.y) / (viewport.yMax - viewport.yMin)) * rect.h;
  return { x: px, y: py };
}
