import type { NotebookPage } from "@/types";
import type { RenderAssets } from "@/lib/drawing/objects";
import { pageToRasterBlob } from "@/lib/export/png";

export interface PdfExportOptions {
  assets: RenderAssets;
  scale?: number;
  quality?: number;
  pressureCurve?: number;
}

const PT_PER_PX = 72 / 96;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(blob);
  });
}

export async function exportPagesToPdf(
  pages: Pick<NotebookPage, "width" | "height" | "background" | "layers" | "objects">[],
  options: PdfExportOptions
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  let doc: import("jspdf").jsPDF | null = null;

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const blob = await pageToRasterBlob(page, { ...options, scale: options.scale ?? 2 }, "image/jpeg");
    const dataUrl = await blobToDataUrl(blob);
    const widthPt = page.width * PT_PER_PX;
    const heightPt = page.height * PT_PER_PX;
    const orientation = widthPt > heightPt ? "landscape" : "portrait";
    if (!doc) {
      doc = new jsPDF({ unit: "pt", format: [widthPt, heightPt], orientation });
    } else {
      doc.addPage([widthPt, heightPt], orientation);
    }
    doc.addImage(dataUrl, "JPEG", 0, 0, widthPt, heightPt, undefined, "FAST");
  }

  if (!doc) {
    const { jsPDF: Fallback } = await import("jspdf");
    doc = new Fallback({ unit: "pt", format: [595, 842] });
  }
  return doc.output("blob");
}
