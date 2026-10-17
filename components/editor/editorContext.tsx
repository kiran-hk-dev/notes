"use client";

import { createContext, useContext } from "react";
import type { DrawingEngine, EditorRequest, ToolId } from "@/lib/drawing/engine";
import type { AssetManager } from "@/lib/assets";

export interface EditorApi {
  engine: () => DrawingEngine | null;
  assets: AssetManager;
  setTool: (tool: ToolId) => void;
  toggleRuler: () => void;
  requestInsert: (request: EditorRequest) => void;
  flushSave: () => Promise<void>;
  goToPage: (pageId: string) => Promise<void>;
  addPage: () => Promise<void>;
  duplicatePage: (pageId: string) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  movePage: (pageId: string, direction: -1 | 1) => Promise<void>;
  setPageTitle: (pageId: string, title: string) => Promise<void>;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditorApi(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error("useEditorApi must be used inside the notebook editor");
  return api;
}
