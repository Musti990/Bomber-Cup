// =========================================================
// 🏆 All-Time-Statistik (Cup-Siege) – ALLE Teams, verteilt auf mehrere Bilder im Stil „Detonation“.
// Gruppiert nach Anzahl Siege („19 SIEGE“, „16 SIEGE“ …), gleich viele Siege = gleicher Platz.
// Große Gruppen (viele Teams mit 1–2 Siegen) laufen automatisch auf der nächsten Seite weiter.
// =========================================================
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import fs from "node:fs";
import { fonts, assetDir } from "./image.mjs";
import * as D from "./detonation.mjs";

/** [{ name, wins }] → sortiert + Platz (Wettkampf-Rangfolge: 1, 1, 3 …) */
export function rank(list) {
  const s = [...list].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, "de"));
  let place = 0;
  return s.map((t, i) => ({ ...t, place: i && s[i - 1].wins === t.wins ? place : (place = i + 1) }));
}

/** Gruppen nach Siegen: [{ wins, place, teams: [name] }] */
export function tiers(list) {
  const out = [];
  for (const t of rank(list)) {
    const last = out[out.length - 1];
    if (last && last.wins === t.wins) last.teams.push(t.name);
    else out.push({ wins: t.wins, place: t.place, teams: [t.name] });
  }
  return out;
}

const W = 1600, PAGE_H = 1700, PAD = 70;
const style = (wins, maxWins) => {
  if (wins >= Math.max(10, maxWins * 0.5)) return { cols: 3, rowH: 62, font: "700 30px Montserrat", col: D.GOLD };
  if (wins >= 3) return { cols: 4, rowH: 50, font: "700 24px Montserrat", col: "#ffffff" };
  return { cols: 5, rowH: 42, font: "600 20px Montserrat", col: "rgba(255,255,255,.88)" };
};

/** Seiten planen: jede Seite = Liste von Blöcken { tier, teams, cont, st, y } */
function plan(T, maxWins) {
  const pages = [];
  let page = [], y = 0, top = 250;
  const bottom = PAGE_H - 90, headH = 74;
  const newPage = () => { pages.push(page); page = []; top = 170; y = 0; };
  for (const t of T) {
    const st = style(t.wins, maxWins);
    let rest = t.teams, cont = false;
    while (rest.length) {
      const rows = Math.floor((bottom - (top + y) - headH) / st.rowH);
      if (rows < 1) { newPage(); continue; }
      const take = rest.slice(0, rows * st.cols);
      page.push({ tier: t, teams: take, cont, st, y });
      y += headH + Math.ceil(take.length / st.cols) * st.rowH + 26;
      rest = rest.slice(take.length);
      cont = true;
      if (rest.length) newPage();
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

export async function allTimePages(list, { title = "ALL-TIME STATISTIK", sub = "Cup-Siege aller Zeiten" } = {}) {
  fonts();
  const T = tiers(list);
  const maxWins = T[0]?.wins || 1;
  const teams = list.length, cups = list.reduce((a, t) => a + t.wins, 0);
  const lp = path.join(assetDir(), "logo.png");
  const logo = fs.existsSync(lp) ? await loadImage(lp).catch(() => null) : null;
  const pages = plan(T, maxWins);
  const out = [];
  for (let p = 0; p < pages.length; p++) {
    const H = PAGE_H;
    const c = createCanvas(W, H), x = c.getContext("2d");
    D.background(x, W, H, W * 0.82, 120, 900);
    D.shockwaves(x, W * 0.82, 120, 140, 85, 8);
    D.sparks(x, 110, W * 0.82, 120, 130, 520, D.rng(30 + p));
    if (p === 0) {
      if (logo) D.medallion(x, logo, PAD + 40, 100, 52, D.OR);
      D.header(x, PAD + 112, 92, 34, "·  " + sub.toUpperCase());
      D.splitTitle(x, title, PAD + 112, 172, 86);
      x.font = "600 26px Montserrat"; x.fillStyle = "rgba(255,255,255,.75)";
      const st = `${teams} Sieger-Teams  ·  ${cups} Cups`;
      x.fillText(st, W - PAD - x.measureText(st).width, 92);
    } else {
      if (logo) D.medallion(x, logo, PAD + 26, 82, 34, D.OR);
      D.header(x, PAD + 76, 74, 30, "·  " + title);
      D.splitTitle(x, `SEITE ${p + 1}`, PAD + 76, 132, 54);
    }
    x.font = "600 22px Montserrat"; x.fillStyle = "rgba(255,255,255,.55)";
    const pg = `Seite ${p + 1} / ${pages.length}`;
    x.fillText(pg, W - PAD - x.measureText(pg).width, p === 0 ? 132 : 82);

    const top = p === 0 ? 250 : 170;
    for (const b of pages[p]) {
      const { tier, st } = b;
      let y = top + b.y;
      x.fillStyle = "rgba(255,138,31,.10)"; x.beginPath(); x.roundRect(PAD, y, W - PAD * 2, 56, 14); x.fill();
      x.fillStyle = D.OR; x.fillRect(PAD, y, 8, 56);
      x.font = '46px "Bebas Neue"'; x.fillStyle = D.GOLD; const wn = String(tier.wins); x.fillText(wn, PAD + 30, y + 45);
      const ww = x.measureText(wn).width;
      x.font = '34px "Bebas Neue"'; x.fillStyle = "#ffffff"; x.fillText(tier.wins === 1 ? "SIEG" : "SIEGE", PAD + 40 + ww, y + 43);
      x.font = "600 22px Montserrat"; x.fillStyle = "rgba(255,255,255,.6)";
      const cnt = `${tier.teams.length} ${tier.teams.length === 1 ? "Team" : "Teams"}${b.cont ? " · Fortsetzung" : ""}`;
      x.fillText(cnt, W - PAD - 20 - x.measureText(cnt).width, y + 37);
      y += 74;
      const cw = (W - PAD * 2) / st.cols;
      b.teams.forEach((name, k) => {
        const cx = PAD + (k % st.cols) * cw, cy = y + Math.floor(k / st.cols) * st.rowH;
        if (Math.floor(k / st.cols) % 2 === 0) { x.fillStyle = "rgba(255,255,255,.03)"; x.fillRect(cx, cy, cw - 8, st.rowH - 6); }
        x.font = st.font; x.fillStyle = st.col;
        let nm = name;
        while (x.measureText(nm).width > cw - 34 && nm.length > 3) nm = nm.slice(0, -1);
        x.fillText(nm === name ? nm : nm.trimEnd() + "…", cx + 14, cy + st.rowH * 0.62);
      });
    }
    D.hazard(x, W, H, 18);
    out.push(c.toBuffer("image/png"));
  }
  return out;
}

/**
 * 📜 Cup-Chronik als Bilder: jeder Cup mit Nummer und Sieger, 4 Spalten, älteste zuerst.
 * cups: [{ nr, winner, special }] – Sonder-Cups (z. B. Halloween) bekommen ein kleines Schild.
 */
export async function chronikPages(cups, { title = "CUP-CHRONIK", sub = "Jeder Cup und sein Sieger" } = {}) {
  fonts();
  const total0 = cups.length, cols = 4, maxRows = 34;
  const nPages0 = Math.max(1, Math.ceil(total0 / (cols * maxRows)));
  const rows = Math.max(1, Math.ceil(total0 / nPages0 / cols)), per = cols * rows, rowH = 42; // gleichmäßig verteilt
  const lp = path.join(assetDir(), "logo.png");
  const logo = fs.existsSync(lp) ? await loadImage(lp).catch(() => null) : null;
  const total = cups.length, teams = new Set(cups.map((c) => c.winner.trim().toLowerCase())).size;
  const nPages = nPages0;
  const out = [];
  for (let p = 0; p < nPages; p++) {
    const part = cups.slice(p * per, p * per + per);
    const H = PAGE_H;
    const c = createCanvas(W, H), x = c.getContext("2d");
    D.background(x, W, H, W * 0.82, 120, 900);
    D.shockwaves(x, W * 0.82, 120, 140, 85, 8);
    D.sparks(x, 110, W * 0.82, 120, 130, 520, D.rng(60 + p));
    if (p === 0) {
      if (logo) D.medallion(x, logo, PAD + 40, 100, 52, D.OR);
      D.header(x, PAD + 112, 92, 34, "·  " + sub.toUpperCase());
      D.splitTitle(x, title, PAD + 112, 172, 86);
      x.font = "600 26px Montserrat"; x.fillStyle = "rgba(255,255,255,.75)";
      const st = `${total} Cups  ·  ${teams} Sieger-Teams`;
      x.fillText(st, W - PAD - x.measureText(st).width, 92);
    } else {
      if (logo) D.medallion(x, logo, PAD + 26, 82, 34, D.OR);
      D.header(x, PAD + 76, 74, 30, "·  " + title);
      D.splitTitle(x, `SEITE ${p + 1}`, PAD + 76, 132, 54);
    }
    x.font = "600 22px Montserrat"; x.fillStyle = "rgba(255,255,255,.55)";
    const pg = `Seite ${p + 1} / ${nPages}`;
    x.fillText(pg, W - PAD - x.measureText(pg).width, p === 0 ? 132 : 82);
    const top = p === 0 ? 240 : 170;
    const cw = (W - PAD * 2) / cols;
    part.forEach((cup, k) => {
      const col = Math.floor(k / rows), row = k % rows; // spaltenweise lesen: 1, 2, 3 … nach unten
      const cx = PAD + col * cw, cy = top + row * rowH;
      x.fillStyle = row % 2 ? "rgba(255,255,255,.025)" : "rgba(255,138,31,.07)";
      x.fillRect(cx, cy, cw - 10, rowH - 4);
      x.font = '28px "Bebas Neue"'; x.fillStyle = D.OR;
      const nr = cup.nr ? String(cup.nr) : "★";
      x.fillText(nr, cx + 12, cy + 29);
      const tagW = cup.special ? 0 : 0;
      x.font = "600 20px Montserrat"; x.fillStyle = "#ffffff";
      let room = cw - 86 - (cup.special ? 92 : 0) - tagW, nm = cup.winner;
      while (x.measureText(nm).width > room && nm.length > 3) nm = nm.slice(0, -1);
      x.fillText(nm === cup.winner ? nm : nm.trimEnd() + "…", cx + 66, cy + 27);
      if (cup.special) {
        const tag = cup.special.replace(/\s*cup$/i, "").toUpperCase();
        x.font = '20px "Bebas Neue"'; const tw = x.measureText(tag).width + 14;
        x.fillStyle = "rgba(255,201,74,.18)"; x.beginPath(); x.roundRect(cx + cw - 22 - tw, cy + 8, tw, 24, 6); x.fill();
        x.fillStyle = D.GOLD; x.fillText(tag, cx + cw - 15 - tw, cy + 27);
      }
    });
    D.hazard(x, W, H, 18);
    out.push(c.toBuffer("image/png"));
  }
  return out;
}
