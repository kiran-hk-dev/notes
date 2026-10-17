# InkSpace

An offline-first digital notebook: handwriting, shapes, text, images, formulas, graphs, and math
calculators — with autosave, version history, and import/export. No backend, no accounts: everything
lives in the browser's IndexedDB.

## Features

- **Handwriting** — 10 pen types (ballpoint, fountain, pencil, mechanical, sketch, marker, highlighter,
  brush, calligraphy, custom) with pressure and velocity response, smoothing, texture, and blend modes.
  Marker and highlighter lay down translucent ink; an eraser supports stroke and pixel modes.
- **Shapes** — 24 shape kinds with stroke/fill/dash/rotation controls, plus on-canvas shape recognition
  (straight lines, rectangles, ellipses, triangles) that snaps rough strokes into clean shapes.
- **Text** — canvas-rendered text boxes with font, size, weight, alignment, and background options.
- **Images** — import via file picker, drag-and-drop, or clipboard paste (PNG/JPEG/WebP/GIF).
- **Formulas** — LaTeX input with live KaTeX preview; renders to SVG-backed raster assets on the page.
- **Graphs** — grapher objects with multiple functions, polar mode, inequality shading, and pan/zoom
  viewports.
- **Calculators** — a scientific keypad with history, unit conversion, an equation solver
  (numeric root finding), and a matrix workspace (add, subtract, multiply, transpose, determinant,
  inverse) — all powered by mathjs, with results insertable onto the page.
- **Pages & layers** — infinite page list with reordering, paper styles (ruled, grid, dotted,
  isometric, music, custom image), A4/A3/Letter/Legal/Square/custom sizes, orientation switching, and
  a layered object model with visibility, lock, opacity, rename, and reorder.
- **Templates** — page templates that add ready-made layouts without touching existing ink.
- **Version history** — conflict-safe saving with automatic snapshots plus manual saves you can
  restore.
- **Export / import** — PNG, JPEG, SVG (vector), PDF, PowerPoint (PPTX), notebook JSON, full ZIP
  archives (manifest + pages + assets + cover preview), and PDF import that turns pages into images.
  Share links compress a notebook into the URL itself — no server round-trip, works offline.
- **Responsive** — full desktop, tablet, and mobile layouts with a touch-friendly toolbar.

## Getting started

```bash
npm install        # also copies KaTeX fonts/css and the pdf.js worker into public/vendor
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Scripts

| Script                | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start the Next.js dev server                  |
| `npm run build`       | Production build                              |
| `npm start`           | Serve the production build                    |
| `npm run typecheck`   | TypeScript strict check (`tsc --noEmit`)      |
| `npm run test`        | Vitest unit suite (geometry, pens, math, exports) |
| `npm run test:watch`  | Vitest in watch mode                          |

## Keyboard shortcuts

Letters select tools (when not typing): `V` select, `A` lasso, `H` pan, `P` pen, `E` eraser,
`S` shape, `T` text, `F` formula, `G` graph, `I` image, `B` table, `L` laser, `R` ruler.

| Shortcut                      | Action                          |
| ----------------------------- | ------------------------------- |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / redo              |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste             |
| `Ctrl+D` / `Ctrl+A`           | Duplicate / select all          |
| `Ctrl+G` / `Ctrl+Shift+G`     | Group / ungroup                 |
| `Ctrl+S`                      | Save now                        |
| `Ctrl+0` / `Ctrl+=` / `Ctrl+-` | Fit page / zoom in / zoom out  |
| `Delete`                      | Delete selection                |
| `Esc`                         | Clear selection                 |

## Storage model

- **IndexedDB** (via `idb`) stores notebooks, pages, assets (image/raster blobs), and revision
  snapshots. Autosave writes incrementally with an expected-revision check; on conflict the newer
  server-side copy is kept and the in-memory state reloads.
- **Assets** are content-addressed blobs; formulas and images keep their raster/bitmap alongside the
  vector description so rendering never blocks on KaTeX or decoding.
- **Share links** encode the whole notebook as a deflate-compressed, base64url payload in the URL hash
  (`#v1.…`, with an uncompressed fallback). `/import` decodes it and writes a fresh copy to IndexedDB.

## Project layout

```
app/                 Next.js App Router routes (dashboard, editor, /import share route)
components/editor/   Canvas stage, toolbars, panels, dialogs (formula, graph, table, image,
                     page settings, calculator, export, templates)
components/dashboard/ Notebook grid, cards, import, version history
lib/drawing/         Canvas engine: tools, history, hit-testing, pens, shapes, recognition, paper
lib/export/          PNG/JPEG/SVG/PDF/PPTX renderers + JSON/ZIP bundles + share-link codec
lib/import/          PDF → notebook conversion (pdf.js)
lib/math/            mathjs wrapper (expression normalization, numeric compilation)
lib/graph/           Function sampling and graphing helpers
lib/state/           Zustand stores (editor session, library, preferences)
lib/repo.ts          IndexedDB repositories (notebooks, pages, assets, revisions)
tests/               Vitest unit tests
```

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix UI ·
Zustand · idb · KaTeX · mathjs · pdf.js · jsPDF · pptxgenjs · JSZip · Vitest.
