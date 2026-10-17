import type { NotebookPage } from "@/types";
import type { RenderAssets } from "@/lib/drawing/objects";

export function renderPaperPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: NotebookPage["background"]
) {
  const spacing = Math.max(8, background.spacing || 28);
  const color = background.patternColor || "#b6c7dd";
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;

  switch (background.paper) {
    case "college": {
      ctx.beginPath();
      for (let y = spacing; y < height; y += spacing) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = "#fca5a5";
      ctx.beginPath();
      ctx.moveTo(72.5, 0);
      ctx.lineTo(72.5, height);
      ctx.stroke();
      break;
    }
    case "wide": {
      ctx.beginPath();
      for (let y = spacing; y < height; y += spacing) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
      break;
    }
    case "grid": {
      ctx.beginPath();
      for (let x = spacing; x < width; x += spacing) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      for (let y = spacing; y < height; y += spacing) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
      break;
    }
    case "dots": {
      const radius = Math.max(1, spacing / 24);
      for (let x = spacing; x < width; x += spacing) {
        for (let y = spacing; y < height; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "isometric": {
      const slope = Math.tan(Math.PI / 6);
      const step = spacing / Math.cos(Math.PI / 6);
      ctx.beginPath();
      for (let c = -width * slope; c < height + width * slope; c += step) {
        ctx.moveTo(0, c);
        ctx.lineTo(width, c + width * slope);
      }
      for (let c = 0; c < height + width * slope * 2; c += step) {
        ctx.moveTo(0, c);
        ctx.lineTo(width, c - width * slope);
      }
      for (let x = step; x < width; x += step * 2) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      ctx.stroke();
      break;
    }
    case "music": {
      const staffHeight = spacing * 2.4;
      ctx.beginPath();
      for (let base = spacing * 2; base + staffHeight * 3 < height - spacing; base += staffHeight * 4) {
        for (let line = 0; line < 5; line += 1) {
          const y = base + (line * staffHeight) / 4;
          ctx.moveTo(spacing, y + 0.5);
          ctx.lineTo(width - spacing, y + 0.5);
        }
      }
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function renderPageBackground(
  ctx: CanvasRenderingContext2D,
  page: Pick<NotebookPage, "width" | "height" | "background">,
  assets: RenderAssets,
  options: { transparent?: boolean } = {}
) {
  const { width, height, background } = page;
  ctx.save();
  if (background.paper === "custom-image" && background.imageAssetId) {
    if (!options.transparent) {
      ctx.fillStyle = background.color || "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    const image = assets.images.get(background.imageAssetId);
    if (image) {
      const naturalWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
      const naturalHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
      const scale = Math.max(width / naturalWidth, height / naturalHeight);
      const w = naturalWidth * scale;
      const h = naturalHeight * scale;
      ctx.globalAlpha = background.imageOpacity ?? 1;
      ctx.drawImage(image as CanvasImageSource, (width - w) / 2, (height - h) / 2, w, h);
      ctx.globalAlpha = 1;
    } else {
      assets.missingAssets.add(background.imageAssetId);
    }
    ctx.restore();
    return;
  }
  if (!options.transparent) {
    ctx.fillStyle = background.color || "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  renderPaperPattern(ctx, width, height, background);
  ctx.restore();
}
