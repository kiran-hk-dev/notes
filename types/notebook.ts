import type { Layer, SceneObject } from "./objects";

export type PaperType =
  | "blank"
  | "college"
  | "wide"
  | "grid"
  | "dots"
  | "isometric"
  | "music"
  | "custom-image";

export interface PageBackground {
  paper: PaperType;
  color: string;
  patternColor: string;
  spacing: number;
  imageAssetId: string | null;
  imageOpacity: number;
}

export interface NotebookPage {
  id: string;
  notebookId: string;
  index: number;
  title: string;
  width: number;
  height: number;
  background: PageBackground;
  layers: Layer[];
  objects: SceneObject[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type PageSizeId = "a4" | "letter" | "legal" | "a5" | "a3" | "square" | "custom";

export interface NotebookSettings {
  pageSize: PageSizeId;
  customWidth: number;
  customHeight: number;
  orientation: "portrait" | "landscape";
  defaultBackground: PageBackground;
  infiniteCanvas: boolean;
  canvasDark: boolean;
  gridSnap: number | null;
}

export interface CoverDesign {
  style: "solid" | "gradient" | "pattern" | "photo";
  color: string;
  color2: string;
  pattern: string;
  emoji: string | null;
  assetId: string | null;
}

export interface Notebook {
  id: string;
  title: string;
  cover: CoverDesign;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  trashed: boolean;
  trashedAt: number | null;
  settings: NotebookSettings;
  thumbnail: string | null;
  pageCount: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface TagDef {
  name: string;
  color: string;
}

export interface AssetRecord {
  id: string;
  notebookId: string | null;
  kind: "image" | "pdf" | "export" | "raster";
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  blob: Blob;
  createdAt: number;
}

export interface NotebookRevisionSnapshot {
  notebook: Notebook;
  pages: NotebookPage[];
}

export interface RevisionRecord {
  id: string;
  notebookId: string;
  pageId: string | null;
  label: string;
  kind: "auto" | "manual" | "restore" | "import";
  snapshot: NotebookRevisionSnapshot;
  createdAt: number;
}

export type TemplateCategory = "meeting" | "study" | "sketch" | "math" | "planning" | "music" | "blank";

export interface PageTemplateMeta {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
}

export interface AppPreferences {
  theme: "light" | "dark" | "system";
  recentColors: string[];
  palettes: { name: string; colors: string[] }[];
  autosaveDebounceMs: number;
  recognizeShapes: boolean;
  showPageBounds: boolean;
  snapToGrid: boolean;
  pressureCurve: number;
  defaultPen: string;
}
