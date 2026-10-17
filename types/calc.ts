export type CalcKind =
  | "expression"
  | "fraction"
  | "percent"
  | "ratio"
  | "unit"
  | "geometry"
  | "trig"
  | "statistics"
  | "matrix"
  | "calculus"
  | "finance"
  | "equation"
  | "formula"
  | "graph";

export interface CalcStep {
  title: string;
  detail: string;
  latex?: string;
}

export interface CalcResult {
  ok: boolean;
  kind: CalcKind;
  input: string;
  interpreted: string;
  latex: string | null;
  result: string;
  unit: string | null;
  steps: CalcStep[];
  assumptions: string[];
  error: string | null;
  approximate: boolean;
}

export interface CalcHistoryEntry {
  id: string;
  kind: CalcKind;
  notebookId: string | null;
  input: string;
  interpreted: string;
  result: string;
  latex: string | null;
  steps: CalcStep[];
  unit: string | null;
  favorite: boolean;
  createdAt: number;
}

export interface FormulaVariable {
  name: string;
  unit: string;
  defaultValue: number | null;
}

export interface SavedFormula {
  id: string;
  name: string;
  latex: string;
  expression: string;
  outputUnit: string | null;
  variables: FormulaVariable[];
  description: string;
  category: string;
}

export interface UnitOption {
  id: string;
  name: string;
  symbol: string;
}

export interface UnitDimension {
  id: string;
  name: string;
  units: UnitOption[];
  baseUnit: string;
}

export interface FinanceTableRow {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}
