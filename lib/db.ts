import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  AssetRecord,
  CalcHistoryEntry,
  Folder,
  Notebook,
  NotebookPage,
  RevisionRecord,
  TagDef
} from "@/types";

export interface InkSpaceDB extends DBSchema {
  notebooks: {
    key: string;
    value: Notebook;
    indexes: {
      "by-updated": number;
      "by-folder": string;
      "by-trash": number;
    };
  };
  pages: {
    key: string;
    value: NotebookPage;
    indexes: {
      "by-notebook": string;
    };
  };
  assets: {
    key: string;
    value: AssetRecord;
    indexes: {
      "by-notebook": string;
    };
  };
  revisions: {
    key: string;
    value: RevisionRecord;
    indexes: {
      "by-notebook": string;
      "by-page": string;
    };
  };
  calcHistory: {
    key: string;
    value: CalcHistoryEntry;
    indexes: {
      "by-created": number;
      "by-notebook": string;
    };
  };
  folders: {
    key: string;
    value: Folder;
  };
  tags: {
    key: string;
    value: TagDef;
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
  searchIndex: {
    key: string;
    value: { pageId: string; notebookId: string; text: string; updatedAt: number };
    indexes: {
      "by-notebook": string;
    };
  };
}

const DB_NAME = "inkspace";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<InkSpaceDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<InkSpaceDB>> {
  if (!dbPromise) {
    dbPromise = openDB<InkSpaceDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const notebooks = db.createObjectStore("notebooks", { keyPath: "id" });
        notebooks.createIndex("by-updated", "updatedAt");
        notebooks.createIndex("by-folder", "folderId");
        notebooks.createIndex("by-trash", "trashedAt");

        const pages = db.createObjectStore("pages", { keyPath: "id" });
        pages.createIndex("by-notebook", "notebookId");

        const assets = db.createObjectStore("assets", { keyPath: "id" });
        assets.createIndex("by-notebook", "notebookId");

        const revisions = db.createObjectStore("revisions", { keyPath: "id" });
        revisions.createIndex("by-notebook", "notebookId");
        revisions.createIndex("by-page", "pageId");

        const calcHistory = db.createObjectStore("calcHistory", { keyPath: "id" });
        calcHistory.createIndex("by-created", "createdAt");
        calcHistory.createIndex("by-notebook", "notebookId");

        db.createObjectStore("folders", { keyPath: "id" });
        db.createObjectStore("tags", { keyPath: "name" });
        db.createObjectStore("meta", { keyPath: "key" });

        const searchIndex = db.createObjectStore("searchIndex", { keyPath: "pageId" });
        searchIndex.createIndex("by-notebook", "notebookId");
      }
    });
  }
  return dbPromise;
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const record = await db.get("meta", key);
  return record ? (record.value as T) : null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}

export async function deleteDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // ignore
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("deleteDatabase failed"));
    request.onblocked = () => resolve();
  });
}
