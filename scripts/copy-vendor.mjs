import { copyFile, mkdir, access, cp, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyPdfWorker() {
  const candidates = ["build/pdf.worker.min.mjs", "build/pdf.worker.mjs"];
  const targetDir = join(root, "public", "vendor");
  const target = join(targetDir, "pdf.worker.min.mjs");
  for (const rel of candidates) {
    const src = join(root, "node_modules", "pdfjs-dist", rel);
    if (await exists(src)) {
      await mkdir(targetDir, { recursive: true });
      await copyFile(src, target);
      console.log(`[copy-vendor] pdf worker: ${rel} -> public/vendor/pdf.worker.min.mjs`);
      return;
    }
  }
  console.warn("[copy-vendor] pdfjs-dist worker not found; PDF import may need a manual worker copy.");
}

async function copyKatex() {
  const katexDir = join(root, "node_modules", "katex", "dist");
  const cssSrc = join(katexDir, "katex.min.css");
  const fontsSrc = join(katexDir, "fonts");
  const targetDir = join(root, "public", "vendor", "katex");
  if (!(await exists(cssSrc))) {
    console.warn("[copy-vendor] katex dist not found; formula rendering will fall back to plain text.");
    return;
  }
  await mkdir(targetDir, { recursive: true });
  await copyFile(cssSrc, join(targetDir, "katex.min.css"));
  if (await exists(fontsSrc)) {
    await cp(fontsSrc, join(targetDir, "fonts"), { recursive: true });
    const fonts = await readdir(join(targetDir, "fonts"));
    console.log(`[copy-vendor] katex: katex.min.css + ${fonts.length} font files -> public/vendor/katex/`);
  } else {
    console.log("[copy-vendor] katex: katex.min.css -> public/vendor/katex/ (no fonts dir)");
  }
}

await copyPdfWorker();
await copyKatex();
