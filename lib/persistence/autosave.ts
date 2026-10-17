import type { NotebookPage } from "@/types";
import { createRevision, savePage } from "@/lib/repo";

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveDetail {
  savedAt?: number;
  message?: string;
}

export interface AutosaveOptions {
  getPage: () => NotebookPage | null;
  onState: (state: AutosaveState, detail?: AutosaveDetail) => void;
  onSaved?: (stored: NotebookPage) => void;
  onConflict?: (stored: NotebookPage) => void;
  debounceMs?: number;
  revisionEveryMs?: number;
}

export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saving = false;
  private queued = false;
  private disposed = false;
  private lastRevisionAt = Date.now();
  private readonly debounceMs: number;
  private readonly revisionEveryMs: number;

  constructor(private readonly opts: AutosaveOptions) {
    this.debounceMs = opts.debounceMs ?? 800;
    this.revisionEveryMs = opts.revisionEveryMs ?? 10 * 60 * 1000;
  }

  get isDirty() {
    return this.dirty;
  }

  markDirty() {
    if (this.disposed) return;
    if (!this.dirty) {
      this.dirty = true;
      this.opts.onState("dirty");
    }
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  resetDirty() {
    this.dirty = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.disposed || !this.dirty) return;
    if (this.saving) {
      this.queued = true;
      return;
    }
    const page = this.opts.getPage();
    if (!page) {
      this.dirty = false;
      return;
    }
    this.saving = true;
    this.dirty = false;
    this.opts.onState("saving");
    try {
      const expectedRevision = page.revision;
      const result = await savePage(page, expectedRevision);
      if (result.ok) {
        this.opts.onSaved?.(result.stored);
        this.opts.onState("saved", { savedAt: result.stored.updatedAt });
        const t = Date.now();
        if (t - this.lastRevisionAt > this.revisionEveryMs) {
          this.lastRevisionAt = t;
          try {
            await createRevision(page.notebookId, { kind: "auto", label: "Autosave snapshot", pageId: page.id });
          } catch {
            // revision pruning is best-effort
          }
        }
      } else {
        this.opts.onConflict?.(result.stored);
        this.opts.onState("error", { message: "This page was changed in another tab." });
      }
    } catch {
      this.dirty = true;
      this.opts.onState("error", { message: "Autosave failed — changes are kept in memory." });
    } finally {
      this.saving = false;
      if (this.queued) {
        this.queued = false;
        void this.flush();
      } else if (this.dirty) {
        this.schedule();
      }
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
