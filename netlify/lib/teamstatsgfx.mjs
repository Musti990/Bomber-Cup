// All-Time-Statistik aller Teams als Bild (Bomber-Cup-Look) – inkl. EA-Verknüpfung
import { BRAND as __B } from "./data.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { assetDir, fonts } from "./image.mjs";
import { teamLogo, drawFit } from "./teamlogo.mjs";

const ACC = __B.accent, GOLD = "#f2c94c", TEXT = "#f2f2f5", MUTED = "#8d8f9c", GREEN = "#2ecc71", RED = "#ff4d4d";
const rr = (x, X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); };
function fit(x, t, font, size, maxW, min = 12) { let s = size; do { x.font = font.replace("{s}", s); s--; } while (x.measureText(t).width > maxW && s > min); }
const blank = { g: 0, s: 0, b: 0, cups: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };

/** clubs: registrierte Teams, stats: Trophäen-Statistik ({ clubs: { Team: {g,s,b,cups,w,d,l,gf,ga} } }) */
export async function teamStatsImage(clubs, stats) {
  fonts();
  const rows = Object.keys(clubs).map((name) => ({ name, c: clubs[name], x: { ...blank, ...(stats?.clubs?.[name] || {}) } }));
  const played = (r) => (r.x.w + r.x.d + r.x.l > 0 ? 1 : 0);
  rows.sort((a, b) => b.x.g - a.x.g || b.x.s - a.x.s || b.x.b - a.x.b || played(b) - played(a) || (b.x.w * 3 + b.x.d) - (a.x.w * 3 + a.x.d) || (b.x.gf - b.x.ga) - (a.x.gf - a.x.ga) || a.name.localeCompare(b.name, "de"));
  const W = 1600, rowH = 58, top = 250, H = top + 50 + Math.max(1, rows.length) * rowH + 90;
  const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#07080c"); g.addColorStop(0.5, "#11131b"); g.addColorStop(1, "#050507"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const gl = x.createRadialGradient(W / 2, H, 10, W / 2, H, W * 0.6); gl.addColorStop(0, "rgba(255,90,31,.2)"); gl.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gl; x.fillRect(0, 0, W, H);
  try { const lg = await loadImage(path.join(assetDir(), "logo.png")); x.shadowColor = ACC; x.shadowBlur = 16; x.drawImage(lg, 50, 30, 200, 200 * lg.height / lg.width); x.shadowBlur = 0; } catch {}
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = '84px "Bebas Neue"'; const tg = x.createLinearGradient(0, 50, 0, 130); tg.addColorStop(0, "#fff"); tg.addColorStop(1, "#ffb08a"); x.fillStyle = tg; x.shadowColor = "rgba(255,90,31,.5)"; x.shadowBlur = 20; x.fillText("TEAM-STATISTIKEN", W / 2 + 80, 92); x.shadowBlur = 0;
  const linked = rows.filter((r) => r.c.eaId).length;
  x.font = "700 20px Montserrat"; x.fillStyle = TEXT; x.fillText(`ALL-TIME · ${rows.length} ${rows.length === 1 ? "Team" : "Teams"} · ${stats?.cups || 0} ${stats?.cups === 1 ? "Cup" : "Cups"} gespielt · ${linked}/${rows.length} mit EA verknüpft`, W / 2 + 80, 150);
  // Kopfzeile
  const cols = [["#", 70], ["TEAM", 0], ["CUPS", 650], ["🥇", 740], ["🥈", 810], ["🥉", 880], ["SP", 970], ["S", 1040], ["U", 1100], ["N", 1160], ["TORE", 1250], ["TD", 1340], ["SIEG %", 1430], ["EA", 1520]];
  x.fillStyle = "rgba(255,90,31,.16)"; rr(x, 40, top, W - 80, 44, 8); x.fill();
  x.font = "800 15px Montserrat"; x.fillStyle = "#ffb08a";
  for (const [l, cx] of cols) { if (!cx) { x.textAlign = "left"; x.fillText(l, 175, top + 22); continue; } x.textAlign = "center"; if (["🥇", "🥈", "🥉"].includes(l)) { const col = { "🥇": GOLD, "🥈": "#d9dee8", "🥉": "#e08a4a" }[l]; x.fillStyle = col; x.beginPath(); x.arc(cx, top + 22, 9, 0, 7); x.fill(); x.fillStyle = "#ffb08a"; } else x.fillText(l, cx, top + 22); }
  let y = top + 52;
  if (!rows.length) { x.textAlign = "center"; x.font = "600 22px Montserrat"; x.fillStyle = MUTED; x.fillText("Noch keine Teams registriert.", W / 2, y + 30); }
  for (const [k, r] of rows.entries()) {
    const s = r.x, sp = s.w + s.d + s.l, td = s.gf - s.ga;
    x.fillStyle = k % 2 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.065)"; rr(x, 40, y, W - 80, rowH - 6, 8); x.fill();
    if (k < 3 && s.g + s.s + s.b > 0) { x.fillStyle = [GOLD, "#d9dee8", "#e08a4a"][k]; x.fillRect(40, y + 6, 5, rowH - 18); }
    const cy = y + (rowH - 6) / 2;
    x.textAlign = "center"; x.font = '30px "Bebas Neue"'; x.fillStyle = "#fff"; x.fillText(String(k + 1), 70, cy + 2);
    const l = await teamLogo(r.name).catch(() => null);
    if (l) drawFit(x, l, 110, cy - 20, 40);
    else { x.fillStyle = "#2a2d38"; x.beginPath(); x.arc(130, cy, 19, 0, 7); x.fill(); x.fillStyle = MUTED; x.font = '22px "Bebas Neue"'; x.fillText(r.name[0].toUpperCase(), 130, cy + 2); }
    x.textAlign = "left"; fit(x, r.name.toUpperCase(), '{s}px "Bebas Neue"', 32, 440); x.fillStyle = "#fff"; x.fillText(r.name.toUpperCase(), 175, cy + 2);
    x.textAlign = "center"; x.font = '28px "Bebas Neue"';
    const val = (v, cx, col = TEXT) => { x.fillStyle = col; x.fillText(String(v), cx, cy + 2); };
    val(s.cups, 650); val(s.g, 740, s.g ? GOLD : MUTED); val(s.s, 810, s.s ? "#d9dee8" : MUTED); val(s.b, 880, s.b ? "#e08a4a" : MUTED);
    val(sp, 970); val(s.w, 1040); val(s.d, 1100); val(s.l, 1160); val(`${s.gf}:${s.ga}`, 1250); val((td > 0 ? "+" : "") + td, 1340, td > 0 ? GREEN : td < 0 ? RED : TEXT);
    val(sp ? `${Math.round((s.w / sp) * 100)}%` : "–", 1430);
    // EA-Status
    const ok = !!r.c.eaId, warn = ok && r.c.eaVerified === false;
    x.fillStyle = ok ? (warn ? GOLD : GREEN) : RED; x.beginPath(); x.arc(1520, cy, 11, 0, 7); x.fill();
    x.strokeStyle = "#0b0c10"; x.lineWidth = 3; x.beginPath();
    if (ok && !warn) { x.moveTo(1514, cy); x.lineTo(1518, cy + 5); x.lineTo(1526, cy - 5); } else if (warn) { x.moveTo(1520, cy - 5); x.lineTo(1520, cy + 1); x.moveTo(1520, cy + 4); x.lineTo(1520, cy + 5); } else { x.moveTo(1515, cy - 5); x.lineTo(1525, cy + 5); x.moveTo(1525, cy - 5); x.lineTo(1515, cy + 5); }
    x.stroke();
    y += rowH;
  }
  x.textAlign = "center"; x.font = "600 14px Montserrat"; x.fillStyle = MUTED;
  x.fillText("Sortiert nach Titeln, Finals, Platz 3, Punkten · EA: grün = verknüpft · gelb = nicht bestätigt · rot = keine EA-Club-ID", W / 2, H - 34);
  return c.toBuffer("image/png");
}
