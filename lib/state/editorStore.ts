import { create } from "zustand";
import type { FormulaObject, GraphObject, Notebook, NotebookPage, TableObject, TextObject } from "@/types";
import type { SelectionSummary, ToolState, Viewport } from "@/lib/drawing/engine";
import { defaultShapeStyle, defaultTextStyle } from "@/lib/drawing/factory";
import { defaultStrokeStyle } from "@/lib/defaults";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type RightPanel = "properties" | "layers" | "outline" | "search" | null;

export type EditorDialog =
  | { kind: "formula"; object: FormulaObject | null }
  | { kind: "graph"; object: GraphObject | null }
  | { kind: "table"; object: TableObject | null }
  | { kind: "image"; point: { x: number; y: number } | null }
  | { kind: "text"; object: TextObject | null; point: { x: number; y: number } | null }
  | { kind: "page-settings" }
  | { kind: "export" }
  | { kind: "templates" }
  | { kind: "calc" }
  | null;

export interface StatusMessage {
  id: number;
  message: string;
  kind: "info" | "error";
}

export const EMPTY_SELECTION: SelectionSummary = {
  count: 0,
  types: [],
  bbox: null,
  first: null,
  allLocked: false,
  allSameType: null
};

export function defaultToolState(): ToolState {
  return {
    tool: "pen",
    strokeStyle: defaultStrokeStyle("fountain"),
    shapeKind: "rect",
    shapeStyle: defaultShapeStyle(),
    textStyle: defaultTextStyle(),
    eraserMode: "partial",
    eraserSize: 28
  };
}

interface EditorState {
  notebook: Notebook | null;
  pages: NotebookPage[];
  page: NotebookPage | null;
  activePageId: string | null;
  ready: boolean;
  saveState: SaveState;
  lastSavedAt: number | null;
  selection: string[];
  selectionSummary: SelectionSummary;
  viewport: Viewport;
  pointer: { x: number; y: number } | null;
  toolState: ToolState;
  rulerActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  sidebarOpen: boolean;
  rightPanel: RightPanel;
  dialog: EditorDialog;
  status: StatusMessage | null;
  docVersion: number;
  bumpDoc: () => void;
  setSession: (notebook: Notebook, pages: NotebookPage[], page: NotebookPage | null) => void;
  setPage: (page: NotebookPage | null) => void;
  patchPage: (patch: Partial<NotebookPage>) => void;
  setPages: (pages: NotebookPage[]) => void;
  setActivePageId: (id: string | null) => void;
  setReady: (ready: boolean) => void;
  setSaveState: (state: SaveState, savedAt?: number) => void;
  setSelection: (ids: string[], summary: SelectionSummary) => void;
  setViewport: (viewport: Viewport) => void;
  setPointer: (pointer: { x: number; y: number } | null) => void;
  setToolState: (toolState: ToolState) => void;
  setRulerActive: (active: boolean) => void;
  setHistory: (canUndo: boolean, canRedo: boolean) => void;
  toggleSidebar: (open?: boolean) => void;
  setRightPanel: (panel: RightPanel) => void;
  openDialog: (dialog: EditorDialog) => void;
  closeDialog: () => void;
  pushStatus: (message: string, kind?: "info" | "error") => void;
  clearStatus: (id: number) => void;
  resetEditor: () => void;
}

let statusId = 0;

export const useEditor = create<EditorState>()((set) => ({
  notebook: null,
  pages: [],
  page: null,
  activePageId: null,
  ready: false,
  saveState: "idle",
  lastSavedAt: null,
  selection: [],
  selectionSummary: EMPTY_SELECTION,
  viewport: { scale: 1, tx: 0, ty: 0 },
  pointer: null,
  toolState: defaultToolState(),
  rulerActive: false,
  canUndo: false,
  canRedo: false,
  sidebarOpen: false,
  rightPanel: "properties",
  dialog: null,
  status: null,
  docVersion: 0,
  bumpDoc: () => set((state) => ({ docVersion: state.docVersion + 1 })),
  setSession: (notebook, pages, page) =>
    set({ notebook, pages, page, activePageId: page?.id ?? null, ready: true }),
  setPage: (page) => set({ page, activePageId: page?.id ?? null }),
  patchPage: (patch) => set((state) => (state.page ? { page: { ...state.page, ...patch } } : {})),
  setPages: (pages) => set({ pages }),
  setActivePageId: (id) => set({ activePageId: id }),
  setReady: (ready) => set({ ready }),
  setSaveState: (saveState, savedAt) =>
    set((state) => ({
      saveState,
      lastSavedAt: savedAt ?? (saveState === "saved" ? state.lastSavedAt : state.lastSavedAt)
    })),
  setSelection: (selection, selectionSummary) => set({ selection, selectionSummary }),
  setViewport: (viewport) => set({ viewport }),
  setPointer: (pointer) => set({ pointer }),
  setToolState: (toolState) => set({ toolState }),
  setRulerActive: (rulerActive) => set({ rulerActive }),
  setHistory: (canUndo, canRedo) => set({ canUndo, canRedo }),
  toggleSidebar: (open) => set((state) => ({ sidebarOpen: open ?? !state.sidebarOpen })),
  setRightPanel: (rightPanel) => set({ rightPanel }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  pushStatus: (message, kind = "info") => {
    statusId += 1;
    set({ status: { id: statusId, message, kind } });
  },
  clearStatus: (id) => set((state) => (state.status?.id === id ? { status: null } : {})),
  resetEditor: () =>
    set({
      notebook: null,
      pages: [],
      page: null,
      activePageId: null,
      ready: false,
      saveState: "idle",
      lastSavedAt: null,
      selection: [],
      selectionSummary: EMPTY_SELECTION,
      viewport: { scale: 1, tx: 0, ty: 0 },
      pointer: null,
      toolState: defaultToolState(),
      rulerActive: false,
      canUndo: false,
      canRedo: false,
      rightPanel: "properties",
      dialog: null,
      status: null
    })
}));
