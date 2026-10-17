import type { CoverDesign, Layer, NotebookSettings, PageBackground, PageTemplateMeta, SceneObject } from "@/types";
import {
  createFormula,
  createShape,
  createTable,
  createText,
  defaultShapeStyle,
  defaultTextStyle
} from "@/lib/drawing/factory";
import { defaultBackground, defaultCover, defaultNotebookSettings } from "@/lib/defaults";

export interface PageTemplateFull extends PageTemplateMeta {
  background: Partial<PageBackground>;
  build: (layers: Layer[], width: number, height: number) => SceneObject[];
}

function withZ(objects: SceneObject[]): SceneObject[] {
  return objects.map((object, i) => ({ ...object, z: i + 1 }));
}

function heading(text: string, x: number, y: number, width: number, size = 26) {
  return {
    text,
    x,
    y,
    w: width,
    h: size * 2,
    style: defaultTextStyle({ fontSize: size, fontWeight: 700 })
  };
}

export const PAGE_TEMPLATES: PageTemplateFull[] = [
  {
    id: "blank",
    name: "Blank page",
    category: "blank",
    description: "An empty page ready for anything.",
    background: { paper: "blank" },
    build: () => []
  },
  {
    id: "lined-notes",
    name: "Lined notes",
    category: "study",
    description: "College-ruled page with title and date.",
    background: { paper: "college" },
    build: (layers, width) => {
      const objects: SceneObject[] = [];
      const title = createText("Title", { x: 64, y: 56, w: width - 128, h: 44 }, heading("Title", 0, 0, 0, 30).style, layers);
      title.text = "";
      objects.push(title);
      const date = createText("", { x: 64, y: 108, w: width - 128, h: 30 }, defaultTextStyle({ fontSize: 14, color: "#64748b" }), layers);
      objects.push(date);
      objects.push(
        createShape(
          "line",
          { x: 64, y: 146, w: width - 128, h: 0 },
          defaultShapeStyle({ stroke: "#cbd5e1", strokeWidth: 1 }),
          layers
        )
      );
      return withZ(objects);
    }
  },
  {
    id: "meeting",
    name: "Meeting notes",
    category: "meeting",
    description: "Agenda, attendees, notes area and action items.",
    background: { paper: "blank" },
    build: (layers, width, height) => {
      const margin = 64;
      const contentWidth = width - margin * 2;
      const objects: SceneObject[] = [];
      const title = createText("Meeting notes", { x: margin, y: 56, w: contentWidth, h: 46 }, heading("", 0, 0, 0, 30).style, layers);
      objects.push(title);
      objects.push(createText("Date: ", { x: margin, y: 108, w: contentWidth / 2, h: 28 }, defaultTextStyle({ fontSize: 14, color: "#475569" }), layers));
      objects.push(createText("Attendees: ", { x: margin + contentWidth / 2, y: 108, w: contentWidth / 2, h: 28 }, defaultTextStyle({ fontSize: 14, color: "#475569" }), layers));
      objects.push(
        createShape("rect", { x: margin, y: 150, w: contentWidth, h: 240 }, defaultShapeStyle({ stroke: "#cbd5e1", fill: "#f8fafc" }), layers)
      );
      objects.push(createText("Agenda", { x: margin + 16, y: 158, w: contentWidth - 32, h: 30 }, defaultTextStyle({ fontSize: 16, fontWeight: 700 }), layers));
      const agendaStart = 196;
      for (let i = 0; i < 5; i += 1) {
        objects.push(
          createShape(
            "line",
            { x: margin + 16, y: agendaStart + i * 38, w: contentWidth - 32, h: 0 },
            defaultShapeStyle({ stroke: "#e2e8f0", strokeWidth: 1 }),
            layers
          )
        );
      }
      objects.push(createText("Notes", { x: margin, y: 410, w: contentWidth, h: 30 }, defaultTextStyle({ fontSize: 16, fontWeight: 700 }), layers));
      const notesLines = Math.max(4, Math.floor((height - 620) / 36));
      for (let i = 0; i < notesLines; i += 1) {
        objects.push(
          createShape(
            "line",
            { x: margin, y: 452 + i * 36, w: contentWidth, h: 0 },
            defaultShapeStyle({ stroke: "#e2e8f0", strokeWidth: 1 }),
            layers
          )
        );
      }
      const tableY = 452 + notesLines * 36 + 20;
      objects.push(createText("Action items", { x: margin, y: tableY - 34, w: contentWidth, h: 28 }, defaultTextStyle({ fontSize: 16, fontWeight: 700 }), layers));
      objects.push(
        createTable(
          [
            ["Action", "Owner", "Due"],
            ["", "", ""],
            ["", "", ""],
            ["", "", ""]
          ],
          { x: margin, y: tableY, w: contentWidth, h: 140 },
          layers
        )
      );
      return withZ(objects);
    }
  },
  {
    id: "cornell",
    name: "Cornell study notes",
    category: "study",
    description: "Cue column, note area and summary box for studying.",
    background: { paper: "college" },
    build: (layers, width, height) => {
      const margin = 56;
      const cueWidth = (width - margin * 2) * 0.32;
      const left = margin;
      const right = width - margin;
      const top = 120;
      const bottom = height - 120;
      const objects: SceneObject[] = [];
      objects.push(createText("Topic:", { x: margin, y: 48, w: width - margin * 2, h: 44 }, heading("", 0, 0, 0, 26).style, layers));
      objects.push(
        createShape("line", { x: margin, y: 108, w: width - margin * 2, h: 0 }, defaultShapeStyle({ stroke: "#334155", strokeWidth: 2 }), layers)
      );
      objects.push(
        createShape("line", { x: left + cueWidth, y: top, w: 0, h: bottom - top }, defaultShapeStyle({ stroke: "#ef4444", strokeWidth: 2 }), layers)
      );
      objects.push(
        createShape("line", { x: left, y: bottom, w: right - left, h: 0 }, defaultShapeStyle({ stroke: "#334155", strokeWidth: 2 }), layers)
      );
      objects.push(createText("Cues / questions", { x: left + 8, y: top - 32, w: cueWidth - 16, h: 26 }, defaultTextStyle({ fontSize: 13, fontWeight: 700, color: "#b91c1c" }), layers));
      objects.push(createText("Notes", { x: left + cueWidth + 16, y: top - 32, w: right - left - cueWidth - 16, h: 26 }, defaultTextStyle({ fontSize: 13, fontWeight: 700 }), layers));
      objects.push(createText("Summary", { x: left + 8, y: bottom + 10, w: right - left - 16, h: 26 }, defaultTextStyle({ fontSize: 13, fontWeight: 700 }), layers));
      return withZ(objects);
    }
  },
  {
    id: "math-work",
    name: "Math problem set",
    category: "math",
    description: "Numbered work area with a graph panel.",
    background: { paper: "grid" },
    build: (layers, width, height) => {
      const margin = 56;
      const objects: SceneObject[] = [];
      objects.push(createText("Problem set", { x: margin, y: 48, w: width - margin * 2, h: 44 }, heading("", 0, 0, 0, 28).style, layers));
      objects.push(createText("Name / Date", { x: margin, y: 96, w: width - margin * 2, h: 28 }, defaultTextStyle({ fontSize: 14, color: "#64748b" }), layers));
      const columnWidth = (width - margin * 2 - 24) / 2;
      for (let i = 0; i < 2; i += 1) {
        const x = margin + i * (columnWidth + 24);
        objects.push(createText(`${i + 1}.`, { x, y: 148, w: columnWidth, h: 30 }, defaultTextStyle({ fontSize: 18, fontWeight: 700 }), layers));
        objects.push(
          createShape("rect", { x, y: 186, w: columnWidth, h: height - 340 }, defaultShapeStyle({ stroke: "#cbd5e1", strokeWidth: 1 }), layers)
        );
      }
      const graphWidth = width - margin * 2;
      objects.push(createText("Graph", { x: margin, y: height - 136, w: graphWidth, h: 26 }, defaultTextStyle({ fontSize: 14, fontWeight: 700 }), layers));
      objects.push(
        createShape("grid", { x: margin, y: height - 104, w: graphWidth, h: 72 }, defaultShapeStyle({ stroke: "#94a3b8", strokeWidth: 1 }), layers)
      );
      return withZ(objects);
    }
  },
  {
    id: "formula-sheet",
    name: "Formula sheet",
    category: "math",
    description: "Named formulas with space to substitute values.",
    background: { paper: "dots" },
    build: (layers, width) => {
      const margin = 56;
      const objects: SceneObject[] = [];
      objects.push(createText("Formula sheet", { x: margin, y: 48, w: width - margin * 2, h: 44 }, heading("", 0, 0, 0, 28).style, layers));
      const formulas: { latex: string; label: string }[] = [
        { label: "Area of a triangle", latex: "A = \\frac{1}{2} b h" },
        { label: "Quadratic formula", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" },
        { label: "Circle area", latex: "A = \\pi r^2" },
        { label: "Pythagorean theorem", latex: "a^2 + b^2 = c^2" }
      ];
      formulas.forEach((item, i) => {
        const y = 130 + i * 150;
        objects.push(createText(item.label, { x: margin, y, w: width - margin * 2, h: 26 }, defaultTextStyle({ fontSize: 14, fontWeight: 700, color: "#475569" }), layers));
        const formula = createFormula(item.latex, { x: margin, y: y + 32, w: width - margin * 2, h: 56 }, layers, { fontSize: 26 });
        objects.push(formula);
        objects.push(
          createShape("line", { x: margin, y: y + 122, w: width - margin * 2, h: 0 }, defaultShapeStyle({ stroke: "#e2e8f0", strokeWidth: 1 }), layers)
        );
      });
      return withZ(objects);
    }
  },
  {
    id: "kanban",
    name: "Project planning",
    category: "planning",
    description: "To do / In progress / Done columns.",
    background: { paper: "blank" },
    build: (layers, width, height) => {
      const margin = 48;
      const gap = 24;
      const columns = ["To do", "In progress", "Done"];
      const columnWidth = (width - margin * 2 - gap * 2) / 3;
      const objects: SceneObject[] = [];
      objects.push(createText("Project plan", { x: margin, y: 40, w: width - margin * 2, h: 44 }, heading("", 0, 0, 0, 28).style, layers));
      const top = 118;
      const heightCol = height - top - 64;
      columns.forEach((name, i) => {
        const x = margin + i * (columnWidth + gap);
        const colors = ["#e0e7ff", "#fef3c7", "#dcfce7"];
        objects.push(
          createShape("rect-rounded", { x, y: top, w: columnWidth, h: heightCol }, defaultShapeStyle({ stroke: "#cbd5e1", fill: colors[i], fillOpacity: 0.6 }), layers)
        );
        objects.push(createText(name, { x: x + 14, y: top + 12, w: columnWidth - 28, h: 30 }, defaultTextStyle({ fontSize: 16, fontWeight: 700 }), layers));
        for (let c = 0; c < 5; c += 1) {
          objects.push(
            createShape(
              "rect-rounded",
              { x: x + 12, y: top + 56 + c * 72, w: columnWidth - 24, h: 58 },
              defaultShapeStyle({ stroke: "#e2e8f0", fill: "#ffffff" }),
              layers
            )
          );
        }
      });
      return withZ(objects);
    }
  },
  {
    id: "music",
    name: "Music manuscript",
    category: "music",
    description: "Manuscript staves for composition.",
    background: { paper: "music" },
    build: (layers, width) => {
      const objects: SceneObject[] = [];
      objects.push(createText("Composition", { x: 56, y: 40, w: width - 112, h: 40 }, heading("", 0, 0, 0, 26).style, layers));
      return withZ(objects);
    }
  },
  {
    id: "sketch",
    name: "Sketch page",
    category: "sketch",
    description: "Open dot grid for drawing and ideation.",
    background: { paper: "dots" },
    build: () => []
  },
  {
    id: "isometric",
    name: "Isometric sketch",
    category: "sketch",
    description: "Isometric grid for 3D sketching.",
    background: { paper: "isometric" },
    build: () => []
  }
];

export function findPageTemplate(id: string): PageTemplateFull | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}

export function buildPageTemplate(
  id: string,
  layers: Layer[],
  width: number,
  height: number
): { background: Partial<PageBackground>; objects: SceneObject[] } {
  const template = findPageTemplate(id);
  if (!template) return { background: {}, objects: [] };
  return { background: template.background, objects: template.build(layers, width, height) };
}

export interface NotebookTemplateMeta {
  id: string;
  name: string;
  description: string;
  cover: CoverDesign;
  settings?: Partial<NotebookSettings>;
  pageTemplateIds: string[];
}

export const NOTEBOOK_TEMPLATES: NotebookTemplateMeta[] = [
  {
    id: "blank",
    name: "Blank notebook",
    description: "Start with a single blank page.",
    cover: defaultCover(0),
    pageTemplateIds: ["blank"]
  },
  {
    id: "meeting-book",
    name: "Meeting notebook",
    description: "Meeting notes template repeated for new meetings.",
    cover: { ...defaultCover(0.1), emoji: "\u{1F4CB}" },
    pageTemplateIds: ["meeting", "meeting", "meeting"]
  },
  {
    id: "study-book",
    name: "Study notebook",
    description: "Cornell notes and lined pages for revision.",
    cover: { ...defaultCover(0.2), emoji: "\u{1F4DA}" },
    pageTemplateIds: ["cornell", "lined-notes", "cornell", "lined-notes"]
  },
  {
    id: "math-workbook",
    name: "Math workbook",
    description: "Problem sets and formula sheets.",
    cover: { ...defaultCover(0.3), emoji: "\u{1F9EE}" },
    pageTemplateIds: ["formula-sheet", "math-work", "math-work"]
  },
  {
    id: "sketchbook",
    name: "Sketchbook",
    description: "Dot and isometric grids for sketching.",
    cover: { ...defaultCover(0.4), emoji: "\u{1F3A8}" },
    pageTemplateIds: ["sketch", "sketch", "isometric"]
  },
  {
    id: "planner",
    name: "Project planner",
    description: "Kanban planning pages.",
    cover: { ...defaultCover(0.5), emoji: "\u{1F5C2}\uFE0F" },
    settings: { pageSize: "a4", orientation: "landscape" },
    pageTemplateIds: ["kanban", "kanban"]
  }
];

export function findNotebookTemplate(id: string): NotebookTemplateMeta | undefined {
  return NOTEBOOK_TEMPLATES.find((t) => t.id === id);
}

export const DEFAULT_SETTINGS_FOR_TEMPLATE = defaultNotebookSettings;
export const DEFAULT_BACKGROUND = defaultBackground;
