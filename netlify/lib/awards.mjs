// =========================================================
// 💣 Bomber-Awards eines Cups (aus den EA-Daten des TOTT-Sammlers) + Bild im Stil „Detonation“.
// Oben groß der „BOMBER DES CUPS“ (beste Ø-Note), darunter 6 Awards mit eigenen Symbolen.
// =========================================================
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import fs from "node:fs";
import { fonts, assetDir } from "./image.mjs";
import { teamLogo, drawFit } from "./teamlogo.mjs";
import * as D from "./detonation.mjs";

/** Die Awards berechnen. players: Objekt/Liste { club, name, games, rSum, rGames, goals, assists, mom, cs, saves, tackles, passes, pos } */
export function computeAwards(players) {
  const list = Object.values(players || {});
  if (!list.length) return null;
  const mainPos = (p) => Object.entries(p.pos || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const maxGames = Math.max(0, ...list.map((p) => p.games || 0));
  const minGames = Math.max(1, Math.ceil(maxGames / 2));
  const best = (val, filter = () => true) => {
    const c = list.filter((p) => filter(p) && val(p) > 0).sort((a, b) => val(b) - val(a) || (b.rSum / (b.rGames || 1)) - (a.rSum / (a.rGames || 1)));
    return c[0] ? { p: c[0], v: val(c[0]) } : null;
  };
  const avg = (p) => (p.rGames ? p.rSum / p.rGames : 0);
  const mvp = best(avg, (p) => p.games >= minGames && p.rGames > 0);
  const fmt = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  return {
    mvp: mvp && { ...mvp, line: `Ø ${avg(mvp.p).toFixed(2).replace(".", ",")} Bewertung` },
    awards: [
      { id: "spreng", title: "SPRENGMEISTER", sub: "meiste Tore", icon: "bomb", r: best((p) => p.goals), unit: (v) => fmt(v, "Tor", "Tore") },
      { id: "zuender", title: "ZÜNDSCHNUR", sub: "meiste Vorlagen", icon: "fuse", r: best((p) => p.assists), unit: (v) => fmt(v, "Vorlage", "Vorlagen") },
      { id: "abriss", title: "ABRISSBIRNE", sub: "meiste Zweikämpfe", icon: "ball", r: best((p) => p.tackles || 0), unit: (v) => fmt(v, "gewonnener Zweikampf", "gewonnene Zweikämpfe") },
      { id: "takt", title: "TAKTGEBER", sub: "meiste Pässe", icon: "net", r: best((p) => p.passes || 0), unit: (v) => fmt(v, "Pass", "Pässe") },
      { id: "wand", title: "STAHLWAND", sub: "meiste Paraden", icon: "goal", r: best((p) => p.saves || 0, (p) => mainPos(p) === "goalkeeper"), unit: (v) => fmt(v, "Parade", "Paraden") },
      { id: "bunker", title: "BUNKER", sub: "meiste Zu-null-Spiele", icon: "shield", r: best((p) => p.cs, (p) => ["goalkeeper", "defender"].includes(mainPos(p))), unit: (v) => fmt(v, "Zu-null-Spiel", "Zu-null-Spiele") },
    ],
    extra: best((p) => p.mom), // Man of the Match (nur im Text)
  };
}

// ---------- Symbole (selbst gezeichnet) ----------
function icon(x, kind, cx, cy, s) {
  x.save();
  x.translate(cx, cy);
  x.shadowColor = "rgba(255,150,40,.85)"; x.shadowBlur = 18;
  const gold = x.createLinearGradient(0, -s, 0, s); gold.addColorStop(0, "#ffe7a3"); gold.addColorStop(0.5, "#f6b73c"); gold.addColorStop(1, "#b5651d");
  x.fillStyle = gold; x.strokeStyle = gold; x.lineWidth = s * 0.09; x.lineCap = "round"; x.lineJoin = "round";
  if (kind === "bomb") {
    x.beginPath(); x.arc(0, s * 0.12, s * 0.62, 0, Math.PI * 2); x.fill();
    x.fillRect(-s * 0.16, -s * 0.66, s * 0.32, s * 0.2);
    x.beginPath(); x.moveTo(0, -s * 0.66); x.quadraticCurveTo(s * 0.35, -s * 1.0, s * 0.6, -s * 0.8); x.stroke();
    x.fillStyle = "#fff"; x.beginPath(); x.arc(s * 0.62, -s * 0.82, s * 0.09, 0, Math.PI * 2); x.fill();
  } else if (kind === "fuse") {
    x.setLineDash([s * 0.08, s * 0.14]); x.beginPath(); x.moveTo(-s * 0.85, s * 0.55); x.bezierCurveTo(-s * 0.3, s * 0.6, -s * 0.2, -s * 0.5, s * 0.55, -s * 0.45); x.stroke(); x.setLineDash([]);
    x.beginPath(); x.moveTo(s * 0.55, -s * 0.45); x.lineTo(s * 0.25, -s * 0.72); x.moveTo(s * 0.55, -s * 0.45); x.lineTo(s * 0.3, -s * 0.15); x.stroke();
    x.fillStyle = "#fff"; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; x.beginPath(); x.moveTo(-s * 0.85, s * 0.55); x.lineTo(-s * 0.85 + Math.cos(a) * s * 0.22, s * 0.55 + Math.sin(a) * s * 0.22); x.lineWidth = s * 0.04; x.strokeStyle = "#fff"; x.stroke(); }
  } else if (kind === "ball") {
    x.beginPath(); x.moveTo(-s * 0.1, -s * 0.95); x.lineTo(s * 0.05, -s * 0.2); x.stroke();
    for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(-s * 0.06 + k * s * 0.04, -s * 0.85 + k * s * 0.2, s * 0.06, s * 0.1, 0.3, 0, Math.PI * 2); x.stroke(); }
    x.beginPath(); x.arc(s * 0.1, s * 0.3, s * 0.52, 0, Math.PI * 2); x.fill();
    x.fillStyle = "rgba(0,0,0,.25)"; x.beginPath(); x.arc(-s * 0.08, s * 0.14, s * 0.14, 0, Math.PI * 2); x.fill();
  } else if (kind === "net") {
    const pts = [[-0.7, -0.4], [0, -0.75], [0.7, -0.35], [0.55, 0.45], [-0.15, 0.7], [-0.75, 0.3], [0, 0]];
    x.lineWidth = s * 0.06;
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [6, 0], [6, 2], [6, 3], [6, 5], [6, 1], [6, 4]]) { x.beginPath(); x.moveTo(pts[i][0] * s, pts[i][1] * s); x.lineTo(pts[j][0] * s, pts[j][1] * s); x.stroke(); }
    for (const [a, b] of pts) { x.beginPath(); x.arc(a * s, b * s, s * 0.14, 0, Math.PI * 2); x.fill(); }
  } else if (kind === "goal") {
    x.lineWidth = s * 0.1; x.beginPath(); x.moveTo(-s * 0.9, s * 0.65); x.lineTo(-s * 0.9, -s * 0.55); x.lineTo(s * 0.9, -s * 0.55); x.lineTo(s * 0.9, s * 0.65); x.stroke();
    x.lineWidth = s * 0.03; x.globalAlpha = 0.6;
    for (let k = -3; k <= 3; k++) { x.beginPath(); x.moveTo(k * s * 0.25, -s * 0.5); x.lineTo(k * s * 0.25, s * 0.62); x.stroke(); }
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(-s * 0.85, -s * 0.3 + k * s * 0.25); x.lineTo(s * 0.85, -s * 0.3 + k * s * 0.25); x.stroke(); }
    x.globalAlpha = 1; x.beginPath(); x.arc(s * 0.15, s * 0.05, s * 0.3, 0, Math.PI * 2); x.fill();
  } else if (kind === "shield") {
    x.beginPath(); x.moveTo(0, -s * 0.9); x.lineTo(s * 0.75, -s * 0.6); x.lineTo(s * 0.65, s * 0.2); x.quadraticCurveTo(s * 0.4, s * 0.75, 0, s * 0.95); x.quadraticCurveTo(-s * 0.4, s * 0.75, -s * 0.65, s * 0.2); x.lineTo(-s * 0.75, -s * 0.6); x.closePath(); x.fill();
    x.fillStyle = "rgba(0,0,0,.3)"; x.font = `${Math.round(s * 0.8)}px "Bebas Neue"`; x.textAlign = "center"; x.fillText("0", 0, s * 0.35);
  } else if (kind === "crown") {
    x.beginPath(); x.moveTo(-s, s * 0.45); x.lineTo(-s, -s * 0.35); x.lineTo(-s * 0.5, s * 0.05); x.lineTo(0, -s * 0.6); x.lineTo(s * 0.5, s * 0.05); x.lineTo(s, -s * 0.35); x.lineTo(s, s * 0.45); x.closePath(); x.fill();
    x.fillStyle = "#fff"; for (const px of [-1, 0, 1]) { x.beginPath(); x.arc(px * s * (px ? 1 : 0), px ? -s * 0.4 : -s * 0.66, s * 0.1, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
}

const ini = (s) => s.replace(/[^A-Za-z0-9ÄÖÜäöü ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((t) => t[0]).join("").toUpperCase() || "?";
async function logoCircle(x, club, cx, cy, r, ring = D.OR) {
  x.save(); x.shadowColor = "rgba(255,120,30,.8)"; x.shadowBlur = 16; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = "#0d0907"; x.fill(); x.restore();
  const img = await teamLogo(club).catch(() => null);
  if (img) { x.save(); x.beginPath(); x.arc(cx, cy, r - 4, 0, Math.PI * 2); x.clip(); drawFit(x, img, cx - (r - 7), cy - (r - 7), (r - 7) * 2); x.restore(); }
  else { x.font = `${Math.round(r * 0.8)}px "Bebas Neue"`; x.fillStyle = "rgba(255,201,74,.85)"; x.textAlign = "center"; x.fillText(ini(club), cx, cy + r * 0.28); x.textAlign = "left"; }
  x.lineWidth = Math.max(3, r * 0.07); x.strokeStyle = ring; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
}
function fitText(x, t, font, size, maxW) { let s = size; do { x.font = font.replace("{s}", s); s--; } while (x.measureText(t).width > maxW && s > 10); }

// ---------- Premium-Bausteine ----------
/** Fläche mit abgeschrägten Ecken */
function chamfer(x, X, Y, w, h, c) {
  x.beginPath();
  x.moveTo(X + c, Y); x.lineTo(X + w - c, Y); x.lineTo(X + w, Y + c); x.lineTo(X + w, Y + h - c);
  x.lineTo(X + w - c, Y + h); x.lineTo(X + c, Y + h); x.lineTo(X, Y + h - c); x.lineTo(X, Y + c); x.closePath();
}
const goldGrad = (x, y0, y1) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, "#fff4c9"); g.addColorStop(0.45, "#ffcf4a"); g.addColorStop(0.55, "#d98a1c"); g.addColorStop(1, "#ffd27a"); return g; };
function metalBorder(x, X, Y, w, h, c, width = 3) {
  const g = x.createLinearGradient(X, Y, X + w, Y + h); g.addColorStop(0, "#ffe7a3"); g.addColorStop(0.3, "#c47a1a"); g.addColorStop(0.6, "#ffd27a"); g.addColorStop(1, "#8a4b10");
  x.lineWidth = width; x.strokeStyle = g; chamfer(x, X, Y, w, h, c); x.stroke();
}
function hexPath(x, cx, cy, r) { x.beginPath(); for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k - Math.PI / 2; x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } x.closePath(); }
async function logoHex(x, club, cx, cy, r) {
  x.save(); x.shadowColor = "rgba(255,190,70,.8)"; x.shadowBlur = 30; hexPath(x, cx, cy, r + 8); x.fillStyle = goldGrad(x, cy - r, cy + r); x.fill(); x.restore();
  hexPath(x, cx, cy, r); x.fillStyle = "#0c0806"; x.fill();
  const img = await teamLogo(club).catch(() => null);
  x.save(); hexPath(x, cx, cy, r - 4); x.clip();
  if (img) drawFit(x, img, cx - r * 0.8, cy - r * 0.8, r * 1.6);
  else { x.font = `${Math.round(r * 0.7)}px "Bebas Neue"`; x.fillStyle = "#ffcf4a"; x.textAlign = "center"; x.fillText(ini(club), cx, cy + r * 0.25); x.textAlign = "left"; }
  x.restore();
}
/** Note in einer Medaille mit Lorbeer */
function medal(x, cx, cy, r, text, label) {
  x.save(); x.strokeStyle = "#e3a93a"; x.fillStyle = "#e3a93a"; x.lineWidth = 3;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const a = Math.PI / 2 + side * (0.35 + k * 0.27), lx = cx + Math.cos(a) * (r + 22), ly = cy + Math.sin(a) * (r + 22);
      x.save(); x.translate(lx, ly); x.rotate(a + side * 0.9); x.beginPath(); x.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); x.fill(); x.restore();
    }
  }
  x.restore();
  x.save(); x.shadowColor = "rgba(255,190,70,.9)"; x.shadowBlur = 30; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = goldGrad(x, cy - r, cy + r); x.fill(); x.restore();
  x.beginPath(); x.arc(cx, cy, r - 10, 0, Math.PI * 2); x.fillStyle = "#1a0f06"; x.fill();
  x.lineWidth = 2; x.strokeStyle = "rgba(255,210,122,.6)"; x.beginPath(); x.arc(cx, cy, r - 16, 0, Math.PI * 2); x.stroke();
  x.textAlign = "center"; x.font = `${Math.round(r * 0.78)}px "Bebas Neue"`; x.fillStyle = goldGrad(x, cy - r * 0.4, cy + r * 0.3); x.fillText(text, cx, cy + r * 0.22);
  x.font = `700 ${Math.round(r * 0.16)}px Montserrat`; x.fillStyle = "rgba(255,255,255,.7)"; x.fillText(label, cx, cy + r * 0.5); x.textAlign = "left";
}
function spacedText(x, t, cx, y, sp) { const ws = [...t].map((ch) => x.measureText(ch).width), tw = ws.reduce((a, b) => a + b, 0) + sp * (t.length - 1); let px = cx - tw / 2; [...t].forEach((ch, i) => { x.fillText(ch, px, y); px += ws[i] + sp; }); return tw; }

/** Bild: 1500 × 1280 – Feuer-Bühne, goldener Titel, Bomber des Cups mit Medaille, 6 Award-Kacheln */
export async function awardsImage(aw, { title = "", cupNr = null } = {}) {
  fonts();
  const W = 1500, H = 1370;
  const c = createCanvas(W, H), x = c.getContext("2d");
  x.textBaseline = "alphabetic";
  // Hintergrund: echtes Feuer (unscharf, abgedunkelt) + Scheinwerfer + Vignette
  x.fillStyle = "#070403"; x.fillRect(0, 0, W, H);
  try {
    const bg = await loadImage(path.join(assetDir(), "fire-bg.jpg"));
    const r = Math.max(W / bg.width, H / bg.height);
    x.filter = "blur(10px)"; x.globalAlpha = 0.55; x.drawImage(bg, (W - bg.width * r) / 2, (H - bg.height * r) / 2, bg.width * r, bg.height * r); x.globalAlpha = 1; x.filter = "none";
  } catch {}
  const dark = x.createLinearGradient(0, 0, 0, H); dark.addColorStop(0, "rgba(6,3,2,.55)"); dark.addColorStop(0.45, "rgba(6,3,2,.35)"); dark.addColorStop(1, "rgba(6,3,2,.85)"); x.fillStyle = dark; x.fillRect(0, 0, W, H);
  x.save(); x.globalCompositeOperation = "lighter";
  for (const [sx, ex] of [[220, 520], [W - 220, W - 520], [W / 2 - 60, W / 2 - 260], [W / 2 + 60, W / 2 + 260]]) {
    const g = x.createLinearGradient(sx, 0, ex, 620); g.addColorStop(0, "rgba(255,180,90,.22)"); g.addColorStop(1, "rgba(255,120,30,0)");
    x.fillStyle = g; x.beginPath(); x.moveTo(sx - 18, 0); x.lineTo(sx + 18, 0); x.lineTo(ex + 120, 620); x.lineTo(ex - 120, 620); x.closePath(); x.fill();
  }
  x.restore();
  D.sparks(x, 160, W / 2, 470, 260, 820, D.rng(91));
  const vig = x.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 950); vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,.7)"); x.fillStyle = vig; x.fillRect(0, 0, W, H);

  // Titel mittig, goldenes Metall
  let lg = null; try { lg = await loadImage(path.join(assetDir(), "logo.png")); } catch {}
  if (lg) { D.medallion(x, lg, 120, 120, 66, "#ffcf4a"); D.medallion(x, lg, W - 120, 120, 66, "#ffcf4a"); }
  x.textAlign = "center";
  x.font = "800 18px Montserrat"; x.fillStyle = "#ffb070"; spacedText(x, "BOMBER CUP  ·  EA FC PRO CLUBS", W / 2, 66, 6);
  x.font = '124px "Bebas Neue"';
  x.save(); x.shadowColor = "rgba(255,120,20,.9)"; x.shadowBlur = 40; x.fillStyle = "#3a1a06"; x.fillText("BOMBER AWARDS", W / 2 + 3, 178); x.restore();
  x.lineWidth = 8; x.strokeStyle = "#2a1405"; x.strokeText("BOMBER AWARDS", W / 2, 175);
  x.fillStyle = goldGrad(x, 80, 180); x.fillText("BOMBER AWARDS", W / 2, 175);
  const line2 = [cupNr ? `CUP #${cupNr}` : null, title || null].filter(Boolean).join("   ·   ");
  if (line2) {
    x.font = '34px "Bebas Neue"'; const lw = x.measureText(line2).width + 60;
    x.fillStyle = "rgba(0,0,0,.55)"; chamfer(x, W / 2 - lw / 2, 196, lw, 46, 12); x.fill();
    metalBorder(x, W / 2 - lw / 2, 196, lw, 46, 12, 2);
    x.fillStyle = "#fff"; x.fillText(line2, W / 2, 230);
  }
  x.textAlign = "left";

  // Bühne: Bomber des Cups
  const bx = 70, by = 270, bw = W - 140, bh = 300;
  x.save(); x.shadowColor = "rgba(255,170,60,.45)"; x.shadowBlur = 40;
  const pf = x.createLinearGradient(0, by, 0, by + bh); pf.addColorStop(0, "rgba(46,24,8,.95)"); pf.addColorStop(1, "rgba(18,9,4,.95)");
  x.fillStyle = pf; chamfer(x, bx, by, bw, bh, 34); x.fill(); x.restore();
  const shine = x.createRadialGradient(W / 2, by + bh / 2, 20, W / 2, by + bh / 2, 600); shine.addColorStop(0, "rgba(255,190,80,.22)"); shine.addColorStop(1, "rgba(255,190,80,0)"); x.fillStyle = shine; chamfer(x, bx, by, bw, bh, 34); x.fill();
  metalBorder(x, bx, by, bw, bh, 34, 5); metalBorder(x, bx + 10, by + 10, bw - 20, bh - 20, 28, 1.5);
  if (aw.mvp) {
    await logoHex(x, aw.mvp.p.club, bx + 190, by + bh / 2 + 6, 104);
    icon(x, "crown", bx + 190, by + 52, 40);
    x.textAlign = "center"; const mid = W / 2 + 10;
    x.font = "800 20px Montserrat"; x.fillStyle = "#ffcf4a"; spacedText(x, "BOMBER DES CUPS", mid, by + 78, 8);
    fitText(x, aw.mvp.p.name.toUpperCase(), '{s}px "Bebas Neue"', 120, 620);
    x.save(); x.shadowColor = "rgba(0,0,0,.8)"; x.shadowBlur = 16; x.fillStyle = "#ffffff"; x.fillText(aw.mvp.p.name.toUpperCase(), mid, by + 190); x.restore();
    x.font = "600 26px Montserrat"; x.fillStyle = "rgba(255,230,200,.8)"; x.fillText(aw.mvp.p.club, mid, by + 236);
    x.textAlign = "left";
    medal(x, bx + bw - 190, by + bh / 2 + 4, 92, aw.mvp.line.split(" ")[1], "Ø BEWERTUNG");
  }

  // 6 Award-Kacheln
  const gx = 70, gy = 640, gap = 30, tw = (W - 140 - gap * 2) / 3, th = 280;
  for (let k = 0; k < 6; k++) {
    const a = aw.awards[k], X = gx + (k % 3) * (tw + gap), Y = gy + Math.floor(k / 3) * (th + gap + 26);
    x.save(); x.shadowColor = "rgba(0,0,0,.7)"; x.shadowBlur = 24;
    const tf = x.createLinearGradient(0, Y, 0, Y + th); tf.addColorStop(0, "rgba(40,20,8,.94)"); tf.addColorStop(1, "rgba(14,7,3,.96)");
    x.fillStyle = tf; chamfer(x, X, Y, tw, th, 22); x.fill(); x.restore();
    metalBorder(x, X, Y, tw, th, 22, 2.5);
    // Symbol-Plakette oben mittig (über dem Rand)
    const pcx = X + tw / 2, pcy = Y;
    x.save(); x.shadowColor = "rgba(255,160,50,.9)"; x.shadowBlur = 24; x.beginPath(); x.arc(pcx, pcy, 44, 0, Math.PI * 2); x.fillStyle = goldGrad(x, pcy - 44, pcy + 44); x.fill(); x.restore();
    x.beginPath(); x.arc(pcx, pcy, 37, 0, Math.PI * 2); x.fillStyle = "#170c05"; x.fill();
    icon(x, a.icon, pcx, pcy + 2, 27);
    x.textAlign = "center";
    x.font = '42px "Bebas Neue"'; x.fillStyle = goldGrad(x, Y + 50, Y + 90); x.fillText(a.title, pcx, Y + 88);
    x.font = "700 14px Montserrat"; x.fillStyle = "rgba(255,255,255,.55)"; x.fillText(a.sub.toUpperCase(), pcx, Y + 112);
    x.textAlign = "left";
    if (a.r) {
      await logoCircle(x, a.r.p.club, X + 70, Y + 172, 40, "#e3a93a");
      fitText(x, a.r.p.name, "700 {s}px Montserrat", 28, tw - 140);
      x.fillStyle = "#fff"; x.fillText(a.r.p.name, X + 124, Y + 166);
      x.font = "600 16px Montserrat"; x.fillStyle = "rgba(255,230,200,.65)"; x.fillText(a.r.p.club, X + 124, Y + 192);
      const pg = x.createLinearGradient(X, 0, X + tw, 0); pg.addColorStop(0, "#ff9a2e"); pg.addColorStop(1, "#ffcf4a");
      x.fillStyle = pg; chamfer(x, X + 24, Y + th - 62, tw - 48, 42, 12); x.fill();
      x.font = '30px "Bebas Neue"'; x.fillStyle = "#1a0d04"; x.textAlign = "center"; x.fillText(a.unit(a.r.v).toUpperCase(), pcx, Y + th - 31); x.textAlign = "left";
    } else {
      x.font = "600 20px Montserrat"; x.fillStyle = "rgba(255,255,255,.5)"; x.textAlign = "center"; x.fillText("keine Daten", pcx, Y + 190); x.textAlign = "left";
    }
  }
  x.font = '22px "Bebas Neue"'; x.fillStyle = "rgba(255,255,255,.4)"; x.textAlign = "center"; spacedText(x, "DATEN: EA SPORTS FC PRO CLUBS", W / 2, H - 38, 3); x.textAlign = "left";
  D.hazard(x, W, H, 16);
  return c.toBuffer("image/png");
}
