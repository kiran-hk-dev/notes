import { describe, expect, it } from "vitest";
import type { Notebook } from "@/types";
import {
  bundleFromJson,
  decodeSharePayload,
  encodeSharePayload,
  type NotebookBundle
} from "@/lib/export/bundle";

function makeBundle(): NotebookBundle {
  return {
    app: "inkspace",
    version: 1,
    exportedAt: 1700000000000,
    notebook: { id: "nb-1", title: "Algebra notes" } as unknown as Notebook,
    pages: [],
    assets: []
  };
}

describe("bundleFromJson", () => {
  it("parses a valid bundle", async () => {
    const parsed = await bundleFromJson(JSON.stringify(makeBundle()));
    expect(parsed).not.toBeNull();
    expect(parsed?.notebook.title).toBe("Algebra notes");
  });

  it("defaults a missing assets array", async () => {
    const bundle = makeBundle();
    const raw = JSON.stringify({ ...bundle, assets: undefined });
    const parsed = await bundleFromJson(raw);
    expect(parsed?.assets).toEqual([]);
  });

  it("rejects malformed and foreign payloads", async () => {
    expect(await bundleFromJson("{oops")).toBeNull();
    expect(await bundleFromJson(JSON.stringify({ app: "other", notebook: {}, pages: [] }))).toBeNull();
    expect(await bundleFromJson(JSON.stringify({ app: "inkspace", notebook: {} }))).toBeNull();
  });
});

describe("share payloads", () => {
  it("round-trips a bundle", async () => {
    const bundle = makeBundle();
    const encoded = await encodeSharePayload(bundle);
    expect(encoded.startsWith("v1.") || encoded.startsWith("v1u.")).toBe(true);
    const decoded = await decodeSharePayload(encoded);
    expect(decoded).toEqual(bundle);
  });

  it("handles unicode content", async () => {
    const bundle = makeBundle();
    bundle.notebook.title = "笔记 — notes ✓ ∑";
    const decoded = await decodeSharePayload(await encodeSharePayload(bundle));
    expect(decoded?.notebook.title).toBe("笔记 — notes ✓ ∑");
  });

  it("rejects unknown prefixes and corrupt data", async () => {
    expect(await decodeSharePayload("zzz.payload")).toBeNull();
    expect(await decodeSharePayload("v1.!!!")).toBeNull();
    expect(await decodeSharePayload("v1u.!!!")).toBeNull();
  });

  it("rejects valid-encoding payloads that are not bundles", async () => {
    const encoded = await encodeSharePayload({ app: "other" } as unknown as NotebookBundle);
    expect(await decodeSharePayload(encoded)).toBeNull();
  });
});
