import { create, all, type MathJsInstance } from "mathjs";

const instance: MathJsInstance = create(all, {});

const disabled = [
  "import",
  "createUnit",
  "createUnitDependencies",
  "config",
  "typed",
  "reviver",
  "replacer"
];

for (const name of disabled) {
  try {
    instance.import(
      {
        [name]: () => {
          throw new Error(`The "${name}" function is disabled in InkSpace.`);
        }
      },
      { override: true }
    );
  } catch {
    // ignore
  }
}

export const math = instance;

export function normalizeExpression(input: string): string {
  return input
    .replace(/[×✕✖]/g, "*")
    .replace(/[÷∕]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/τ/g, "tau")
    .replace(/θ/g, "theta")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/\s+/g, " ")
    .trim();
}

export type CompiledFunction = (value: number) => number;

export interface CompileResult {
  fn: CompiledFunction | null;
  error: string | null;
  normalized: string;
}

export function compileNumeric(expression: string, variable: string): CompileResult {
  const normalized = normalizeExpression(stripAssignment(expression));
  if (!normalized) return { fn: null, error: "Enter an expression.", normalized };
  if (normalized.length > 500) return { fn: null, error: "Expression is too long.", normalized };
  try {
    const compiled = math.compile(normalized);
    const scope: Record<string, number> = {};
    const fn: CompiledFunction = (value: number) => {
      scope[variable] = value;
      const result = compiled.evaluate(scope);
      const num = typeof result === "number" ? result : Number(result);
      if (typeof num !== "number") throw new Error("Result is not a number");
      return num;
    };
    fn(1);
    return { fn, error: null, normalized };
  } catch (error) {
    return { fn: null, error: error instanceof Error ? error.message : "Invalid expression", normalized };
  }
}

export function stripAssignment(expression: string): string {
  let out = expression.trim();
  out = out.replace(/^\s*[a-zA-Z][a-zA-Z0-9_]*\s*\([^)]*\)\s*=/, "");
  out = out.replace(/^\s*(y|r|f|g|h)\s*=\s*/i, "");
  return out.trim();
}

export function isInequality(expression: string): { kind: "lt" | "lte" | "gt" | "gte"; left: string; right: string } | null {
  const match = /^(.*?)(<=|>=|<|>)(.*)$/.exec(expression.trim());
  if (!match) return null;
  const [, left, op, right] = match;
  const kind = op === "<=" ? "lte" : op === ">=" ? "gte" : op === "<" ? "lt" : "gt";
  return { kind, left: left.trim(), right: right.trim() };
}
