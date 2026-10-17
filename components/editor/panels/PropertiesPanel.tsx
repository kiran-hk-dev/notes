"use client";

import { useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Group,
  Lock,
  LockOpen,
  Trash2,
  Ungroup
} from "lucide-react";
import type { SceneObject, ShapeKind, ShapeStyle, StrokeStyle, TextStyle } from "@/types";
import { FONT_OPTIONS, HIGHLIGHTER_COLORS, PEN_DEFS, defaultStrokeStyle } from "@/lib/defaults";
import type { EraserMode } from "@/lib/drawing/engine";
import { useEditor } from "@/lib/state/editorStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { useEditorApi } from "@/components/editor/editorContext";
import { ColorControl } from "@/components/editor/ColorControl";

const SHAPE_LABELS: Record<ShapeKind, string> = {
  line: "Line",
  arrow: "Arrow",
  "arrow-both": "Double arrow",
  rect: "Rectangle",
  "rect-rounded": "Rounded rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  pentagon: "Pentagon",
  hexagon: "Hexagon",
  star: "Star",
  polyline: "Polyline",
  curve: "Curve",
  freeform: "Freeform",
  speech: "Speech bubble",
  thought: "Thought bubble",
  process: "Process",
  decision: "Decision",
  terminator: "Terminator",
  data: "Data",
  connector: "Connector",
  dimension: "Dimension",
  axes: "Axes",
  grid: "Grid"
};

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function PropertiesPanel() {
  const docVersion = useEditor((state) => state.docVersion);
  const toolState = useEditor((state) => state.toolState);
  const summary = useEditor((state) => state.selectionSummary);
  const api = useEditorApi();
  const engine = api.engine();
  void docVersion;

  const selected = useMemo(() => (engine ? engine.getSelectedObjects() : []), [engine, docVersion, summary]);

  const patchStrokes = (patch: Partial<StrokeStyle>) => {
    if (!engine) return;
    const strokes = selected.filter((object): object is Extract<SceneObject, { type: "stroke" }> => object.type === "stroke");
    if (strokes.length === 0) return;
    engine.updateObjects(
      strokes.map((object) => ({ ...object, style: { ...object.style, ...patch } })),
      "Stroke style"
    );
  };

  const patchShapes = (patch: Partial<ShapeStyle>) => {
    if (!engine) return;
    const shapes = selected.filter((object): object is Extract<SceneObject, { type: "shape" }> => object.type === "shape");
    if (shapes.length === 0) return;
    engine.updateObjects(
      shapes.map((object) => ({ ...object, style: { ...object.style, ...patch } })),
      "Shape style"
    );
  };

  const patchTexts = (patch: Partial<TextStyle>) => {
    if (!engine) return;
    const texts = selected.filter((object): object is Extract<SceneObject, { type: "text" }> => object.type === "text");
    if (texts.length === 0) return;
    engine.updateObjects(
      texts.map((object) => ({ ...object, style: { ...object.style, ...patch } })),
      "Text style"
    );
  };

  if (!engine) return null;

  if (summary.count > 0 && summary.first) {
    const first = selected[0] ?? summary.first;
    const layers = engine.getLayers();
    return (
      <div>
        <Section
          title={`${summary.count} selected · ${summary.types.join(", ")}`}
          action={
            <div className="flex gap-1">
              <Button size="iconSm" variant="ghost" aria-label="Duplicate" onClick={() => engine.duplicateSelection()}>
                <Copy />
              </Button>
              <Button size="iconSm" variant="dangerGhost" aria-label="Delete" onClick={() => engine.deleteSelection()}>
                <Trash2 />
              </Button>
            </div>
          }
        >
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => engine.toggleLockSelection()}>
              {summary.allLocked ? <LockOpen /> : <Lock />}
              {summary.allLocked ? "Unlock" : "Lock"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => engine.groupSelection()} disabled={summary.count < 2}>
              <Group /> Group
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => engine.ungroupSelection()}>
              <Ungroup /> Ungroup
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            <Button size="sm" variant="ghost" aria-label="Bring to front" onClick={() => engine.reorderSelection("front")}>
              <ArrowUpToLine />
            </Button>
            <Button size="sm" variant="ghost" aria-label="Bring forward" onClick={() => engine.reorderSelection("forward")}>
              <ChevronUp />
            </Button>
            <Button size="sm" variant="ghost" aria-label="Send backward" onClick={() => engine.reorderSelection("backward")}>
              <ChevronDown />
            </Button>
            <Button size="sm" variant="ghost" aria-label="Send to back" onClick={() => engine.reorderSelection("back")}>
              <ArrowDownToLine />
            </Button>
          </div>
          <Field label="Layer">
            <Select
              value={first.layerId}
              onValueChange={(value) => engine.setSelectionLayer(value)}
              options={layers.map((layer) => ({ value: layer.id, label: layer.name }))}
            />
          </Field>
          <Field label="Opacity">
            <div className="flex h-8 items-center gap-3">
              <Slider
                value={Math.round(first.opacity * 100)}
                min={5}
                max={100}
                onValueChange={(value) => engine.updateSelectedObjects({ opacity: value / 100 })}
                ariaLabel="Object opacity"
              />
              <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{Math.round(first.opacity * 100)}%</span>
            </div>
          </Field>
        </Section>

        {summary.allSameType === "stroke" && first.type === "stroke" ? (
          <Section title="Pen style">
            <Field label="Pen">
              <Select
                value={first.style.penType}
                onValueChange={(value) => {
                  const base = defaultStrokeStyle(value as StrokeStyle["penType"], first.style.color);
                  patchStrokes({ ...base, opacity: first.style.opacity });
                }}
                options={PEN_DEFS.map((pen) => ({ value: pen.id, label: pen.name }))}
              />
            </Field>
            <Field label="Color">
              <ColorControl
                color={first.style.color}
                palette={first.style.penType === "highlighter" ? HIGHLIGHTER_COLORS : undefined}
                onColorChange={(color) => patchStrokes({ color })}
              />
            </Field>
            <Field label="Width">
              <div className="flex h-8 items-center gap-3">
                <Slider value={first.style.width} min={1} max={48} step={0.5} onValueChange={(width) => patchStrokes({ width })} ariaLabel="Stroke width" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{first.style.width}px</span>
              </div>
            </Field>
            <Field label="Opacity">
              <div className="flex h-8 items-center gap-3">
                <Slider
                  value={Math.round(first.style.opacity * 100)}
                  min={5}
                  max={100}
                  onValueChange={(value) => patchStrokes({ opacity: value / 100 })}
                  ariaLabel="Stroke opacity"
                />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{Math.round(first.style.opacity * 100)}%</span>
              </div>
            </Field>
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-soft">Pressure width</span>
              <Switch checked={first.style.pressure} onCheckedChange={(value) => patchStrokes({ pressure: value })} aria-label="Pressure width" />
            </label>
          </Section>
        ) : null}

        {summary.allSameType === "shape" && first.type === "shape" ? (
          <Section title="Shape style">
            {summary.count === 1 ? (
              <Field label="Shape">
                <Select
                  value={first.shape}
                  onValueChange={(value) => engine.updateObjects([{ ...first, shape: value as ShapeKind }], "Change shape")}
                  options={(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((kind) => ({ value: kind, label: SHAPE_LABELS[kind] }))}
                />
              </Field>
            ) : null}
            <Field label="Stroke">
              <ColorControl color={first.style.stroke} onColorChange={(stroke) => patchShapes({ stroke })} />
            </Field>
            <Field label="Stroke width">
              <div className="flex h-8 items-center gap-3">
                <Slider value={first.style.strokeWidth} min={1} max={24} step={0.5} onValueChange={(strokeWidth) => patchShapes({ strokeWidth })} ariaLabel="Shape stroke width" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{first.style.strokeWidth}px</span>
              </div>
            </Field>
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-soft">Fill</span>
              <Switch
                checked={first.style.fill !== null}
                onCheckedChange={(value) => patchShapes({ fill: value ? "#e0e7ff" : null })}
                aria-label="Shape fill"
              />
            </label>
            {first.style.fill !== null ? (
              <>
                <ColorControl color={first.style.fill} onColorChange={(fill) => patchShapes({ fill })} />
                <Field label="Fill opacity">
                  <div className="flex h-8 items-center gap-3">
                    <Slider
                      value={Math.round(first.style.fillOpacity * 100)}
                      min={5}
                      max={100}
                      onValueChange={(value) => patchShapes({ fillOpacity: value / 100 })}
                      ariaLabel="Fill opacity"
                    />
                    <span className="w-10 text-right text-xs tabular-nums text-ink-faint">
                      {Math.round(first.style.fillOpacity * 100)}%
                    </span>
                  </div>
                </Field>
              </>
            ) : null}
          </Section>
        ) : null}

        {summary.allSameType === "text" && first.type === "text" ? (
          <Section title="Text">
            <Field label="Font">
              <Select
                value={first.style.fontFamily}
                onValueChange={(fontFamily) => patchTexts({ fontFamily })}
                options={FONT_OPTIONS.map((font) => ({ value: font.id, label: font.name }))}
              />
            </Field>
            <Field label="Size">
              <div className="flex h-8 items-center gap-3">
                <Slider value={first.style.fontSize} min={10} max={96} onValueChange={(fontSize) => patchTexts({ fontSize })} ariaLabel="Font size" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{first.style.fontSize}px</span>
              </div>
            </Field>
            <Field label="Color">
              <ColorControl color={first.style.color} onColorChange={(color) => patchTexts({ color })} />
            </Field>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={first.style.fontWeight >= 700 ? "soft" : "outline"}
                className="flex-1 font-bold"
                onClick={() => patchTexts({ fontWeight: first.style.fontWeight >= 700 ? 400 : 700 })}
              >
                B
              </Button>
              <Button
                size="sm"
                variant={first.style.italic ? "soft" : "outline"}
                className="flex-1 italic"
                onClick={() => patchTexts({ italic: !first.style.italic })}
              >
                I
              </Button>
              <Button
                size="sm"
                variant={first.style.underline ? "soft" : "outline"}
                className="flex-1 underline"
                onClick={() => patchTexts({ underline: !first.style.underline })}
              >
                U
              </Button>
            </div>
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((align) => (
                <Button
                  key={align}
                  size="sm"
                  variant={first.style.align === align ? "soft" : "outline"}
                  className="flex-1 capitalize"
                  onClick={() => patchTexts({ align })}
                >
                  {align}
                </Button>
              ))}
            </div>
          </Section>
        ) : null}

        {summary.allSameType === "image" && first.type === "image" ? (
          <Section title="Image">
            <Field label="Corner radius">
              <div className="flex h-8 items-center gap-3">
                <Slider value={first.radius} min={0} max={64} onValueChange={(radius) => engine.updateSelectedObjects({ radius })} ariaLabel="Corner radius" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{first.radius}px</span>
              </div>
            </Field>
          </Section>
        ) : null}

        {summary.allSameType === "formula" && first.type === "formula" ? (
          <Section
            title="Formula"
            action={
              <Button size="sm" variant="soft" onClick={() => useEditor.getState().openDialog({ kind: "formula", object: first })}>
                Edit LaTeX
              </Button>
            }
          >
            <Field label="Font size">
              <div className="flex h-8 items-center gap-3">
                <Slider
                  value={first.fontSize}
                  min={12}
                  max={72}
                  onValueChange={(fontSize) => {
                    for (const object of selected) {
                      if (object.type === "formula") engine.updateFormulaObject(object.id, { fontSize });
                    }
                  }}
                  ariaLabel="Formula font size"
                />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{first.fontSize}px</span>
              </div>
            </Field>
            <Field label="Color">
              <ColorControl
                color={first.color}
                onColorChange={(color) => {
                  for (const object of selected) {
                    if (object.type === "formula") engine.updateFormulaObject(object.id, { color });
                  }
                }}
              />
            </Field>
          </Section>
        ) : null}

        {summary.allSameType === "graph" && first.type === "graph" ? (
          <Section
            title="Graph"
            action={
              <Button size="sm" variant="soft" onClick={() => useEditor.getState().openDialog({ kind: "graph", object: first })}>
                Edit
              </Button>
            }
          >
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-soft">Grid</span>
              <Switch
                checked={first.showGrid}
                onCheckedChange={(showGrid) => engine.updateGraphObject(first.id, { showGrid })}
                aria-label="Show grid"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-soft">Axes</span>
              <Switch
                checked={first.showAxes}
                onCheckedChange={(showAxes) => engine.updateGraphObject(first.id, { showAxes })}
                aria-label="Show axes"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-soft">Labels</span>
              <Switch
                checked={first.showLabels}
                onCheckedChange={(showLabels) => engine.updateGraphObject(first.id, { showLabels })}
                aria-label="Show labels"
              />
            </label>
          </Section>
        ) : null}

        {summary.allSameType === "table" && first.type === "table" ? (
          <Section
            title="Table"
            action={
              <Button size="sm" variant="soft" onClick={() => useEditor.getState().openDialog({ kind: "table", object: first })}>
                Edit
              </Button>
            }
          >
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-soft">Header row</span>
              <Switch
                checked={first.headerRow}
                onCheckedChange={(headerRow) => engine.updateTableObject(first.id, { headerRow })}
                aria-label="Header row"
              />
            </label>
          </Section>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {toolState.tool === "pen" ? (
        <Section title="Pen">
          <Field label="Pen type">
            <Select
              value={toolState.strokeStyle.penType}
              onValueChange={(value) => engine.setStrokePen(value as StrokeStyle["penType"], defaultStrokeStyle(value as StrokeStyle["penType"], toolState.strokeStyle.color))}
              options={PEN_DEFS.map((pen) => ({ value: pen.id, label: pen.name }))}
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            {PEN_DEFS.find((pen) => pen.id === toolState.strokeStyle.penType)?.description}
          </p>
          <Field label="Color">
            <ColorControl
              color={toolState.strokeStyle.color}
              palette={toolState.strokeStyle.penType === "highlighter" ? HIGHLIGHTER_COLORS : undefined}
              onColorChange={(color) => engine.setStrokeStyle({ color })}
            />
          </Field>
          <Field label="Width">
            <div className="flex h-8 items-center gap-3">
              <Slider
                value={toolState.strokeStyle.width}
                min={1}
                max={toolState.strokeStyle.penType === "highlighter" ? 60 : 40}
                step={0.5}
                onValueChange={(width) => engine.setStrokeStyle({ width })}
                ariaLabel="Brush width"
              />
              <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{toolState.strokeStyle.width}px</span>
            </div>
          </Field>
          <Field label="Opacity">
            <div className="flex h-8 items-center gap-3">
              <Slider
                value={Math.round(toolState.strokeStyle.opacity * 100)}
                min={5}
                max={100}
                onValueChange={(value) => engine.setStrokeStyle({ opacity: value / 100 })}
                ariaLabel="Brush opacity"
              />
              <span className="w-10 text-right text-xs tabular-nums text-ink-faint">
                {Math.round(toolState.strokeStyle.opacity * 100)}%
              </span>
            </div>
          </Field>
          <Field label="Smoothing">
            <div className="flex h-8 items-center gap-3">
              <Slider
                value={Math.round(toolState.strokeStyle.smoothing * 100)}
                min={0}
                max={100}
                onValueChange={(value) => engine.setStrokeStyle({ smoothing: value / 100 })}
                ariaLabel="Stroke smoothing"
              />
              <span className="w-10 text-right text-xs tabular-nums text-ink-faint">
                {Math.round(toolState.strokeStyle.smoothing * 100)}%
              </span>
            </div>
          </Field>
          <label className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">Pen pressure</span>
            <Switch
              checked={toolState.strokeStyle.pressure}
              onCheckedChange={(pressure) => engine.setStrokeStyle({ pressure })}
              aria-label="Pen pressure"
            />
          </label>
        </Section>
      ) : null}

      {toolState.tool === "eraser" ? (
        <Section title="Eraser">
          <div className="flex gap-1.5">
            {(["stroke", "partial", "object"] as EraserMode[]).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={toolState.eraserMode === mode ? "soft" : "outline"}
                className="flex-1 capitalize"
                onClick={() => engine.setEraser(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            {toolState.eraserMode === "stroke"
              ? "Removes whole strokes in one sweep."
              : toolState.eraserMode === "partial"
                ? "Splits strokes where you erase — like an ink eraser."
                : "Removes entire objects, including shapes and text."}
          </p>
          <Field label="Size">
            <div className="flex h-8 items-center gap-3">
              <Slider value={toolState.eraserSize} min={8} max={96} onValueChange={(size) => engine.setEraserSize(size)} ariaLabel="Eraser size" />
              <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{toolState.eraserSize}px</span>
            </div>
          </Field>
        </Section>
      ) : null}

      {toolState.tool === "shape" ? (
        <Section title="Shape">
          <Field label="Shape">
            <Select
              value={toolState.shapeKind}
              onValueChange={(value) => engine.setShapeKind(value as ShapeKind)}
              options={(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((kind) => ({ value: kind, label: SHAPE_LABELS[kind] }))}
            />
          </Field>
          <Field label="Stroke">
            <ColorControl color={toolState.shapeStyle.stroke} onColorChange={(stroke) => engine.setShapeStyle({ stroke })} />
          </Field>
          <Field label="Stroke width">
            <div className="flex h-8 items-center gap-3">
              <Slider
                value={toolState.shapeStyle.strokeWidth}
                min={1}
                max={24}
                step={0.5}
                onValueChange={(strokeWidth) => engine.setShapeStyle({ strokeWidth })}
                ariaLabel="Shape stroke width"
              />
              <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{toolState.shapeStyle.strokeWidth}px</span>
            </div>
          </Field>
          <label className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">Fill</span>
            <Switch
              checked={toolState.shapeStyle.fill !== null}
              onCheckedChange={(value) => engine.setShapeStyle({ fill: value ? "#e0e7ff" : null })}
              aria-label="Shape fill"
            />
          </label>
          {toolState.shapeStyle.fill !== null ? (
            <ColorControl color={toolState.shapeStyle.fill} onColorChange={(fill) => engine.setShapeStyle({ fill })} />
          ) : null}
        </Section>
      ) : null}

      {toolState.tool === "text" ? (
        <Section title="Text">
          <Field label="Font">
            <Select
              value={toolState.textStyle.fontFamily}
              onValueChange={(fontFamily) => engine.setTextStyle({ fontFamily })}
              options={FONT_OPTIONS.map((font) => ({ value: font.id, label: font.name }))}
            />
          </Field>
          <Field label="Size">
            <div className="flex h-8 items-center gap-3">
              <Slider
                value={toolState.textStyle.fontSize}
                min={10}
                max={96}
                onValueChange={(fontSize) => engine.setTextStyle({ fontSize })}
                ariaLabel="Text size"
              />
              <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{toolState.textStyle.fontSize}px</span>
            </div>
          </Field>
          <Field label="Color">
            <ColorControl color={toolState.textStyle.color} onColorChange={(color) => engine.setTextStyle({ color })} />
          </Field>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={toolState.textStyle.fontWeight >= 700 ? "soft" : "outline"}
              className="flex-1 font-bold"
              onClick={() => engine.setTextStyle({ fontWeight: toolState.textStyle.fontWeight >= 700 ? 400 : 700 })}
            >
              B
            </Button>
            <Button
              size="sm"
              variant={toolState.textStyle.italic ? "soft" : "outline"}
              className="flex-1 italic"
              onClick={() => engine.setTextStyle({ italic: !toolState.textStyle.italic })}
            >
              I
            </Button>
            <Button
              size="sm"
              variant={toolState.textStyle.underline ? "soft" : "outline"}
              className="flex-1 underline"
              onClick={() => engine.setTextStyle({ underline: !toolState.textStyle.underline })}
            >
              U
            </Button>
          </div>
          <div className="flex gap-1.5">
            {(["left", "center", "right"] as const).map((align) => (
              <Button
                key={align}
                size="sm"
                variant={toolState.textStyle.align === align ? "soft" : "outline"}
                className="flex-1 capitalize"
                onClick={() => engine.setTextStyle({ align })}
              >
                {align}
              </Button>
            ))}
          </div>
        </Section>
      ) : null}

      {toolState.tool === "select" || toolState.tool === "lasso" ? (
        <Section title={toolState.tool === "select" ? "Select" : "Lasso select"}>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            {toolState.tool === "select"
              ? "Tap an object to select. Drag empty space for a marquee. Drag a selection to move it; use the handles to resize or rotate."
              : "Draw a loop around the objects you want to select."}
          </p>
          <Button size="sm" variant="outline" onClick={() => engine.selectAll()}>
            Select all
          </Button>
        </Section>
      ) : null}

      {toolState.tool === "laser" ? (
        <Section title="Laser pointer">
          <p className="text-[11px] leading-relaxed text-ink-faint">
            A fading trail to guide attention — nothing is saved. Great for teaching.
          </p>
        </Section>
      ) : null}

      {toolState.tool === "formula" ? (
        <Section title="Formula">
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Insert a LaTeX equation at the center of the page, or tap an existing formula to edit it.
          </p>
          <Button size="sm" variant="primary" onClick={() => useEditor.getState().openDialog({ kind: "formula", object: null })}>
            Insert formula
          </Button>
        </Section>
      ) : null}

      {toolState.tool === "graph" ? (
        <Section title="Graph">
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Plot functions on a canvas graph, or tap an existing graph to edit it.
          </p>
          <Button size="sm" variant="primary" onClick={() => useEditor.getState().openDialog({ kind: "graph", object: null })}>
            Insert graph
          </Button>
        </Section>
      ) : null}

      {toolState.tool === "table" ? (
        <Section title="Table">
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Add a structured table, or tap an existing table to edit it.
          </p>
          <Button size="sm" variant="primary" onClick={() => useEditor.getState().openDialog({ kind: "table", object: null })}>
            Insert table
          </Button>
        </Section>
      ) : null}

      {toolState.tool === "image" ? (
        <Section title="Image">
          <p className="text-[11px] leading-relaxed text-ink-faint">Tap the page to place an image there.</p>
          <Button size="sm" variant="outline" onClick={() => useEditor.getState().openDialog({ kind: "image", point: null })}>
            Choose image…
          </Button>
        </Section>
      ) : null}

      <Section title="Page">
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="outline" onClick={() => useEditor.getState().openDialog({ kind: "page-settings" })}>
            Page setup
          </Button>
          <Button size="sm" variant="outline" onClick={() => engine.fitToPage()}>
            Fit page
          </Button>
        </div>
        <Button
          size="sm"
          variant={useEditor.getState().rulerActive ? "soft" : "outline"}
          onClick={() => {
            const next = !engine.getRuler().active;
            engine.setRuler(next);
            useEditor.getState().setRulerActive(next);
          }}
        >
          Ruler: {engine.getRuler().active ? "on" : "off"}
        </Button>
      </Section>
    </div>
  );
}
