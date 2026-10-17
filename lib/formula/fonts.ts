const KATEX_CSS_URL = "/vendor/katex/katex.min.css";

let cssPromise: Promise<string> | null = null;
let cssCache: string | null = null;

function stripFallbackFormats(css: string): string {
  return css
    .replace(/,\s*url\(\s*["']?[^)"']+\.(?:woff|ttf)["']?\s*\)(?:\s*format\((["'])(?:woff|truetype)\1\))?/gi, "")
    .replace(/url\(\s*["']?fonts\/[^)"']+\.(?:woff|ttf)["']?\s*\)(?:\s*format\((["'])(?:woff|truetype)\1\))?\s*,?/gi, "");
}

function collectFontRefs(css: string): string[] {
  const refs = new Set<string>();
  const pattern = /url\(\s*["']?(fonts\/[^)"']+)["']?\s*\)/gi;
  let match: RegExpExecArray | null = pattern.exec(css);
  while (match) {
    refs.add(match[1]);
    match = pattern.exec(css);
  }
  return [...refs];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("font-read-failed"));
    reader.readAsDataURL(blob);
  });
}

async function buildCss(): Promise<string> {
  const response = await fetch(KATEX_CSS_URL, { cache: "force-cache" });
  if (!response.ok) throw new Error(`katex-css-${response.status}`);
  let css = stripFallbackFormats(await response.text());
  const refs = collectFontRefs(css);
  const resolved = await Promise.all(
    refs.map(async (ref) => {
      try {
        const font = await fetch(`/vendor/katex/${ref}`, { cache: "force-cache" });
        if (!font.ok) return [ref, null] as const;
        const dataUrl = await blobToDataUrl(await font.blob());
        return [ref, dataUrl] as const;
      } catch {
        return [ref, null] as const;
      }
    })
  );
  for (const [ref, dataUrl] of resolved) {
    if (!dataUrl) continue;
    css = css.split(ref).join(dataUrl);
  }
  return css;
}

export async function katexCss(): Promise<string> {
  if (cssCache) return cssCache;
  if (!cssPromise) {
    cssPromise = buildCss()
      .then((css) => {
        cssCache = css;
        return css;
      })
      .catch((error) => {
        cssPromise = null;
        throw error;
      });
  }
  return cssPromise;
}

export function katexCssSync(): string | null {
  return cssCache;
}

export async function warmKatexFonts(): Promise<void> {
  try {
    await katexCss();
  } catch {
    // fonts unavailable; katex will fall back to system fonts
  }
}
