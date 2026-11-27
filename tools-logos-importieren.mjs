// Logos aus einem Discord-Kanal übernehmen (nur lesen!). Pro Spieler wird sein neuestes Logo gemerkt.
// Registriert dieser Spieler später sein Team, bekommt es automatisch dieses Logo.
// Hat ein Team schon diesen Manager, bekommt es das Logo sofort (wenn noch keins da ist).
// Aufruf im Container:  node tools-logos-importieren.mjs <KANAL-ID>
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { get, set, getClubs, mutate } from "./netlify/lib/store.mjs";

const CH = process.argv[2];
if (!CH) { console.log("Kanal-ID fehlt"); process.exit(1); }
const H = { Authorization: `Bot ${process.env.DISCORD_TOKEN}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let before = "", all = [];
for (let i = 0; i < 80; i++) {
  const r = await fetch(`https://discord.com/api/v10/channels/${CH}/messages?limit=100${before ? `&before=${before}` : ""}`, { headers: H });
  if (r.status === 429) { await sleep(2000); i--; continue; }
  const b = await r.json();
  if (!Array.isArray(b)) { console.log("Fehler:", JSON.stringify(b)); process.exit(1); }
  all.push(...b);
  if (b.length < 100) break;
  before = b[b.length - 1].id;
}
// älteste zuerst → neuere überschreiben ältere
all.reverse();
const lib = {};
for (const m of all) {
  const img = m.attachments.find((a) => /^image\//.test(a.content_type || ""));
  if (img && !m.author.bot) lib[m.author.id] = { url: img.url, text: m.content.trim().split("\n")[0].slice(0, 60), at: m.timestamp, user: m.author.username };
}
async function shrink(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const im = await loadImage(Buffer.from(await r.arrayBuffer()));
  const k = Math.min(1, 512 / Math.max(im.width, im.height));
  const c = createCanvas(Math.round(im.width * k), Math.round(im.height * k));
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  return c.toBuffer("image/png");
}
const clubs = await getClubs();
const byManager = Object.fromEntries(Object.entries(clubs).map(([n, c]) => [c.manager, n]));
let ok = 0, fail = 0, given = 0;
for (const [uid, e] of Object.entries(lib)) {
  try {
    const png = await shrink(e.url);
    if (!png) { fail++; continue; }
    await set(`logolib:${uid}`, { type: "image/png", b64: png.toString("base64"), text: e.text, user: e.user, at: e.at });
    ok++;
    const club = byManager[uid];
    if (club && !(await get(`logo:${club}`))) {
      const v = Date.now().toString(36);
      await set(`logo:${club}`, { type: "image/png", b64: png.toString("base64"), v });
      await mutate("clubs", (cl) => { if (cl[club]) cl[club].logoV = v; }, { initial: {} });
      given++;
    }
  } catch { fail++; }
}
console.log(`✔ ${ok} Logos gemerkt (von ${Object.keys(lib).length} Spielern), ${given} direkt an bestehende Teams vergeben, ${fail} Fehler`);
