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

/** Bild: 1500 × 1150, Kopf + großer Bomber des Cups + 6 Award-Kacheln (3 × 2) */
export async function awardsImage(aw, { title = "", cupNr = null } = {}) {
  fonts();
  const W = 1500, H = 1200;
  const c = createCanvas(W, H), x = c.getContext("2d");
  D.background(x, W, H, W / 2, 330, 900);
  D.shockwaves(x, W / 2, 330, 200, 90, 9);
  D.sparks(x, 240, W / 2, 330, 190, 760, D.rng(91));
  x.textBaseline = "alphabetic";
  try { const lg = await loadImage(path.join(assetDir(), "logo.png")); D.medallion(x, lg, 110, 104, 58, D.OR); } catch {}
  D.header(x, 196, 82, 30, "·  EA FC PRO CLUBS");
  D.splitTitle(x, "BOMBER AWARDS", 196, 164, 88);
  x.font = "600 22px Montserrat"; x.fillStyle = "rgba(255,255,255,.75)"; x.fillText(title, 200, 200);
  if (cupNr) {
    const tag = `CUP #${cupNr}`; x.font = '44px "Bebas Neue"'; const tw = x.measureText(tag).width + 40;
    x.fillStyle = "rgba(0,0,0,.55)"; x.beginPath(); x.roundRect(W - 60 - tw, 70, tw, 62, 14); x.fill();
    x.save(); x.shadowColor = "rgba(255,138,31,.8)"; x.shadowBlur = 18; x.strokeStyle = D.OR; x.lineWidth = 4; x.beginPath(); x.roundRect(W - 60 - tw, 70, tw, 62, 14); x.stroke(); x.restore();
    x.fillStyle = "#fff"; x.fillText(tag, W - 60 - tw + 20, 116);
  }

  // Großes Band: Bomber des Cups
  const by = 240, bh = 250, bx = 60, bw = W - 120;
  x.save(); x.shadowColor = "rgba(255,207,74,.5)"; x.shadowBlur = 30; x.fillStyle = "rgba(28,16,8,.92)"; x.beginPath(); x.roundRect(bx, by, bw, bh, 26); x.fill(); x.restore();
  x.lineWidth = 4; x.strokeStyle = "#ffcf4a"; x.beginPath(); x.roundRect(bx, by, bw, bh, 26); x.stroke();
  icon(x, "crown", bx + 150, by + 70, 46);
  if (aw.mvp) {
    await logoCircle(x, aw.mvp.p.club, bx + 150, by + 160, 66, "#ffcf4a");
    x.font = '34px "Bebas Neue"'; x.fillStyle = "#ffcf4a"; x.fillText("💣".replace("💣", "") + "BOMBER DES CUPS", bx + 270, by + 72);
    fitText(x, aw.mvp.p.name.toUpperCase(), '{s}px "Bebas Neue"', 96, bw - 560);
    x.fillStyle = "#fff"; x.fillText(aw.mvp.p.name.toUpperCase(), bx + 268, by + 158);
    x.font = "600 24px Montserrat"; x.fillStyle = "rgba(255,255,255,.7)"; x.fillText(aw.mvp.p.club, bx + 272, by + 200);
    x.textAlign = "right"; x.font = '84px "Bebas Neue"'; x.fillStyle = "#ffcf4a"; x.fillText(aw.mvp.line.split(" ")[1], bx + bw - 60, by + 150);
    x.font = "700 20px Montserrat"; x.fillStyle = "rgba(255,255,255,.65)"; x.fillText("Ø BEWERTUNG", bx + bw - 62, by + 186); x.textAlign = "left";
  }

  // 6 Kacheln
  const gx = 60, gy = 530, gap = 24, tw = (W - 120 - gap * 2) / 3, th = 270;
  for (let k = 0; k < 6; k++) {
    const a = aw.awards[k], X = gx + (k % 3) * (tw + gap), Y = gy + Math.floor(k / 3) * (th + gap);
    x.fillStyle = "rgba(22,13,8,.92)"; x.beginPath(); x.roundRect(X, Y, tw, th, 20); x.fill();
    x.lineWidth = 2.5; x.strokeStyle = "rgba(255,138,31,.85)"; x.beginPath(); x.roundRect(X, Y, tw, th, 20); x.stroke();
    // schräger Akzent oben
    x.fillStyle = D.OR; x.beginPath(); x.moveTo(X + 20, Y); x.lineTo(X + 150, Y); x.lineTo(X + 138, Y + 6); x.lineTo(X + 20, Y + 6); x.closePath(); x.fill();
    x.font = '40px "Bebas Neue"'; x.fillStyle = "#fff"; x.fillText(a.title, X + 26, Y + 54);
    x.font = "600 15px Montserrat"; x.fillStyle = "rgba(255,255,255,.55)"; x.fillText(a.sub.toUpperCase(), X + 28, Y + 78);
    icon(x, a.icon, X + tw - 78, Y + 70, 40);
    if (a.r) {
      await logoCircle(x, a.r.p.club, X + 70, Y + 165, 44);
      fitText(x, a.r.p.name, "700 {s}px Montserrat", 28, tw - 150);
      x.fillStyle = "#fff"; x.fillText(a.r.p.name, X + 130, Y + 158);
      x.font = "600 16px Montserrat"; x.fillStyle = "rgba(255,255,255,.6)"; x.fillText(a.r.p.club, X + 130, Y + 184);
      x.fillStyle = "rgba(255,138,31,.14)"; x.beginPath(); x.roundRect(X + 20, Y + th - 58, tw - 40, 40, 20); x.fill();
      x.font = '28px "Bebas Neue"'; x.fillStyle = D.GOLD; x.textAlign = "center"; x.fillText(a.unit(a.r.v).toUpperCase(), X + tw / 2, Y + th - 28); x.textAlign = "left";
    } else {
      x.font = "600 20px Montserrat"; x.fillStyle = "rgba(255,255,255,.5)"; x.fillText("keine Daten", X + 28, Y + 170);
    }
  }
  x.font = '24px "Bebas Neue"'; x.fillStyle = "rgba(255,255,255,.45)"; x.textAlign = "center"; x.fillText("DATEN: EA SPORTS FC PRO CLUBS", W / 2, H - 40); x.textAlign = "left";
  D.hazard(x, W, H, 18);
  return c.toBuffer("image/png");
}
