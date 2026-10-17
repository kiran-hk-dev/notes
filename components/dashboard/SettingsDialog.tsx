"use client";

import { useEffect, useState } from "react";
import { Database, Monitor, MoonStar, Sun, Trash2 } from "lucide-react";
import { PEN_DEFS } from "@/lib/defaults";
import { deleteDatabase, estimateStorage } from "@/lib/db";
import { getStorageStats } from "@/lib/repo";
import { usePrefs } from "@/lib/state/prefsStore";
import { bytesToSize, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";

const THEME_OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: Monitor },
  { id: "dark", label: "Dark", icon: MoonStar }
] as const;

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const prefs = usePrefs();
  const [stats, setStats] = useState<{ notebooks: number; pages: number; assets: number; assetBytes: number } | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [storageStats, estimate] = await Promise.all([getStorageStats(), estimateStorage()]);
      if (cancelled) return;
      setStats(storageStats);
      setUsage(estimate);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences are stored locally on this device.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-soft">Theme</span>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => prefs.setPref("theme", option.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors",
                    prefs.theme === option.id ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-soft hover:bg-surface-2"
                  )}
                >
                  <option.icon className="size-4" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default pen">
              <Select
                value={prefs.defaultPen}
                onValueChange={(value) => prefs.setPref("defaultPen", value)}
                options={PEN_DEFS.map((pen) => ({ value: pen.id, label: pen.name }))}
              />
            </Field>
            <Field label="Autosave delay">
              <div className="flex h-9 items-center gap-3">
                <Slider
                  value={prefs.autosaveDebounceMs}
                  min={300}
                  max={2000}
                  step={100}
                  onValueChange={(value) => prefs.setPref("autosaveDebounceMs", value)}
                  ariaLabel="Autosave delay"
                />
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-faint">{prefs.autosaveDebounceMs} ms</span>
              </div>
            </Field>
          </div>

          <Field label="Pen pressure sensitivity">
            <div className="flex h-9 items-center gap-3">
              <Slider
                value={Math.round(prefs.pressureCurve * 100)}
                min={10}
                max={100}
                step={5}
                onValueChange={(value) => prefs.setPref("pressureCurve", value / 100)}
                ariaLabel="Pressure curve"
              />
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-faint">{Math.round(prefs.pressureCurve * 100)}%</span>
            </div>
          </Field>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <label className="flex items-center justify-between gap-4">
              <span className="flex flex-col">
                <span className="text-sm font-medium text-ink">Shape recognition</span>
                <span className="text-xs text-ink-faint">Snap wobbly ink into clean shapes as you draw.</span>
              </span>
              <Switch checked={prefs.recognizeShapes} onCheckedChange={(value) => prefs.setPref("recognizeShapes", value)} aria-label="Shape recognition" />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="flex flex-col">
                <span className="text-sm font-medium text-ink">Show page bounds</span>
                <span className="text-xs text-ink-faint">Outline the printable page area on the canvas.</span>
              </span>
              <Switch checked={prefs.showPageBounds} onCheckedChange={(value) => prefs.setPref("showPageBounds", value)} aria-label="Show page bounds" />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="flex flex-col">
                <span className="text-sm font-medium text-ink">Snap to grid</span>
                <span className="text-xs text-ink-faint">Align moved objects to a rough grid.</span>
              </span>
              <Switch checked={prefs.snapToGrid} onCheckedChange={(value) => prefs.setPref("snapToGrid", value)} aria-label="Snap to grid" />
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Database className="size-4 text-ink-soft" /> Local storage
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft sm:grid-cols-4">
              <span>{stats ? `${stats.notebooks} notebooks` : "…"}</span>
              <span>{stats ? `${stats.pages} pages` : "…"}</span>
              <span>{stats ? `${stats.assets} assets` : "…"}</span>
              <span>{stats ? bytesToSize(stats.assetBytes) : "…"}</span>
            </div>
            {usage ? (
              <p className="text-[11px] text-ink-faint">
                Browser storage: {bytesToSize(usage.usage)} used of ~{bytesToSize(usage.quota)} available.
              </p>
            ) : null}
            {confirmClear ? (
              <div className="flex flex-col gap-2 rounded-lg bg-danger/10 p-3">
                <p className="text-xs text-danger">
                  Delete all notebooks, pages, assets and settings from this browser? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        await deleteDatabase();
                        window.localStorage.removeItem("inkspace-prefs-v1");
                        window.location.href = "/";
                      })();
                    }}
                  >
                    Yes, erase everything
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="dangerGhost" size="sm" className="self-start" onClick={() => setConfirmClear(true)}>
                <Trash2 /> Erase all local data
              </Button>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
