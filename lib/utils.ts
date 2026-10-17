import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { customAlphabet } from "nanoid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const idAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
export const uid = customAlphabet(idAlphabet, 12);

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function now() {
  return Date.now();
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  wrapped.flush = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = null;
    fn(...args);
  };
  return wrapped as T & { cancel: () => void; flush: (...args: Parameters<T>) => void };
}

export function throttle<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let last = 0;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    const t = Date.now();
    const remaining = ms - (t - last);
    if (remaining <= 0) {
      last = t;
      fn(...args);
    } else if (!trailing) {
      trailing = setTimeout(() => {
        trailing = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function dataURLToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head)?.[1] ?? "application/octet-stream";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function bytesToSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatRelativeTime(ts: number) {
  const diff = Date.now() - ts;
  const minute = 60000;
  const hour = 3600000;
  const day = 86400000;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < day * 7) return `${Math.floor(diff / day)} d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function sanitizeFilename(name: string, fallback = "inkspace") {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function isBrowser() {
  return typeof window !== "undefined";
}

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeXml(text: string) {
  return escapeHtml(text);
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function nextSortOrder(items: { z: number }[]) {
  return items.reduce((max, item) => Math.max(max, item.z), 0) + 1;
}

export async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatNumber(value: number, maxDigits = 12) {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return value.toString();
  const str = value.toPrecision(maxDigits);
  return String(parseFloat(str));
}
