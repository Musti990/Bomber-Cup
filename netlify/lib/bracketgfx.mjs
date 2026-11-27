// Turnierbaum (K.-o.-Phase) als Bild im Bomber-Cup-Look: Achtel-/Viertel-/Halbfinale, Finale + Spiel um Platz 3
import { BRAND as __B } from "./data.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { assetDir, fonts } from "./image.mjs";
import { KO_NAME } from "./data.mjs";
import { teamLogo, drawFit } from "./teamlogo.mjs";

const ACC = __B.accent, GOLD = "#f2c94c", TEXT = "#f2f2f5", MUTED = "#8d8f9c", LINE = __B.line;
const rr = (x, X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); };
function fit(x, t, font, size, maxW, min = 12) { let s = size; do { x.font = font.replace("{s}", s); s--; } while (x.measureText(t).width > maxW && s > min); }
const winnerOf = (m) => (m?.status !== "fertig" ? null : m.h > m.a || (m.h === m.a && m.pen && m.pen[0] > m.pen[1]) ? m.home : m.away);

async function teamRow(x, name, score, X, Y, W, h, state) {
  // state: "win" | "lose" | "open" | "empty"
  const empty = !name;
  if (!empty) {
    const l = await teamLogo(name).catch(() => null);
    const s = h - 14;
    if (l) drawFit(x, l, X + 12, Y + 7, s);
    else { x.fillStyle = "#2a2d38"; x.beginPath(); x.arc(X + 12 + s / 2, Y + h / 2, s / 2, 0, 7); x.fill(); x.fillStyle = MUTED; x.font = `${Math.round(s * 0.55)}px "Bebas Neue"`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(name)[0].toUpperCase(), X + 12 + s / 2, Y + h / 2 + 1); }
  }
  x.textAlign = "left"; x.textBaseline = "middle";
  const label = empty ? "–" : String(name);
  fit(x, label, '{s}px "Bebas Neue"', 24, W - 110);
  x.fillStyle = empty ? MUTED : state === "lose" ? MUTED : TEXT;
  x.fillText(label, X + (empty ? 24 : h + 6), Y + h / 2 + 1);
  if (score != null) {
    x.textAlign = "right"; x.font = '26px "Bebas Neue"'; x.fillStyle = state === "win" ? ACC : MUTED;
    x.fillText(String(score), X + W - 14, Y + h / 2 + 1);
  }
  x.textAlign = "left";
}

async function matchBox(x, m, X, Y, W, rowH, highlight) {
  const H = rowH * 2;
  x.fillStyle = "rgba(20,22,30,.94)"; rr(x, X, Y, W, H, 6); x.fill();
  x.strokeStyle = highlight ? GOLD : m?.status === "fertig" ? LINE : "rgba(255,255,255,.14)"; x.lineWidth = highlight ? 2.5 : 1.5; rr(x, X, Y, W, H, 6); x.stroke();
  x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(X + 1, Y + rowH, W - 2, 1);
  const w = winnerOf(m);
  const pens = m?.pen ? [m.pen[0], m.pen[1]] : null;
  const sc = (k) => (m?.status === "fertig" ? `${k === 0 ? m.h : m.a}${pens ? "*" : ""}` : null);
  await teamRow(x, m?.home, sc(0), X, Y, W, rowH, !w ? "open" : w === m.home ? "win" : "lose");
  await teamRow(x, m?.away, sc(1), X, Y + rowH, W, rowH, !w ? "open" : w === m.away ? "win" : "lose");
}

/** t: Turnier in/nach der K.-o.-Phase */
export async function bracketImage(t) {
  fonts();
  const size = t.koSize || 8;
  const rounds = Math.round(Math.log2(size)); // 16 → 4 Runden (AF, VF, HF, F)
  const ko = t.matches.filter((m) => m.phase === "ko");
  const at = (r, s) => ko.find((m) => m.round === r && m.slot === s && !m.p3) || null;
  const p3 = ko.find((m) => m.p3) || null;
  const W = 380 * rounds + 160, rowH = 42, boxH = rowH * 2, gap = 22;
  const first = size / 2;
  const yOf0 = (r) => { const span = (boxH + gap) * 2 ** (r - 1); return 175 + (span - gap) / 2 - boxH / 2; };
  const finY = yOf0(rounds) - 40, champBottom = finY + boxH + 70 + boxH + 40 + 110;
  const H = Math.max(190 + first * (boxH + gap) + 60, champBottom + 40);
  const c = createCanvas(W, H), x = c.getContext("2d");
  // Hintergrund
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#07080c"); g.addColorStop(0.5, "#11131b"); g.addColorStop(1, "#050507"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const gl = x.createRadialGradient(W / 2, H, 10, W / 2, H, W * 0.6); gl.addColorStop(0, "rgba(255,90,31,.22)"); gl.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gl; x.fillRect(0, 0, W, H);
  x.strokeStyle = ACC; x.lineWidth = 3; const cm = (a, b, cc, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(cc, b); x.moveTo(a, b); x.lineTo(a, d); x.stroke(); };
  cm(10, 10, 46, 46); cm(W - 10, 10, W - 46, 46); cm(10, H - 10, 46, H - 46); cm(W - 10, H - 10, W - 46, H - 46);
  // Kopf
  try { const lg = await loadImage(path.join(assetDir(), "logo.png")); x.drawImage(lg, W - 230, 22, 190, 190 * lg.height / lg.width); } catch {}
  x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.font = "800 15px Montserrat"; x.fillStyle = ACC; x.fillText(`${String(t.name).toUpperCase()} · K.-O.-RUNDE`, 40, 46);
  x.font = '58px "Bebas Neue"'; x.fillStyle = "#fff"; x.fillText("TURNIERBAUM", 38, 100); x.fillStyle = ACC; x.fillRect(40, 110, 80, 4);
  // Spalten
  const colX = (r) => 50 + (r - 1) * 375, boxW = 300;
  const yOf = (r, s) => { const span = (boxH + gap) * 2 ** (r - 1); return 175 + s * span + (span - gap) / 2 - boxH / 2; };
  for (let r = 1; r <= rounds; r++) {
    const n = size / 2 ** (r - 1);
    // Rundenname direkt über der ersten Box der Spalte
    const firstY = r === rounds ? yOf(r, 0) - 40 : yOf(r, 0);
    x.textAlign = "center"; x.textBaseline = "alphabetic"; x.font = '24px "Bebas Neue"'; x.fillStyle = ACC; x.fillText((KO_NAME[n] || `Runde ${r}`).toUpperCase(), colX(r) + boxW / 2, firstY - 12);
    const cnt = n / 2;
    for (let s = 0; s < cnt; s++) {
      const m = at(r, s), X = colX(r), Y = r === rounds ? yOf(r, 0) - 40 : yOf(r, s);
      // Verbindungslinien zur nächsten Runde
      if (r < rounds) {
        const nx = colX(r + 1), ny = (r + 1 === rounds ? yOf(r + 1, 0) - 40 : yOf(r + 1, Math.floor(s / 2))) + boxH / 2;
        const midX = X + boxW + (nx - X - boxW) / 2;
        x.strokeStyle = winnerOf(m) ? LINE : "rgba(255,255,255,.18)"; x.lineWidth = 2;
        x.beginPath(); x.moveTo(X + boxW, Y + boxH / 2); x.lineTo(midX, Y + boxH / 2); x.lineTo(midX, ny); x.lineTo(nx, ny); x.stroke();
      }
      await matchBox(x, m, X, Y, boxW, rowH, r === rounds && m?.status === "fertig");
    }
  }
  // Spiel um Platz 3 unter dem Finale
  if (size >= 4) {
    const X = colX(rounds), Y = yOf(rounds, 0) - 40 + boxH + 70;
    x.textAlign = "center"; x.textBaseline = "alphabetic"; x.font = '24px "Bebas Neue"'; x.fillStyle = ACC; x.fillText("SPIEL UM PLATZ 3", X + boxW / 2, Y - 12);
    await matchBox(x, p3, X, Y, boxW, rowH, false);
  }
  // Sieger (unter dem Spiel um Platz 3)
  const fin = at(rounds, 0), champ = winnerOf(fin);
  if (champ) {
    const X = colX(rounds), Y = yOf(rounds, 0) - 40 + boxH + 70 + boxH + 40;
    const gg = x.createLinearGradient(0, Y, 0, Y + 100); gg.addColorStop(0, "rgba(242,201,76,.22)"); gg.addColorStop(1, "rgba(242,201,76,.05)");
    x.fillStyle = gg; rr(x, X, Y, boxW, 100, 10); x.fill(); x.strokeStyle = GOLD; x.lineWidth = 2.5; rr(x, X, Y, boxW, 100, 10); x.stroke();
    x.textAlign = "center"; x.textBaseline = "middle"; x.font = "800 13px Montserrat"; x.fillStyle = GOLD; x.fillText("TURNIERSIEGER", X + boxW / 2, Y + 24);
    const l = await teamLogo(champ).catch(() => null);
    fit(x, champ.toUpperCase(), '{s}px "Bebas Neue"', 42, boxW - (l ? 80 : 30));
    const tw = x.measureText(champ.toUpperCase()).width, ls = 36, blockW = tw + (l ? ls + 10 : 0), lx = X + boxW / 2 - blockW / 2, cy = Y + 64;
    if (l) drawFit(x, l, lx, cy - ls / 2, ls);
    x.textAlign = "left"; x.fillStyle = "#fff"; x.shadowColor = "rgba(242,201,76,.6)"; x.shadowBlur = 18; x.fillText(champ.toUpperCase(), lx + (l ? ls + 10 : 0), cy + 2); x.shadowBlur = 0;
  }
  x.textAlign = "right"; x.font = "600 13px Montserrat"; x.fillStyle = MUTED; x.fillText("* nach Elfmeterschießen", W - 40, H - 26);
  return c.toBuffer("image/png");
}
