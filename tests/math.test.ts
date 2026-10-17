import { describe, expect, it } from "vitest";
import { compileNumeric, isInequality, normalizeExpression, stripAssignment } from "@/lib/math/mathjs";

describe("normalizeExpression", () => {
  it("maps unicode operators to ascii", () => {
    expect(normalizeExpression("2 × 3 ÷ 4 − 1")).toBe("2 * 3 / 4 - 1");
    expect(normalizeExpression("a ≤ b ≥ c ≠ d")).toBe("a <= b >= c != d");
  });

  it("maps symbols", () => {
    expect(normalizeExpression("π")).toBe("pi");
    expect(normalizeExpression("√(16)")).toBe("sqrt(16)");
    expect(normalizeExpression("3² + x³")).toBe("3^2 + x^3");
    expect(normalizeExpression("θ + τ")).toBe("theta + tau");
  });

  it("collapses whitespace", () => {
    expect(normalizeExpression("  1   +   2  ")).toBe("1 + 2");
  });
});

describe("stripAssignment", () => {
  it("strips simple assignments", () => {
    expect(stripAssignment("y = x^2")).toBe("x^2");
    expect(stripAssignment("r=sin(theta)")).toBe("sin(theta)");
    expect(stripAssignment("x^2")).toBe("x^2");
  });

  it("strips function notation assignments", () => {
    expect(stripAssignment("f(x) = x + 1")).toBe("x + 1");
  });
});

describe("isInequality", () => {
  it("parses inequalities", () => {
    expect(isInequality("x < 5")).toEqual({ kind: "lt", left: "x", right: "5" });
    expect(isInequality("x <= 5")).toEqual({ kind: "lte", left: "x", right: "5" });
    expect(isInequality("2x > 1")).toEqual({ kind: "gt", left: "2x", right: "1" });
    expect(isInequality("y >= x")).toEqual({ kind: "gte", left: "y", right: "x" });
  });

  it("returns null for plain expressions", () => {
    expect(isInequality("2x + 1")).toBeNull();
  });
});

describe("compileNumeric", () => {
  it("evaluates expressions with implicit multiplication", () => {
    const result = compileNumeric("2x + 3", "x");
    expect(result.error).toBeNull();
    expect(result.fn?.(4)).toBe(11);
  });

  it("handles functions and powers", () => {
    const square = compileNumeric("x^2", "x");
    expect(square.fn?.(5)).toBe(25);
    const sine = compileNumeric("sin(x)", "x");
    expect(sine.fn?.(Math.PI / 2)).toBeCloseTo(1, 10);
  });

  it("strips assignments before compiling", () => {
    const result = compileNumeric("y = 2x", "x");
    expect(result.error).toBeNull();
    expect(result.fn?.(3)).toBe(6);
  });

  it("reports syntax errors", () => {
    const result = compileNumeric("x +", "x");
    expect(result.fn).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("rejects empty and oversized expressions", () => {
    expect(compileNumeric("", "x").error).toBe("Enter an expression.");
    expect(compileNumeric("1".repeat(501), "x").error).toBe("Expression is too long.");
  });

  it("normalizes before compiling", () => {
    const result = compileNumeric("2 × x", "x");
    expect(result.normalized).toBe("2 * x");
    expect(result.fn?.(3)).toBe(6);
  });
});
