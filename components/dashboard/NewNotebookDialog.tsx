"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { CoverDesign, NotebookPage, NotebookSettings, PageSizeId } from "@/types";
import { COVER_PRESETS, defaultBackground, defaultLayers, resolvePageSize } from "@/lib/defaults";
import { buildPageTemplate, NOTEBOOK_TEMPLATES } from "@/lib/templates";
import { createNotebook, createPage, deletePage, getPages } from "@/lib/repo";
import { useLibrary } from "@/lib/state/libraryStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CoverSwatch, CoverView, COVER_PATTERNS } from "@/components/dashboard/CoverView";

const PAGE_SIZE_OPTIONS: { value: PageSizeId; label: string }[] = [
  { value: "a4", label: "A4 — 210 × 297 mm" },
  { value: "letter", label: "Letter — 8.5 × 11 in" },
  { value: "legal", label: "Legal — 8.5 × 14 in" },
  { value: "a5", label: "A5 — 148 × 210 mm" },
  { value: "a3", label: "A3 — 297 × 420 mm" },
  { value: "square", label: "Square — 1000 × 1000" }
];

export function NewNotebookDialog({
  open,
  onOpenChange,
  folderId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
}) {
  const router = useRouter();
  const refresh = useLibrary((state) => state.refresh);
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("blank");
  const [cover, setCover] = useState<CoverDesign>(() => ({ ...COVER_PRESETS[0] }));
  const [emoji, setEmoji] = useState("");
  const [pageSize, setPageSize] = useState<PageSizeId>("a4");
  const [orientation, setOrientation] = useState<NotebookSettings["orientation"]>("portrait");
  const [creating, setCreating] = useState(false);

  const template = useMemo(() => NOTEBOOK_TEMPLATES.find((item) => item.id === templateId) ?? NOTEBOOK_TEMPLATES[0], [templateId]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const next = NOTEBOOK_TEMPLATES.find((item) => item.id === id);
    if (!next) return;
    setCover({ ...next.cover });
    setEmoji(next.cover.emoji ?? "");
    if (next.settings?.pageSize) setPageSize(next.settings.pageSize);
    if (next.settings?.orientation) setOrientation(next.settings.orientation);
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const settings: Partial<NotebookSettings> = {
        pageSize,
        orientation,
        defaultBackground: defaultBackground("blank")
      };
      const finalCover: CoverDesign = { ...cover, emoji: emoji.trim() ? emoji.trim().slice(0, 4) : null };
      const { notebook } = await createNotebook({
        title: title.trim() || undefined,
        cover: finalCover,
        settings,
        folderId: folderId ?? null,
        pageCount: 1
      });
      if (template.pageTemplateIds.length > 0) {
        const size = resolvePageSize({ pageSize, customWidth: 794, customHeight: 1123 });
        const width = orientation === "portrait" ? size.width : size.height;
        const height = orientation === "portrait" ? size.height : size.width;
        for (const pageTemplateId of template.pageTemplateIds) {
          const built = buildPageTemplate(pageTemplateId, defaultLayers(), width, height);
          await createPage(notebook.id, {
            background: { ...defaultBackground("blank"), ...built.background },
            objects: built.objects,
            width,
            height
          });
        }
        const pages: NotebookPage[] = await getPages(notebook.id);
        const blank = pages.find((page) => page.index === 0 && page.objects.length === 0);
        if (blank && pages.length > 1) await deletePage(blank.id);
      }
      await refresh();
      onOpenChange(false);
      setTitle("");
      router.push(`/notebook/${notebook.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New notebook</DialogTitle>
          <DialogDescription>Pick a template, design the cover, then start writing.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-5">
            <Field label="Title">
              <Input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={template.name}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-soft">Template</span>
              <div className="grid grid-cols-2 gap-2">
                {NOTEBOOK_TEMPLATES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyTemplate(item.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
                      templateId === item.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2"
                    )}
                  >
                    <CoverView cover={item.cover} className="size-9 shrink-0 rounded-lg" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-semibold text-ink">{item.name}</span>
                      <span className="truncate text-[11px] text-ink-faint">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-soft">Cover color</span>
              <div className="flex flex-wrap gap-2">
                {COVER_PRESETS.map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCover({ ...preset, emoji: emoji.trim() ? emoji.trim().slice(0, 4) : null, pattern: cover.pattern })}
                    aria-label={`Cover preset ${index + 1}`}
                  >
                    <CoverSwatch cover={preset} selected={cover.color === preset.color && cover.color2 === preset.color2} />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] text-ink-faint">Pattern</span>
                {COVER_PATTERNS.map((pattern) => (
                  <button
                    key={pattern.id}
                    type="button"
                    onClick={() => setCover((c) => ({ ...c, pattern: pattern.id }))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      cover.pattern === pattern.id ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-soft hover:bg-surface-2"
                    )}
                  >
                    {pattern.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Page size">
                <Select value={pageSize} onValueChange={(value) => setPageSize(value as PageSizeId)} options={PAGE_SIZE_OPTIONS} />
              </Field>
              <Field label="Orientation">
                <Select
                  value={orientation}
                  onValueChange={(value) => setOrientation(value as NotebookSettings["orientation"])}
                  options={[
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" }
                  ]}
                />
              </Field>
            </div>

            <Field label="Cover emoji (optional)">
              <Input value={emoji} onChange={(event) => setEmoji(event.target.value)} maxLength={8} placeholder="✨" />
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-ink-soft">Preview</span>
            <div className="overflow-hidden rounded-2xl border border-line shadow-soft">
              <CoverView cover={{ ...cover, emoji: emoji.trim() ? emoji.trim().slice(0, 4) : null }} className="aspect-[4/3] w-full">
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/30 px-4 py-3 backdrop-blur-sm">
                  <span className="truncate text-sm font-semibold text-white">{title.trim() || template.name}</span>
                  <Sparkles className="size-4 text-white/80" />
                </div>
              </CoverView>
            </div>
            <p className="text-xs leading-relaxed text-ink-faint">
              Everything stays on this device in your browser storage — nothing is uploaded. You can export or back up any
              notebook at any time.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void create()} disabled={creating}>
            {creating ? "Creating…" : "Create notebook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
