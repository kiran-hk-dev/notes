import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppPreferences } from "@/types";
import { DEFAULT_PALETTE } from "@/lib/defaults";

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: "system",
  recentColors: [],
  palettes: [{ name: "Default", colors: DEFAULT_PALETTE }],
  autosaveDebounceMs: 800,
  recognizeShapes: false,
  showPageBounds: true,
  snapToGrid: false,
  pressureCurve: 0.5,
  defaultPen: "fountain"
};

interface PrefsState extends AppPreferences {
  setPref: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void;
  pushRecentColor: (color: string) => void;
  resetPrefs: () => void;
}

type PersistedPrefs = AppPreferences;

export const usePrefs = create<PrefsState>()(
  persist<PrefsState, [], [], PersistedPrefs>(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,
      setPref: (key, value) => set({ [key]: value } as unknown as Partial<PrefsState>),
      pushRecentColor: (color) => {
        const clean = color.trim();
        if (!clean) return;
        const recent = [clean, ...get().recentColors.filter((c) => c.toLowerCase() !== clean.toLowerCase())].slice(0, 12);
        set({ recentColors: recent });
      },
      resetPrefs: () => set({ ...DEFAULT_PREFERENCES })
    }),
    {
      name: "inkspace-prefs-v1",
      version: 1,
      partialize: (state): PersistedPrefs => ({
        theme: state.theme,
        recentColors: state.recentColors,
        palettes: state.palettes,
        autosaveDebounceMs: state.autosaveDebounceMs,
        recognizeShapes: state.recognizeShapes,
        showPageBounds: state.showPageBounds,
        snapToGrid: state.snapToGrid,
        pressureCurve: state.pressureCurve,
        defaultPen: state.defaultPen
      })
    }
  )
);
