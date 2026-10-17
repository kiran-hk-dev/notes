import type {
  FormulaObject,
  GraphFunction,
  GraphObject,
  GraphViewport,
  ImageObject,
  Layer,
  LayerKind,
  Point,
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
import { uid } from "@/lib/utils";
import { OBJECT_TYPE_BY_DEFAULT } from "@/types/objects";

function baseFields(layerId: string) {
  const t = Date.now();
  return {
    id: uid(),
    z: 0,
    layerId,
    locked: false,
    hidden: false,
    opacity: 1,
    groupId: null,
    createdAt: t,
    updatedAt: t
  };
}

export function findLayerFor(layers: Layer[], kind: LayerKind): Layer {
  return layers.find((l) => l.kind === kind) ?? layers[0];
}

export function createStroke(points: Point[], style: StrokeStyle, layers: Layer[], layerId?: string): StrokeObject {
  const layer = layerId ? layers.find((l) => l.id === layerId) ?? findLayerFor(layers, "ink") : findLayerFor(layers, "ink");
  return {
    ...baseFields(layer.id),
    type: "stroke",
    style: { ...style },
    points: points.map((p) => ({ ...p })),
    seed: Math.floor(Math.random() * 2 ** 31)
  };
}

export function defaultShapeStyle(overrides: Partial<ShapeStyle> = {}): ShapeStyle {
  return {
    stroke: "#1f2937",
    strokeWidth: 2,
    fill: null,
    fillOpacity: 1,
    dash: null,
    ...overrides
  };
}

export function createShape(
  shape: ShapeKind,
  rect: { x: number; y: number; w: number; h: number },
  style: ShapeStyle,
  layers: Layer[],
  layerId?: string
): ShapeObject {
  const layer = layerId ? layers.find((l) => l.id === layerId) ?? findLayerFor(layers, "shapes") : findLayerFor(layers, "shapes");
  return {
    ...baseFields(layer.id),
    type: "shape",
    shape,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    style: { ...style },
    points: undefined,
    text: undefined
  };
}

export function defaultTextStyle(overrides: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 18,
    fontWeight: 400,
    italic: false,
    underline: false,
    align: "left",
    color: "#111827",
    lineHeight: 1.4,
    background: null,
    padding: 6,
    ...overrides
  };
}

export function createText(
  text: string,
  rect: { x: number; y: number; w: number; h: number },
  style: TextStyle,
  layers: Layer[],
  layerId?: string
): TextObject {
  const layer = layerId ? layers.find((l) => l.id === layerId) ?? findLayerFor(layers, "text") : findLayerFor(layers, "text");
  return {
    ...baseFields(layer.id),
    type: "text",
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    text,
    style: { ...style }
  };
}

export function createImage(
  assetId: string,
  naturalWidth: number,
  naturalHeight: number,
  rect: { x: number; y: number; w: number; h: number },
  layers: Layer[]
): ImageObject {
  const layer = findLayerFor(layers, "images");
  return {
    ...baseFields(layer.id),
    type: "image",
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    assetId,
    naturalWidth,
    naturalHeight,
    crop: null,
    radius: 0
  };
}

export function createFormula(
  latex: string,
  rect: { x: number; y: number; w: number; h: number },
  layers: Layer[],
  options: { fontSize?: number; color?: string; background?: string | null; assetId?: string | null } = {}
): FormulaObject {
  const layer = findLayerFor(layers, "formulas");
  return {
    ...baseFields(layer.id),
    type: "formula",
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    latex,
    fontSize: options.fontSize ?? 28,
    color: options.color ?? "#111827",
    background: options.background ?? null,
    assetId: options.assetId ?? null
  };
}

export function createGraph(
  viewport: GraphViewport,
  functions: GraphFunction[],
  rect: { x: number; y: number; w: number; h: number },
  layers: Layer[]
): GraphObject {
  const layer = findLayerFor(layers, "graphs");
  return {
    ...baseFields(layer.id),
    type: "graph",
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    viewport: { ...viewport },
    functions: functions.map((f) => ({ ...f })),
    showGrid: true,
    showAxes: true,
    showLabels: true
  };
}

export function createTable(
  rows: string[][],
  rect: { x: number; y: number; w: number; h: number },
  layers: Layer[]
): TableObject {
  const layer = findLayerFor(layers, "tables");
  return {
    ...baseFields(layer.id),
    type: "table",
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    rows: rows.map((r) => [...r]),
    headerRow: true,
    style: {
      stroke: "#94a3b8",
      strokeWidth: 1,
      fontSize: 14,
      color: "#111827",
      headerBg: "#f1f5f9"
    }
  };
}

export function objectBBox(object: SceneObject): { x: number; y: number; w: number; h: number } {
  switch (object.type) {
    case "stroke": {
      if (object.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of object.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = object.style.width / 2 + 2;
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case "shape": {
      if (object.points && object.points.length > 0 && (object.shape === "freeform" || object.shape === "polyline" || object.shape === "curve")) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of object.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      return {
        x: Math.min(object.x, object.x + object.w),
        y: Math.min(object.y, object.y + object.h),
        w: Math.abs(object.w),
        h: Math.abs(object.h)
      };
    }
    default:
      return {
        x: Math.min(object.x, object.x + object.w),
        y: Math.min(object.y, object.y + object.h),
        w: Math.abs(object.w),
        h: Math.abs(object.h)
      };
  }
}

export function directionForObjectType(type: SceneObject["type"]): LayerKind {
  return OBJECT_TYPE_BY_DEFAULT[type];
}
