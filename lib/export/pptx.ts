import type { NotebookPage } from "@/types";
import type { RenderAssets } from "@/lib/drawing/objects";
import { pageToRasterBlob } from "@/lib/export/png";

export interface PptxExportOptions {
  assets: RenderAssets;
  title?: string;
  scale?: number;
  pressureCurve?: number;
}

const IN_PER_PX = 1 / 96;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(blob);
  });
}

export async function exportPagesToPptx(
  pages: Pick<NotebookPage, "width" | "height" | "background" | "layers" | "objects" | "title">[],
  options: PptxExportOptions
): Promise<Blob> {
  const { default: PptxGenJs } = await import("pptxgenjs");
  const deck = new PptxGenJs();
  deck.author = "InkSpace";
  deck.title = options.title ?? "InkSpace notebook";

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const widthIn = Math.max(1, page.width * IN_PER_PX);
    const heightIn = Math.max(1, page.height * IN_PER_PX);
    const layoutName = `INKSPACE_${i}`;
    deck.defineLayout({ name: layoutName, width: widthIn, height: heightIn });
    deck.layout = layoutName;
    const slide = deck.addSlide();
    const blob = await pageToRasterBlob(page, { ...options, scale: options.scale ?? 2 }, "image/jpeg");
    const dataUrl = await blobToDataUrl(blob);
    slide.addImage({ data: dataUrl, x: 0, y: 0, w: widthIn, h: heightIn });
  }

  const arrayBuffer = (await deck.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}
