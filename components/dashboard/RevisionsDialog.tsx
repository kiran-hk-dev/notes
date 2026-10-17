"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Save } from "lucide-react";
import type { Notebook, RevisionRecord } from "@/types";
import { createRevision, listRevisions, restoreRevision } from "@/lib/repo";
import { useLibrary } from "@/lib/state/libraryStore";
import { cn, formatRelativeTime } from "@/lib/utils";
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

const KIND_LABELS: Record<RevisionRecord["kind"], string> = {
  auto: "Autosave",
  manual: "Manual save",
  restore: "Restore point",
  import: "Imported"
};

const KIND_DOT: Record<RevisionRecord["kind"], string> = {
  auto: "bg-sky-500",
  manual: "bg-accent",
  restore: "bg-amber-500",
  import: "bg-violet-500"
};

export function RevisionsDialog({
  notebook,
  open,
  onOpenChange
}: {
  notebook: Notebook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useLibrary((state) => state.refresh);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRevisions(await listRevisions(notebook.id));
    } finally {
      setLoading(false);
    }
  }, [notebook.id]);

  useEffect(() => {
    if (open) {
      setMessage(null);
      setConfirmId(null);
      void load();
    }
  }, [open, load]);

  const saveVersion = async () => {
    setBusy(true);
    try {
      const created = await createRevision(notebook.id, { kind: "manual", label: "Manual save" });
      setMessage(created ? "Version saved." : "Could not save a version.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const restore = async (revision: RevisionRecord) => {
    setBusy(true);
    try {
      const restored = await restoreRevision(revision.id);
      if (!restored) {
        setMessage("Could not restore that version.");
        return;
      }
      await refresh();
      setMessage(`Restored “${revision.label}”.`);
      setConfirmId(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-ink-faint" />
            Version history
          </DialogTitle>
          <DialogDescription>
            Automatic snapshots plus manual saves. Restore puts the whole notebook back to that moment.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-faint">
              {revisions.length} {revisions.length === 1 ? "version" : "versions"}
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveVersion()}>
              <Save /> Save version now
            </Button>
          </div>
          {message ? <p className="text-xs font-medium text-accent-strong">{message}</p> : null}
          {loading ? (
            <p className="py-6 text-center text-sm text-ink-faint">Loading versions…</p>
          ) : revisions.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">
              No versions yet. Snapshots appear automatically while you work, and every 10 minutes.
            </p>
          ) : (
            <ul className="ks-scroll flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", KIND_DOT[revision.kind])} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-ink">{revision.label}</span>
                    <span className="text-[11px] text-ink-faint">
                      {KIND_LABELS[revision.kind]} · {formatRelativeTime(revision.createdAt)} ·{" "}
                      {revision.snapshot.pages.length} {revision.snapshot.pages.length === 1 ? "page" : "pages"}
                    </span>
                  </span>
                  {confirmId === revision.id ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => void restore(revision)}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={busy}
                      onClick={() => setConfirmId(revision.id)}
                    >
                      <RotateCcw /> Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
