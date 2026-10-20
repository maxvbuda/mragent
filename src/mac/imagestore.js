/**
 * Real pixels (screenshots, Photo Booth shots, paintings) live in IndexedDB, not in
 * the localStorage file system, which only keeps a small reference to them.
 */
const DB = 'mragent-images';
const cache = new Map(); // id -> object URL
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('img');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbp;
}

/** Load everything into memory once, so thumbnails can be drawn synchronously. */
export async function loadImages() {
  const d = await db();
  if (!d) return;
  await new Promise((resolve) => {
    const tx = d.transaction('img', 'readonly');
    const req = tx.objectStore('img').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { resolve(); return; }
      if (!cache.has(c.key)) cache.set(c.key, URL.createObjectURL(c.value));
      c.continue();
    };
    req.onerror = () => resolve();
  });
}

export async function saveImage(blob) {
  const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  cache.set(id, URL.createObjectURL(blob));
  const d = await db();
  if (d) {
    await new Promise((resolve) => {
      const tx = d.transaction('img', 'readwrite');
      tx.objectStore('img').put(blob, id);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }
  return id;
}

export function imageRefURL(id) { return cache.get(id) || null; }

export function dataURLToBlob(url) {
  const [head, b64] = url.split(',');
  const mime = head.match(/data:(.*?);/)[1];
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}
