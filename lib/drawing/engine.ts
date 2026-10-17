import type {
  FormulaObject,
  GraphObject,
  Layer,
  NotebookPage,
  ObjectType,
  PageBackground,
  Point,
  Rect,
  RectObject,
  SceneObject,
  ShapeKind,
  ShapeObject,
  ShapeStyle,
  StrokeObject,
  StrokeStyle,
  TableObject,
  TextObject,
  TextStyle
} from "@/types";
import { clamp, deepClone, nextSortOrder, uid } from "@/lib/utils";
import { createShape, createStroke } from "@/lib/drawing/factory";
import { dist, pointsBBox, projectPointOnSegment, rectCorners, rotatePoint } from "@/lib/drawing/geometry";
import { SpatialIndex, aabbOfObjects, hitTestObject, objectAABB, objectIntersectsLasso, objectsInRect, pickTopmost } from "@/lib/drawing/hit";
import { renderPageBackground } from "@/lib/drawing/paper";
import { renderObjectsToContext, renderSceneObject, type RenderAssets } from "@/lib/drawing/objects";
import { recognizedShapeObject } from "@/lib/drawing/recognize";
import { get2d } from "@/lib/drawing/canvas";

export type ToolId =
  | "select"
  | "lasso"
  | "hand"
  | "pen"
  | "eraser"
  | "shape"
  | "text"
  | "image"
  | "formula"
  | "graph"
  | "table"
  | "ruler"
  | "laser";

export type EraserMode = "stroke" | "partial" | "object";

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export interface EnginePrefs {
  pressureCurve: number;
  recognizeShapes: boolean;
  gridSnap: number | null;
  showPageBounds: boolean;
  infiniteCanvas: boolean;
}

export interface ToolState {
  tool: ToolId;
  strokeStyle: StrokeStyle;
  shapeKind: ShapeKind;
  shapeStyle: ShapeStyle;
  textStyle: TextStyle;
  eraserMode: EraserMode;
  eraserSize: number;
}

export type EditorRequest =
  | { type: "edit-text"; object: TextObject | null; point: { x: number; y: number } }
  | { type: "insert-image"; point: { x: number; y: number } }
  | { type: "edit-formula"; object: FormulaObject }
  | { type: "edit-graph"; object: GraphObject }
  | { type: "edit-table"; object: TableObject };

export interface EngineCallbacks {
  onChange: () => void;
  onSelectionChange: (ids: string[]) => void;
  onViewportChange: (viewport: Viewport) => void;
  onToolChange: (tool: ToolState) => void;
  onPointer: (p: { x: number; y: number } | null) => void;
  onRequest: (request: EditorRequest) => void;
  onStatus: (message: string, kind?: "info" | "error") => void;
}

export interface SelectionSummary {
  count: number;
  types: ObjectType[];
  bbox: Rect | null;
  first: SceneObject | null;
  allLocked: boolean;
  allSameType: ObjectType | null;
}

interface HistoryEntry {
  label: string;
  before: { id: string; object: SceneObject | null }[];
  after: { id: string; object: SceneObject | null }[];
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";

type InteractionMode =
  | { kind: "idle" }
  | { kind: "draw-stroke"; stroke: StrokeObject }
  | { kind: "erase" }
  | { kind: "shape-draw"; start: { x: number; y: number }; preview: ShapeObject }
  | { kind: "move"; startPage: { x: number; y: number }; originals: SceneObject[]; moved: boolean }
  | { kind: "resize"; handle: HandleId; startPage: { x: number; y: number }; originals: SceneObject[]; box: Rect; rotation: number; center: { x: number; y: number } }
  | { kind: "rotate"; startAngle: number; center: { x: number; y: number }; originals: SceneObject[] }
  | { kind: "marquee"; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: "lasso"; pts: { x: number; y: number }[] }
  | { kind: "pan"; lastScreen: { x: number; y: number } }
  | { kind: "ruler-drag"; grabOffset: { x: number; y: number } }
  | { kind: "ruler-rotate" }
  | { kind: "laser" }
  | { kind: "pinch" };

export interface RulerState {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  length: number;
}

interface PointerTrack {
  id: number;
  type: string;
  screen: { x: number; y: number };
}

const HANDLE_SIZE = 9;
const ROTATE_OFFSET = 26;
const MIN_SCALE = 0.1;
const MAX_SCALE = 12;

function rotationOf(object: SceneObject): number {
  return "rotation" in object ? object.rotation : 0;
}

function hasOwnRect(object: SceneObject): object is RectObject {
  return object.type !== "stroke";
}

function transformKey(object: SceneObject): string {
  if (!hasOwnRect(object)) return `${object.updatedAt}`;
  return `${object.x}|${object.y}|${object.w}|${object.h}|${object.rotation}`;
}

export class DrawingEngine {
  private host: HTMLElement;
  private staticCanvas: HTMLCanvasElement;
  private liveCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private resizeObserver: ResizeObserver;
  private callbacks: EngineCallbacks;
  private getPrefs: () => EnginePrefs;
  private assets: RenderAssets;

  private objects: SceneObject[] = [];
  private layers: Layer[] = [];
  private pageId: string | null = null;
  private notebookId: string | null = null;
  private pageWidth = 794;
  private pageHeight = 1123;
  private background: PageBackground | null = null;
  private pageRevision = 1;

  private index = new SpatialIndex();
  private selection = new Set<string>();
  private viewport: Viewport = { scale: 1, tx: 0, ty: 0 };
  private toolState: ToolState;
  private mode: InteractionMode = { kind: "idle" };
  private previewMap = new Map<string, SceneObject>();
  private batch: Map<string, { before: SceneObject | null; after: SceneObject | null }> | null = null;

  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private clipboard: SceneObject[] = [];

  private pointers = new Map<number, PointerTrack>();
  private pinchStart: { distance: number; scale: number; center: { x: number; y: number }; viewport: Viewport } | null = null;
  private lastPointerEmit = 0;

  private laserPoints: { x: number; y: number; t: number }[] = [];
  private eraserPos: { x: number; y: number } | null = null;
  private ruler: RulerState = { active: false, x: 120, y: 400, angle: 0, length: 520 };

  private dpr = 1;
  private viewWidth = 1;
  private viewHeight = 1;

  private staticDirty = true;
  private liveDirty = true;
  private overlayDirty = true;
  private rafHandle: number | null = null;
  private destroyed = false;

  constructor(
    host: HTMLElement,
    callbacks: EngineCallbacks,
    getPrefs: () => EnginePrefs,
    toolState: ToolState,
    assets: RenderAssets
  ) {
    this.host = host;
    this.callbacks = callbacks;
    this.getPrefs = getPrefs;
    this.toolState = toolState;
    this.assets = assets;

    this.staticCanvas = document.createElement("canvas");
    this.liveCanvas = document.createElement("canvas");
    this.overlayCanvas = document.createElement("canvas");
    for (const canvas of [this.staticCanvas, this.liveCanvas, this.overlayCanvas]) {
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.touchAction = "none";
      canvas.setAttribute("aria-hidden", "true");
      host.appendChild(canvas);
    }
    this.overlayCanvas.style.pointerEvents = "none";
    this.staticCtx = get2d(this.staticCanvas);
    this.liveCtx = get2d(this.liveCanvas);
    this.overlayCtx = get2d(this.overlayCanvas);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.attachEvents();
    this.updateCursor();
    this.loop();
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.detachEvents();
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    for (const canvas of [this.staticCanvas, this.liveCanvas, this.overlayCanvas]) canvas.remove();
  }

  setAssets(assets: RenderAssets) {
    this.assets = assets;
    this.invalidate();
  }

  loadPage(page: NotebookPage, opts: { keepViewport?: boolean } = {}) {
    this.pageId = page.id;
    this.notebookId = page.notebookId;
    this.pageWidth = page.width;
    this.pageHeight = page.height;
    this.background = deepClone(page.background);
    this.objects = page.objects.map((o) => deepClone(o));
    this.layers = page.layers.map((l) => deepClone(l));
    this.pageRevision = page.revision;
    this.selection.clear();
    this.previewMap.clear();
    this.past = [];
    this.future = [];
    this.mode = { kind: "idle" };
    this.rebuildIndex();
    if (!opts.keepViewport) this.fitToPage();
    this.emitSelection();
    this.invalidate();
  }

  setPageMeta(meta: { width: number; height: number; background: PageBackground }) {
    this.pageWidth = meta.width;
    this.pageHeight = meta.height;
    this.background = deepClone(meta.background);
    this.invalidate();
  }

  setLayers(layers: Layer[]) {
    this.layers = layers.map((l) => deepClone(l));
    this.invalidate();
  }

  getLayers(): Layer[] {
    return deepClone(this.layers);
  }

  getPageId() {
    return this.pageId;
  }

  getNotebookId() {
    return this.notebookId;
  }

  getPageRevision() {
    return this.pageRevision;
  }

  getPageSize() {
    return { width: this.pageWidth, height: this.pageHeight };
  }

  getBackground(): PageBackground | null {
    return this.background ? deepClone(this.background) : null;
  }

  getObjects(): SceneObject[] {
    return this.objects;
  }

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  getToolState(): ToolState {
    return deepClone(this.toolState);
  }

  getRuler(): RulerState {
    return { ...this.ruler };
  }

  getSelectedIds(): string[] {
    return [...this.selection];
  }

  getSelectedObjects(): SceneObject[] {
    return this.objects.filter((o) => this.selection.has(o.id));
  }

  getSelectionSummary(): SelectionSummary {
    const selected = this.getSelectedObjects();
    const bbox = aabbOfObjects(selected);
    const types = [...new Set(selected.map((o) => o.type))];
    return {
      count: selected.length,
      types,
      bbox,
      first: selected[0] ?? null,
      allLocked: selected.length > 0 && selected.every((o) => o.locked),
      allSameType: types.length === 1 ? types[0] : null
    };
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  private resize() {
    const rect = this.host.getBoundingClientRect();
    this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.viewWidth = Math.max(1, Math.floor(rect.width));
    this.viewHeight = Math.max(1, Math.floor(rect.height));
    for (const canvas of [this.staticCanvas, this.liveCanvas, this.overlayCanvas]) {
      canvas.width = Math.floor(this.viewWidth * this.dpr);
      canvas.height = Math.floor(this.viewHeight * this.dpr);
    }
    this.invalidate();
  }

  private attachEvents() {
    this.host.addEventListener("pointerdown", this.onPointerDown);
    this.host.addEventListener("pointermove", this.onPointerMove);
    this.host.addEventListener("pointerup", this.onPointerUp);
    this.host.addEventListener("pointercancel", this.onPointerUp);
    this.host.addEventListener("wheel", this.onWheel, { passive: false });
    this.host.addEventListener("dblclick", this.onDoubleClick);
    this.host.addEventListener("contextmenu", this.onContextMenu);
  }

  private detachEvents() {
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    this.host.removeEventListener("pointermove", this.onPointerMove);
    this.host.removeEventListener("pointerup", this.onPointerUp);
    this.host.removeEventListener("pointercancel", this.onPointerUp);
    this.host.removeEventListener("wheel", this.onWheel);
    this.host.removeEventListener("dblclick", this.onDoubleClick);
    this.host.removeEventListener("contextmenu", this.onContextMenu);
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private screenToPage(screen: { x: number; y: number }) {
    return this.screenToPageAt(screen, this.viewport);
  }

  private screenToPageAt(screen: { x: number; y: number }, viewport: Viewport) {
    return { x: (screen.x - viewport.tx) / viewport.scale, y: (screen.y - viewport.ty) / viewport.scale };
  }

  private eventScreen(e: { clientX: number; clientY: number }) {
    const rect = this.host.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private eventPage(e: { clientX: number; clientY: number }) {
    return this.screenToPage(this.eventScreen(e));
  }

  private onPointerDown = (e: PointerEvent) => {
    const screen = this.eventScreen(e);
    if (e.button === 1) {
      e.preventDefault();
      this.host.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { id: e.pointerId, type: e.pointerType, screen });
      this.mode = { kind: "pan", lastScreen: screen };
      return;
    }
    if (e.button !== 0) return;
    this.pointers.set(e.pointerId, { id: e.pointerId, type: e.pointerType, screen });
    this.host.setPointerCapture(e.pointerId);

    if (this.pointers.size === 2) {
      this.beginPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    const page = this.screenToPage(screen);
    const tool = this.toolState.tool;

    if (tool === "hand") {
      this.mode = { kind: "pan", lastScreen: screen };
      return;
    }
    if (tool === "select") {
      this.beginSelectInteraction(page, e.shiftKey || e.metaKey || e.ctrlKey);
      return;
    }
    if (tool === "lasso") {
      this.mode = { kind: "lasso", pts: [page] };
      this.overlayDirty = true;
      return;
    }
    if (tool === "pen") {
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const stroke = createStroke(
        [{ x: page.x, y: page.y, p: pressure, t: performance.now() }],
        this.toolState.strokeStyle,
        this.layers
      );
      this.mode = { kind: "draw-stroke", stroke };
      this.liveDirty = true;
      return;
    }
    if (tool === "eraser") {
      this.beginBatch();
      this.mode = { kind: "erase" };
      this.eraserPos = page;
      this.eraseAt(page);
      this.liveDirty = true;
      return;
    }
    if (tool === "shape") {
      const preview = createShape(
        this.toolState.shapeKind,
        { x: page.x, y: page.y, w: 0, h: 0 },
        this.toolState.shapeStyle,
        this.layers
      );
      if (this.toolState.shapeKind === "freeform") preview.points = [];
      this.mode = { kind: "shape-draw", start: page, preview };
      this.liveDirty = true;
      return;
    }
    if (tool === "text") {
      this.callbacks.onRequest({ type: "edit-text", object: null, point: page });
      return;
    }
    if (tool === "image") {
      this.callbacks.onRequest({ type: "insert-image", point: page });
      return;
    }
    if (tool === "ruler") {
      const handler = this.rulerHitTest(page);
      if (handler === "edge") {
        this.mode = { kind: "ruler-drag", grabOffset: { x: page.x - this.ruler.x, y: page.y - this.ruler.y } };
      } else if (handler === "end") {
        this.mode = { kind: "ruler-rotate" };
      }
      this.overlayDirty = true;
      return;
    }
    if (tool === "laser") {
      this.mode = { kind: "laser" };
      this.laserPoints = [{ x: page.x, y: page.y, t: performance.now() }];
      this.overlayDirty = true;
      return;
    }
  };

  private beginPinch() {
    if (this.mode.kind === "draw-stroke" || this.mode.kind === "shape-draw") {
      this.mode = { kind: "idle" };
      this.liveDirty = true;
    }
    if (this.mode.kind === "erase") {
      this.endBatch("Erase");
      this.eraserPos = null;
    }
    const [a, b] = [...this.pointers.values()];
    const distance = Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y);
    const center = { x: (a.screen.x + b.screen.x) / 2, y: (a.screen.y + b.screen.y) / 2 };
    this.pinchStart = { distance, scale: this.viewport.scale, center, viewport: { ...this.viewport } };
    this.mode = { kind: "pinch" };
  }

  private onPointerMove = (e: PointerEvent) => {
    const screen = this.eventScreen(e);
    const track = this.pointers.get(e.pointerId);
    if (track) track.screen = screen;

    if (this.mode.kind === "pinch" && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      if (a && b) {
        const distance = Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y);
        const center = { x: (a.screen.x + b.screen.x) / 2, y: (a.screen.y + b.screen.y) / 2 };
        const factor = distance / Math.max(1, this.pinchStart.distance);
        const newScale = clamp(this.pinchStart.scale * factor, MIN_SCALE, MAX_SCALE);
        const pageOrigin = this.screenToPageAt(this.pinchStart.center, this.pinchStart.viewport);
        this.viewport.scale = newScale;
        this.viewport.tx = center.x - pageOrigin.x * newScale;
        this.viewport.ty = center.y - pageOrigin.y * newScale;
        this.callbacks.onViewportChange(this.getViewport());
        this.invalidate();
      }
      return;
    }

    const page = this.screenToPage(screen);
    if (this.mode.kind !== "pan" && this.mode.kind !== "pinch") {
      const nowMs = performance.now();
      if (nowMs - this.lastPointerEmit > 60) {
        this.lastPointerEmit = nowMs;
        this.callbacks.onPointer(page);
      }
    }

    switch (this.mode.kind) {
      case "pan": {
        const dx = screen.x - this.mode.lastScreen.x;
        const dy = screen.y - this.mode.lastScreen.y;
        this.mode.lastScreen = screen;
        this.viewport.tx += dx;
        this.viewport.ty += dy;
        this.callbacks.onViewportChange(this.getViewport());
        this.invalidate();
        return;
      }
      case "draw-stroke": {
        const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
        let changed = false;
        for (const ev of events) {
          const p = this.eventPage(ev);
          const pressure = ev.pressure > 0 ? ev.pressure : 0.5;
          let point: Point = { x: p.x, y: p.y, p: pressure, t: performance.now() };
          if (this.ruler.active) point = this.constrainToRuler(point);
          const last = this.mode.stroke.points[this.mode.stroke.points.length - 1];
          if (last && dist(last, point) < 0.8) continue;
          this.mode.stroke.points.push(point);
          changed = true;
        }
        if (changed && this.mode.stroke.points.length > 4000) {
          const stroke = this.mode.stroke;
          this.mode = { kind: "idle" };
          this.commitStroke(stroke);
        }
        if (changed) this.liveDirty = true;
        return;
      }
      case "erase": {
        this.eraserPos = page;
        this.eraseAt(page);
        this.liveDirty = true;
        return;
      }
      case "shape-draw": {
        const preview = this.mode.preview;
        if (preview.shape === "freeform") {
          const points = preview.points ?? (preview.points = []);
          points.push({ x: page.x, y: page.y, p: 0.5, t: performance.now() });
          this.liveDirty = true;
          return;
        }
        const prefs = this.getPrefs();
        let end = page;
        if (prefs.gridSnap) {
          end = { x: Math.round(page.x / prefs.gridSnap) * prefs.gridSnap, y: Math.round(page.y / prefs.gridSnap) * prefs.gridSnap };
        }
        preview.w = end.x - this.mode.start.x;
        preview.h = end.y - this.mode.start.y;
        this.liveDirty = true;
        return;
      }
      case "move": {
        const dx = page.x - this.mode.startPage.x;
        const dy = page.y - this.mode.startPage.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this.mode.moved = true;
        const snapped = this.snapDelta(dx, dy, this.mode.originals);
        for (const original of this.mode.originals) {
          this.previewMap.set(original.id, translateObject(original, snapped.dx, snapped.dy));
        }
        this.overlayDirty = true;
        this.staticDirty = true;
        return;
      }
      case "resize": {
        this.applyResize(page);
        return;
      }
      case "rotate": {
        const center = this.mode.center;
        const angle = Math.atan2(page.y - center.y, page.x - center.x);
        let delta = angle - this.mode.startAngle;
        if (this.ruler.active) delta = Math.round(delta / (Math.PI / 36)) * (Math.PI / 36);
        for (const original of this.mode.originals) {
          this.previewMap.set(original.id, rotateObjectAround(original, center, delta));
        }
        this.overlayDirty = true;
        this.staticDirty = true;
        return;
      }
      case "marquee": {
        this.mode.current = page;
        this.overlayDirty = true;
        return;
      }
      case "lasso": {
        const pts = this.mode.pts;
        const last = pts[pts.length - 1];
        if (!last || dist(last, page) > 3) pts.push(page);
        this.overlayDirty = true;
        return;
      }
      case "ruler-drag": {
        this.ruler.x = page.x - this.mode.grabOffset.x;
        this.ruler.y = page.y - this.mode.grabOffset.y;
        this.overlayDirty = true;
        this.liveDirty = true;
        return;
      }
      case "ruler-rotate": {
        const endX = this.ruler.x + Math.cos(this.ruler.angle) * this.ruler.length;
        const endY = this.ruler.y + Math.sin(this.ruler.angle) * this.ruler.length;
        const distanceFromEnd = Math.hypot(page.x - endX, page.y - endY);
        if (distanceFromEnd > 60) {
          this.ruler.length = Math.max(160, Math.hypot(page.x - this.ruler.x, page.y - this.ruler.y));
        }
        const angle = Math.atan2(page.y - this.ruler.y, page.x - this.ruler.x);
        this.ruler.angle = Math.round(angle / (Math.PI / 36)) * (Math.PI / 36);
        this.overlayDirty = true;
        return;
      }
      case "laser": {
        this.laserPoints.push({ x: page.x, y: page.y, t: performance.now() });
        if (this.laserPoints.length > 400) this.laserPoints.shift();
        this.overlayDirty = true;
        return;
      }
      default:
        return;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.mode.kind === "pinch") {
      if (this.pointers.size < 2) {
        this.mode = { kind: "idle" };
        this.pinchStart = null;
        this.callbacks.onStatus(`Zoom ${Math.round(this.viewport.scale * 100)}%`);
      }
      return;
    }

    switch (this.mode.kind) {
      case "draw-stroke": {
        const stroke = this.mode.stroke;
        this.mode = { kind: "idle" };
        this.commitStroke(stroke);
        this.liveDirty = true;
        return;
      }
      case "erase": {
        this.eraserPos = null;
        this.endBatch("Erase");
        this.mode = { kind: "idle" };
        this.liveDirty = true;
        return;
      }
      case "shape-draw": {
        const preview = this.mode.preview;
        this.mode = { kind: "idle" };
        this.liveDirty = true;
        if (preview.shape === "freeform") {
          const points = preview.points ?? [];
          if (points.length > 3) {
            const box = pointsBBox(points);
            preview.x = box.x;
            preview.y = box.y;
            preview.w = box.w;
            preview.h = box.h;
            const closed = dist(points[0], points[points.length - 1]) < Math.max(box.w, box.h) * 0.2;
            if (closed) preview.points = [...points, points[0]];
            const prefs = this.getPrefs();
            if (prefs.recognizeShapes) {
              const strokeLike: StrokeObject = {
                ...createStroke(points, this.toolState.strokeStyle, this.layers),
                z: preview.z,
                opacity: preview.opacity
              };
              const recognized = recognizedShapeObject(strokeLike, this.layers);
              if (recognized) {
                recognized.z = nextSortOrder(this.objects.filter((o) => o.layerId === recognized.layerId));
                this.addObjects([recognized], { select: true, label: "Draw shape (recognized)" });
                return;
              }
            }
            this.addObjects([{ ...preview, updatedAt: Date.now() }], { select: true, label: "Draw freeform" });
          }
          return;
        }
        if (Math.abs(preview.w) > 3 || Math.abs(preview.h) > 3) {
          this.addObjects([{ ...preview, updatedAt: Date.now() }], { select: true, label: "Draw shape" });
        }
        return;
      }
      case "move":
      case "resize":
      case "rotate": {
        const previews = this.mode.originals.map((o) => this.previewMap.get(o.id) ?? o);
        const originals = this.mode.originals;
        const moved = this.mode.kind !== "move" || this.mode.moved;
        this.previewMap.clear();
        this.mode = { kind: "idle" };
        if (moved) {
          const label = originals.length > 1 ? undefined : undefined;
          void label;
        }
        void this.replaceIfChanged(originals, previews, "Transform");
        return;
      }
      case "marquee": {
        const rect: Rect = {
          x: Math.min(this.mode.start.x, this.mode.current.x),
          y: Math.min(this.mode.start.y, this.mode.current.y),
          w: Math.abs(this.mode.current.x - this.mode.start.x),
          h: Math.abs(this.mode.current.y - this.mode.start.y)
        };
        const ids = rect.w > 3 && rect.h > 3 ? objectsInRect(this.objects, rect).filter((id) => this.isSelectable(id)) : [];
        this.setSelection(ids);
        this.mode = { kind: "idle" };
        this.overlayDirty = true;
        return;
      }
      case "lasso": {
        const polygon = this.mode.pts;
        if (polygon.length > 4) {
          const ids = this.objects
            .filter((o) => this.isSelectable(o.id))
            .filter((o) => objectIntersectsLasso(o, polygon))
            .map((o) => o.id);
          this.setSelection(ids);
        }
        this.mode = { kind: "idle" };
        this.overlayDirty = true;
        return;
      }
      default: {
        this.mode = { kind: "idle" };
        this.overlayDirty = true;
        return;
      }
    }
  };

  private replaceIfChanged(originals: SceneObject[], replacements: SceneObject[], label: string) {
    const changed = replacements.some((next, i) => {
      const original = originals[i];
      return next.updatedAt !== original.updatedAt || transformKey(next) !== transformKey(original);
    });
    if (!changed) {
      this.staticDirty = true;
      this.overlayDirty = true;
      return;
    }
    this.replaceObjects(originals, replacements, label);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const screen = this.eventScreen(e);
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(Math.exp(-e.deltaY * 0.01), screen);
      return;
    }
    this.viewport.tx -= e.deltaX;
    this.viewport.ty -= e.deltaY;
    this.callbacks.onViewportChange(this.getViewport());
    this.invalidate();
  };

  private onDoubleClick = (e: MouseEvent) => {
    const page = this.eventPage(e);
    const hit = pickTopmost(this.objects, this.layers, page, 6 / this.viewport.scale);
    if (!hit) return;
    if (hit.type === "text") {
      this.callbacks.onRequest({ type: "edit-text", object: hit, point: page });
    } else if (hit.type === "formula") {
      this.callbacks.onRequest({ type: "edit-formula", object: hit });
    } else if (hit.type === "graph") {
      this.callbacks.onRequest({ type: "edit-graph", object: hit });
    } else if (hit.type === "table") {
      this.callbacks.onRequest({ type: "edit-table", object: hit });
    } else if (hit.type === "image") {
      this.setSelection([hit.id]);
    } else if (hit.type === "shape" && ["process", "decision", "terminator", "data", "speech"].includes(hit.shape)) {
      this.setSelection([hit.id]);
      this.callbacks.onRequest({ type: "edit-text", object: null, point: page });
    }
  };

  private beginSelectInteraction(page: { x: number; y: number }, additive: boolean) {
    const handle = this.hitHandle(page);
    const selected = this.getSelectedObjects();
    if (handle && selected.length > 0) {
      const display = this.selectionDisplayBox();
      if (!display) return;
      if (handle === "rot") {
        this.mode = {
          kind: "rotate",
          startAngle: Math.atan2(page.y - display.center.y, page.x - display.center.x),
          center: display.center,
          originals: selected.map((o) => deepClone(o))
        };
        return;
      }
      this.mode = {
        kind: "resize",
        handle,
        startPage: page,
        originals: selected.map((o) => deepClone(o)),
        box: display.box,
        rotation: display.rotation,
        center: display.center
      };
      return;
    }
    const hit = pickTopmost(this.objects, this.layers, page, 6 / this.viewport.scale);
    if (!hit) {
      if (!additive) this.setSelection([]);
      this.mode = { kind: "marquee", start: page, current: page };
      this.overlayDirty = true;
      return;
    }
    if (!this.isSelectable(hit.id)) {
      this.callbacks.onStatus("This object is locked.", "info");
      return;
    }
    let ids = this.expandGroup([hit.id]);
    if (additive) {
      const allSelected = ids.every((id) => this.selection.has(id));
      if (allSelected) {
        this.setSelection([...this.selection].filter((id) => !ids.includes(id)));
        return;
      }
      ids = [...new Set([...this.selection, ...ids])];
    }
    this.setSelection(ids);
    const originals = this.objects.filter((o) => ids.includes(o.id)).map((o) => deepClone(o));
    this.mode = { kind: "move", startPage: page, originals, moved: false };
  }

  private selectionDisplayBox(): { box: Rect; rotation: number; center: { x: number; y: number } } | null {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return null;
    if (selected.length === 1 && hasOwnRect(selected[0])) {
      const object = selected[0];
      const box = {
        x: Math.min(object.x, object.x + object.w),
        y: Math.min(object.y, object.y + object.h),
        w: Math.abs(object.w),
        h: Math.abs(object.h)
      };
      return {
        box,
        rotation: rotationOf(object),
        center: { x: box.x + box.w / 2, y: box.y + box.h / 2 }
      };
    }
    const box = aabbOfObjects(selected);
    if (!box) return null;
    return { box, rotation: 0, center: { x: box.x + box.w / 2, y: box.y + box.h / 2 } };
  }

  private hitHandle(page: { x: number; y: number }): HandleId | null {
    const display = this.selectionDisplayBox();
    if (!display) return null;
    const { box, rotation, center } = display;
    const tolerance = (HANDLE_SIZE + 6) / this.viewport.scale;
    const handles: { id: HandleId; x: number; y: number }[] = [
      { id: "nw", x: box.x, y: box.y },
      { id: "n", x: box.x + box.w / 2, y: box.y },
      { id: "ne", x: box.x + box.w, y: box.y },
      { id: "e", x: box.x + box.w, y: box.y + box.h / 2 },
      { id: "se", x: box.x + box.w, y: box.y + box.h },
      { id: "s", x: box.x + box.w / 2, y: box.y + box.h },
      { id: "sw", x: box.x, y: box.y + box.h },
      { id: "w", x: box.x, y: box.y + box.h / 2 },
      { id: "rot", x: box.x + box.w / 2, y: box.y - ROTATE_OFFSET / this.viewport.scale }
    ];
    for (const handle of handles) {
      const point = rotation ? rotatePoint({ x: handle.x, y: handle.y }, center, rotation) : { x: handle.x, y: handle.y };
      if (Math.hypot(page.x - point.x, page.y - point.y) <= tolerance) return handle.id;
    }
    return null;
  }

  private expandGroup(ids: string[]): string[] {
    const result = new Set(ids);
    for (const id of ids) {
      const object = this.objects.find((o) => o.id === id);
      if (object?.groupId) {
        for (const member of this.objects) {
          if (member.groupId === object.groupId) result.add(member.id);
        }
      }
    }
    return [...result];
  }

  private isSelectable(id: string) {
    const object = this.objects.find((o) => o.id === id);
    if (!object) return false;
    const layer = this.layers.find((l) => l.id === object.layerId);
    return Boolean(layer && layer.visible && !layer.locked && !object.locked);
  }

  private snapDelta(dx: number, dy: number, originals: SceneObject[]) {
    const snap = this.getPrefs().gridSnap;
    if (!snap) return { dx, dy };
    const bbox = aabbOfObjects(originals);
    if (!bbox) return { dx, dy };
    const targetX = Math.round((bbox.x + dx) / snap) * snap;
    const targetY = Math.round((bbox.y + dy) / snap) * snap;
    return { dx: targetX - bbox.x, dy: targetY - bbox.y };
  }

  private applyResize(page: { x: number; y: number }) {
    if (this.mode.kind !== "resize") return;
    const { handle, originals, box, startPage, rotation, center } = this.mode;

    if (originals.length === 1 && rotation !== 0 && hasOwnRect(originals[0])) {
      const object = originals[0];
      const local = rotatePoint(page, center, -rotation);
      const signX = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
      const signY = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
      const anchor = {
        x: signX === 0 ? box.x + box.w / 2 : box.x + (signX === -1 ? box.w : 0),
        y: signY === 0 ? box.y + box.h / 2 : box.y + (signY === -1 ? box.h : 0)
      };
      const newW = signX === 0 ? object.w : Math.max(8, Math.abs(local.x - anchor.x));
      const newH = signY === 0 ? object.h : Math.max(8, Math.abs(local.y - anchor.y));
      const worldAnchor = rotatePoint(anchor, center, rotation);
      const offX = (signX * newW) / 2;
      const offY = (signY * newH) / 2;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const worldCenter = {
        x: worldAnchor.x + offX * cos - offY * sin,
        y: worldAnchor.y + offX * sin + offY * cos
      };
      const next = deepClone(object);
      next.w = newW;
      next.h = newH;
      next.x = worldCenter.x - newW / 2;
      next.y = worldCenter.y - newH / 2;
      next.updatedAt = Date.now();
      this.previewMap.set(object.id, next);
      this.staticDirty = true;
      this.overlayDirty = true;
      return;
    }

    const dx0 = page.x - startPage.x;
    const dy0 = page.y - startPage.y;
    let left = box.x;
    let top = box.y;
    let right = box.x + box.w;
    let bottom = box.y + box.h;
    if (handle.includes("w")) left = Math.min(box.x + box.w - 8, box.x + dx0);
    if (handle.includes("e")) right = Math.max(box.x + 8, box.x + box.w + dx0);
    if (handle.includes("n")) top = Math.min(box.y + box.h - 8, box.y + dy0);
    if (handle.includes("s")) bottom = Math.max(box.y + 8, box.y + box.h + dy0);
    const newW = Math.max(8, right - left);
    const newH = Math.max(8, bottom - top);
    const scaleX = box.w === 0 ? 1 : newW / box.w;
    const scaleY = box.h === 0 ? 1 : newH / box.h;
    const dx = left - box.x;
    const dy = top - box.y;
    for (const original of originals) {
      this.previewMap.set(original.id, scaleObject(original, box, scaleX, scaleY, dx, dy));
    }
    this.staticDirty = true;
    this.overlayDirty = true;
  }

  private beginBatch() {
    this.batch = new Map();
  }

  private recordBatch(before: SceneObject | null, after: SceneObject | null) {
    if (!this.batch) return;
    if (before === null && after === null) return;
    const id = (after ?? before)!.id;
    const existing = this.batch.get(id);
    if (!existing) {
      this.batch.set(id, { before, after });
    } else {
      existing.after = after;
    }
  }

  private endBatch(label: string) {
    if (!this.batch) return;
    const batch = this.batch;
    this.batch = null;
    const entries = [...batch.values()].filter((e) => e.before !== e.after);
    if (entries.length === 0) return;
    const before: HistoryEntry["before"] = entries.map((e) => ({ id: (e.before ?? e.after)!.id, object: e.before ? deepClone(e.before) : null }));
    const after: HistoryEntry["after"] = entries.map((e) => ({ id: (e.before ?? e.after)!.id, object: e.after ? deepClone(e.after) : null }));
    this.pushHistory({ label, before, after });
    this.afterMutation();
  }

  private commitStroke(stroke: StrokeObject) {
    stroke.updatedAt = Date.now();
    if (stroke.points.length === 0) return;
    const prefs = this.getPrefs();
    if (prefs.recognizeShapes && stroke.points.length > 8) {
      const recognized = recognizedShapeObject(stroke, this.layers);
      if (recognized) {
        recognized.z = nextSortOrder(this.objects.filter((o) => o.layerId === recognized.layerId));
        this.addObjects([recognized], { select: true, label: "Recognized shape" });
        return;
      }
    }
    this.addObjects([stroke], { label: "Draw" });
  }

  private eraseAt(page: { x: number; y: number }) {
    const radius = this.toolState.eraserSize / 2;
    const mode = this.toolState.eraserMode;
    const candidates = this.index.query({ x: page.x - radius, y: page.y - radius, w: radius * 2, h: radius * 2 });
    const toRemove: SceneObject[] = [];
    const toReplace: { before: StrokeObject; replacements: StrokeObject[] }[] = [];

    for (const id of candidates) {
      const object = this.objects.find((o) => o.id === id);
      if (!object || object.locked) continue;
      const layer = this.layers.find((l) => l.id === object.layerId);
      if (!layer || !layer.visible || layer.locked) continue;
      if (object.type !== "stroke") {
        if (mode === "object" && hitTestObject(object, page, radius)) toRemove.push(object);
        continue;
      }
      const inside = (p: Point) => Math.hypot(p.x - page.x, p.y - page.y) <= radius;
      if (!object.points.some(inside)) continue;
      if (mode === "stroke" || mode === "object") {
        toRemove.push(object);
        continue;
      }
      const runs: Point[][] = [];
      let current: Point[] = [];
      for (const point of object.points) {
        if (inside(point)) {
          if (current.length > 1) runs.push(current);
          current = [];
        } else {
          current.push(point);
        }
      }
      if (current.length > 1) runs.push(current);
      const replacements = runs.map((run) => ({
        ...deepClone(object),
        id: uid(),
        points: run,
        updatedAt: Date.now()
      }));
      if (replacements.length > 0) toReplace.push({ before: object, replacements });
      else toRemove.push(object);
    }

    if (toRemove.length === 0 && toReplace.length === 0) return;

    const removalsAffected = new Set(toRemove.map((o) => o.id));
    this.objects = this.objects.filter((o) => !removalsAffected.has(o.id));
    for (const object of toRemove) this.index.remove(object.id);
    for (const item of toReplace) {
      const index = this.objects.findIndex((o) => o.id === item.before.id);
      if (index >= 0) this.objects.splice(index, 1, ...item.replacements);
      this.index.remove(item.before.id);
      for (const replacement of item.replacements) this.index.insert(replacement.id, objectAABB(replacement));
    }

    if (this.batch) {
      for (const object of toRemove) this.recordBatch(object, null);
      for (const item of toReplace) {
        this.recordBatch(item.before, item.replacements[0]);
        for (const extra of item.replacements.slice(1)) this.recordBatch(null, extra);
      }
      this.staticDirty = true;
      this.callbacks.onChange();
      return;
    }
    const before = [...toRemove, ...toReplace.map((t) => t.before)].map((o) => ({ id: o.id, object: deepClone(o) }));
    const after: HistoryEntry["after"] = [
      ...toRemove.map((o) => ({ id: o.id, object: null })),
      ...toReplace.map((t) => ({ id: t.before.id, object: t.replacements[0] ? deepClone(t.replacements[0]) : null }))
    ];
    this.pushHistory({ label: "Erase", before, after });
    this.afterMutation();
  }

  setTool(tool: ToolId) {
    this.toolState.tool = tool;
    if (tool !== "eraser") this.eraserPos = null;
    if (tool === "ruler") this.ruler.active = true;
    if (this.mode.kind === "draw-stroke" || this.mode.kind === "shape-draw") this.mode = { kind: "idle" };
    this.updateCursor();
    this.callbacks.onToolChange(this.getToolState());
    this.liveDirty = true;
    this.overlayDirty = true;
  }

  setStrokeStyle(patch: Partial<StrokeStyle>) {
    this.toolState.strokeStyle = { ...this.toolState.strokeStyle, ...patch };
    this.applyStyleToSelection(patch);
    this.callbacks.onToolChange(this.getToolState());
  }

  setStrokePen(penType: StrokeStyle["penType"], style: StrokeStyle) {
    this.toolState.strokeStyle = { ...style };
    this.callbacks.onToolChange(this.getToolState());
    void penType;
  }

  setShapeKind(kind: ShapeKind) {
    this.toolState.shapeKind = kind;
    this.callbacks.onToolChange(this.getToolState());
  }

  setShapeStyle(patch: Partial<ShapeStyle>) {
    this.toolState.shapeStyle = { ...this.toolState.shapeStyle, ...patch };
    this.applyShapeStyleToSelection(patch);
    this.callbacks.onToolChange(this.getToolState());
  }

  setTextStyle(patch: Partial<TextStyle>) {
    this.toolState.textStyle = { ...this.toolState.textStyle, ...patch };
    const selected = this.getSelectedObjects().filter((o) => o.type === "text");
    if (selected.length > 0) {
      const updates = selected.map((o) => ({ ...o, style: { ...(o as TextObject).style, ...patch }, updatedAt: Date.now() }) as SceneObject);
      this.updateObjects(updates, "Update text style");
    }
    this.callbacks.onToolChange(this.getToolState());
  }

  setEraser(mode: EraserMode, size?: number) {
    this.toolState.eraserMode = mode;
    if (size !== undefined) this.toolState.eraserSize = clamp(size, 6, 160);
    this.callbacks.onToolChange(this.getToolState());
    this.liveDirty = true;
  }

  setEraserSize(size: number) {
    this.toolState.eraserSize = clamp(size, 6, 160);
    this.callbacks.onToolChange(this.getToolState());
    this.liveDirty = true;
  }

  setRuler(active: boolean) {
    this.ruler.active = active;
    if (!active && this.toolState.tool === "ruler") {
      this.toolState.tool = "select";
      this.callbacks.onToolChange(this.getToolState());
      this.updateCursor();
    }
    this.overlayDirty = true;
    this.liveDirty = true;
  }

  private applyStyleToSelection(patch: Partial<StrokeStyle>) {
    const strokes = this.getSelectedObjects().filter((o): o is StrokeObject => o.type === "stroke");
    if (strokes.length === 0) return;
    const updates = strokes.map((s) => ({ ...s, style: { ...s.style, ...patch }, updatedAt: Date.now() }));
    this.updateObjects(updates, "Update pen");
  }

  private applyShapeStyleToSelection(patch: Partial<ShapeStyle>) {
    const shapes = this.getSelectedObjects().filter((o): o is ShapeObject => o.type === "shape");
    if (shapes.length === 0) return;
    const updates = shapes.map((s) => ({ ...s, style: { ...s.style, ...patch }, updatedAt: Date.now() }));
    this.updateObjects(updates, "Update shape");
  }

  setSelection(ids: string[]) {
    this.selection = new Set(ids);
    this.emitSelection();
    this.overlayDirty = true;
  }

  private emitSelection() {
    this.callbacks.onSelectionChange([...this.selection]);
  }

  insertObject(object: SceneObject, label = "Insert", select = true) {
    object.z = nextSortOrder(this.objects.filter((o) => o.layerId === object.layerId));
    this.addObjects([object], { select, label });
  }

  addObjects(objects: SceneObject[], opts: { select?: boolean; label?: string } = {}) {
    const clones = objects.map((o) => deepClone(o));
    for (const object of clones) {
      this.objects.push(object);
      this.index.insert(object.id, objectAABB(object));
      if (this.batch) this.recordBatch(null, object);
    }
    if (opts.select) {
      this.selection = new Set(clones.map((o) => o.id));
      this.emitSelection();
    }
    if (this.batch) {
      this.staticDirty = true;
      this.callbacks.onChange();
      return;
    }
    this.pushHistory({
      label: opts.label ?? "Add",
      before: clones.map((o) => ({ id: o.id, object: null })),
      after: clones.map((o) => ({ id: o.id, object: deepClone(o) }))
    });
    this.afterMutation();
  }

  updateObjects(updates: SceneObject[], label = "Update") {
    const before = updates.map((next) => {
      const current = this.objects.find((o) => o.id === next.id);
      return { id: next.id, object: current ? deepClone(current) : null };
    });
    for (const next of updates) {
      const index = this.objects.findIndex((o) => o.id === next.id);
      if (index >= 0) {
        this.objects[index] = next;
        this.index.update(next.id, objectAABB(next));
      }
    }
    if (this.batch) {
      for (const item of before) {
        const after = updates.find((u) => u.id === item.id) ?? null;
        this.recordBatch(item.object, after);
      }
      this.staticDirty = true;
      this.callbacks.onChange();
      return;
    }
    this.pushHistory({ label, before, after: updates.map((u) => ({ id: u.id, object: deepClone(u) })) });
    this.afterMutation();
  }

  private replaceObjects(originals: SceneObject[], replacements: SceneObject[], label: string) {
    const before = originals.map((o) => ({ id: o.id, object: deepClone(o) }));
    for (let i = 0; i < originals.length; i += 1) {
      const index = this.objects.findIndex((o) => o.id === originals[i].id);
      if (index >= 0) this.objects[index] = replacements[i] ?? originals[i];
      this.index.update(originals[i].id, objectAABB(replacements[i] ?? originals[i]));
    }
    this.pushHistory({ label, before, after: replacements.map((o) => ({ id: o.id, object: deepClone(o) })) });
    this.afterMutation();
  }

  removeObjects(ids: string[], label = "Delete") {
    const removed = this.objects.filter((o) => ids.includes(o.id) && !o.locked);
    if (removed.length === 0) return;
    const removedIds = new Set(removed.map((o) => o.id));
    for (const object of removed) this.index.remove(object.id);
    this.objects = this.objects.filter((o) => !removedIds.has(o.id));
    for (const id of removedIds) this.selection.delete(id);
    this.emitSelection();
    if (this.batch) {
      for (const object of removed) this.recordBatch(object, null);
      this.staticDirty = true;
      this.callbacks.onChange();
      return;
    }
    this.pushHistory({
      label,
      before: removed.map((o) => ({ id: o.id, object: deepClone(o) })),
      after: removed.map((o) => ({ id: o.id, object: null }))
    });
    this.afterMutation();
  }

  private applyHistoryEntry(entry: HistoryEntry, direction: "undo" | "redo") {
    const list = direction === "undo" ? entry.before : entry.after;
    for (const item of list) {
      const index = this.objects.findIndex((o) => o.id === item.id);
      if (item.object === null) {
        if (index >= 0) {
          this.index.remove(item.id);
          this.objects.splice(index, 1);
          this.selection.delete(item.id);
        }
      } else {
        const restored = deepClone(item.object);
        if (index >= 0) {
          this.objects[index] = restored;
          this.index.update(item.id, objectAABB(restored));
        } else {
          this.objects.push(restored);
          this.index.insert(item.id, objectAABB(restored));
        }
      }
    }
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return;
    this.applyHistoryEntry(entry, "undo");
    this.future.push(entry);
    this.emitSelection();
    this.afterMutation();
    this.callbacks.onStatus(`Undo: ${entry.label}`);
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return;
    this.applyHistoryEntry(entry, "redo");
    this.past.push(entry);
    this.emitSelection();
    this.afterMutation();
    this.callbacks.onStatus(`Redo: ${entry.label}`);
  }

  private pushHistory(entry: HistoryEntry) {
    this.past.push(entry);
    if (this.past.length > 200) this.past.shift();
    this.future = [];
  }

  private afterMutation() {
    this.staticDirty = true;
    this.overlayDirty = true;
    this.callbacks.onChange();
  }

  copySelection() {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return;
    this.clipboard = selected.map((o) => deepClone(o));
    this.callbacks.onStatus(`Copied ${selected.length} object${selected.length > 1 ? "s" : ""}`);
  }

  cutSelection() {
    if (this.getSelectedObjects().length === 0) return;
    this.copySelection();
    this.deleteSelection();
  }

  paste() {
    if (this.clipboard.length === 0) return;
    const sourceGroup = this.clipboard.find((o) => o.groupId)?.groupId ?? null;
    const newGroup = sourceGroup ? uid() : null;
    const copies = this.clipboard.map((o) => {
      const copy = deepClone(o);
      copy.id = uid();
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      if (newGroup && copy.groupId) copy.groupId = newGroup;
      return translateObject(copy, 18, 18);
    });
    this.addObjects(copies, { select: true, label: "Paste" });
    this.clipboard = copies.map((c) => deepClone(c));
  }

  duplicateSelection() {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return;
    const sourceGroup = selected.find((o) => o.groupId)?.groupId ?? null;
    const newGroup = sourceGroup ? uid() : null;
    const copies = selected.map((o) => {
      const copy = deepClone(o);
      copy.id = uid();
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      if (newGroup && copy.groupId) copy.groupId = newGroup;
      return translateObject(copy, 18, 18);
    });
    this.addObjects(copies, { select: true, label: "Duplicate" });
  }

  deleteSelection() {
    const ids = [...this.selection];
    if (ids.length === 0) return;
    this.removeObjects(ids);
  }

  selectAll() {
    const ids = this.objects.filter((o) => this.isSelectable(o.id)).map((o) => o.id);
    this.setSelection(ids);
  }

  groupSelection() {
    const selected = this.getSelectedObjects();
    if (selected.length < 2) return;
    const groupId = uid();
    const updates = selected.map((o) => ({ ...o, groupId, updatedAt: Date.now() }));
    this.updateObjects(updates, "Group");
  }

  ungroupSelection() {
    const selected = this.getSelectedObjects().filter((o) => o.groupId);
    if (selected.length === 0) return;
    const groupIds = new Set(selected.map((o) => o.groupId));
    const members = this.objects.filter((o) => o.groupId && groupIds.has(o.groupId));
    const updates = members.map((o) => ({ ...o, groupId: null, updatedAt: Date.now() }));
    this.updateObjects(updates, "Ungroup");
  }

  toggleLockSelection() {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return;
    const shouldLock = !selected.every((o) => o.locked);
    const updates = selected.map((o) => ({ ...o, locked: shouldLock, updatedAt: Date.now() }));
    this.updateObjects(updates, shouldLock ? "Lock" : "Unlock");
    if (shouldLock) this.setSelection([]);
  }

  setSelectionLayer(layerId: string) {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return;
    const z = nextSortOrder(this.objects.filter((o) => o.layerId === layerId));
    const updates = selected.map((o, i) => ({ ...o, layerId, z: z + i, updatedAt: Date.now() }));
    this.updateObjects(updates, "Move to layer");
  }

  reorderSelection(direction: "front" | "back" | "forward" | "backward") {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return;
    const updates: SceneObject[] = [];
    for (const object of selected) {
      const siblings = this.objects.filter((o) => o.layerId === object.layerId).sort((a, b) => a.z - b.z);
      const index = siblings.findIndex((o) => o.id === object.id);
      let newIndex = index;
      if (direction === "front") newIndex = siblings.length - 1;
      else if (direction === "back") newIndex = 0;
      else if (direction === "forward") newIndex = Math.min(siblings.length - 1, index + 1);
      else newIndex = Math.max(0, index - 1);
      if (newIndex === index) continue;
      siblings.splice(index, 1);
      siblings.splice(newIndex, 0, object);
      siblings.forEach((sibling, i) => {
        if (sibling.z !== i + 1) updates.push({ ...sibling, z: i + 1, updatedAt: Date.now() });
      });
    }
    if (updates.length > 0) this.updateObjects(updates, "Reorder");
  }

  updateObjectProps(id: string, patch: Partial<SceneObject>) {
    const object = this.objects.find((o) => o.id === id);
    if (!object) return;
    const next = { ...object, ...patch, updatedAt: Date.now() } as SceneObject;
    this.updateObjects([next], "Update properties");
  }

  updateSelectedObjects(patch: Partial<SceneObject>, label = "Update properties") {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return;
    const updates = selected.map((o) => ({ ...o, ...patch, updatedAt: Date.now() }) as SceneObject);
    this.updateObjects(updates, label);
  }

  updateTextObject(id: string, text: string, height?: number) {
    const object = this.objects.find((o) => o.id === id);
    if (!object || object.type !== "text") return;
    const next: TextObject = { ...object, text, h: height && height > 20 ? height : object.h, updatedAt: Date.now() };
    this.updateObjects([next], "Edit text");
  }

  updateFormulaObject(id: string, patch: Partial<FormulaObject>) {
    const object = this.objects.find((o) => o.id === id);
    if (!object || object.type !== "formula") return;
    const next: FormulaObject = { ...object, ...patch, updatedAt: Date.now() };
    this.updateObjects([next], "Edit formula");
  }

  updateGraphObject(id: string, patch: Partial<GraphObject>) {
    const object = this.objects.find((o) => o.id === id);
    if (!object || object.type !== "graph") return;
    const next: GraphObject = { ...object, ...patch, updatedAt: Date.now() };
    this.updateObjects([next], "Edit graph");
  }

  updateTableObject(id: string, patch: Partial<TableObject>) {
    const object = this.objects.find((o) => o.id === id);
    if (!object || object.type !== "table") return;
    const next: TableObject = { ...object, ...patch, updatedAt: Date.now() };
    this.updateObjects([next], "Edit table");
  }

  addLayer(layer: Layer) {
    this.layers.push(deepClone(layer));
    this.afterMutation();
  }

  updateLayer(id: string, patch: Partial<Layer>) {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index < 0) return;
    this.layers[index] = { ...this.layers[index], ...patch };
    this.afterMutation();
  }

  removeLayer(id: string) {
    if (this.layers.length <= 1) return;
    const fallback = this.layers.find((l) => l.id !== id);
    if (!fallback) return;
    const affected = this.objects.filter((o) => o.layerId === id);
    if (affected.length > 0) {
      const updates = affected.map((o) => ({ ...o, layerId: fallback.id, updatedAt: Date.now() }));
      this.updateObjects(updates, "Move from removed layer");
    }
    this.layers = this.layers.filter((l) => l.id !== id);
    this.afterMutation();
  }

  reorderLayer(id: string, direction: -1 | 1) {
    const index = this.layers.findIndex((l) => l.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.layers.length) return;
    const [layer] = this.layers.splice(index, 1);
    this.layers.splice(target, 0, layer);
    this.afterMutation();
  }

  duplicateLayer(id: string) {
    const source = this.layers.find((l) => l.id === id);
    if (!source) return;
    const newLayer: Layer = { ...source, id: uid(), name: `${source.name} copy` };
    const index = this.layers.findIndex((l) => l.id === id);
    this.layers.splice(index + 1, 0, newLayer);
    const children = this.objects.filter((o) => o.layerId === id);
    if (children.length > 0) {
      const copies = children.map((o, i) => ({ ...deepClone(o), id: uid(), layerId: newLayer.id, z: i + 1, updatedAt: Date.now() }));
      this.addObjects(copies, { label: "Duplicate layer" });
    } else {
      this.afterMutation();
    }
  }

  renameLayer(id: string, name: string) {
    this.updateLayer(id, { name });
  }

  fitToPage() {
    const padding = 40;
    const scale = Math.min((this.viewWidth - padding * 2) / this.pageWidth, (this.viewHeight - padding * 2) / this.pageHeight);
    const finalScale = clamp(scale, MIN_SCALE, MAX_SCALE);
    this.viewport.scale = finalScale;
    this.viewport.tx = (this.viewWidth - this.pageWidth * finalScale) / 2;
    this.viewport.ty = (this.viewHeight - this.pageHeight * finalScale) / 2;
    this.callbacks.onViewportChange(this.getViewport());
    this.invalidate();
  }

  setZoom(scale: number, anchorScreen?: { x: number; y: number }) {
    const anchor = anchorScreen ?? { x: this.viewWidth / 2, y: this.viewHeight / 2 };
    this.zoomAtScale(scale, anchor);
  }

  private zoomAtScale(newScale: number, anchorScreen: { x: number; y: number }) {
    const clamped = clamp(newScale, MIN_SCALE, MAX_SCALE);
    const pagePoint = this.screenToPage(anchorScreen);
    this.viewport.scale = clamped;
    this.viewport.tx = anchorScreen.x - pagePoint.x * clamped;
    this.viewport.ty = anchorScreen.y - pagePoint.y * clamped;
    this.callbacks.onViewportChange(this.getViewport());
    this.invalidate();
  }

  zoomAt(factor: number, anchorScreen: { x: number; y: number }) {
    this.zoomAtScale(this.viewport.scale * factor, anchorScreen);
  }

  zoomBy(factor: number) {
    this.zoomAt(factor, { x: this.viewWidth / 2, y: this.viewHeight / 2 });
  }

  centerOn(pagePoint: { x: number; y: number }) {
    this.viewport.tx = this.viewWidth / 2 - pagePoint.x * this.viewport.scale;
    this.viewport.ty = this.viewHeight / 2 - pagePoint.y * this.viewport.scale;
    this.callbacks.onViewportChange(this.getViewport());
    this.invalidate();
  }

  private updateCursor() {
    const cursors: Record<ToolId, string> = {
      select: "default",
      lasso: "crosshair",
      hand: "grab",
      pen: "crosshair",
      eraser: "cell",
      shape: "crosshair",
      text: "text",
      image: "copy",
      formula: "copy",
      graph: "copy",
      table: "copy",
      ruler: "move",
      laser: "pointer"
    };
    this.host.style.cursor = cursors[this.toolState.tool] ?? "default";
  }

  private constrainToRuler(point: Point): Point {
    const { x, y, angle, length } = this.ruler;
    const a = { x, y };
    const b = { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length };
    const projected = projectPointOnSegment(point, a, b);
    return { ...point, x: projected.x, y: projected.y };
  }

  private rulerHitTest(page: { x: number; y: number }): "edge" | "end" | null {
    const { x, y, angle, length } = this.ruler;
    const a = { x, y };
    const b = { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length };
    const endTolerance = 22 / this.viewport.scale;
    const edgeTolerance = 26 / this.viewport.scale;
    if (Math.hypot(page.x - b.x, page.y - b.y) <= endTolerance) return "end";
    const projected = projectPointOnSegment(page, a, b);
    if (Math.hypot(page.x - projected.x, page.y - projected.y) <= edgeTolerance) return "edge";
    return null;
  }

  private rebuildIndex() {
    this.index.clear();
    for (const object of this.objects) this.index.insert(object.id, objectAABB(object));
  }

  invalidate() {
    this.staticDirty = true;
    this.liveDirty = true;
    this.overlayDirty = true;
  }

  private loop = () => {
    if (this.destroyed) return;
    this.render();
    this.rafHandle = requestAnimationFrame(this.loop);
  };

  private render() {
    const dpr = this.dpr;
    const scale = this.viewport.scale;
    const tx = this.viewport.tx;
    const ty = this.viewport.ty;
    const pw = this.pageWidth;
    const ph = this.pageHeight;
    const prefs = this.getPrefs();

    if (this.staticDirty) {
      const ctx = this.staticCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);

      const viewRect: Rect = { x: -tx / scale, y: -ty / scale, w: this.viewWidth / scale, h: this.viewHeight / scale };

      if (prefs.infiniteCanvas) {
        if (this.background) {
          const spacing = Math.max(8, this.background.spacing || 28);
          const ox = Math.floor(viewRect.x / spacing) * spacing - spacing;
          const oy = Math.floor(viewRect.y / spacing) * spacing - spacing;
          ctx.save();
          ctx.translate(ox, oy);
          renderPageBackground(
            ctx,
            { width: viewRect.w + spacing * 3, height: viewRect.h + spacing * 3, background: this.background },
            this.assets
          );
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
        ctx.shadowBlur = 24 / scale;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pw, ph);
        ctx.restore();
        if (this.background) {
          renderPageBackground(ctx, { width: pw, height: ph, background: this.background }, this.assets);
        }
      }

      const renderObjects = this.objects.map((o) => this.previewMap.get(o.id) ?? o);
      renderObjectsToContext(
        ctx,
        renderObjects,
        this.layers,
        { assets: this.assets, renderScale: scale * dpr, pressureCurve: prefs.pressureCurve },
        viewRect
      );

      if (!prefs.infiniteCanvas && prefs.showPageBounds) {
        ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
        ctx.lineWidth = 1 / scale;
        ctx.strokeRect(0, 0, pw, ph);
      }
      this.staticDirty = false;
    }

    if (this.liveDirty) {
      const ctx = this.liveCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);

      if (this.mode.kind === "draw-stroke") {
        renderSceneObject(ctx, this.mode.stroke, {
          assets: this.assets,
          renderScale: scale * dpr,
          pressureCurve: prefs.pressureCurve
        });
      } else if (this.mode.kind === "shape-draw") {
        if (this.mode.preview.shape === "freeform") {
          const pts = this.mode.preview.points ?? [];
          if (pts.length > 1) {
            ctx.strokeStyle = this.toolState.shapeStyle.stroke;
            ctx.lineWidth = this.toolState.shapeStyle.strokeWidth;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
          }
        } else {
          renderSceneObject(ctx, this.mode.preview, {
            assets: this.assets,
            renderScale: scale * dpr,
            pressureCurve: prefs.pressureCurve
          });
        }
      } else if (this.mode.kind === "erase" && this.eraserPos) {
        ctx.strokeStyle = "rgba(100, 116, 139, 0.85)";
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.arc(this.eraserPos.x, this.eraserPos.y, this.toolState.eraserSize / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.liveDirty = false;
    }

    const laserAnimating = this.laserPoints.length > 0;
    if (this.overlayDirty || laserAnimating) {
      const ctx = this.overlayCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawOverlay(ctx);
      this.overlayDirty = false;
    }
  }

  private currentSelectionBox(): { corners: { x: number; y: number }[]; rotation: number } | null {
    const selected = this.getSelectedObjects().map((o) => this.previewMap.get(o.id) ?? o);
    if (selected.length === 0) return null;
    if (selected.length === 1 && hasOwnRect(selected[0])) {
      const object = selected[0];
      const box = {
        x: Math.min(object.x, object.x + object.w),
        y: Math.min(object.y, object.y + object.h),
        w: Math.abs(object.w),
        h: Math.abs(object.h)
      };
      return { corners: rectCorners(box, rotationOf(object)), rotation: rotationOf(object) };
    }
    const bbox = aabbOfObjects(selected);
    if (!bbox) return null;
    return { corners: rectCorners(bbox, 0), rotation: 0 };
  }

  private drawOverlay(ctx: CanvasRenderingContext2D) {
    const scale = this.viewport.scale;
    const toScreen = (p: { x: number; y: number }) => ({ x: p.x * scale + this.viewport.tx, y: p.y * scale + this.viewport.ty });

    if (this.ruler.active) {
      const a = toScreen({ x: this.ruler.x, y: this.ruler.y });
      const b = toScreen({
        x: this.ruler.x + Math.cos(this.ruler.angle) * this.ruler.length,
        y: this.ruler.y + Math.sin(this.ruler.angle) * this.ruler.length
      });
      ctx.save();
      ctx.strokeStyle = "rgba(14, 165, 233, 0.85)";
      ctx.lineWidth = 22;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const step = 8 * scale;
      let counter = 0;
      for (let d = step; d < len; d += step) {
        counter += 1;
        const t = d / len;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        const size = counter % 5 === 0 ? 11 : 6;
        const nx = Math.cos(angle + Math.PI / 2);
        const ny = Math.sin(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(px - nx * size, py - ny * size);
        ctx.lineTo(px + nx * size, py + ny * size);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(14, 165, 233, 0.95)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const selectionBox = this.currentSelectionBox();
    if (selectionBox) {
      const screenCorners = selectionBox.corners.map(toScreen);
      const centerX = screenCorners.reduce((s, c) => s + c.x, 0) / screenCorners.length;
      const centerY = screenCorners.reduce((s, c) => s + c.y, 0) / screenCorners.length;
      ctx.save();
      ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
      for (let i = 1; i < screenCorners.length; i += 1) ctx.lineTo(screenCorners[i].x, screenCorners[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      if (this.mode.kind !== "move" || !this.mode.moved) {
        const drawsMoveHandles = this.mode.kind !== "laser";
        const topMid = { x: (screenCorners[0].x + screenCorners[1].x) / 2, y: (screenCorners[0].y + screenCorners[1].y) / 2 };
        const rotScreen = { x: centerX, y: topMid.y - ROTATE_OFFSET };
        ctx.strokeStyle = "rgba(37, 99, 235, 0.7)";
        ctx.beginPath();
        ctx.moveTo(topMid.x, topMid.y);
        ctx.lineTo(rotScreen.x, rotScreen.y);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        for (const corner of screenCorners) {
          ctx.beginPath();
          ctx.rect(corner.x - HANDLE_SIZE / 2, corner.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          ctx.fill();
          ctx.stroke();
        }
        if (drawsMoveHandles) {
          for (let i = 0; i < screenCorners.length; i += 1) {
            const next = screenCorners[(i + 1) % screenCorners.length];
            const mid = { x: (screenCorners[i].x + next.x) / 2, y: (screenCorners[i].y + next.y) / 2 };
            ctx.beginPath();
            ctx.rect(mid.x - HANDLE_SIZE / 2, mid.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.arc(rotScreen.x, rotScreen.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.mode.kind === "marquee") {
      const a = toScreen(this.mode.start);
      const b = toScreen(this.mode.current);
      ctx.save();
      ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
      ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
      ctx.lineWidth = 1;
      const rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }

    if (this.mode.kind === "lasso" && this.mode.pts.length > 1) {
      ctx.save();
      ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
      ctx.fillStyle = "rgba(37, 99, 235, 0.06)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const first = toScreen(this.mode.pts[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < this.mode.pts.length; i += 1) {
        const p = toScreen(this.mode.pts[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.laserPoints.length > 0) {
      const nowMs = performance.now();
      this.laserPoints = this.laserPoints.filter((p) => nowMs - p.t < 900);
      const alive = this.laserPoints;
      if (alive.length > 1) {
        ctx.save();
        ctx.lineCap = "round";
        for (let i = 1; i < alive.length; i += 1) {
          const age = (nowMs - alive[i].t) / 900;
          const alpha = Math.max(0, 1 - age);
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.lineWidth = 4 * alpha + 1;
          ctx.beginPath();
          const a = toScreen(alive[i - 1]);
          const b = toScreen(alive[i]);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (alive.length === 0) this.overlayDirty = true;
    }
  }

  exportSelection(): { objects: SceneObject[]; layers: Layer[]; width: number; height: number } | null {
    const selected = this.getSelectedObjects();
    if (selected.length === 0) return null;
    const bbox = aabbOfObjects(selected);
    if (!bbox) return null;
    return {
      objects: selected.map((o) => deepClone(o)),
      layers: deepClone(this.layers),
      width: Math.ceil(bbox.w),
      height: Math.ceil(bbox.h)
    };
  }

  getContentBounds(): Rect | null {
    return aabbOfObjects(this.objects);
  }

  getPageData(): { objects: SceneObject[]; layers: Layer[]; background: PageBackground | null; width: number; height: number } {
    return {
      objects: this.objects.map((o) => deepClone(o)),
      layers: deepClone(this.layers),
      background: this.getBackground(),
      width: this.pageWidth,
      height: this.pageHeight
    };
  }
}

export function translateObject(object: SceneObject, dx: number, dy: number): SceneObject {
  const copy = deepClone(object);
  if (copy.type === "stroke") {
    copy.points = copy.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  } else if (copy.type === "shape" && copy.points) {
    copy.points = copy.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    copy.x += dx;
    copy.y += dy;
  } else {
    copy.x += dx;
    copy.y += dy;
  }
  copy.updatedAt = Date.now();
  return copy;
}

export function scaleObject(
  object: SceneObject,
  box: Rect,
  scaleX: number,
  scaleY: number,
  dx: number,
  dy: number
): SceneObject {
  const copy = deepClone(object);
  const mapX = (x: number) => box.x + (x - box.x) * scaleX + dx;
  const mapY = (y: number) => box.y + (y - box.y) * scaleY + dy;
  if (copy.type === "stroke") {
    copy.points = copy.points.map((p) => ({ ...p, x: mapX(p.x), y: mapY(p.y) }));
    const avg = (scaleX + scaleY) / 2;
    copy.style = { ...copy.style, width: clamp(copy.style.width * avg, 0.4, 200) };
  } else if (copy.type === "shape") {
    if (copy.points && copy.points.length > 0) {
      copy.points = copy.points.map((p) => ({ ...p, x: mapX(p.x), y: mapY(p.y) }));
    }
    copy.x = mapX(copy.x);
    copy.y = mapY(copy.y);
    copy.w = copy.w * scaleX;
    copy.h = copy.h * scaleY;
  } else if (copy.type === "text") {
    copy.x = mapX(copy.x);
    copy.y = mapY(copy.y);
    copy.w = Math.max(30, copy.w * scaleX);
    copy.h = Math.max(20, copy.h * scaleY);
    const avg = (scaleX + scaleY) / 2;
    copy.style = { ...copy.style, fontSize: clamp(copy.style.fontSize * avg, 6, 300) };
  } else if (copy.type === "formula") {
    copy.x = mapX(copy.x);
    copy.y = mapY(copy.y);
    copy.w = Math.max(24, copy.w * scaleX);
    copy.h = Math.max(16, copy.h * scaleY);
  } else if (copy.type === "table") {
    copy.x = mapX(copy.x);
    copy.y = mapY(copy.y);
    copy.w = Math.max(40, copy.w * scaleX);
    copy.h = Math.max(30, copy.h * scaleY);
  } else {
    copy.x = mapX(copy.x);
    copy.y = mapY(copy.y);
    copy.w = Math.max(4, copy.w * scaleX);
    copy.h = Math.max(4, copy.h * scaleY);
  }
  copy.updatedAt = Date.now();
  return copy;
}

export function rotateObjectAround(object: SceneObject, center: { x: number; y: number }, delta: number): SceneObject {
  const copy = deepClone(object);
  if (copy.type === "stroke") {
    copy.points = copy.points.map((p) => ({ ...p, ...rotatePoint(p, center, delta) }));
  } else if (copy.type === "shape") {
    if (copy.points) {
      copy.points = copy.points.map((p) => ({ ...p, ...rotatePoint(p, center, delta) }));
    }
    const box = { x: copy.x, y: copy.y, w: copy.w, h: copy.h };
    const rectCenter = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const newCenter = rotatePoint(rectCenter, center, delta);
    copy.x = newCenter.x - box.w / 2;
    copy.y = newCenter.y - box.h / 2;
    copy.rotation += delta;
  } else {
    const box = { x: copy.x, y: copy.y, w: copy.w, h: copy.h };
    const rectCenter = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const newCenter = rotatePoint(rectCenter, center, delta);
    copy.x = newCenter.x - box.w / 2;
    copy.y = newCenter.y - box.h / 2;
    if ("rotation" in copy) copy.rotation += delta;
  }
  copy.updatedAt = Date.now();
  return copy;
}
