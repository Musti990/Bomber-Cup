// Speicher auf der Festplatte (ersetzt Netlify Blobs) – gleiche Schnittstelle wie getStore() von Netlify.
// Jeder Eintrag ist eine JSON-Datei in DATA_DIR. Schreiben ist atomar (temporäre Datei + umbenennen).
// Ein Prozess → Sperre im Speicher reicht für „onlyIfMatch“ (keine verlorenen Klicks bei gleichzeitigen Aktionen).
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.DATA_DIR || path.resolve("data");
const enc = (k) => encodeURIComponent(k).replace(/%/g, "_") + ".json";
const dec = (f) => decodeURIComponent(f.slice(0, -5).replace(/_([0-9A-F]{2})/g, "%$1"));
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn)); // Schreibvorgänge nacheinander

export function getStore({ name }) {
  const dir = path.join(ROOT, name);
  const file = (k) => path.join(dir, enc(k));
  const read = async (k) => { try { return JSON.parse(await fs.readFile(file(k), "utf8")); } catch { return null; } };
  return {
    async get(k) { const e = await read(k); return e ? e.v : null; },
    async getWithMetadata(k) { const e = await read(k); return e ? { data: e.v, etag: String(e.e) } : null; },
    setJSON(k, v, o = {}) {
      return serial(async () => {
        await fs.mkdir(dir, { recursive: true });
        const cur = await read(k);
        if (o.onlyIfMatch && String(cur?.e) !== String(o.onlyIfMatch)) return { modified: false };
        if (o.onlyIfNew && cur) return { modified: false };
        const tmp = file(k) + "." + process.pid + ".tmp";
        await fs.writeFile(tmp, JSON.stringify({ v, e: (cur?.e || 0) + 1 }));
        await fs.rename(tmp, file(k));
        return { modified: true };
      });
    },
    delete(k) { return serial(() => fs.rm(file(k), { force: true })); },
    async list({ prefix = "" } = {}) {
      const files = await fs.readdir(dir).catch(() => []);
      return { blobs: files.filter((f) => f.endsWith(".json")).map((f) => ({ key: dec(f) })).filter((b) => b.key.startsWith(prefix)) };
    },
  };
}
