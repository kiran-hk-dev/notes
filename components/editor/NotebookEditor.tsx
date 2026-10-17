"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileQuestion } from "lucide-react";
import type { Notebook, NotebookPage, StrokeStyle } from "@/types";
import { getMeta, setMeta } from "@/lib/db";
import {
  createPage,
  deletePage as repoDeletePage,
  duplicatePage as repoDuplicatePage,
  getNotebook,
  getPage,
  getPages,
  reorderPages,
  setNotebookThumbnail,
  touchNotebook,
  updatePageProps
} from "@/lib/repo";
import { AssetManager } from "@/lib/assets";
import { Autosave } from "@/lib/persistence/autosave";
import { DrawingEngine, type EditorRequest } from "@/lib/drawing/engine";
import { renderPageToCanvas } from "@/lib/drawing/renderPage";
import { defaultStrokeStyle } from "@/lib/defaults";
import { usePrefs } from "@/lib/state/prefsStore";
import { defaultToolState, useEditor } from "@/lib/state/editorStore";
import { cn, deepClone } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Toolbar } from "@/components/editor/Toolbar";
import { TopBar } from "@/components/editor/TopBar";
import { PageStrip } from "@/components/editor/PageStrip";
import { CanvasStage } from "@/components/editor/CanvasStage";
import { EditorContext, type EditorApi } from "@/components/editor/editorContext";
import { EditorDialogs } from "@/components/editor/EditorDialogs";
import { SidePanel } from "@/components/editor/SidePanel";

function StatusToast() {
  const status = useEditor((state) => state.status);
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => useEditor.getState().clearStatus(status.id), 2800);
    return () => clearTimeout(timer);
  }, [status]);
  if (!status) return null;
  return (
    <div
      role="status"
      className={cn(
        "ks-toast pointer-events-none fixed bottom-24 left-1/2 z-[75] -translate-x-1/2 rounded-full px-4 py-2 text-xs font-medium shadow-pop",
        status.kind === "error" ? "bg-danger text-white" : "bg-ink text-surface dark:bg-surface-3 dark:text-ink"
      )}
    >
      {status.message}
    </div>
  );
}

const TOOL_KEYS: Record<string, string> = {
  v: "select",
  a: "lasso",
  h: "hand",
  p: "pen",
  e: "eraser",
  s: "shape",
  t: "text",
  f: "formula",
  g: "graph",
  i: "image",
  b: "table",
  l: "laser"
};

export function NotebookEditor({ notebookId }: { notebookId: string }) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DrawingEngine | null>(null);
  const autosaveRef = useRef<Autosave | null>(null);
  const notebookRef = useRef<Notebook | null>(null);
  const lastThumbAt = useRef(0);
  const assetsRef = useRef<AssetManager | null>(null);
  if (!assetsRef.current) assetsRef.current = new AssetManager();
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  const syncHistoryFlags = useCallback(() => {
    const engine = engineRef.current;
    if (engine) useEditor.getState().setHistory(engine.canUndo(), engine.canRedo());
  }, []);

  const snapshotPage = useCallback((): NotebookPage | null => {
    const state = useEditor.getState();
    if (!state.page) return null;
    const engine = engineRef.current;
    if (!engine) return state.page;
    return {
      ...state.page,
      width: engine.getPageSize().width,
      height: engine.getPageSize().height,
      background: engine.getBackground() ?? state.page.background,
      layers: engine.getLayers(),
      objects: engine.getObjects().map((object) => deepClone(object))
    };
  }, []);

  const scheduleThumbnail = useCallback(() => {
    const nowMs = Date.now();
    if (nowMs - lastThumbAt.current < 15000) return;
    lastThumbAt.current = nowMs;
    const assets = assetsRef.current;
    const notebook = notebookRef.current;
    const data = snapshotPage();
    if (!assets || !notebook || !data) return;
    try {
      const scale = Math.min(1, 480 / Math.max(1, data.width));
      const canvas = renderPageToCanvas(data, {
        assets: assets.render,
        scale,
        pressureCurve: usePrefs.getState().pressureCurve
      });
      const url = canvas.toDataURL("image/jpeg", 0.72);
      void setNotebookThumbnail(notebook.id, url);
      notebookRef.current = { ...notebook, thumbnail: url };
      useEditor.setState((state) => (state.notebook ? { notebook: { ...state.notebook, thumbnail: url } } : {}));
    } catch {
      // thumbnails are best-effort
    }
  }, [snapshotPage]);

  const handleRequest = useCallback((request: EditorRequest) => {
    const store = useEditor.getState();
    if (request.type === "edit-text") store.openDialog({ kind: "text", object: request.object, point: request.point });
    else if (request.type === "insert-image") store.openDialog({ kind: "image", point: request.point });
    else if (request.type === "edit-formula") store.openDialog({ kind: "formula", object: request.object });
    else if (request.type === "edit-graph") store.openDialog({ kind: "graph", object: request.object });
    else if (request.type === "edit-table") store.openDialog({ kind: "table", object: request.object });
  }, []);

  const gotoPageInternal = useCallback(
    async (pageId: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      await autosaveRef.current?.flushNow();
      autosaveRef.current?.resetDirty();
      const state = useEditor.getState();
      const fresh = (await getPage(pageId)) ?? state.pages.find((page) => page.id === pageId) ?? null;
      if (!fresh) return;
      state.setPage(deepClone(fresh));
      engine.loadPage(fresh);
      void setMeta(`last-page:${fresh.notebookId}`, pageId);
      void assetsRef.current?.ensureForPage(fresh);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const notebook = await getNotebook(notebookId);
      if (cancelled) return;
      if (!notebook || notebook.trashed) {
        setStatus("missing");
        return;
      }
      const [pages, lastId] = await Promise.all([getPages(notebookId), getMeta<string>(`last-page:${notebookId}`)]);
      if (cancelled) return;
      notebookRef.current = notebook;
      const page = pages.find((item) => item.id === lastId) ?? pages[0] ?? null;
      useEditor.getState().setSession(notebook, pages, page ? deepClone(page) : null);
      void touchNotebook(notebookId, { opened: true });
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  useEffect(() => {
    if (status !== "ready") return;
    const host = hostRef.current;
    const assetManager = assetsRef.current;
    if (!host || !assetManager) return;

    const prefs = usePrefs.getState();
    const toolState = defaultToolState();
    toolState.strokeStyle = defaultStrokeStyle(prefs.defaultPen as StrokeStyle["penType"], toolState.strokeStyle.color);

    const engine = new DrawingEngine(
      host,
      {
        onChange: () => {
          autosaveRef.current?.markDirty();
          syncHistoryFlags();
          useEditor.getState().bumpDoc();
        },
        onSelectionChange: (ids) => {
          useEditor.getState().setSelection(ids, engine.getSelectionSummary());
          syncHistoryFlags();
        },
        onViewportChange: (viewport) => useEditor.getState().setViewport(viewport),
        onToolChange: (next) => {
          useEditor.getState().setToolState(next);
          useEditor.getState().setRulerActive(engine.getRuler().active);
        },
        onPointer: (pointer) => useEditor.getState().setPointer(pointer),
        onRequest: handleRequest,
        onStatus: (message, kind) => useEditor.getState().pushStatus(message, kind)
      },
      () => {
        const current = usePrefs.getState();
        const notebook = notebookRef.current;
        return {
          pressureCurve: current.pressureCurve,
          recognizeShapes: current.recognizeShapes,
          gridSnap: current.snapToGrid ? (notebook?.settings.gridSnap ?? 24) : null,
          showPageBounds: current.showPageBounds,
          infiniteCanvas: notebook?.settings.infiniteCanvas ?? false
        };
      },
      toolState,
      assetManager.render
    );
    engineRef.current = engine;

    const autosave = new Autosave({
      debounceMs: usePrefs.getState().autosaveDebounceMs,
      getPage: snapshotPage,
      onState: (state, detail) => {
        const store = useEditor.getState();
        store.setSaveState(state, detail?.savedAt);
        if (detail?.message) store.pushStatus(detail.message, "error");
      },
      onSaved: (stored) => {
        useEditor.setState((current) => ({
          page:
            current.page && current.page.id === stored.id
              ? { ...current.page, revision: stored.revision, updatedAt: stored.updatedAt }
              : current.page,
          pages: current.pages.map((page) =>
            page.id === stored.id ? { ...page, revision: stored.revision, updatedAt: stored.updatedAt } : page
          )
        }));
        scheduleThumbnail();
      },
      onConflict: (stored) => {
        useEditor.setState((current) => ({
          page: current.page && current.page.id === stored.id ? { ...current.page, revision: stored.revision } : current.page
        }));
      }
    });
    autosaveRef.current = autosave;

    const current = useEditor.getState().page;
    if (current) {
      engine.loadPage(current);
      void assetManager.ensureForPage(current);
    }
    const unsubscribeAssets = assetManager.subscribe(() => {
      engineRef.current?.setAssets(assetManager.render);
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void autosave.flushNow();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (autosave.isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeAssets();
      void autosave.flushNow();
      autosave.dispose();
      engine.destroy();
      engineRef.current = null;
      autosaveRef.current = null;
    };
  }, [status, handleRequest, snapshotPage, syncHistoryFlags, scheduleThumbnail]);

  const toggleRuler = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !engine.getRuler().active;
    engine.setRuler(next);
    useEditor.getState().setRulerActive(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          !!target.closest?.("math-field") ||
          !!target.closest?.("[data-ks-typing]"));
      if (typing) return;
      const engine = engineRef.current;
      if (!engine) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod) {
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) engine.redo();
          else engine.undo();
          return;
        }
        if (key === "y") {
          event.preventDefault();
          engine.redo();
          return;
        }
        if (key === "c") {
          engine.copySelection();
          return;
        }
        if (key === "x") {
          engine.cutSelection();
          return;
        }
        if (key === "v") {
          engine.paste();
          return;
        }
        if (key === "d") {
          event.preventDefault();
          engine.duplicateSelection();
          return;
        }
        if (key === "a") {
          event.preventDefault();
          engine.selectAll();
          return;
        }
        if (key === "g") {
          event.preventDefault();
          if (event.shiftKey) engine.ungroupSelection();
          else engine.groupSelection();
          return;
        }
        if (key === "s") {
          event.preventDefault();
          void autosaveRef.current?.flushNow();
          return;
        }
        if (key === "0") {
          event.preventDefault();
          engine.fitToPage();
          return;
        }
        if (key === "=" || key === "+") {
          event.preventDefault();
          engine.zoomBy(1.25);
          return;
        }
        if (key === "-") {
          event.preventDefault();
          engine.zoomBy(0.8);
          return;
        }
        return;
      }
      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        engine.deleteSelection();
        return;
      }
      if (key === "escape") {
        engine.setSelection([]);
        return;
      }
      if (key === "r") {
        toggleRuler();
        return;
      }
      const tool = TOOL_KEYS[key];
      if (tool) engine.setTool(tool as Parameters<DrawingEngine["setTool"]>[0]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleRuler]);

  const api = useMemo<EditorApi>(
    () => ({
      engine: () => engineRef.current,
      assets: assetsRef.current!,
      setTool: (tool) => engineRef.current?.setTool(tool),
      toggleRuler,
      requestInsert: handleRequest,
      flushSave: async () => {
        await autosaveRef.current?.flushNow();
      },
      goToPage: async (pageId) => {
        if (useEditor.getState().activePageId === pageId) return;
        await gotoPageInternal(pageId);
      },
      addPage: async () => {
        const state = useEditor.getState();
        const engine = engineRef.current;
        if (!state.notebook || !engine) return;
        await autosaveRef.current?.flushNow();
        autosaveRef.current?.resetDirty();
        const current = state.pages.find((page) => page.id === state.activePageId);
        const created = await createPage(state.notebook.id, {
          index: current ? current.index + 1 : state.pages.length,
          background: engine.getBackground() ?? undefined,
          width: current?.width,
          height: current?.height
        });
        if (!created) return;
        useEditor.getState().setPages(await getPages(state.notebook.id));
        await gotoPageInternal(created.id);
      },
      duplicatePage: async (pageId) => {
        const state = useEditor.getState();
        if (!state.notebook) return;
        const copy = await repoDuplicatePage(pageId);
        if (!copy) return;
        useEditor.getState().setPages(await getPages(state.notebook.id));
        await gotoPageInternal(copy.id);
      },
      deletePage: async (pageId) => {
        const state = useEditor.getState();
        if (!state.notebook) return;
        if (state.pages.length <= 1) {
          state.pushStatus("A notebook needs at least one page.", "error");
          return;
        }
        const index = state.pages.findIndex((page) => page.id === pageId);
        await repoDeletePage(pageId);
        const pages = await getPages(state.notebook.id);
        useEditor.getState().setPages(pages);
        const next = pages[Math.min(index, pages.length - 1)];
        if (next) await gotoPageInternal(next.id);
      },
      movePage: async (pageId, direction) => {
        const state = useEditor.getState();
        if (!state.notebook) return;
        const index = state.pages.findIndex((page) => page.id === pageId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= state.pages.length) return;
        const ids = state.pages.map((page) => page.id);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        await reorderPages(state.notebook.id, ids);
        useEditor.getState().setPages(await getPages(state.notebook.id));
      },
      setPageTitle: async (pageId, title) => {
        const updated = await updatePageProps(pageId, { title });
        if (!updated) return;
        useEditor.setState((state) => ({
          pages: state.pages.map((page) => (page.id === pageId ? { ...page, title, index: page.index } : page)),
          page: state.page && state.page.id === pageId ? { ...state.page, title } : state.page
        }));
      }
    }),
    [gotoPageInternal, handleRequest, toggleRuler]
  );

  if (status === "missing") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
          <FileQuestion className="size-6" />
        </span>
        <h1 className="text-lg font-semibold text-ink">Notebook not found</h1>
        <p className="max-w-sm text-sm text-ink-soft">
          This notebook may have been deleted from this browser, or the link points to a different device.
        </p>
        <Button variant="primary" onClick={() => router.push("/")}>
          Back to library
        </Button>
      </div>
    );
  }

  return (
    <EditorContext.Provider value={api}>
      <div className="flex h-dvh flex-col overflow-hidden">
        <TopBar />
        <div className="relative flex min-h-0 flex-1">
          <Toolbar className="hidden w-12 shrink-0 md:flex" />
          <div className="relative min-h-0 min-w-0 flex-1 bg-canvas-bg">
            <CanvasStage ref={hostRef} />
            <Toolbar orientation="horizontal" className="absolute inset-x-0 bottom-3 mx-auto w-fit md:hidden" />
          </div>
          <SidePanel />
        </div>
        {status === "ready" ? <PageStrip /> : null}
        <EditorDialogs />
        <StatusToast />
        {status === "loading" ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-canvas-bg">
            <span className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-label="Loading notebook" />
          </div>
        ) : null}
      </div>
    </EditorContext.Provider>
  );
}
