import { describe, expect, it } from "vitest";
import {
  average,
  bytesToSize,
  clamp,
  escapeHtml,
  formatNumber,
  formatRelativeTime,
  hexToRgba,
  nextSortOrder,
  sanitizeFilename
} from "@/lib/utils";

describe("clamp", () => {
  it("clamps within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe("bytesToSize", () => {
  it("formats byte sizes", () => {
    expect(bytesToSize(0)).toBe("0 B");
    expect(bytesToSize(-5)).toBe("0 B");
    expect(bytesToSize(512)).toBe("512 B");
    expect(bytesToSize(2048)).toBe("2.0 KB");
    expect(bytesToSize(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });
});

describe("hexToRgba", () => {
  it("converts 6-digit hex", () => {
    expect(hexToRgba("#ff8800", 0.5)).toBe("rgba(255, 136, 0, 0.5)");
  });

  it("converts 3-digit hex", () => {
    expect(hexToRgba("#abc", 1)).toBe("rgba(170, 187, 204, 1)");
  });
});

describe("sanitizeFilename", () => {
  it("removes illegal characters", () => {
    expect(sanitizeFilename('my: note/<>|?"')).toBe("my note");
  });

  it("falls back when nothing is left", () => {
    expect(sanitizeFilename("///")).toBe("inkspace");
    expect(sanitizeFilename("///", "custom")).toBe("custom");
  });

  it("limits length to 120 characters", () => {
    expect(sanitizeFilename("a".repeat(500)).length).toBe(120);
  });
});

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml('<b class="x">&amp;\'</b>')).toBe(
      "&lt;b class=&quot;x&quot;&gt;&amp;amp;&#39;&lt;/b&gt;"
    );
  });
});

describe("average", () => {
  it("averages values and handles empty input", () => {
    expect(average([2, 4, 6])).toBe(4);
    expect(average([])).toBe(0);
  });
});

describe("nextSortOrder", () => {
  it("returns one past the highest z", () => {
    expect(nextSortOrder([{ z: 1 }, { z: 7 }, { z: 3 }])).toBe(8);
    expect(nextSortOrder([])).toBe(1);
  });
});

describe("formatNumber", () => {
  it("keeps integers plain", () => {
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(-7)).toBe("-7");
  });

  it("trims floating point noise", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(1 / 3)).toBe("0.333333333333");
  });

  it("stringifies non-finite values", () => {
    expect(formatNumber(Infinity)).toBe("Infinity");
    expect(formatNumber(NaN)).toBe("NaN");
  });
});

describe("formatRelativeTime", () => {
  it("formats recent timestamps", () => {
    expect(formatRelativeTime(Date.now())).toBe("just now");
    expect(formatRelativeTime(Date.now() - 120000)).toBe("2 min ago");
    expect(formatRelativeTime(Date.now() - 3 * 3600000)).toBe("3 h ago");
    expect(formatRelativeTime(Date.now() - 2 * 86400000)).toBe("2 d ago");
  });
});
