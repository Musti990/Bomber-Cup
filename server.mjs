// Bomber Cup Bot – Webserver + Minuten-Timer (statt Netlify). Start: node server.mjs
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

process.env.URL ||= process.env.PUBLIC_URL || ""; // öffentliche HTTPS-Adresse (für Bilder in Discord)
const PORT = Number(process.env.PORT || 3000);
const fn = (f) => import(`./netlify/functions/${f}.mjs`).then((m) => m.default);
const routes = { "/api/interactions": "interactions", "/api/setup": "setup", "/api/logo": "logo" };
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") { res.writeHead(200).end("ok"); return; }
    if (routes[url.pathname]) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const context = { waitUntil: (p) => Promise.resolve(p).catch((e) => console.error("Hintergrund:", e)) };
      const r = await (await fn(routes[url.pathname]))(request, context);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    // Bilder & Startseite aus public/
    const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const file = path.join(path.resolve("public"), path.normalize(rel));
    if (!file.startsWith(path.resolve("public"))) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "public, max-age=3600" }).end(data);
  } catch (e) {
    if (e.code === "ENOENT") { res.writeHead(404).end("Nicht gefunden"); return; }
    console.error(e); res.writeHead(500).end("Fehler");
  }
});
server.listen(PORT, () => console.log(`Bomber Cup Bot läuft auf Port ${PORT} · ${process.env.URL || "(PUBLIC_URL fehlt!)"}`));

// Minuten-Timer: tick (Turnier-Abläufe) und ea-check (EA-Ergebnisse, TOTT) – nie doppelt gleichzeitig
const running = new Set();
async function every(name) {
  if (running.has(name)) return;
  running.add(name);
  try { await (await fn(name))(); } catch (e) { console.error(`${name}:`, e?.message || e); } finally { running.delete(name); }
}
const loop = () => { every("tick"); every("ea-check"); };
setTimeout(() => { loop(); setInterval(loop, 60000); }, 60000 - (Date.now() % 60000) + 500); // pünktlich zur vollen Minute
