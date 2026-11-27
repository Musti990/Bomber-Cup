// Live-Spielplan als Bild (Bomber-Cup-Look): Fortschritt, Spiele der aktuellen Runde, Tabellen bzw. K.-o.-Paarungen
import { BRAND as __B } from "./data.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { assetDir, fonts } from "./image.mjs";
import { FORMATS, KO_SIZE, KO_NAME, isFreilos } from "./data.mjs";
import { standings, currentMatches, koRoundName } from "./tournament.mjs";
import { teamLogo, drawFit } from "./teamlogo.mjs";

const ACC = __B.accent, GOLD = "#f2c94c", TEXT = "#f2f2f5", MUTED = "#a9abb8", GREEN = "#2ecc71", RED = "#ff4d4d";
const rr = (x, X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); };
function fit(x, t, font, size, maxW, min = 12) { let s = size; do { x.font = font.replace("{s}", s); s--; } while (x.measureText(t).width > maxW && s > min); }

function bg(x, W, H) {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#07080c"); g.addColorStop(0.5, "#121520"); g.addColorStop(1, "#050507"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const gl = x.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, W * 0.8); gl.addColorStop(0, "rgba(255,90,31,.35)"); gl.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gl; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = 0.05; x.strokeStyle = "#fff"; x.lineWidth = 2; for (let k = -H; k < W; k += 46) { x.beginPath(); x.moveTo(k, H); x.lineTo(k + H * 0.8, 0); x.stroke(); } x.restore();
}
async function logoAt(x, name, X, Y, s) {
  const l = await teamLogo(name).catch(() => null);
  if (l) { drawFit(x, l, X, Y, s); return true; }
  x.fillStyle = "#2a2d38"; rr(x, X, Y, s, s, s * 0.25); x.fill();
  x.fillStyle = MUTED; x.font = `${Math.round(s * 0.5)}px "Bebas Neue"`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(name).slice(0, 1).toUpperCase(), X + s / 2, Y + s / 2 + 1); x.textAlign = "left";
  return false;
}

/** Ein Spiel als Zeile */
async function matchRow(x, m, X, Y, W, t) {
  const h = 54, done = m.status === "fertig";
  x.fillStyle = "rgba(22,24,32,.92)"; rr(x, X, Y, W, h, 10); x.fill();
  x.strokeStyle = done ? "rgba(46,204,113,.55)" : m.status === "konflikt" ? "rgba(255,77,77,.7)" : "rgba(255,90,31,.45)"; x.lineWidth = 1.5; rr(x, X, Y, W, h, 10); x.stroke();
  const mid = X + W / 2, cy = Y + h / 2;
  x.textBaseline = "middle";
  // Status-Punkt
  x.fillStyle = done ? GREEN : m.status === "konflikt" ? RED : m.pendingBy ? GOLD : ACC; x.beginPath(); x.arc(X + 16, cy, 5, 0, 7); x.fill();
  await logoAt(x, m.home, mid - 110, cy - 15, 30);
  x.textAlign = "right"; fit(x, String(m.home).toUpperCase(), '{s}px "Bebas Neue"', 26, W / 2 - 150); x.fillStyle = done && m.h < m.a ? MUTED : TEXT; x.fillText(String(m.home).toUpperCase(), mid - 120, cy + 1);
  await logoAt(x, m.away, mid + 80, cy - 15, 30);
  x.textAlign = "left"; fit(x, String(m.away).toUpperCase(), '{s}px "Bebas Neue"', 26, W / 2 - 150); x.fillStyle = done && m.a < m.h ? MUTED : TEXT; x.fillText(String(m.away).toUpperCase(), mid + 120, cy + 1);
  // Ergebnis-Kasten
  x.fillStyle = done ? "#0b0c10" : "#16181f"; rr(x, mid - 52, Y + 9, 104, h - 18, 8); x.fill();
  x.strokeStyle = done ? ACC : "rgba(255,255,255,.15)"; x.lineWidth = 1.5; rr(x, mid - 52, Y + 9, 104, h - 18, 8); x.stroke();
  x.textAlign = "center"; x.font = '30px "Bebas Neue"'; x.fillStyle = done ? "#fff" : MUTED;
  x.fillText(done ? `${m.h} : ${m.a}` : m._future ? "– : –" : m.pendingBy ? "WARTET" : "LIVE", mid, cy + 1);
  if (done && m.pen) { x.font = "700 11px Montserrat"; x.fillStyle = "#ffd9c7"; x.fillText(`${m.pen[0]}:${m.pen[1]} i.E.`, mid, Y + h - 5); }
  x.textAlign = "left";
  return h;
}

export async function liveImage(t) {
  fonts();
  const W = 1200, cur = currentMatches(t), d = FORMATS[t.fmt] || { top: 2 };
  const groupsMode = t.status === "checkin" || t.status === "gruppen";
  const r = t.status === "checkin" ? 1 : t.round;
  // Höhe vorab berechnen
  let body = 0;
  if (groupsMode) for (const g of t.groups) { const n = t.matches.filter((m) => m.group === g.name && m.round === r).length; body += 56 + n * 62 + 34 + g.teams.length * 40 + 30; }
  else body = 56 + cur.length * 62 + 30;
  const H = 300 + body + 70;
  const c = createCanvas(W, H), x = c.getContext("2d");
  bg(x, W, H);
  // Kopf
  try { const lg = await loadImage(path.join(assetDir(), "logo.png")); x.shadowColor = ACC; x.shadowBlur = 16; x.drawImage(lg, 40, 26, 160, 160 * lg.height / lg.width); x.shadowBlur = 0; } catch {}
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = '76px "Bebas Neue"'; const tg = x.createLinearGradient(0, 40, 0, 110); tg.addColorStop(0, "#fff"); tg.addColorStop(1, "#ffb08a"); x.fillStyle = tg; x.shadowColor = "rgba(255,90,31,.5)"; x.shadowBlur = 20; x.fillText("LIVE-SPIELPLAN", W / 2 + 60, 78); x.shadowBlur = 0;
  fit(x, t.name, "600 {s}px Montserrat", 22, 700); x.fillStyle = TEXT; x.fillText(t.name, W / 2 + 60, 128);
  const status = t.status === "checkin" ? "CHECK-IN LÄUFT" : t.status === "fertig" ? "TURNIER BEENDET" : `${t.status === "gruppen" ? `SPIELTAG ${t.round}` : koRoundName(t).toUpperCase()} LÄUFT · ${cur.filter((m) => m.status === "fertig").length}/${cur.length} BEENDET`;
  x.font = "800 15px Montserrat"; x.fillStyle = ACC; x.fillText(status, W / 2 + 60, 158);
  // Fortschritt
  const steps = []; for (let k = 1; k <= t.maxRounds; k++) steps.push({ g: true, r: k, n: `ST ${k}` });
  let n = t.koSize || KO_SIZE[t.fmt], kr = 1; while (n > 2) { steps.push({ g: false, r: kr, n: (KO_NAME[n] || "K.-O.").replace("finale", "F.").toUpperCase() }); n /= 2; kr++; } steps.push({ g: false, r: kr, n: "FINALE" });
  const on = (s) => (t.status === "gruppen" && s.g && s.r === t.round) || (t.status === "ko" && !s.g && s.r === t.koRound);
  const done = (s) => t.status === "fertig" || (s.g && (t.status === "ko" || (t.status === "gruppen" && s.r < t.round))) || (!s.g && t.status === "ko" && s.r < t.koRound);
  const sw = Math.min(150, (W - 120) / steps.length), sx = W / 2 - (sw * steps.length) / 2;
  steps.forEach((s, k) => {
    const X = sx + k * sw + 4, Y = 196;
    x.fillStyle = on(s) ? ACC : done(s) ? "rgba(46,204,113,.18)" : "rgba(255,255,255,.06)"; rr(x, X, Y, sw - 8, 40, 8); x.fill();
    x.strokeStyle = on(s) ? ACC : done(s) ? GREEN : "rgba(255,255,255,.12)"; x.lineWidth = 1.5; rr(x, X, Y, sw - 8, 40, 8); x.stroke();
    fit(x, s.n, '{s}px "Bebas Neue"', 22, sw - 16); x.fillStyle = on(s) ? "#fff" : done(s) ? GREEN : MUTED; x.fillText(s.n, X + (sw - 8) / 2, Y + 21);
    if (done(s)) { x.strokeStyle = GREEN; x.lineWidth = 3; x.beginPath(); x.moveTo(X + 10, Y + 21); x.lineTo(X + 15, Y + 27); x.lineTo(X + 24, Y + 14); x.stroke(); }
  });
  let y = 262;
  const PX = 60, PW = W - 120;
  const head = (txt) => { x.textAlign = "left"; x.font = '34px "Bebas Neue"'; x.fillStyle = "#fff"; x.fillText(txt, PX, y + 18); x.fillStyle = ACC; x.fillRect(PX, y + 38, 70, 3); y += 56; };
  if (groupsMode) {
    for (const g of t.groups) {
      head(`GRUPPE ${g.name} · SPIELTAG ${r}`);
      for (const m of t.matches.filter((z) => z.group === g.name && z.round === r)) y += (await matchRow(x, m, PX, y, PW, t)) + 8;
      // Tabelle
      y += 6; x.font = "700 13px Montserrat"; x.fillStyle = MUTED; x.textAlign = "left";
      x.fillText("#", PX + 14, y + 10); x.fillText("TEAM", PX + 90, y + 10); x.textAlign = "center";
      [["SP", 700], ["S", 770], ["U", 830], ["N", 890], ["TD", 960], ["PKT", 1040]].forEach(([l, cx]) => x.fillText(l, cx, y + 10)); y += 24;
      for (const [k, row] of standings(t, g.name).entries()) {
        const out = isFreilos(row.id) || t.out?.includes(row.id), q = !out && k < d.top;
        x.fillStyle = k % 2 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)"; rr(x, PX, y, PW, 36, 6); x.fill();
        if (q) { x.fillStyle = GREEN; x.fillRect(PX, y + 4, 4, 28); }
        x.textAlign = "left"; x.font = '24px "Bebas Neue"'; x.fillStyle = out ? MUTED : "#fff"; x.fillText(String(k + 1), PX + 14, y + 19);
        await logoAt(x, row.id, PX + 46, y + 5, 26);
        fit(x, String(row.id).toUpperCase(), '{s}px "Bebas Neue"', 24, 520); x.fillStyle = out ? MUTED : "#fff"; x.fillText(String(row.id).toUpperCase(), PX + 90, y + 19);
        x.textAlign = "center"; x.font = '24px "Bebas Neue"';
        const td = row.t - row.gt;
        [[row.sp, 700], [row.s, 770], [row.u, 830], [row.n, 890], [(td > 0 ? "+" : "") + td, 960]].forEach(([v, cx]) => { x.fillStyle = out ? MUTED : TEXT; x.fillText(String(v), cx, y + 19); });
        x.fillStyle = q ? GOLD : out ? MUTED : "#fff"; x.font = '28px "Bebas Neue"'; x.fillText(String(row.p), 1040, y + 19);
        y += 40;
      }
      y += 30;
    }
  } else {
    head(t.status === "fertig" ? "ENDERGEBNISSE" : koRoundName(t).toUpperCase() + (cur.some((m) => m.p3) ? " + SPIEL UM PLATZ 3" : ""));
    const list = t.status === "fertig" ? t.matches.filter((m) => m.phase === "ko" && (m.final || m.p3)) : [...cur].sort((a, b) => a.slot - b.slot);
    for (const m of list) {
      const lbl = m.p3 ? "PLATZ 3" : m.final ? "FINALE" : `SPIEL ${m.slot + 1}`;
      x.textAlign = "left"; x.font = "800 12px Montserrat"; x.fillStyle = m.final ? GOLD : MUTED; x.fillText(lbl, PX + 30, y + 27);
      y += (await matchRow(x, m, PX + 110, y, PW - 110, t)) + 8;
    }
  }
  x.textAlign = "center"; x.font = "600 14px Montserrat"; x.fillStyle = MUTED;
  x.fillText(`● LIVE · Ergebnisse direkt von EA oder gemeldet · aktualisiert ${new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(new Date())} Uhr`, W / 2, H - 30);
  return c.toBuffer("image/png");
}


/** Bild für einen Gruppenkanal: Kopf, alle Spieltage (aktueller hervorgehoben) und Tabelle */
export async function groupImage(t, groupName) {
  fonts();
  const g = t.groups.find((x) => x.name === groupName); if (!g) return null;
  const d = FORMATS[t.fmt] || { top: 2 };
  const ms = t.matches.filter((m) => m.group === groupName);
  const rounds = [...new Set(ms.map((m) => m.round))].sort((a, b) => a - b);
  const cur = t.status === "gruppen" ? t.round : t.status === "checkin" ? 0 : 99;
  const W = 1200, perRound = (r) => ms.filter((m) => m.round === r).length;
  const body = rounds.reduce((h, r) => h + 50 + perRound(r) * 62, 0);
  const H = 250 + body + 70 + g.teams.length * 40 + 110;
  const c = createCanvas(W, H), x = c.getContext("2d");
  bg(x, W, H);
  try { const lg = await loadImage(path.join(assetDir(), "logo.png")); x.shadowColor = ACC; x.shadowBlur = 16; x.drawImage(lg, 40, 26, 160, 160 * lg.height / lg.width); x.shadowBlur = 0; } catch {}
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = '86px "Bebas Neue"'; const tg = x.createLinearGradient(0, 40, 0, 120); tg.addColorStop(0, "#fff"); tg.addColorStop(1, "#ffb08a"); x.fillStyle = tg; x.shadowColor = "rgba(255,90,31,.5)"; x.shadowBlur = 20; x.fillText(`GRUPPE ${groupName}`, W / 2, 82); x.shadowBlur = 0;
  fit(x, t.name, "600 {s}px Montserrat", 22, 700); x.fillStyle = TEXT; x.fillText(t.name, W / 2, 138);
  const st = t.status === "checkin" ? "CHECK-IN LÄUFT" : t.status === "gruppen" ? `SPIELTAG ${t.round} LÄUFT` : "GRUPPENPHASE BEENDET";
  x.font = "800 15px Montserrat"; x.fillStyle = ACC; x.fillText(st, W / 2, 170);
  let y = 210; const PX = 60, PW = W - 120;
  for (const r of rounds) {
    const live = r === cur, done = r < cur;
    x.textAlign = "left"; x.font = '30px "Bebas Neue"'; x.fillStyle = live ? "#fff" : done ? "#cfd1da" : MUTED;
    x.fillText(`SPIELTAG ${r}`, PX, y + 16);
    const lw = x.measureText(`SPIELTAG ${r}`).width;
    if (live) { x.fillStyle = ACC; rr(x, PX + lw + 14, y + 4, 64, 24, 12); x.fill(); x.font = "800 12px Montserrat"; x.fillStyle = "#fff"; x.textAlign = "center"; x.fillText("LIVE", PX + lw + 46, y + 17); }
    else if (done) { x.font = "700 13px Montserrat"; x.fillStyle = GREEN; x.textAlign = "left"; x.fillText("BEENDET", PX + lw + 14, y + 17); }
    else { x.font = "700 13px Montserrat"; x.fillStyle = MUTED; x.textAlign = "left"; x.fillText("FOLGT", PX + lw + 14, y + 17); }
    y += 42;
    for (const m of ms.filter((z) => z.round === r)) {
      x.save(); if (!live && !done) x.globalAlpha = 0.55;
      y += (await matchRow(x, m.status === "fertig" || live ? m : { ...m, status: "offen", pendingBy: null, _future: true }, PX, y, PW, t)) + 8;
      x.restore();
    }
    y += 8;
  }
  // Tabelle
  y += 10; x.textAlign = "left"; x.font = '30px "Bebas Neue"'; x.fillStyle = "#fff"; x.fillText("TABELLE", PX, y + 14); x.fillStyle = ACC; x.fillRect(PX, y + 32, 70, 3); y += 48;
  x.font = "700 13px Montserrat"; x.fillStyle = MUTED; x.fillText("#", PX + 14, y + 10); x.fillText("TEAM", PX + 90, y + 10); x.textAlign = "center";
  [["SP", 700], ["S", 770], ["U", 830], ["N", 890], ["TORE", 975], ["TD", 1050], ["PKT", 1110]].forEach(([l, cx]) => x.fillText(l, cx, y + 10)); y += 24;
  for (const [k, row] of standings(t, groupName).entries()) {
    const out = isFreilos(row.id) || t.out?.includes(row.id), q = !out && k < d.top;
    x.fillStyle = k % 2 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)"; rr(x, PX, y, PW, 36, 6); x.fill();
    if (q) { x.fillStyle = GREEN; x.fillRect(PX, y + 4, 4, 28); }
    x.textAlign = "left"; x.font = '24px "Bebas Neue"'; x.fillStyle = out ? MUTED : "#fff"; x.fillText(String(k + 1), PX + 14, y + 19);
    await logoAt(x, row.id, PX + 46, y + 5, 26);
    fit(x, String(row.id).toUpperCase(), '{s}px "Bebas Neue"', 24, 520); x.fillStyle = out ? MUTED : "#fff"; x.fillText(String(row.id).toUpperCase(), PX + 90, y + 19);
    x.textAlign = "center"; x.font = '24px "Bebas Neue"'; const td = row.t - row.gt;
    [[row.sp, 700], [row.s, 770], [row.u, 830], [row.n, 890], [`${row.t}:${row.gt}`, 975], [(td > 0 ? "+" : "") + td, 1050]].forEach(([v, cx]) => { x.fillStyle = out ? MUTED : TEXT; x.fillText(String(v), cx, y + 19); });
    x.fillStyle = q ? GOLD : out ? MUTED : "#fff"; x.font = '28px "Bebas Neue"'; x.fillText(String(row.p), 1110, y + 19);
    y += 40;
  }
  x.textAlign = "center"; x.font = "600 14px Montserrat"; x.fillStyle = MUTED;
  x.fillText(`Grün = weiter (Top ${d.top}) · Ergebnisse direkt von EA oder gemeldet · aktualisiert ${new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(new Date())} Uhr`, W / 2, H - 30);
  return c.toBuffer("image/png");
}
