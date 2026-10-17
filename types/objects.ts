export interface Point {
  x: number;
  y: number;
  p: number;
  t: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PenType =
  | "ballpoint"
  | "fountain"
  | "pencil"
  | "mechanical"
  | "sketch"
  | "marker"
  | "highlighter"
  | "brush"
  | "calligraphy"
  | "custom";

export type BlendMode = "source-over" | "multiply" | "screen" | "darken" | "lighten";

export interface StrokeStyle {
  penType: PenType;
  color: string;
  width: number;
  opacity: number;
  smoothing: number;
  pressure: boolean;
  texture: number;
  lineCap: "round" | "butt" | "square";
  lineJoin: "round" | "bevel" | "miter";
  blend: BlendMode;
  dash: number[] | null;
  nibAngle?: number;
  softness?: number;
}

export interface ObjectBase {
  id: string;
  z: number;
  layerId: string;
  name?: string;
  locked: boolean;
  hidden: boolean;
  opacity: number;
  groupId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StrokeObject extends ObjectBase {
  type: "stroke";
  style: StrokeStyle;
  points: Point[];
  seed: number;
}

export type ShapeKind =
  | "line"
  | "arrow"
  | "arrow-both"
  | "rect"
  | "rect-rounded"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "polyline"
  | "curve"
  | "freeform"
  | "speech"
  | "thought"
  | "process"
  | "decision"
  | "terminator"
  | "data"
  | "connector"
  | "dimension"
  | "axes"
  | "grid";

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fill: string | null;
  fillOpacity: number;
  dash: number[] | null;
}

export interface ShapeObject extends ObjectBase {
  type: "shape";
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  style: ShapeStyle;
  points?: Point[];
  sides?: number;
  text?: string;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  color: string;
  lineHeight: number;
  background: string | null;
  padding: number;
}

export interface TextObject extends ObjectBase {
  type: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text: string;
  style: TextStyle;
}

export interface ImageObject extends ObjectBase {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: Rect | null;
  radius: number;
}

export interface FormulaObject extends ObjectBase {
  type: "formula";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  latex: string;
  fontSize: number;
  color: string;
  background: string | null;
  assetId: string | null;
}

export type GraphFunctionKind = "cartesian" | "polar";

export interface GraphFunction {
  id: string;
  expression: string;
  color: string;
  hidden: boolean;
  width: number;
  kind: GraphFunctionKind;
}

export interface GraphViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface GraphObject extends ObjectBase {
  type: "graph";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  viewport: GraphViewport;
  functions: GraphFunction[];
  showGrid: boolean;
  showAxes: boolean;
  showLabels: boolean;
}

export interface TableStyle {
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  color: string;
  headerBg: string;
}

export interface TableObject extends ObjectBase {
  type: "table";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  rows: string[][];
  headerRow: boolean;
  style: TableStyle;
}

export type SceneObject =
  | StrokeObject
  | ShapeObject
  | TextObject
  | ImageObject
  | FormulaObject
  | GraphObject
  | TableObject;

export type RectObject = Exclude<SceneObject, StrokeObject>;

export type ObjectType = SceneObject["type"];

export type LayerKind = "ink" | "shapes" | "text" | "images" | "formulas" | "graphs" | "tables";

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export const OBJECT_TYPE_BY_DEFAULT: Record<ObjectType, LayerKind> = {
  stroke: "ink",
  shape: "shapes",
  text: "text",
  image: "images",
  formula: "formulas",
  graph: "graphs",
  table: "tables"
};
