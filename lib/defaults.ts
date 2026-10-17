import type {
  CoverDesign,
  Layer,
  NotebookSettings,
  PageBackground,
  PageSizeId,
  PaperType,
  PenType,
  StrokeStyle
} from "@/types";
import { uid } from "@/lib/utils";

export const MM_TO_PX = 96 / 25.4;

export const PAGE_SIZES: Record<Exclude<PageSizeId, "custom">, { width: number; height: number; label: string }> = {
  a4: { width: 210 * MM_TO_PX, height: 297 * MM_TO_PX, label: "A4 (210 x 297 mm)" },
  letter: { width: 8.5 * 96, height: 11 * 96, label: "Letter (8.5 x 11 in)" },
  legal: { width: 8.5 * 96, height: 14 * 96, label: "Legal (8.5 x 14 in)" },
  a5: { width: 148 * MM_TO_PX, height: 210 * MM_TO_PX, label: "A5 (148 x 210 mm)" },
  a3: { width: 297 * MM_TO_PX, height: 420 * MM_TO_PX, label: "A3 (297 x 420 mm)" },
  square: { width: 210 * MM_TO_PX, height: 210 * MM_TO_PX, label: "Square (210 x 210 mm)" }
};

export function resolvePageSize(settings: Pick<NotebookSettings, "pageSize" | "customWidth" | "customHeight">) {
  if (settings.pageSize === "custom") {
    return { width: settings.customWidth, height: settings.customHeight };
  }
  const size = PAGE_SIZES[settings.pageSize];
  return { width: size.width, height: size.height };
}

export interface PaperOption {
  id: PaperType;
  name: string;
  description: string;
  defaultSpacing: number;
}

export const PAPER_OPTIONS: PaperOption[] = [
  { id: "blank", name: "Blank", description: "No guides", defaultSpacing: 32 },
  { id: "college", name: "College ruled", description: "7.1 mm ruled lines", defaultSpacing: 27 },
  { id: "wide", name: "Wide ruled", description: "8.7 mm ruled lines", defaultSpacing: 33 },
  { id: "grid", name: "Graph", description: "Square 5 mm grid", defaultSpacing: 19 },
  { id: "dots", name: "Dotted", description: "Dot grid", defaultSpacing: 24 },
  { id: "isometric", name: "Isometric", description: "3D sketch guides", defaultSpacing: 24 },
  { id: "music", name: "Music", description: "Manuscript staves", defaultSpacing: 48 },
  { id: "custom-image", name: "Custom image", description: "Upload a background image", defaultSpacing: 32 }
];

export const PEN_DEFS: {
  id: PenType;
  name: string;
  description: string;
  width: number;
  opacity: number;
  texture: number;
  softness: number;
  blend: StrokeStyle["blend"];
  pressure: boolean;
}[] = [
  { id: "ballpoint", name: "Ballpoint pen", description: "Smooth, consistent lines", width: 2.4, opacity: 1, texture: 0, softness: 0, blend: "source-over", pressure: false },
  { id: "fountain", name: "Fountain pen", description: "Width varies with speed and pressure", width: 3.2, opacity: 1, texture: 0, softness: 0.2, blend: "source-over", pressure: true },
  { id: "pencil", name: "Pencil", description: "Textured graphite strokes", width: 2.6, opacity: 0.85, texture: 0.7, softness: 0.35, blend: "source-over", pressure: true },
  { id: "mechanical", name: "Mechanical pencil", description: "Fine, uniform lines", width: 1.3, opacity: 0.95, texture: 0.3, softness: 0.15, blend: "source-over", pressure: false },
  { id: "sketch", name: "Sketch pencil", description: "Soft, expressive shading", width: 5, opacity: 0.6, texture: 0.8, softness: 0.6, blend: "source-over", pressure: true },
  { id: "marker", name: "Marker", description: "Broad, saturated strokes", width: 14, opacity: 0.95, texture: 0, softness: 0.1, blend: "multiply", pressure: false },
  { id: "highlighter", name: "Highlighter", description: "Translucent overlay", width: 20, opacity: 0.35, texture: 0, softness: 0, blend: "multiply", pressure: false },
  { id: "brush", name: "Brush", description: "Soft, pressure-driven brush", width: 18, opacity: 0.9, texture: 0.1, softness: 0.75, blend: "source-over", pressure: true },
  { id: "calligraphy", name: "Calligraphy", description: "Angle-sensitive nib", width: 8, opacity: 1, texture: 0, softness: 0, blend: "source-over", pressure: false },
  { id: "custom", name: "Custom pen", description: "Your configured pen", width: 4, opacity: 1, texture: 0.2, softness: 0.3, blend: "source-over", pressure: true }
];

export function defaultStrokeStyle(penType: PenType, color = "#1f2937"): StrokeStyle {
  const def = PEN_DEFS.find((pen) => pen.id === penType) ?? PEN_DEFS[0];
  return {
    penType,
    color,
    width: def.width,
    opacity: def.opacity,
    smoothing: 0.5,
    pressure: def.pressure,
    texture: def.texture,
    lineCap: penType === "highlighter" || penType === "marker" ? "butt" : "round",
    lineJoin: "round",
    blend: def.blend,
    dash: null,
    nibAngle: penType === "calligraphy" ? 45 : undefined,
    softness: def.softness
  };
}

export const DEFAULT_PALETTE = [
  "#1f2937",
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#eab308",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#ea580c",
  "#475569",
  "#111827",
  "#f8fafc"
];

export const HIGHLIGHTER_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74", "#c4b5fd"];

export const SANS_STACK = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

export const FONT_OPTIONS = [
  { id: SANS_STACK, name: "Inter / Sans" },
  { id: "Georgia, 'Times New Roman', serif", name: "Georgia Serif" },
  { id: "'Courier New', ui-monospace, monospace", name: "Courier Mono" },
  { id: "'Comic Sans MS', 'Segoe Print', cursive", name: "Comic / Hand" },
  { id: "Verdana, Geneva, sans-serif", name: "Verdana" },
  { id: "system-ui, sans-serif", name: "System" }
];

export function defaultBackground(paper: PaperType = "blank"): PageBackground {
  return {
    paper,
    color: "#ffffff",
    patternColor: paper === "grid" || paper === "dots" ? "#c7d2de" : "#a8bfd8",
    spacing: PAPER_OPTIONS.find((p) => p.id === paper)?.defaultSpacing ?? 28,
    imageAssetId: null,
    imageOpacity: 0.9
  };
}

export function defaultLayers(): Layer[] {
  return [
    { id: uid(), name: "Ink", kind: "ink", visible: true, locked: false, opacity: 1 },
    { id: uid(), name: "Shapes", kind: "shapes", visible: true, locked: false, opacity: 1 },
    { id: uid(), name: "Text", kind: "text", visible: true, locked: false, opacity: 1 },
    { id: uid(), name: "Images", kind: "images", visible: true, locked: false, opacity: 1 },
    { id: uid(), name: "Formulas", kind: "formulas", visible: true, locked: false, opacity: 1 },
    { id: uid(), name: "Graphs", kind: "graphs", visible: true, locked: false, opacity: 1 },
    { id: uid(), name: "Tables", kind: "tables", visible: true, locked: false, opacity: 1 }
  ];
}

export function defaultNotebookSettings(): NotebookSettings {
  return {
    pageSize: "a4",
    customWidth: 794,
    customHeight: 1123,
    orientation: "portrait",
    defaultBackground: defaultBackground("blank"),
    infiniteCanvas: false,
    canvasDark: false,
    gridSnap: null
  };
}

const COVER_COLORS = [
  ["#4f46e5", "#7c3aed"],
  ["#0ea5e9", "#2563eb"],
  ["#16a34a", "#059669"],
  ["#f59e0b", "#ea580c"],
  ["#db2777", "#be123c"],
  ["#0f172a", "#334155"],
  ["#7c3aed", "#db2777"],
  ["#0d9488", "#0891b2"]
];

export function defaultCover(seed = Math.random()): CoverDesign {
  const idx = Math.floor(seed * COVER_COLORS.length) % COVER_COLORS.length;
  const pair = COVER_COLORS[idx];
  return { style: "gradient", color: pair[0], color2: pair[1], pattern: "none", emoji: null, assetId: null };
}

export const COVER_PRESETS: CoverDesign[] = [
  ...COVER_COLORS.map((pair) => ({
    style: "gradient" as const,
    color: pair[0],
    color2: pair[1],
    pattern: "none",
    emoji: null,
    assetId: null
  })),
  { style: "solid", color: "#1f2937", color2: "#1f2937", pattern: "none", emoji: null, assetId: null },
  { style: "gradient", color: "#f8fafc", color2: "#e2e8f0", pattern: "none", emoji: null, assetId: null }
];

export const MAX_ASSET_SIZE = 40 * 1024 * 1024;
export const MAX_PDF_SIZE = 80 * 1024 * 1024;
