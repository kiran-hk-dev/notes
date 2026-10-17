"use client";

import { useState } from "react";
import { Check, Copy, Download, Link2 } from "lucide-react";
import type { NotebookPage } from "@/types";
import { getPages } from "@/lib/repo";
import { usePrefs } from "@/lib/state/prefsStore";
import { useEditor } from "@/lib/state/editorStore";
import { collectObjectAssetIds } from "@/lib/assets";
import {
  bundleToZipBlob,
  buildBundle,
  encodeSharePayload,
  exportNotebookJsonFile
} from "@/lib/export/bundle";
import { exportPagesToPdf } from "@/lib/export/pdf";
import { pagesToRasterBlobs, pageToRasterBlob } from "@/lib/export/png";
import { exportPagesToPptx } from "@/lib/export/pptx";
import { pageToSvg } from "@/lib/export/svg";
import { cn, deepClone, downloadBlob, sanitizeFilename } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { useEditorApi } from "@/components/editor/editorContext";

type Format = "png" | "jpeg" | "svg" | "pdf" | "pptx" | "json" | "zip" | "share";
type Scope = "page" | "all";

const FORMATS: { id: Format; label: string; description: string }[] = [
  { id: "png", label: "PNG image", description: "Crisp raster image of each page" },
  { id: "jpeg", label: "JPEG image", description: "Smaller file, no transparency" },
  { id: "svg", label: "SVG vector", description: "Editable vector graphics" },
  { id: "pdf", label: "PDF document", description: "One PDF page per notebook page" },
  { id: "pptx", label: "PowerPoint", description: "One slide per notebook page" },
  { id: "json", label: "InkSpace JSON", description: "Full fidelity, re-importable" },
  { id: "zip", label: "InkSpace archive", description: "Notebook + pages + images in a .zip" },
  { id: "share", label: "Share link", description: "Compressed link anyone can open on this device" }
];

export function ExportDialog() {
  const api = useEditorApi();
  const close = useEditor((state) => state.closeDialog);
  const notebook = useEditor((state) => state.notebook);
  const pushStatus = useEditor((state) => state.pushStatus);
  const [format, setFormat] = useState<Format>("pdf");
  const [scope, setScope] = useState<Scope>("all");
  const [scale, setScale] = useState("2");
  const [quality, setQuality] = useState(92);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const snapshotPage = (): NotebookPage | null => {
    const engine = api.engine();
    const state = useEditor.getState();
    if (!state.page) return null;
    if (!engine) return state.page;
    return {
      ...state.page,
      width: engine.getPageSize().width,
      height: engine.getPageSize().height,
      background: engine.getBackground() ?? state.page.background,
      layers: engine.getLayers(),
      objects: engine.getObjects().map((object) => deepClone(object))
    };
  };

  const collectPages = async (): Promise<NotebookPage[]> => {
    if (!notebook) return [];
    const current = snapshotPage();
    await api.flushSave();
    if (scope === "page") return current ? [current] : [];
    const pages = await getPages(notebook.id);
    return pages.map((page) => (current && page.id === current.id ? current : page));
  };

  const prepareAssets = async (pages: NotebookPage[]) => {
    const images = new Set<string>();
    const rasters = new Set<string>();
    for (const page of pages) {
      const collected = collectObjectAssetIds(page.objects);
      collected.images.forEach((id) => images.add(id));
      collected.rasters.forEach((id) => rasters.add(id));
      if (page.background.imageAssetId) images.add(page.background.imageAssetId);
    }
    await api.assets.ensureAll({ images: [...images], rasters: [...rasters] });
  };

  const run = async () => {
    if (!notebook) return;
    setBusy(true);
    setProgress(null);
    setShareUrl(null);
    setCopied(false);
    try {
      const pressureCurve = usePrefs.getState().pressureCurve;
      const base = sanitizeFilename(notebook.title);

      if (format === "json") {
        setProgress("Packing JSON…");
        const result = await exportNotebookJsonFile(notebook.id);
        if (!result) throw new Error("Could not read the notebook.");
        downloadBlob(result.blob, result.filename);
        pushStatus("Exported InkSpace JSON.", "info");
        close();
        return;
      }

      if (format === "zip") {
        setProgress("Building archive…");
        const bundle = await buildBundle(notebook.id);
        if (!bundle) throw new Error("Could not read the notebook.");
        const pages = await collectPages();
        await prepareAssets(pages);
        const blob = await bundleToZipBlob(bundle, { preview: api.assets.render, pressureCurve });
        downloadBlob(blob, `${base}.inkspace.zip`);
        pushStatus("Exported InkSpace archive.", "info");
        close();
        return;
      }

      if (format === "share") {
        setProgress("Compressing notebook…");
        const bundle = await buildBundle(notebook.id);
        if (!bundle) throw new Error("Could not read the notebook.");
        const payload = await encodeSharePayload(bundle);
        if (payload.length > 700_000) {
          pushStatus("This notebook is too large for a share link — use the ZIP archive instead.", "error");
          return;
        }
        const url = `${window.location.origin}/import#${payload}`;
        setShareUrl(url);
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          pushStatus(payload.length > 24_000 ? "Link copied — it is long, keep it safe." : "Share link copied to clipboard.", "info");
        } catch {
          pushStatus("Link ready — copy it manually below.", "info");
        }
        return;
      }

      const pages = await collectPages();
      if (pages.length === 0) throw new Error("There is nothing to export yet.");
      setProgress("Loading assets…");
      await prepareAssets(pages);

      if (format === "pdf") {
        setProgress(`Rendering ${pages.length} page${pages.length === 1 ? "" : "s"}…`);
        const blob = await exportPagesToPdf(pages, {
          assets: api.assets.render,
          scale: Number(scale),
          quality: quality / 100,
          pressureCurve
        });
        downloadBlob(blob, `${base}.pdf`);
      } else if (format === "pptx") {
        setProgress(`Rendering ${pages.length} slide${pages.length === 1 ? "" : "s"}…`);
        const blob = await exportPagesToPptx(pages, {
          assets: api.assets.render,
          title: notebook.title,
          scale: Number(scale),
          pressureCurve
        });
        downloadBlob(blob, `${base}.pptx`);
      } else if (format === "svg") {
        setProgress("Writing SVG…");
        if (pages.length === 1) {
          const svg = pageToSvg(pages[0], { assets: api.assets.render, includeBackground: !transparent });
          downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${base}.svg`);
        } else {
          const { default: JSZip } = await import("jszip");
          const zip = new JSZip();
          pages.forEach((page, index) => {
            zip.file(`page-${String(index + 1).padStart(3, "0")}.svg`, pageToSvg(page, { assets: api.assets.render, includeBackground: !transparent }));
          });
          const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
          downloadBlob(blob, `${base}-svg.zip`);
        }
      } else {
        const type = format === "png" ? "image/png" : "image/jpeg";
        setProgress(`Rendering ${pages.length} page${pages.length === 1 ? "" : "s"}…`);
        if (pages.length === 1) {
          const blob = await pageToRasterBlob(pages[0], {
            assets: api.assets.render,
            scale: Number(scale),
            quality: quality / 100,
            transparent,
            pressureCurve
          }, type);
          downloadBlob(blob, `${base}.${format === "png" ? "png" : "jpg"}`);
        } else {
          const blobs = await pagesToRasterBlobs(pages, {
            assets: api.assets.render,
            scale: Number(scale),
            quality: quality / 100,
            transparent,
            pressureCurve
          }, type, (done, total) => setProgress(`Rendering page ${done} of ${total}…`));
          const { default: JSZip } = await import("jszip");
          const zip = new JSZip();
          blobs.forEach((blob, index) => {
            zip.file(`page-${String(index + 1).padStart(3, "0")}.${format === "png" ? "png" : "jpg"}`, blob);
          });
          const zipBlob = await zip.generateAsync({ type: "blob" });
          downloadBlob(zipBlob, `${base}-${format}.zip`);
        }
      }
      pushStatus("Export complete.", "info");
      close();
    } catch (error) {
      pushStatus(error instanceof Error ? error.message : "Export failed.", "error");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const raster = format === "png" || format === "jpeg" || format === "pdf" || format === "pptx";
  const current = FORMATS.find((item) => item.id === format);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Save this notebook as a file, or create a share link.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-1.5">
            {FORMATS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFormat(item.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  format === item.id ? "border-accent bg-accent-soft/50" : "border-line hover:border-line-strong"
                )}
              >
                <span className="block text-sm font-medium text-ink">{item.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{item.description}</span>
              </button>
            ))}
          </div>

          {format !== "json" && format !== "zip" && format !== "share" ? (
            <div className="flex gap-1.5">
              {(["page", "all"] as Scope[]).map((value) => (
                <Button key={value} size="sm" variant={scope === value ? "soft" : "outline"} className="flex-1" onClick={() => setScope(value)}>
                  {value === "page" ? "Current page" : "Whole notebook"}
                </Button>
              ))}
            </div>
          ) : null}

          {raster ? (
            <Field label="Quality scale">
              <Select
                value={scale}
                onValueChange={setScale}
                options={[
                  { value: "1", label: "1× — screen" },
                  { value: "2", label: "2× — high" },
                  { value: "3", label: "3× — print" },
                  { value: "4", label: "4× — maximum" }
                ]}
              />
            </Field>
          ) : null}

          {format === "jpeg" ? (
            <Field label="JPEG quality">
              <div className="flex h-8 items-center gap-3">
                <Slider value={quality} min={60} max={100} onValueChange={setQuality} ariaLabel="JPEG quality" />
                <span className="w-10 text-right text-xs tabular-nums text-ink-faint">{quality}%</span>
              </div>
            </Field>
          ) : null}

          {format === "png" || format === "svg" ? (
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-soft">Transparent background</span>
              <Switch checked={transparent} onCheckedChange={setTransparent} aria-label="Transparent background" />
            </label>
          ) : null}

          {shareUrl ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                <Link2 className="size-3.5" /> Share link ({Math.round(shareUrl.length / 1024)} KB)
              </span>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-xs text-ink-soft"
                  onFocus={(event) => event.target.select()}
                />
                <Button size="sm" variant={copied ? "soft" : "outline"} onClick={() => void copyShareUrl()}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-faint">
                Anyone who opens this link on this browser gets a full copy of the notebook.
              </p>
            </div>
          ) : null}

          {progress ? <p className="text-xs text-ink-faint">{progress}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {shareUrl ? "Done" : "Cancel"}
          </Button>
          {shareUrl ? null : (
            <Button variant="primary" onClick={() => void run()} disabled={busy}>
              <Download />
              {busy ? "Exporting…" : `Export ${current?.label ?? ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
