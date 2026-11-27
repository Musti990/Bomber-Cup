// Einmalig: Bomber-Cup-Bilder im Stil „Detonation“ bauen (Logo, Banner, Hall-of-Fame-Vorlage).
// Aufruf: node tools-bilder-erstellen.mjs "C:/Users/musti/Desktop/Bomber Cup"
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import * as D from "./netlify/lib/detonation.mjs";

const SRC = process.argv[2];
const A = "netlify/assets", P = "public";
GlobalFonts.registerFromPath(path.join(A, "fonts/BebasNeue-Regular.ttf"), "Bebas Neue");
GlobalFonts.registerFromPath(path.join(A, "fonts/Montserrat.ttf"), "Montserrat");
const logo = await loadImage(path.join(SRC, "logo-discord.png"));

// 1) Logo
fs.copyFileSync(path.join(SRC, "logo-discord.png"), path.join(A, "logo.png"));
{ const c = createCanvas(512, 512), x = c.getContext("2d"); x.drawImage(logo, 0, 0, 512, 512); fs.writeFileSync(path.join(P, "logo.jpg"), c.toBuffer("image/jpeg", 92)); }

// 2) Banner 2048 × 512
function banner(title, sub, file) {
  const W = 2048, H = 512, c = createCanvas(W, H), x = c.getContext("2d");
  const cx = 1660, cy = 256;
  D.background(x, W, H, cx, cy);
  D.shockwaves(x, cx, cy);
  D.sparks(x, 220, cx, cy, 190, 620, D.rng(7));
  D.medallion(x, logo, cx, cy, 175);
  D.header(x, 110, 92);
  D.splitTitle(x, title, 110, 330, 230);
  D.fuse(x, 110, 395, 1430, 300, 60);
  x.font = "600 34px Montserrat"; x.fillStyle = "rgba(255,255,255,.85)"; x.fillText(sub, 110, 450);
  D.hazard(x, W, H);
  fs.writeFileSync(path.join(P, file), c.toBuffer("image/jpeg", 92));
}
banner("ANMELDUNG", "Die Lunte brennt – melde dein Team jetzt an", "banner-anmeldung.jpg");
banner("REGISTRIEREN", "Trag dein Team ein und sei beim nächsten Knall dabei", "banner-registrieren.jpg");

// 3) Hall-of-Fame-Vorlage 1672 × 941 (Wappen an denselben Stellen wie im Bot erwartet)
{
  const W = 1672, H = 941, c = createCanvas(W, H), x = c.getContext("2d");
  const cx = 823, cy = 640;
  D.background(x, W, H, cx, cy, 900);
  D.shockwaves(x, cx, cy, 260, 90, 9);
  D.sparks(x, 260, cx, cy, 250, 800, D.rng(11));
  D.medallion(x, logo, W / 2, 110, 78);
  D.splitTitle(x, "HALL OF FAME", W / 2, 300, 120, { align: "center" });
  const shield = (l, t, w, h, col, glow, num) => {
    x.save(); x.beginPath();
    x.moveTo(l, t); x.lineTo(l + w, t); x.lineTo(l + w, t + h * 0.55);
    x.quadraticCurveTo(l + w, t + h * 0.85, l + w / 2, t + h); x.quadraticCurveTo(l, t + h * 0.85, l, t + h * 0.55); x.closePath();
    const f = x.createLinearGradient(0, t, 0, t + h); f.addColorStop(0, "rgba(24,16,12,.96)"); f.addColorStop(1, "rgba(10,7,5,.96)"); x.fillStyle = f; x.fill();
    x.shadowColor = glow; x.shadowBlur = 26; x.lineWidth = 7; x.strokeStyle = col; x.stroke(); x.restore();
    x.beginPath(); x.arc(l + w / 2, t, 38, 0, Math.PI * 2); x.fillStyle = col; x.fill();
    x.font = '52px "Bebas Neue"'; x.fillStyle = "#1a120a"; const nw = x.measureText(num).width; x.fillText(num, l + w / 2 - nw / 2, t + 19);
  };
  shield(632, 464, 382, 425, "#ffcf4a", "rgba(255,200,80,.9)", "1");
  shield(147, 526, 300, 335, "#dfe3ea", "rgba(220,230,255,.8)", "2");
  shield(1214, 540, 300, 335, "#e0894a", "rgba(255,150,80,.85)", "3");
  D.hazard(x, W, H, 18);
  fs.writeFileSync(path.join(A, "hof-template.jpg"), c.toBuffer("image/jpeg", 90));
}
console.log("Bilder erstellt (Stil: Detonation)");
