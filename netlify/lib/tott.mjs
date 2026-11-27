// TOTT: Auswahl der besten Elf (4-3-3) und Bild im Cup-Look.
import { BRAND as __B } from "./data.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { assetDir, fonts } from "./image.mjs";
import { club } from "./data.mjs";
import { teamLogo, drawFit } from "./teamlogo.mjs";

const GROUP = { goalkeeper: "gk", defender: "def", midfielder: "mid", forward: "fwd" };
const LINES = [ // 3-4-1-2
  { key: "fwd", label: "Sturm", short: "ST", n: 2 },
  { key: "cam", label: "Mittelfeld (offensiv)", short: "MF", n: 1 }, // EA kennt nur „Mittelfeld“ – deshalb auch hier MF
  { key: "mid", label: "Mittelfeld", short: "MF", n: 4 },
  { key: "def", label: "Abwehr", short: "IV", n: 3 },
  { key: "gk", label: "Tor", short: "TW", n: 1 },
];
const NEIGH = { gk: [], def: ["mid"], mid: ["def", "fwd"], cam: ["mid", "fwd"], fwd: ["mid"] };

/** Beste Durchschnittsnote, bei Gleichstand Torbeteiligungen, dann Einsätze */
const cmp = (a, b) => b.avg - a.avg || (b.goals + b.assists) - (a.goals + a.assists) || b.games - a.games || b.mom - a.mom;

/**
 * players: gesammelte Werte je Spieler ({ club, name, games, rSum, rGames, goals, assists, mom, cs, pos: {defender: 2, …} })
 * Rückgabe: { lines: [{ key, label, players: [..|null] }], pot, count, minGames }
 */
export function pickTott(players) {
  const list = players.filter((p) => p.rGames > 0).map((p) => {
    const main = Object.entries(p.pos || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { ...p, avg: p.rSum / p.rGames, main: GROUP[main] || "mid" };
  });
  const maxGames = Math.max(0, ...list.map((p) => p.games));
  const minGames = Math.max(1, Math.ceil(maxGames / 2)); // mindestens die Hälfte der Spiele des fleißigsten Spielers
  const ok = (p) => p.games >= minGames;
  const taken = new Set(), key = (p) => `${p.club}|${p.name}`;
  const slots = Object.fromEntries(LINES.map((l) => [l.key, []]));
  const take = (line, pool) => {
    for (const p of pool.sort(cmp)) {
      if (slots[line.key].length >= line.n) break;
      if (taken.has(key(p))) continue;
      taken.add(key(p)); slots[line.key].push(p);
    }
  };
  const order = ["gk", "def", "mid", "fwd", "cam"].map((k) => LINES.find((l) => l.key === k));
  for (const l of order) take(l, list.filter((p) => ok(p) && p.main === l.key));
  for (const l of order) take(l, list.filter((p) => ok(p) && NEIGH[l.key].includes(p.main)));
  for (const l of order) take(l, list.filter((p) => !ok(p) && p.main === l.key));
  for (const l of order) take(l, list.filter((p) => !ok(p) && NEIGH[l.key].includes(p.main)));
  const lines = LINES.map((l) => ({ ...l, players: Array.from({ length: l.n }, (_, i) => slots[l.key][i] || null) }));
  const pot = [...list.filter(ok)].sort(cmp)[0] || [...list].sort(cmp)[0] || null;
  return { lines, pot, count: taken.size, minGames };
}

// ---------- Bild ----------
const BLUE = __B.accent, GOLD = "#f2c94c", TEXT = "#f2f2f5", MUTED = "#b7b9c4";
const rr = (x, X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
const star = (x, cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.42 : r; x.lineTo(cx + q * Math.cos(a), cy + q * Math.sin(a)); } x.closePath(); x.fill(); };
function fit(x, text, font, size, maxW, min = 10) { let s = size; while (s > min) { x.font = font.replace("{s}", s); if (x.measureText(text).width <= maxW) break; s -= 1; } x.font = font.replace("{s}", s); }
const center = (x, t, cx, y) => x.fillText(t, cx - x.measureText(t).width / 2, y);
function spaced(x, t, cx, y, sp) { const ws = [...t].map((c) => x.measureText(c).width), tw = ws.reduce((a, b) => a + b, 0) + sp * (t.length - 1); let px = cx - tw / 2; [...t].forEach((c, i) => { x.fillText(c, px, y); px += ws[i] + sp; }); return tw; }
const flags = new Map();
async function flagImg(name) {
  const tl = await teamLogo(name).catch(() => null); if (tl) return tl; // eigenes Team-Logo
  const code = club(name)?.code; if (!code) return null;
  if (!flags.has(code)) flags.set(code, await loadImage(path.join(assetDir(), `flags/${code}.png`)).catch(() => null));
  return flags.get(code);
}

async function card(x, p, cx, y, short, isPot) {
  const w = 214, h = 190, X = cx - w / 2;
  x.shadowColor = isPot ? "rgba(242,201,76,.7)" : "rgba(0,0,0,.55)"; x.shadowBlur = isPot ? 26 : 14;
  const g = x.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, isPot ? "#3a2f0e" : "#24262f"); g.addColorStop(1, isPot ? "#1b1606" : "#101117");
  x.fillStyle = g; rr(x, X, y, w, h, 16); x.fill(); x.shadowBlur = 0;
  x.strokeStyle = isPot ? GOLD : "rgba(255,138,31,.85)"; x.lineWidth = isPot ? 3 : 2; rr(x, X, y, w, h, 16); x.stroke();
  if (!p) { x.fillStyle = MUTED; x.font = "600 15px Montserrat"; center(x, "keine Daten", cx, y + h / 2 - 8); return; }
  // Team-Logo groß und mittig oben auf der Karte
  const L = 64, fl = await flagImg(p.club);
  if (fl) { x.save(); x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 10; drawFit(x, fl, cx - L / 2, y + 10, L); x.restore(); }
  else { x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 2; x.beginPath(); x.arc(cx, y + 10 + L / 2, L / 2 - 4, 0, Math.PI * 2); x.stroke(); x.fillStyle = MUTED; x.font = '30px "Bebas Neue"'; const ini = p.club.replace(/[^A-Za-z0-9ÄÖÜäöü ]/g, "").split(/s+/).filter(Boolean).slice(0, 2).map((t) => t[0]).join("").toUpperCase() || "?"; center(x, ini, cx, y + 10 + L / 2 - 16); }
  // Note links oben, Position darunter
  x.fillStyle = isPot ? GOLD : "#ffffff"; x.font = '46px "Bebas Neue"'; x.fillText(p.avg.toFixed(1), X + 14, y + 10);
  x.fillStyle = isPot ? GOLD : "#ff9a6b"; x.font = "800 13px Montserrat"; x.fillText(short, X + 16, y + 58);
  if (isPot) star(x, X + w - 26, y + 26, 11, GOLD);
  // Name & Verein
  x.fillStyle = TEXT; fit(x, p.name, "700 {s}px Montserrat", 19, w - 24, 11); center(x, p.name, cx, y + 84);
  x.fillStyle = MUTED; fit(x, p.club, "600 {s}px Montserrat", 13, w - 24, 9); center(x, p.club, cx, y + 110);
  // Werte
  x.fillStyle = "rgba(255,255,255,.07)"; rr(x, X + 10, y + h - 32, w - 20, 22, 11); x.fill();
  x.fillStyle = "#ffd9c7"; x.font = "700 12px Montserrat";
  center(x, `${p.games} Sp · ${p.goals} T · ${p.assists} V${p.main === "gk" || p.main === "def" ? ` · ${p.cs} ZN` : ""}`, cx, y + h - 28);
}

/**
 * TOTT im Bomber-Cup-Stil „Detonation“ (Hochformat 1080 × 1620):
 * Druckwellen + Feuer-Glut, Spielfeld in Perspektive, jeder Spieler als Team-Logo im Neon-Ring,
 * darunter Name + Note. Keine Statistiken. Bester Spieler: goldener Ring mit Stern.
 * cupNr: optional „CUP #699“ oben rechts.
 */
export async function tottImage({ title, team, matches, cupNr = null }) {
  fonts();
  const D = await import("./detonation.mjs");
  const W = 1080, H = 1620;
  const c = createCanvas(W, H), x = c.getContext("2d");
  x.textBaseline = "alphabetic";
  D.background(x, W, H, W / 2, 980, 1050);
  D.shockwaves(x, W / 2, 980, 260, 95, 9);
  D.sparks(x, 260, W / 2, 980, 240, 900, D.rng(77));
  const glowTop = x.createRadialGradient(W / 2, 120, 0, W / 2, 120, 520);
  glowTop.addColorStop(0, "rgba(255,90,20,.28)"); glowTop.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = glowTop; x.fillRect(0, 0, W, 600);

  // Kopf: Logo links, Titel, Cup-Nummer rechts
  try { const lg = await loadImage(path.join(assetDir(), "logo.png")); D.medallion(x, lg, 128, 150, 88); } catch {}
  x.textAlign = "left";
  x.font = '30px "Bebas Neue"'; x.fillStyle = D.OR; x.fillText("BOMBER CUP", 248, 88);
  x.fillStyle = "rgba(255,255,255,.55)"; x.fillText("·  EA FC PRO CLUBS", 248 + x.measureText("BOMBER CUP ").width + 10, 88);
  D.splitTitle(x, "TEAM OF THE", 246, 168, 92);
  D.splitTitle(x, "TOURNAMENT", 246, 262, 112);
  if (cupNr) {
    const tag = `CUP #${cupNr}`;
    x.font = '44px "Bebas Neue"';
    const tw = x.measureText(tag).width + 40;
    x.fillStyle = "rgba(0,0,0,.55)"; rr(x, W - 60 - tw, 300, tw, 60, 14); x.fill();
    x.save(); x.shadowColor = "rgba(255,138,31,.8)"; x.shadowBlur = 18; x.strokeStyle = D.OR; x.lineWidth = 4; rr(x, W - 60 - tw, 300, tw, 60, 14); x.stroke(); x.restore();
    x.fillStyle = "#fff"; x.fillText(tag, W - 60 - tw + 20, 345);
  }
  x.font = "600 22px Montserrat"; x.fillStyle = "rgba(255,255,255,.8)"; x.fillText(title, 250, 330);

  // Spielfeld in Perspektive (oben schmal, unten breit)
  const top = 390, bot = 1500, tl = 250, tr = W - 250, bl = 40, br = W - 40;
  const at = (fx, fy) => { const y = top + (bot - top) * fy; const L = tl + (bl - tl) * fy, R = tr + (br - tr) * fy; return [L + (R - L) * fx, y]; };
  const field = x.createLinearGradient(0, top, 0, bot); field.addColorStop(0, "rgba(30,14,6,.55)"); field.addColorStop(1, "rgba(60,22,6,.55)");
  x.beginPath(); x.moveTo(tl, top); x.lineTo(tr, top); x.lineTo(br, bot); x.lineTo(bl, bot); x.closePath(); x.fillStyle = field; x.fill();
  x.save(); x.clip(); x.strokeStyle = "rgba(255,255,255,.04)"; x.lineWidth = 1;
  for (let i = 0; i < 26; i++) { const [a1, b1] = at(i / 25, 0), [a2, b2] = at(i / 25, 1); x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke(); }
  x.restore();
  const line = (pts) => { x.save(); x.shadowColor = "rgba(255,138,31,.9)"; x.shadowBlur = 14; x.strokeStyle = "rgba(255,170,90,.85)"; x.lineWidth = 3; x.beginPath(); pts.forEach(([fx, fy], i) => { const [px, py] = at(fx, fy); if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke(); x.restore(); };
  line([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
  line([[0, 0.5], [1, 0.5]]);
  line([[0.3, 0], [0.3, 0.13], [0.7, 0.13], [0.7, 0]]); line([[0.3, 1], [0.3, 0.87], [0.7, 0.87], [0.7, 1]]);
  line([[0.42, 0], [0.42, 0.05], [0.58, 0.05], [0.58, 0]]); line([[0.42, 1], [0.42, 0.95], [0.58, 0.95], [0.58, 1]]);
  { const [cx0, cy0] = at(0.5, 0.5); x.save(); x.shadowColor = "rgba(255,138,31,.9)"; x.shadowBlur = 14; x.strokeStyle = "rgba(255,170,90,.85)"; x.lineWidth = 3; x.beginPath(); x.ellipse(cx0, cy0, 120, 62, 0, 0, Math.PI * 2); x.stroke(); x.restore(); }

  // Spieler (3-4-1-2): Reihen von oben nach unten
  const rows = { fwd: { fy: 0.07, xs: [0.32, 0.68] }, cam: { fy: 0.27, xs: [0.5] }, mid: { fy: 0.43, xs: [0.06, 0.35, 0.65, 0.94] }, def: { fy: 0.66, xs: [0.2, 0.5, 0.8] }, gk: { fy: 0.86, xs: [0.5] } };
  const isPot = (p) => p && team.pot && p.name === team.pot.name && p.club === team.pot.club;
  for (const l of team.lines) {
    const r = rows[l.key];
    if (!r) continue;
    for (let i = 0; i < l.n; i++) {
      const p = l.players[i];
      if (!p) continue;
      let [px, py] = at(r.xs[i], r.fy);
      px = Math.max(115, Math.min(W - 145, px));
      const yo = l.key === "mid" && (i === 1 || i === 2) ? 26 : l.key === "def" && i === 1 ? 18 : 0;
      await playerBadge(x, D, p, px, py + yo, isPot(p));
    }
  }
  x.font = "600 15px Montserrat"; x.fillStyle = "rgba(255,255,255,.5)"; x.textAlign = "center";
  x.fillText(`3-4-1-2 · Ø-Note aus ${matches} Spielen (EA-Daten)`, W / 2, H - 46);
  x.textAlign = "left";
  D.hazard(x, W, H, 20);
  return c.toBuffer("image/png");
}

/** Ein Spieler: Team-Logo im Neon-Ring, darunter Namens-Leiste mit Note */
async function playerBadge(x, D, p, cx, cy, pot) {
  const R = 74, ring = pot ? "#ffcf4a" : D.OR;
  x.save(); x.shadowColor = pot ? "rgba(255,207,74,.95)" : "rgba(255,120,30,.9)"; x.shadowBlur = 26;
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = "#0d0907"; x.fill(); x.restore();
  const logo = await flagImg(p.club);
  if (logo) { x.save(); x.beginPath(); x.arc(cx, cy, R - 6, 0, Math.PI * 2); x.clip(); drawFit(x, logo, cx - (R - 10), cy - (R - 10), (R - 10) * 2); x.restore(); }
  else {
    x.font = '48px "Bebas Neue"'; x.fillStyle = "rgba(255,201,74,.8)"; x.textAlign = "center";
    const ini = p.club.replace(/[^A-Za-z0-9ÄÖÜäöü ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((t) => t[0]).join("").toUpperCase() || "?";
    x.fillText(ini, cx, cy + 17); x.textAlign = "left";
  }
  x.lineWidth = 5; x.strokeStyle = ring; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 1.5; x.strokeStyle = "rgba(255,255,255,.35)"; x.beginPath(); x.arc(cx, cy, R + 7, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
  if (pot) star(x, cx + R * 0.72, cy - R * 0.72, 16, "#ffcf4a");
  // Namens-Leiste + Note
  x.font = "700 21px Montserrat";
  let name = p.name;
  while (x.measureText(name).width > 170 && name.length > 3) name = name.slice(0, -1);
  if (name !== p.name) name = name.trimEnd() + "…";
  const nw = Math.max(110, x.measureText(name).width + 34), bh = 42, by = cy + R - 8, bx = cx - (nw + 34) / 2;
  x.save(); x.shadowColor = "rgba(0,0,0,.7)"; x.shadowBlur = 10; x.fillStyle = "rgba(12,8,6,.92)"; rr(x, bx, by, nw, bh, bh / 2); x.fill(); x.restore();
  x.lineWidth = 2.5; x.strokeStyle = ring; rr(x, bx, by, nw, bh, bh / 2); x.stroke();
  x.fillStyle = "#fff"; x.textAlign = "center"; x.fillText(name, bx + nw / 2 - 4, by + 29);
  const rcx = bx + nw + 12, rcy = by + bh / 2, rr0 = 27;
  x.save(); x.shadowColor = pot ? "rgba(255,207,74,.9)" : "rgba(255,120,30,.9)"; x.shadowBlur = 14;
  x.beginPath(); x.arc(rcx, rcy, rr0, 0, Math.PI * 2); x.fillStyle = pot ? "#ffcf4a" : D.OR; x.fill(); x.restore();
  x.font = '30px "Bebas Neue"'; x.fillStyle = "#140c06"; x.fillText(p.avg.toFixed(1).replace(".", ","), rcx, rcy + 11);
  x.textAlign = "left";
}
