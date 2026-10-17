"use client";

import { useState } from "react";
import type { PageTemplateFull } from "@/lib/templates";
import { PAGE_TEMPLATES, buildPageTemplate } from "@/lib/templates";
import { updatePageProps } from "@/lib/repo";
import { useEditor } from "@/lib/state/editorStore";
import { cn } from "@/lib/utils";
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
import { useEditorApi } from "@/components/editor/editorContext";

const CATEGORY_LABELS: Record<string, string> = {
  blank: "Blank",
  study: "Study",
  work: "Work",
  math: "Math",
  planning: "Planning",
  creative: "Creative",
  music: "Music"
};

export function TemplatesDialog() {
  const api = useEditorApi();
  const close = useEditor((state) => state.closeDialog);
  const pushStatus = useEditor((state) => state.pushStatus);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = async (template: PageTemplateFull) => {
    const engine = api.engine();
    const page = useEditor.getState().page;
    if (!engine || !page) return;
    setBusyId(template.id);
    try {
      const { width, height } = engine.getPageSize();
      const { background, objects } = buildPageTemplate(template.id, engine.getLayers(), width, height);
      if (objects.length > 0) {
        engine.addObjects(objects, { label: `Template: ${template.name}`, select: false });
      }
      if (Object.keys(background).length > 0) {
        const merged = { ...page.background, ...background };
        engine.setPageMeta({ width, height, background: merged });
        await updatePageProps(page.id, { background: merged });
        useEditor.setState((state) => (state.page ? { page: { ...state.page, background: merged } } : {}));
        useEditor.getState().bumpDoc();
      }
      pushStatus(`Applied “${template.name}”. Undo with Ctrl+Z.`, "info");
      close();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Page templates</DialogTitle>
          <DialogDescription>
            Templates add their layout to the current page — your existing ink stays put, and you can undo.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PAGE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={busyId !== null}
                onClick={() => void apply(template)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border border-line p-3.5 text-left transition-colors hover:border-accent hover:bg-accent-soft/30 disabled:opacity-60",
                  busyId === template.id && "border-accent bg-accent-soft/40"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{template.name}</span>
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                    {CATEGORY_LABELS[template.category] ?? template.category}
                  </span>
                </span>
                <span className="text-xs leading-relaxed text-ink-soft">{template.description}</span>
                <span className="text-[11px] text-ink-faint">
                  Paper: {template.background.paper ?? "unchanged"}
                  {busyId === template.id ? " · applying…" : ""}
                </span>
              </button>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
