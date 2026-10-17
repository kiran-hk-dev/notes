import type { Notebook, NotebookPage } from "@/types";
import { defaultBackground, defaultLayers } from "@/lib/defaults";
import { createNotebook, putAsset, putNotebookWithPages, setNotebookThumbnail } from "@/lib/repo";
import { createImage } from "@/lib/drawing/factory";
import { canvasToBlob } from "@/lib/drawing/canvas";
import { now, uid } from "@/lib/utils";

export interface PdfImportOptions {
  scale?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function importPdfAsNotebook(file: File, opts: PdfImportOptions = {}): Promise<Notebook | null> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pageTotal = document.numPages;
  if (pageTotal === 0) return null;

  const scale = opts.scale ?? 2;
  const firstViewport = (await document.getPage(1)).getViewport({ scale });
  const pageWidth = Math.round(firstViewport.width);
  const pageHeight = Math.round(firstViewport.height);
  const title = file.name.replace(/\.pdf$/i, "").trim() || "Imported PDF";

  const { notebook } = await createNotebook({
    title,
    settings: {
      pageSize: "custom",
      customWidth: pageWidth,
      customHeight: pageHeight,
      orientation: "portrait",
      defaultBackground: defaultBackground("blank")
    }
  });

  const pages: NotebookPage[] = [];
  let thumbnail: string | null = null;

  for (let i = 0; i < pageTotal; i += 1) {
    const pdfPage = await document.getPage(i + 1);
    const viewport = pdfPage.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await canvasToBlob(canvas, "image/png");
    const assetId = uid();
    await putAsset({
      id: assetId,
      notebookId: notebook.id,
      kind: "pdf",
      name: `${title} — page ${i + 1}.png`,
      mimeType: "image/png",
      size: blob.size,
      width: canvas.width,
      height: canvas.height,
      blob,
      createdAt: now()
    });
    if (i === 0) {
      const thumbBlob = await canvasToBlob(canvas, "image/jpeg", 0.7);
      thumbnail = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(thumbBlob);
      });
    }
    const layers = defaultLayers();
    pages.push({
      id: uid(),
      notebookId: notebook.id,
      index: i,
      title: `Page ${i + 1}`,
      width: canvas.width,
      height: canvas.height,
      background: defaultBackground("blank"),
      layers,
      objects: [
        createImage(
          assetId,
          canvas.width,
          canvas.height,
          { x: 0, y: 0, w: canvas.width, h: canvas.height },
          layers
        )
      ],
      revision: 1,
      createdAt: now(),
      updatedAt: now()
    });
    opts.onProgress?.(i + 1, pageTotal);
  }

  const updated: Notebook = { ...notebook, pageCount: pages.length, updatedAt: now() };
  await putNotebookWithPages(updated, pages);
  if (thumbnail) await setNotebookThumbnail(notebook.id, thumbnail);
  return { ...updated, thumbnail };
}
