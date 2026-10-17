"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  ImagePlus,
  Minus,
  Plus,
  Scan,
  Trash2
} from "lucide-react";
import type {
  FormulaObject,
  GraphFunction,
  GraphObject,
  GraphViewport,
  NotebookPage,
  PageSizeId,
  PaperType,
  TableObject,
  TextObject,
  TextStyle
} from "@/types";
import {
  FONT_OPTIONS,
  MAX_ASSET_SIZE,
  PAGE_SIZES,
  PAPER_OPTIONS,
  resolvePageSize
} from "@/lib/defaults";
import { putAsset, updatePageProps } from "@/lib/repo";
import type { DrawingEngine } from "@/lib/drawing/engine";
import { createFormula, createGraph, createImage, createTable, createText } from "@/lib/drawing/factory";
import { measureTextObject } from "@/lib/drawing/objects";
import { renderLatexHtml, rasterizeFormulaToBlob } from "@/lib/formula/raster";
import { drawGraph, graphFunctionErrors } from "@/lib/graph/render";
import { useEditor } from "@/lib/state/editorStore";
import { cn, uid } from "@/lib/utils";
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
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { ColorControl } from "@/components/editor/ColorControl";
import { CalcDialog } from "@/components/editor/CalcDialog";
import { ExportDialog } from "@/components/editor/ExportDialog";
import { TemplatesDialog } from "@/components/editor/TemplatesDialog";
import { useEditorApi } from "@/components/editor/editorContext";

const PRESET_LATEX = [
  String.raw`x^2`,
  String.raw`\frac{a}{b}`,
  String.raw`\sqrt{x}`,
  String.raw`\int_a^b f(x)\,dx`,
  String.raw`\sum_{n=1}^{\infty}`,
  String.raw`\lim_{x \to 0}`,
  String.raw`e^{i\pi}+1=0`,
  String.raw`\begin{pmatrix}a & b\\c & d\end{pmatrix}`,
  String.raw`\vec{v}`,
  String.raw`\sin^2\theta + \cos^2\theta = 1`
];

const GRAPH_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

const DEFAULT_VIEWPORT: GraphViewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

function placeCentered(engine: DrawingEngine, w: number, h: number) {
  const size = engine.getPageSize();
  return {
    x: Math.round((size.width - w) / 2),
    y: Math.round((size.height - h) / 2),
    w: Math.round(w),
    h: Math.round(h)
  };
}

function detectPageSize(width: number, height: number): PageSizeId {
  for (const [id, size] of Object.entries(PAGE_SIZES)) {
    const portrait = Math.abs(size.width - width) < 2 && Math.abs(size.height - height) < 2;
    const landscape = Math.abs(size.width - height) < 2 && Math.abs(size.height - width) < 2;
    if (portrait || landscape) return id as PageSizeId;
  }
  return "custom";
}

function useDialogClose() {
  const close = useEditor((state) => state.closeDialog);
  return close;
}

function FormulaDialog({ object }: { object: FormulaObject | null }) {
  const api = useEditorApi();
  const close = useDialogClose();
  const notebookId = useEditor((state) => state.notebook?.id ?? null);
  const [latex, setLatex] = useState(object?.latex ?? "");
  const [fontSize, setFontSize] = useState(object?.fontSize ?? 28);
  const [color, setColor] = useState(object?.color ?? "#111827");
  const [background, setBackground] = useState<string | null>(object?.background ?? null);
  const [displayMode, setDisplayMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const pushStatus = useEditor((state) => state.pushStatus);

  const preview = renderLatexHtml(latex.trim() || "\\;", displayMode);

  const save = async () => {
    const trimmed = latex.trim();
    if (!trimmed) {
      pushStatus("Enter some LaTeX first.", "error");
      return;
    }
    const engine = api.engine();
    if (!engine) return;
    setBusy(true);
    try {
      const style = { fontSize, color, displayMode, background, padding: Math.max(6, Math.round(fontSize * 0.4)) };
      const raster = await rasterizeFormulaToBlob(trimmed, style);
      if (!raster) {
        pushStatus("Could not render that formula.", "error");
        return;
      }
      const assetId = uid();
      await putAsset({
        id: assetId,
        notebookId,
        kind: "raster",
        name: "formula.png",
        mimeType: raster.blob.type || "image/png",
        size: raster.blob.size,
        width: raster.width,
        height: raster.height,
        blob: raster.blob,
        createdAt: Date.now()
      });
      api.assets.invalidate(assetId);
      const ready = await api.assets.ensureRaster(assetId);
      if (!ready) {
        pushStatus("Could not prepare the formula image.", "error");
        return;
      }
      if (object) {
        engine.updateFormulaObject(object.id, {
          latex: trimmed,
          fontSize,
          color,
          background,
          assetId,
          w: raster.width,
          h: raster.height
        });
      } else {
        engine.insertObject(
          createFormula(trimmed, placeCentered(engine, raster.width, raster.height), engine.getLayers(), {
            fontSize,
            color,
            background,
            assetId
          }),
          "Insert formula"
        );
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{object ? "Edit formula" : "Insert formula"}</DialogTitle>
          <DialogDescription>Type LaTeX and watch the preview update live.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex min-h-24 items-center justify-center overflow-x-auto rounded-xl border border-line bg-surface-2 px-4 py-3">
            <div className="text-ink" style={{ color }} dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
          <Field label="LaTeX" hint="MathLive-style shortcuts work: fractions, integrals, matrices and more.">
            <Textarea
              value={latex}
              onChange={(event) => setLatex(event.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={String.raw`e.g. \frac{-b \pm \sqrt{b^2-4ac}}{2a}`}
              className="font-mono"
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_LATEX.slice(0, 8).map((snippet) => (
              <button
                key={snippet}
                type="button"
                onClick={() => setLatex((current) => (current.trim() ? `${current} ${snippet}` : snippet))}
                className="rounded-lg border border-line px-2 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:border-accent hover:text-ink"
              >
                {snippet}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Size">
              <div className="flex h-8 items-center gap-3">
                <Slider value={fontSize} min={12} max={72} onValueChange={setFontSize} ariaLabel="Formula size" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{fontSize}px</span>
              </div>
            </Field>
            <Field label="Display style">
              <div className="flex h-8 items-center gap-2">
                <Button size="sm" variant={displayMode ? "soft" : "outline"} onClick={() => setDisplayMode(true)}>
                  Block
                </Button>
                <Button size="sm" variant={!displayMode ? "soft" : "outline"} onClick={() => setDisplayMode(false)}>
                  Inline
                </Button>
              </div>
            </Field>
          </div>
          <Field label="Color">
            <ColorControl color={color} onColorChange={setColor} />
          </Field>
          <label className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">Background</span>
            <Switch
              checked={background !== null}
              onCheckedChange={(value) => setBackground(value ? "#ffffff" : null)}
              aria-label="Formula background"
            />
          </label>
          {background !== null ? <ColorControl color={background} onColorChange={setBackground} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Rendering..." : object ? "Save formula" : "Insert formula"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GraphDialog({ object }: { object: GraphObject | null }) {
  const api = useEditorApi();
  const close = useDialogClose();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [functions, setFunctions] = useState<GraphFunction[]>(
    object?.functions.length
      ? object.functions.map((fn) => ({ ...fn }))
      : [{ id: uid(), expression: "sin(x)", color: GRAPH_COLORS[0], hidden: false, width: 2, kind: "cartesian" }]
  );
  const [viewport, setViewport] = useState<GraphViewport>(object?.viewport ?? { ...DEFAULT_VIEWPORT });
  const [showGrid, setShowGrid] = useState(object?.showGrid ?? true);
  const [showAxes, setShowAxes] = useState(object?.showAxes ?? true);
  const [showLabels, setShowLabels] = useState(object?.showLabels ?? true);

  const tempGraph: GraphObject = {
    id: object?.id ?? "preview",
    type: "graph",
    z: 0,
    layerId: object?.layerId ?? "preview",
    locked: false,
    hidden: false,
    opacity: 1,
    groupId: null,
    createdAt: 0,
    updatedAt: 0,
    x: 0,
    y: 0,
    w: 520,
    h: 320,
    rotation: 0,
    viewport,
    functions,
    showGrid,
    showAxes,
    showLabels
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 520 * dpr;
    canvas.height = 320 * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGraph(ctx, tempGraph);
  });

  const errors = graphFunctionErrors(tempGraph);

  const patchFunction = (id: string, patch: Partial<GraphFunction>) => {
    setFunctions((current) => current.map((fn) => (fn.id === id ? { ...fn, ...patch } : fn)));
  };

  const save = () => {
    const engine = api.engine();
    if (!engine) return;
    if (object) {
      engine.updateGraphObject(object.id, { functions, viewport, showGrid, showAxes, showLabels });
    } else {
      engine.insertObject(createGraph(viewport, functions, placeCentered(engine, 480, 360), engine.getLayers()), "Insert graph");
    }
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{object ? "Edit graph" : "Insert graph"}</DialogTitle>
          <DialogDescription>Plot cartesian and polar functions with mathjs.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex justify-center overflow-x-auto rounded-xl border border-line bg-white p-2">
            <canvas ref={canvasRef} style={{ width: 520, height: 320 }} className="max-w-full" />
          </div>
          <div className="flex flex-col gap-2">
            {functions.map((fn) => (
              <div key={fn.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Cycle color"
                  onClick={() => {
                    const index = GRAPH_COLORS.indexOf(fn.color);
                    patchFunction(fn.id, { color: GRAPH_COLORS[(index + 1) % GRAPH_COLORS.length] });
                  }}
                  className="size-6 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: fn.color }}
                />
                <Input
                  value={fn.expression}
                  onChange={(event) => patchFunction(fn.id, { expression: event.target.value })}
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder={fn.kind === "polar" ? "r = 2*sin(3*theta)" : "x^2 - 3"}
                  aria-label="Expression"
                />
                <Select
                  value={fn.kind}
                  onValueChange={(value) => patchFunction(fn.id, { kind: value as GraphFunction["kind"] })}
                  options={[
                    { value: "cartesian", label: "y(x)" },
                    { value: "polar", label: "r(theta)" }
                  ]}
                  ariaLabel="Function kind"
                  className="w-24 shrink-0"
                />
                <div className="hidden w-24 items-center gap-2 sm:flex">
                  <Slider
                    value={fn.width}
                    min={1}
                    max={6}
                    step={0.5}
                    onValueChange={(width) => patchFunction(fn.id, { width })}
                    ariaLabel="Line width"
                  />
                </div>
                <Button
                  size="iconSm"
                  variant="ghost"
                  aria-label={fn.hidden ? "Show function" : "Hide function"}
                  onClick={() => patchFunction(fn.id, { hidden: !fn.hidden })}
                >
                  {fn.hidden ? <EyeOff className="text-ink-faint" /> : <Eye />}
                </Button>
                <Button
                  size="iconSm"
                  variant="ghost"
                  aria-label="Remove function"
                  disabled={functions.length <= 1}
                  onClick={() => setFunctions((current) => current.filter((item) => item.id !== fn.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              disabled={functions.length >= 8}
              onClick={() =>
                setFunctions((current) => [
                  ...current,
                  {
                    id: uid(),
                    expression: "",
                    color: GRAPH_COLORS[current.length % GRAPH_COLORS.length],
                    hidden: false,
                    width: 2,
                    kind: "cartesian"
                  }
                ])
              }
            >
              <Plus /> Add function
            </Button>
            {errors.length > 0 ? (
              <p className="text-[11px] text-danger">
                {errors.map((error) => `${error.expression || "(empty)"}: ${error.error}`).join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["xMin", "xMax", "yMin", "yMax"] as const).map((key) => (
              <Field key={key} label={key}>
                <Input
                  type="number"
                  value={viewport[key]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setViewport((current) => ({ ...current, [key]: value }));
                  }}
                  className="h-8 text-xs"
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
              <Switch checked={showGrid} onCheckedChange={setShowGrid} aria-label="Show grid" /> Grid
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
              <Switch checked={showAxes} onCheckedChange={setShowAxes} aria-label="Show axes" /> Axes
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
              <Switch checked={showLabels} onCheckedChange={setShowLabels} aria-label="Show labels" /> Labels
            </label>
            <Button size="sm" variant="outline" onClick={() => setViewport({ ...DEFAULT_VIEWPORT })}>
              <Scan /> Reset view
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {object ? "Save graph" : "Insert graph"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TableDialog({ object }: { object: TableObject | null }) {
  const api = useEditorApi();
  const close = useDialogClose();
  const [rows, setRows] = useState<string[][]>(
    object?.rows.length
      ? object.rows.map((row) => [...row])
      : [
          ["", "", ""],
          ["", "", ""],
          ["", "", ""]
        ]
  );
  const [headerRow, setHeaderRow] = useState(object?.headerRow ?? true);

  const columns = Math.max(1, ...rows.map((row) => row.length));

  const setCell = (r: number, c: number, value: string) => {
    setRows((current) => current.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)));
  };

  const addRow = () => setRows((current) => [...current, new Array(columns).fill("")]);
  const addColumn = () => setRows((current) => current.map((row) => [...row, ""]));
  const removeRow = () => setRows((current) => (current.length > 1 ? current.slice(0, -1) : current));
  const removeColumn = () =>
    setRows((current) => (columns > 1 ? current.map((row) => row.slice(0, row.length - 1)) : current));

  const save = () => {
    const engine = api.engine();
    if (!engine) return;
    if (object) {
      engine.updateTableObject(object.id, { rows, headerRow });
    } else {
      const rect = placeCentered(engine, columns * 132, rows.length * 36);
      engine.insertObject(createTable(rows, rect, engine.getLayers()), "Insert table");
    }
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{object ? "Edit table" : "Insert table"}</DialogTitle>
          <DialogDescription>Tap a cell to type. Use the buttons below to grow the table.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="ks-scroll overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {rows.map((row, r) => (
                  <tr key={r} className={r === 0 && headerRow ? "bg-surface-2 font-medium" : undefined}>
                    {row.map((cell, c) => (
                      <td key={c} className="border border-line p-0">
                        <input
                          value={cell}
                          onChange={(event) => setCell(r, c, event.target.value)}
                          className="h-9 w-full min-w-32 bg-transparent px-2 text-sm outline-none focus:bg-accent-soft/40"
                          aria-label={`Cell ${r + 1}, ${c + 1}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus /> Row
            </Button>
            <Button size="sm" variant="outline" onClick={addColumn}>
              <Plus /> Column
            </Button>
            <Button size="sm" variant="outline" onClick={removeRow} disabled={rows.length <= 1}>
              <Minus /> Row
            </Button>
            <Button size="sm" variant="outline" onClick={removeColumn} disabled={columns <= 1}>
              <Minus /> Column
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs font-medium text-ink-soft">
              <Switch checked={headerRow} onCheckedChange={setHeaderRow} aria-label="Header row" /> Header row
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {object ? "Save table" : "Insert table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImageDialog({ point }: { point: { x: number; y: number } | null }) {
  const api = useEditorApi();
  const close = useDialogClose();
  const notebookId = useEditor((state) => state.notebook?.id ?? null);
  const pushStatus = useEditor((state) => state.pushStatus);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const insertBlob = async (blob: Blob, name: string) => {
    const engine = api.engine();
    if (!engine) return;
    if (blob.size > MAX_ASSET_SIZE) {
      pushStatus("That image is too large (40 MB max).", "error");
      return;
    }
    if (!blob.type.startsWith("image/")) {
      pushStatus("That file is not an image.", "error");
      return;
    }
    setBusy(true);
    try {
      const assetId = uid();
      await putAsset({
        id: assetId,
        notebookId,
        kind: "image",
        name,
        mimeType: blob.type,
        size: blob.size,
        width: null,
        height: null,
        blob,
        createdAt: Date.now()
      });
      api.assets.invalidate(assetId);
      const ready = await api.assets.ensureImage(assetId);
      const image = ready ? api.assets.render.images.get(assetId) : null;
      if (!image) {
        pushStatus("Could not decode that image.", "error");
        return;
      }
      const naturalWidth = (image instanceof HTMLImageElement ? image.naturalWidth : image.width) || 512;
      const naturalHeight = (image instanceof HTMLImageElement ? image.naturalHeight : image.height) || 512;
      const pageSize = engine.getPageSize();
      const scale = Math.min(1, (pageSize.width * 0.6) / naturalWidth, (pageSize.height * 0.6) / naturalHeight);
      const w = Math.round(naturalWidth * scale);
      const h = Math.round(naturalHeight * scale);
      const anchor = point ?? { x: pageSize.width / 2, y: pageSize.height / 2 };
      engine.insertObject(
        createImage(
          assetId,
          naturalWidth,
          naturalHeight,
          { x: Math.round(anchor.x - w / 2), y: Math.round(anchor.y - h / 2), w, h },
          engine.getLayers()
        ),
        "Insert image"
      );
      close();
    } finally {
      setBusy(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          await insertBlob(blob, "pasted-image");
          return;
        }
      }
      pushStatus("No image found on the clipboard.", "error");
    } catch {
      pushStatus("Clipboard access was blocked by the browser.", "error");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Insert image</DialogTitle>
          <DialogDescription>Images are stored locally inside this notebook's browser database.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void insertBlob(file, file.name);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-accent bg-accent-soft/40" : "border-line"
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
              <ImagePlus className="size-5" />
            </span>
            <p className="text-sm text-ink-soft">Drag an image here, or</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
                Choose file
              </Button>
              <Button variant="outline" size="sm" onClick={() => void pasteFromClipboard()} disabled={busy}>
                Paste from clipboard
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void insertBlob(file, file.name);
              }}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextDialog({ object, point }: { object: TextObject | null; point: { x: number; y: number } | null }) {
  const api = useEditorApi();
  const close = useDialogClose();
  const toolStyle = useEditor((state) => state.toolState.textStyle);
  const base = object?.style ?? toolStyle;
  const [text, setText] = useState(object?.text ?? "");
  const [fontFamily, setFontFamily] = useState(base.fontFamily);
  const [fontSize, setFontSize] = useState(base.fontSize);
  const [color, setColor] = useState(base.color);
  const [bold, setBold] = useState(base.fontWeight >= 700);
  const [italic, setItalic] = useState(base.italic);
  const [underline, setUnderline] = useState(base.underline);
  const [align, setAlign] = useState(base.align);

  const style: TextStyle = {
    ...base,
    fontFamily,
    fontSize,
    fontWeight: bold ? 700 : 400,
    italic,
    underline,
    align,
    color
  };

  const save = () => {
    const engine = api.engine();
    if (!engine) return;
    if (object) {
      const h = measureTextObject(text, style, object.w);
      engine.updateObjects([{ ...object, style, text, h: Math.max(24, h), updatedAt: Date.now() }], "Edit text");
      close();
      return;
    }
    if (!text.trim()) {
      close();
      return;
    }
    const width = 420;
    const h = Math.max(28, measureTextObject(text, style, width));
    const anchor = point ?? { x: 0, y: 0 };
    engine.insertObject(
      createText(text, { x: Math.round(anchor.x), y: Math.round(anchor.y), w: width, h }, style, engine.getLayers()),
      "Insert text"
    );
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{object ? "Edit text" : "Insert text"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label="Text">
            <Textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} rows={4} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Font">
              <Select
                value={fontFamily}
                onValueChange={setFontFamily}
                options={FONT_OPTIONS.map((font) => ({ value: font.id, label: font.name }))}
              />
            </Field>
            <Field label="Size">
              <div className="flex h-8 items-center gap-3">
                <Slider value={fontSize} min={10} max={96} onValueChange={setFontSize} ariaLabel="Font size" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{fontSize}px</span>
              </div>
            </Field>
          </div>
          <Field label="Color">
            <ColorControl color={color} onColorChange={setColor} />
          </Field>
          <div className="flex gap-1.5">
            <Button size="sm" variant={bold ? "soft" : "outline"} className="flex-1 font-bold" onClick={() => setBold((value) => !value)}>
              B
            </Button>
            <Button size="sm" variant={italic ? "soft" : "outline"} className="flex-1 italic" onClick={() => setItalic((value) => !value)}>
              I
            </Button>
            <Button size="sm" variant={underline ? "soft" : "outline"} className="flex-1 underline" onClick={() => setUnderline((value) => !value)}>
              U
            </Button>
          </div>
          <div className="flex gap-1.5">
            {(["left", "center", "right"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={align === value ? "soft" : "outline"}
                className="flex-1 capitalize"
                onClick={() => setAlign(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {object ? "Save text" : "Insert text"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PageSettingsDialog({ page }: { page: NotebookPage }) {
  const api = useEditorApi();
  const close = useDialogClose();
  const pushStatus = useEditor((state) => state.pushStatus);
  const [paper, setPaper] = useState<PaperType>(page.background.paper);
  const [spacing, setSpacing] = useState(page.background.spacing);
  const [color, setColor] = useState(page.background.color);
  const [patternColor, setPatternColor] = useState(page.background.patternColor);
  const initialSize = detectPageSize(page.width, page.height);
  const [sizeId, setSizeId] = useState<PageSizeId>(initialSize);
  const [customW, setCustomW] = useState(Math.round(initialSize === "custom" ? page.width : 900));
  const [customH, setCustomH] = useState(Math.round(initialSize === "custom" ? page.height : 1200));
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(page.width > page.height ? "landscape" : "portrait");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const engine = api.engine();
    setBusy(true);
    try {
      await api.flushSave();
      const dims = resolvePageSize({ pageSize: sizeId, customWidth: customW, customHeight: customH });
      const width = Math.round(orientation === "landscape" ? Math.max(dims.width, dims.height) : Math.min(dims.width, dims.height));
      const height = Math.round(orientation === "landscape" ? Math.min(dims.width, dims.height) : Math.max(dims.width, dims.height));
      const updated = await updatePageProps(page.id, {
        background: { ...page.background, paper, spacing, color, patternColor },
        width,
        height
      });
      if (!updated) {
        pushStatus("Could not update the page.", "error");
        return;
      }
      engine?.loadPage(updated);
      useEditor.getState().setPage(updated);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Page setup</DialogTitle>
          <DialogDescription>Paper style and page dimensions for this page.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label="Paper style">
            <Select
              value={paper}
              onValueChange={(value) => setPaper(value as PaperType)}
              options={PAPER_OPTIONS.map((option) => ({ value: option.id, label: option.name }))}
            />
          </Field>
          {paper !== "blank" && paper !== "custom-image" ? (
            <Field label="Spacing">
              <div className="flex h-8 items-center gap-3">
                <Slider value={spacing} min={8} max={96} onValueChange={setSpacing} ariaLabel="Pattern spacing" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{spacing}px</span>
              </div>
            </Field>
          ) : null}
          <Field label="Paper color">
            <ColorControl color={color} onColorChange={setColor} />
          </Field>
          {paper !== "blank" && paper !== "custom-image" ? (
            <Field label="Pattern color">
              <ColorControl color={patternColor} onColorChange={setPatternColor} />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Page size">
              <Select
                value={sizeId}
                onValueChange={(value) => setSizeId(value as PageSizeId)}
                options={[
                  ...Object.entries(PAGE_SIZES).map(([id, size]) => ({ value: id, label: size.label })),
                  { value: "custom", label: "Custom" }
                ]}
              />
            </Field>
            <Field label="Orientation">
              <div className="flex h-9 gap-1.5">
                {(["portrait", "landscape"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={orientation === value ? "soft" : "outline"}
                    className="flex-1 capitalize"
                    onClick={() => setOrientation(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </Field>
          </div>
          {sizeId === "custom" ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Width (px)">
                <Input
                  type="number"
                  min={200}
                  max={8000}
                  value={customW}
                  onChange={(event) => setCustomW(Number(event.target.value) || 900)}
                />
              </Field>
              <Field label="Height (px)">
                <Input
                  type="number"
                  min={200}
                  max={8000}
                  value={customH}
                  onChange={(event) => setCustomH(Number(event.target.value) || 1200)}
                />
              </Field>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Applying..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditorDialogs() {
  const dialog = useEditor((state) => state.dialog);
  const page = useEditor((state) => state.page);
  const api = useEditorApi();

  if (!dialog) return null;
  if (dialog.kind === "formula") return <FormulaDialog object={dialog.object} />;
  if (dialog.kind === "graph") return <GraphDialog object={dialog.object} />;
  if (dialog.kind === "table") return <TableDialog object={dialog.object} />;
  if (dialog.kind === "image") return <ImageDialog point={dialog.point} />;
  if (dialog.kind === "text") return <TextDialog object={dialog.object} point={dialog.point} />;
  if (dialog.kind === "page-settings") {
    if (!page) return null;
    const engine = api.engine();
    const key = `${page.id}:${page.width}x${page.height}:${page.background.paper}`;
    return <PageSettingsDialog key={key} page={page} />;
  }
  if (dialog.kind === "export") return <ExportDialog />;
  if (dialog.kind === "calc") return <CalcDialog />;
  if (dialog.kind === "templates") return <TemplatesDialog />;
  return null;
}
