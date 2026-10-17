"use client";

import { DEFAULT_PALETTE, HIGHLIGHTER_COLORS } from "@/lib/defaults";
import { usePrefs } from "@/lib/state/prefsStore";
import { cn } from "@/lib/utils";

export function ColorControl({
  color,
  onColorChange,
  palette,
  allowCustom = true,
  size = "md"
}: {
  color: string;
  onColorChange: (color: string) => void;
  palette?: string[];
  allowCustom?: boolean;
  size?: "sm" | "md";
}) {
  const recent = usePrefs((state) => state.recentColors);
  const pushRecent = usePrefs((state) => state.pushRecentColor);
  const swatches = palette ?? DEFAULT_PALETTE;
  const dim = size === "sm" ? "size-5" : "size-6";

  const pick = (value: string) => {
    onColorChange(value);
    pushRecent(value);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            onClick={() => pick(swatch)}
            className={cn(
              dim,
              "rounded-md border border-line transition-transform hover:scale-110",
              color.toLowerCase() === swatch.toLowerCase() && "ring-2 ring-accent ring-offset-1 ring-offset-surface"
            )}
            style={{ background: swatch }}
          />
        ))}
        {allowCustom ? (
          <label
            className={cn(
              dim,
              "relative cursor-pointer overflow-hidden rounded-md border border-line",
              "bg-[conic-gradient(#ef4444,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#ef4444)]"
            )}
          >
            <input
              type="color"
              value={color}
              onChange={(event) => pick(event.target.value)}
              aria-label="Custom color"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        ) : null}
      </div>
      {recent.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {recent.slice(0, 8).map((swatch) => (
            <button
              key={`recent-${swatch}`}
              type="button"
              aria-label={`Recent ${swatch}`}
              onClick={() => onColorChange(swatch)}
              className={cn(
                "size-4 rounded-full border border-line transition-transform hover:scale-110",
                color.toLowerCase() === swatch.toLowerCase() && "ring-2 ring-accent"
              )}
              style={{ background: swatch }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { HIGHLIGHTER_COLORS };
