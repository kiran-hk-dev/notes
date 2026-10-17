"use client";

import { useMemo, useRef, useState } from "react";
import { CornerDownLeft, Delete, Trash2 } from "lucide-react";
import { math, compileNumeric, normalizeExpression } from "@/lib/math/mathjs";
import { createText } from "@/lib/drawing/factory";
import { measureTextObject } from "@/lib/drawing/objects";
import { useEditor } from "@/lib/state/editorStore";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useEditorApi } from "@/components/editor/editorContext";

type CalcTab = "scientific" | "units" | "solver" | "matrix";

const TABS: { id: CalcTab; label: string }[] = [
  { id: "scientific", label: "Scientific" },
  { id: "units", label: "Units" },
  { id: "solver", label: "Solver" },
  { id: "matrix", label: "Matrix" }
];

const KEYPAD: string[][] = [
  ["7", "8", "9", "/", "sqrt("],
  ["4", "5", "6", "*", "^"],
  ["1", "2", "3", "-", "pi"],
  ["0", ".", "(", ")", "+"],
  ["e", "ans", ",", "!", "="]
];

const UNIT_GROUPS: { label: string; units: { value: string; label: string }[] }[] = [
  {
    label: "Length",
    units: ["m", "cm", "mm", "km", "inch", "ft", "yd", "mile"].map((unit) => ({ value: unit, label: unit }))
  },
  {
    label: "Mass",
    units: ["g", "kg", "mg", "tonne", "oz", "lb", "stone"].map((unit) => ({ value: unit, label: unit }))
  },
  {
    label: "Volume",
    units: ["L", "mL", "gallon", "quart", "pint", "cup", "fluidounce"].map((unit) => ({ value: unit, label: unit }))
  },
  {
    label: "Temperature",
    units: ["degC", "degF", "K"].map((unit) => ({ value: unit, label: unit }))
  },
  {
    label: "Time",
    units: ["s", "min", "hour", "day", "week", "year"].map((unit) => ({ value: unit, label: unit }))
  },
  {
    label: "Angle",
    units: ["rad", "deg", "grad"].map((unit) => ({ value: unit, label: unit }))
  },
  {
    label: "Speed",
    units: ["m/s", "km/h", "mi/h"].map((unit) => ({ value: unit, label: unit }))
  },
  {
    label: "Digital",
    units: ["bit", "B", "kB", "MB", "GB", "TB"].map((unit) => ({ value: unit, label: unit }))
  }
];

const UNIT_OPTIONS = UNIT_GROUPS.flatMap((group) =>
  group.units.map((unit) => ({ value: unit.value, label: `${unit.label} · ${group.label}` }))
);

function formatValue(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "bigint") return value.toString();
  try {
    return math.format(value as never, { precision: 10 });
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not evaluate that expression.";
}

function useInsertResult() {
  const api = useEditorApi();
  return (content: string) => {
    const engine = api.engine();
    if (!engine) return;
    const style = useEditor.getState().toolState.textStyle;
    const width = 420;
    const height = Math.max(28, measureTextObject(content, style, width));
    const page = engine.getPageSize();
    const object = createText(
      content,
      {
        x: Math.round((page.width - width) / 2),
        y: Math.round((page.height - height) / 2),
        w: width,
        h: height
      },
      style,
      engine.getLayers()
    );
    engine.insertObject(object, "Insert result");
  };
}

function ScientificTab() {
  const insertResult = useInsertResult();
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ expression: string; result: string }[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const evaluate = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const ans = history[0] ? `(${history[0].result})` : "0";
    const prepared = normalizeExpression(trimmed).replace(/\bans\b/g, ans);
    try {
      const value = math.evaluate(prepared);
      const formatted = formatValue(value);
      setResult(formatted);
      setError(null);
      setHistory((current) => [{ expression: trimmed, result: formatted }, ...current].slice(0, 14));
    } catch (caught) {
      setError(errorMessage(caught));
      setResult(null);
    }
  };

  const append = (token: string) => {
    if (token === "=") {
      evaluate(expression);
      return;
    }
    setExpression((current) => current + token);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface-2 p-3">
        <Input
          ref={inputRef}
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") evaluate(expression);
          }}
          placeholder="e.g. 2*sqrt(16) + sin(pi/2)"
          spellCheck={false}
          className="border-none bg-transparent px-1 font-mono text-base"
          aria-label="Expression"
        />
        <div className="mt-1 flex min-h-8 items-center justify-between gap-3 px-1">
          <span className={cn("truncate text-lg font-semibold tabular-nums", error ? "text-danger text-sm font-normal" : "text-ink")}>
            {error ?? result ?? "\u00a0"}
          </span>
          <div className="flex shrink-0 gap-1">
            {result && !error ? (
              <Button size="sm" variant="soft" onClick={() => insertResult(`${expression.trim()} = ${result}`)}>
                Insert into page
              </Button>
            ) : null}
            <Button size="iconSm" variant="ghost" aria-label="Clear" onClick={() => setExpression("")}>
              <Delete />
            </Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {KEYPAD.flat().map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === "=" ? "primary" : "outline"}
            className="font-mono"
            onClick={() => append(key)}
          >
            {key}
          </Button>
        ))}
      </div>
      {history.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">History</span>
            <Button size="iconSm" variant="ghost" aria-label="Clear history" onClick={() => setHistory([])}>
              <Trash2 />
            </Button>
          </div>
          <ul className="ks-scroll flex max-h-44 flex-col gap-0.5 overflow-y-auto">
            {history.map((entry, index) => (
              <li key={`${entry.expression}-${index}`}>
                <button
                  type="button"
                  onClick={() => setExpression(entry.expression)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-3"
                >
                  <span className="truncate font-mono text-xs text-ink-soft">{entry.expression}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">{entry.result}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function UnitsTab() {
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState("inch");
  const [to, setTo] = useState("cm");
  const insertResult = useInsertResult();

  const conversion = useMemo(() => {
    const value = Number(amount);
    if (!Number.isFinite(value)) return { text: null, error: "Enter a number to convert." };
    try {
      const converted = math.evaluate(`${value} ${from} to ${to}`);
      return { text: math.format(converted as never, { precision: 10 }), error: null };
    } catch (caught) {
      return { text: null, error: errorMessage(caught) };
    }
  }, [amount, from, to]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Amount">
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </Field>
        <Field label="From">
          <Select value={from} onValueChange={setFrom} options={UNIT_OPTIONS} />
        </Field>
        <Field label="To">
          <Select value={to} onValueChange={setTo} options={UNIT_OPTIONS} />
        </Field>
        <div className="flex items-end">
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            Swap
          </Button>
        </div>
      </div>
      <div className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4">
        <span className={cn("text-base font-semibold", conversion.error ? "text-sm font-normal text-danger" : "text-ink")}>
          {conversion.error ?? conversion.text}
        </span>
        {conversion.text ? (
          <Button size="sm" variant="soft" onClick={() => insertResult(`${amount} ${from} = ${conversion.text}`)}>
            Insert into page
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SolverTab() {
  const insertResult = useInsertResult();
  const [equation, setEquation] = useState("x^2 - 4 = 0");
  const [variable, setVariable] = useState("x");
  const [rangeMin, setRangeMin] = useState("-50");
  const [rangeMax, setRangeMax] = useState("50");
  const [roots, setRoots] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const solve = () => {
    const min = Number(rangeMin);
    const max = Number(rangeMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      setError("Enter a valid range (min < max).");
      setRoots(null);
      return;
    }
    const parts = equation.split("=");
    const left = parts[0]?.trim();
    const right = parts[1]?.trim();
    if (!left) {
      setError("Enter an equation to solve.");
      setRoots(null);
      return;
    }
    const { fn, error: compileError } = compileNumeric(`${left} - (${right && right.length > 0 ? right : "0"})`, variable);
    if (!fn) {
      setError(compileError ?? "Could not parse that equation.");
      setRoots(null);
      return;
    }
    const samples = 4000;
    const step = (max - min) / samples;
    const found: number[] = [];
    let previousX = min;
    let previousY = fn(previousX);
    if (Number.isFinite(previousY) && Math.abs(previousY) < 1e-9) found.push(previousX);
    for (let i = 1; i <= samples; i += 1) {
      const x = min + i * step;
      const y = fn(x);
      if (Number.isFinite(previousY) && Number.isFinite(y)) {
        if (y === 0 || Math.abs(y) < 1e-9) {
          found.push(x);
        } else if (previousY * y < 0) {
          let a = previousX;
          let b = x;
          for (let iteration = 0; iteration < 90; iteration += 1) {
            const mid = (a + b) / 2;
            const fy = fn(mid);
            if (!Number.isFinite(fy)) break;
            if (fn(a) * fy <= 0) b = mid;
            else a = mid;
          }
          found.push((a + b) / 2);
        }
      }
      previousX = x;
      previousY = y;
    }
    const unique: number[] = [];
    for (const root of found.sort((a, b) => a - b)) {
      const duplicate = unique.some((existing) => Math.abs(existing - root) <= 1e-6 * Math.max(1, Math.abs(root)));
      if (!duplicate) unique.push(root);
    }
    if (unique.length === 0) {
      setError("No solutions found in this range.");
      setRoots(null);
      return;
    }
    setError(null);
    setRoots(unique.slice(0, 12).map((root) => formatNumber(Number(root.toPrecision(12)))));
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Equation" hint="Type an equation with one variable, e.g. 2x + 3 = 7 (implicit multiplication works).">
        <Input
          value={equation}
          onChange={(event) => setEquation(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && solve()}
          spellCheck={false}
          className="font-mono"
        />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Variable">
          <Input value={variable} onChange={(event) => setVariable(event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 1) || "x")} maxLength={1} className="font-mono" />
        </Field>
        <Field label="Range from">
          <Input value={rangeMin} onChange={(event) => setRangeMin(event.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Range to">
          <Input value={rangeMax} onChange={(event) => setRangeMax(event.target.value)} inputMode="decimal" />
        </Field>
      </div>
      <Button variant="primary" className="w-fit" onClick={solve}>
        Solve
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {roots ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Solutions</span>
          <div className="flex flex-wrap items-center gap-2">
            {roots.map((root) => (
              <span key={root} className="rounded-lg bg-surface px-2.5 py-1 font-mono text-sm text-ink shadow-sm">
                {variable} = {root}
              </span>
            ))}
          </div>
          <Button
            size="sm"
            variant="soft"
            className="w-fit"
            onClick={() => insertResult(roots.map((root) => `${variable} = ${root}`).join(",  "))}
          >
            Insert into page
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function parseMatrix(text: string): number[][] | string {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rows.length === 0) return "Matrix is empty.";
  const parsed: number[][] = [];
  for (const row of rows) {
    const cells = row
      .split(/[\s,]+/)
      .filter((cell) => cell.length > 0)
      .map((cell) => Number(cell));
    if (cells.some((cell) => !Number.isFinite(cell))) return `Could not read row "${row}".`;
    parsed.push(cells);
  }
  const width = parsed[0].length;
  if (parsed.some((row) => row.length !== width)) return "All rows must have the same number of values.";
  return parsed;
}

function MatrixTab() {
  const [matrixA, setMatrixA] = useState("1 2\n3 4");
  const [matrixB, setMatrixB] = useState("5 6\n7 8");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (operation: "add" | "subtract" | "multiply" | "transpose" | "det" | "inv") => {
    const a = parseMatrix(matrixA);
    if (typeof a === "string") {
      setError(`Matrix A: ${a}`);
      setResult(null);
      return;
    }
    try {
      if (operation === "add" || operation === "subtract" || operation === "multiply") {
        const b = parseMatrix(matrixB);
        if (typeof b === "string") {
          setError(`Matrix B: ${b}`);
          setResult(null);
          return;
        }
        const value =
          operation === "add"
            ? math.add(a as never, b as never)
            : operation === "subtract"
              ? math.subtract(a as never, b as never)
              : math.multiply(a as never, b as never);
        setResult(formatValue(value));
      } else if (operation === "transpose") {
        setResult(formatValue(math.transpose(a as never)));
      } else if (operation === "det") {
        setResult(formatValue(math.det(a as never)));
      } else {
        setResult(formatValue(math.inv(a as never)));
      }
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
      setResult(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Matrix A" hint="One row per line, values separated by spaces or commas.">
          <Textarea value={matrixA} onChange={(event) => setMatrixA(event.target.value)} rows={4} spellCheck={false} className="font-mono text-xs" />
        </Field>
        <Field label="Matrix B">
          <Textarea value={matrixB} onChange={(event) => setMatrixB(event.target.value)} rows={4} spellCheck={false} className="font-mono text-xs" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => run("add")}>
          A + B
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("subtract")}>
          A − B
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("multiply")}>
          A × B
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("transpose")}>
          Aᵀ
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("det")}>
          det A
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("inv")}>
          A⁻¹
        </Button>
      </div>
      <div className="flex min-h-16 items-center rounded-2xl border border-line bg-surface-2 px-4 py-3">
        <span className={cn("break-all font-mono text-sm", error ? "text-danger" : "text-ink")}>{error ?? result ?? "Result appears here."}</span>
      </div>
    </div>
  );
}

export function CalcDialog() {
  const close = useEditor((state) => state.closeDialog);
  const [tab, setTab] = useState<CalcTab>("scientific");

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CornerDownLeft className="size-4 text-ink-faint" />
            Calculator
          </DialogTitle>
          <DialogDescription>Scientific calculations, unit conversion, equation solving and linear algebra.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5 border-b border-line px-5 py-2">
          {TABS.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={tab === item.id ? "soft" : "ghost"}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <DialogBody>
          {tab === "scientific" ? <ScientificTab /> : null}
          {tab === "units" ? <UnitsTab /> : null}
          {tab === "solver" ? <SolverTab /> : null}
          {tab === "matrix" ? <MatrixTab /> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
