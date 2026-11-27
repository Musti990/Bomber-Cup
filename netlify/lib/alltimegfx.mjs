// =========================================================
// 🏆 All-Time-Rangliste (Cup-Siege) als Bild im Stil „Detonation“:
// oben die Top 3 als große Karten, darunter Platz 4–20 in zwei Spalten mit Balken.
// Gleich viele Siege = gleicher Platz (1, 1, 3, …).
// =========================================================
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import fs from "node:fs";
import { fonts, assetDir } from "./image.mjs";
import * as D from "./detonation.mjs";
import { teamLogo, drawFit } from "./teamlogo.mjs";

// Logos für die Rangliste: erst die aus dem Bot (/cup-logo), sonst die importierten aus dem Logo-Kanal
let libMap;
async function logoFor(name) {
  const own = await teamLogo(name).catch(() => null);
  if (own) return own;
  if (!libMap) { try { libMap = JSON.parse(fs.readFileSync(path.join(assetDir(), "rangliste-logos/_zuordnung.json"), "utf8")); } catch { libMap = {}; } }
  const file = libMap[name];
  return file ? loadImage(path.join(assetDir(), "rangliste-logos", file)).catch(() => null) : null;
}
/** Logo rund in einem Kreis – ohne Logo: Anfangsbuchstaben */
function badge(x, img, cx, cy, r, name) {
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = "#120c08"; x.fill(); x.clip();
  if (img) drawFit(x, img, cx - r * 0.92, cy - r * 0.92, r * 1.84);
  else { x.font = `${Math.round(r * 0.9)}px "Bebas Neue"`; x.fillStyle = "rgba(255,201,74,.85)"; const t = name.replace(/[^A-Za-z0-9ÄÖÜäöü ]/g, "").split(/s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"; x.fillText(t, cx - x.measureText(t).width / 2, cy + r * 0.32); }
  x.restore();
  x.lineWidth = Math.max(2, r * 0.08); x.strokeStyle = "rgba(255,138,31,.75)"; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
}

/** [{ name, wins }] → sortiert + Platz (Wettkampf-Rangfolge) */
export function rank(list) {
  const s = [...list].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, "de"));
  let place = 0;
  return s.map((t, i) => ({ ...t, place: i && s[i - 1].wins === t.wins ? place : (place = i + 1) }));
}

export async function allTimeImage(list, { title = "ALL-TIME RANGLISTE", sub = "Cup-Siege aller Zeiten" } = {}) {
  fonts();
  const R = rank(list);
  const W = 1600, H = 1250;
  const c = createCanvas(W, H), x = c.getContext("2d");
  D.background(x, W, H, W / 2, 330, 820);
  D.shockwaves(x, W / 2, 330, 180, 80, 8);
  D.sparks(x, 160, W / 2, 330, 170, 470, D.rng(21));
  const lp = path.join(assetDir(), "logo.png");
  const logo = fs.existsSync(lp) ? await loadImage(lp).catch(() => null) : null;
  if (logo) D.medallion(x, logo, 110, 100, 52, D.OR);
  D.header(x, 182, 92, 34, "·  " + sub.toUpperCase());
  D.splitTitle(x, title, 182, 168, 84);
  const teams = R.length, cups = R.reduce((a, t) => a + t.wins, 0);
  x.font = "600 24px Montserrat"; x.fillStyle = "rgba(255,255,255,.7)";
  const st = `${teams} Sieger-Teams  ·  ${cups} Cups`;
  x.fillText(st, W - 70 - x.measureText(st).width, 92);

  // Top 3 als Karten (1 in der Mitte, größer)
  const medal = { 1: ["#ffcf4a", "🥇"], 2: ["#dfe3ea", "🥈"], 3: ["#e0894a", "🥉"] };
  const top = R.slice(0, 3);
  const slots = [{ i: 1, cx: 330, y: 300, w: 400, h: 200 }, { i: 0, cx: 800, y: 250, w: 460, h: 250 }, { i: 2, cx: 1270, y: 300, w: 400, h: 200 }];
  for (const s of slots) {
    const t = top[s.i];
    if (!t) continue;
    const col = (medal[t.place] || medal[3])[0];
    x.save(); x.shadowColor = col; x.shadowBlur = 28;
    x.beginPath(); x.roundRect(s.cx - s.w / 2, s.y, s.w, s.h, 22); x.fillStyle = "rgba(14,9,6,.92)"; x.fill();
    x.lineWidth = 5; x.strokeStyle = col; x.stroke(); x.restore();
    x.beginPath(); x.arc(s.cx, s.y, 34, 0, Math.PI * 2); x.fillStyle = col; x.fill();
    x.font = '46px "Bebas Neue"'; x.fillStyle = "#1a120a"; const pn = String(t.place); x.fillText(pn, s.cx - x.measureText(pn).width / 2, s.y + 16);
    badge(x, await logoFor(t.name), s.cx, s.y + s.h * 0.36, s.i === 0 ? 46 : 38, t.name);
    let size = s.i === 0 ? 50 : 42; x.font = `${size}px "Bebas Neue"`;
    while (x.measureText(t.name.toUpperCase()).width > s.w - 40 && size > 26) x.font = `${(size -= 2)}px "Bebas Neue"`;
    x.fillStyle = "#fff"; const nm = t.name.toUpperCase(); x.fillText(nm, s.cx - x.measureText(nm).width / 2, s.y + s.h * 0.68);
    x.font = `${s.i === 0 ? 72 : 58}px "Bebas Neue"`; x.fillStyle = col; const wn = `${t.wins} 🏆`.replace(" 🏆", ""); const ww = x.measureText(wn).width;
    x.fillText(wn, s.cx - ww / 2 - 40, s.y + s.h * 0.93);
    x.font = "700 26px Montserrat"; x.fillStyle = "rgba(255,255,255,.8)"; x.fillText(t.wins === 1 ? "SIEG" : "SIEGE", s.cx + ww / 2 - 30, s.y + s.h * 0.93 - 4);
  }

  // Platz 4–20 in zwei Spalten
  const rest = R.slice(3, 21);
  const max = R[0]?.wins || 1;
  const colX = [80, 830], rowH = 64, top0 = 580, colW = 690;
  const restLogos = await Promise.all(rest.map((t) => logoFor(t.name)));
  rest.forEach((t, k) => {
    const col = k < 9 ? 0 : 1, row = k % 9;
    const X = colX[col], Y = top0 + row * rowH;
    x.fillStyle = k % 2 ? "rgba(20,14,10,.92)" : "rgba(34,20,10,.92)";
    x.beginPath(); x.roundRect(X, Y, colW, rowH - 10, 12); x.fill();
    x.font = '38px "Bebas Neue"'; x.fillStyle = D.OR; x.fillText(String(t.place).padStart(2, " "), X + 18, Y + 40);
    badge(x, restLogos[k], X + 100, Y + 27, 21, t.name);
    x.font = "700 26px Montserrat"; x.fillStyle = "#fff";
    let nm = t.name; while (x.measureText(nm).width > 290 && nm.length > 3) nm = nm.slice(0, -2) + "";
    x.fillText(nm === t.name ? nm : nm + "…", X + 134, Y + 36);
    const bw = 200 * (t.wins / max);
    const g = x.createLinearGradient(X + 430, 0, X + 430 + bw, 0); g.addColorStop(0, D.GOLD); g.addColorStop(1, D.RED);
    x.fillStyle = "rgba(255,255,255,.08)"; x.beginPath(); x.roundRect(X + 430, Y + 20, 200, 14, 7); x.fill();
    x.fillStyle = g; x.beginPath(); x.roundRect(X + 430, Y + 20, Math.max(14, bw), 14, 7); x.fill();
    x.font = '36px "Bebas Neue"'; x.fillStyle = D.GOLD; const wn = String(t.wins); x.fillText(wn, X + colW - 18 - x.measureText(wn).width, Y + 40);
  });
  x.font = "600 22px Montserrat"; x.fillStyle = "rgba(255,255,255,.6)";
  const more = R.length > 21 ? `… und ${R.length - 21} weitere Sieger-Teams  ·  komplette Liste & Suche: /rangliste` : "Komplette Liste & Suche: /rangliste";
  x.fillText(more, W / 2 - x.measureText(more).width / 2, H - 50);
  D.hazard(x, W, H, 18);
  return c.toBuffer("image/png");
}
