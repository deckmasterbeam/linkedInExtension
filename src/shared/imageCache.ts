import { openDB } from "idb";
import type { IDBPDatabase } from "idb";

// Extension-origin IndexedDB — accessible from the background service worker
// and extension pages (e.g. viewer). Content scripts must go through messaging.

const IMAGE_DB_NAME = "li-ext-images";
const IMAGE_STORE = "images";
const IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface StoredImage {
  buffer: ArrayBuffer;
  cachedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(IMAGE_DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(IMAGE_STORE);
      },
    });
  }
  return dbPromise;
}

async function getImageBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const db = await getDB();
    const stored: StoredImage | undefined = await db.get(IMAGE_STORE, url);
    if (!stored) return null;
    if (Date.now() - stored.cachedAt > IMAGE_TTL_MS) {
      await db.delete(IMAGE_STORE, url);
      return null;
    }
    return stored.buffer;
  } catch {
    return null;
  }
}

export async function storeImageBuffer(url: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await getDB();
    await db.put(IMAGE_STORE, { buffer, cachedAt: Date.now() } satisfies StoredImage, url);
  } catch { /* quota exceeded */ }
}

/**
 * Check cache, fetch if missing, store, return ArrayBuffer.
 * Returns null if the image cannot be fetched.
 */
export async function resolveImageBuffer(url: string): Promise<ArrayBuffer | null> {
  const cached = await getImageBuffer(url);
  if (cached) return cached;

  try {
    const resp = await fetch(url, { credentials: "omit" });
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    await storeImageBuffer(url, buffer);
    return buffer;
  } catch {
    return null;
  }
}
