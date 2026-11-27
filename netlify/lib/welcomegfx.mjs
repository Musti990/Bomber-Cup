// =========================================================
// 👋 Willkommenskarte als Bild im Bomber-Cup-Stil „Detonation“:
// Profilbild rechts mit Druckwellen, Titel zweifarbig, Zündschnur, Warnband.
// =========================================================
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import fs from "node:fs";
import { fonts, assetDir } from "./image.mjs";
import * as D from "./detonation.mjs";

let logoCache;
async function logo() {
  if (logoCache !== undefined) return logoCache;
  for (const f of ["logo.png", "logo.jpg"]) {
    const p = path.join(assetDir(), f);
    if (fs.existsSync(p)) return (logoCache = await loadImage(p).catch(() => null));
  }
  return (logoCache = null);
}

async function avatar(user) {
  const url = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user?.id || "0") >> 22n) % 6n)}.png`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.ok ? await loadImage(Buffer.from(await r.arrayBuffer())) : null;
  } catch {
    return null;
  }
}

/** user: Discord-User-Objekt, count: Mitgliederzahl → PNG-Buffer (1200 × 420) */
export async function welcomeCard(user, count) {
  fonts();
  const W = 1200, H = 420;
  const c = createCanvas(W, H), x = c.getContext("2d");
  const cx = 960, cy = 200;
  D.background(x, W, H, cx, cy, 520);
  D.shockwaves(x, cx, cy, 140, 52, 9);
  D.sparks(x, 140, cx, cy, 135, 430, D.rng(Number(String(user?.id || "7").slice(-6)) || 7));
  D.medallion(x, await avatar(user), cx, cy, 118);

  // kleines Logo + Kopfzeile
  const lg = await logo();
  if (lg) D.medallion(x, lg, 92, 62, 30, D.OR);
  D.header(x, 136, 74, 30, "·  EA FC PRO CLUBS");

  D.splitTitle(x, "WILLKOMMEN", 60, 205, 132);
  const name = String(user?.global_name || user?.username || "Neues Mitglied");
  x.font = "700 40px Montserrat";
  let shown = name;
  while (x.measureText(shown).width > 600 && shown.length > 3) shown = shown.slice(0, -2);
  x.fillStyle = "#ffffff";
  x.fillText(shown === name ? name : shown + "…", 62, 262);
  D.fuse(x, 62, 300, cx - 128, cy + 40, 40, D.rng(5));
  x.font = "600 24px Montserrat";
  x.fillStyle = "rgba(255,255,255,.7)";
  x.fillText(count ? `Mitglied #${count}  ·  Schön, dass du da bist!` : "Schön, dass du da bist!", 62, 350);
  D.hazard(x, W, H, 16);
  return c.toBuffer("image/png");
}

/** Abschiedskarte: Profilbild grau („verglüht“), Titel TSCHÜSS, Name und neue Mitgliederzahl */
export async function goodbyeCard(user, count) {
  fonts();
  const W = 1200, H = 420;
  const c = createCanvas(W, H), x = c.getContext("2d");
  const cx = 960, cy = 200;
  D.background(x, W, H, cx, cy, 460);
  x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, 0, W, H); // gedämpfter als beim Willkommen
  D.shockwaves(x, cx, cy, 140, 52, 7);
  D.sparks(x, 70, cx, cy, 135, 380, D.rng(Number(String(user?.id || "9").slice(-6)) || 9));
  const av = await avatar(user);
  x.save(); x.filter = "grayscale(1) brightness(.8)"; D.medallion(x, av, cx, cy, 118, "#9a8f86"); x.restore();
  const lg = await logo();
  if (lg) D.medallion(x, lg, 92, 62, 30, D.OR);
  D.header(x, 136, 74, 30, "·  EA FC PRO CLUBS");
  D.splitTitle(x, "TSCHÜSS", 60, 205, 132);
  const name = String(user?.global_name || user?.username || "Ein Mitglied");
  x.font = "700 40px Montserrat";
  let shown = name;
  while (x.measureText(shown).width > 600 && shown.length > 3) shown = shown.slice(0, -2);
  x.fillStyle = "#ffffff";
  x.fillText(shown === name ? name : shown + "…", 62, 262);
  x.font = "600 24px Montserrat";
  x.fillStyle = "rgba(255,255,255,.7)";
  x.fillText("hat den Server verlassen – die Lunte ist aus.", 62, 305);
  if (count) { x.fillStyle = "rgba(255,201,74,.85)"; x.fillText(`Wir sind jetzt ${count} Mitglieder`, 62, 350); }
  D.hazard(x, W, H, 16);
  return c.toBuffer("image/png");
}
