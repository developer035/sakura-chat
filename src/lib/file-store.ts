/**
 * Tiny IndexedDB wrapper for binary/text payloads (images, extracted document text,
 * generated files). localStorage only keeps small metadata that points here by key.
 * Falls back to memory (lost on reload) when IndexedDB is unavailable.
 */
const DB_NAME = 'sakura-files';
const STORE = 'files';

type Entry = { blob?: Blob; text?: string; createdAt: number };

const memory = new Map<string, Entry>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let warned = false;
let onFallback: (() => void) | null = null;

export function setFileStoreFallbackHandler(fn: () => void) {
  onFallback = fn;
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function warnFallback() {
  if (warned) return;
  warned = true;
  onFallback?.();
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) {
          warnFallback();
          return resolve(undefined);
        }
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      })
  );
}

async function put(key: string, entry: Entry): Promise<void> {
  memory.set(key, entry);
  await run('readwrite', (s) => s.put(entry, key));
}

async function get(key: string): Promise<Entry | undefined> {
  const hit = memory.get(key);
  if (hit) return hit;
  return run<Entry>('readonly', (s) => s.get(key) as IDBRequest<Entry>);
}

export const putBlob = (key: string, blob: Blob) => put(key, { blob, createdAt: Date.now() });
export const putText = (key: string, text: string) => put(key, { text, createdAt: Date.now() });

export async function getBlob(key: string): Promise<Blob | null> {
  return (await get(key))?.blob ?? null;
}

export async function getText(key: string): Promise<string | null> {
  return (await get(key))?.text ?? null;
}

export async function del(key: string): Promise<void> {
  memory.delete(key);
  await run('readwrite', (s) => s.delete(key));
}

/** All stored keys with their creation time (for startup cleanup). */
export async function entries(): Promise<Array<{ key: string; createdAt: number }>> {
  const db = await openDb();
  if (!db) return [...memory].map(([key, e]) => ({ key, createdAt: e.createdAt }));
  return new Promise((resolve) => {
    try {
      const out: Array<{ key: string; createdAt: number }> = [];
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push({ key: String(cur.key), createdAt: (cur.value as Entry)?.createdAt ?? 0 });
        cur.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve([]);
    }
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
