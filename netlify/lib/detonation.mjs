// =========================================================
// 💥 Bomber-Cup-Stil „Detonation“ – gemeinsame Bausteine für alle Bilder:
// Druckwellen-Ringe + Funken, zweifarbiger Titel (oben weiß, unten Feuer), Zündschnur, Warnband.
// =========================================================
export const OR = "#ff8a1f", GOLD = "#ffc94a", RED = "#ff3d1f", BG = "#0b0807";

export function rng(seed = 7) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Dunkler Grund + Glut-Schein um (cx, cy) */
export function background(x, W, H, cx, cy, radius = 760) {
  x.fillStyle = BG;
  x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, "rgba(255,120,30,.55)");
  g.addColorStop(0.35, "rgba(255,70,20,.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
}

/** Druckwellen-Ringe (abwechselnd durchgezogen/gestrichelt) */
export function shockwaves(x, cx, cy, r0 = 200, step = 75, n = 9) {
  for (let i = 0; i < n; i++) {
    x.strokeStyle = `rgba(255,${140 - i * 8},40,${0.5 - i * 0.05})`;
    x.lineWidth = Math.max(0.8, 3 - i * 0.2);
    x.setLineDash(i % 2 ? [18, 14] : []);
    x.beginPath();
    x.arc(cx, cy, r0 + i * step, 0, Math.PI * 2);
    x.stroke();
  }
  x.setLineDash([]);
}

/** Funken-Striche, die vom Mittelpunkt wegfliegen */
export function sparks(x, n, cx, cy, rMin, rMax, rnd = rng()) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin), len = 6 + rnd() * 26;
    x.strokeStyle = `rgba(255,${(150 + rnd() * 90) | 0},60,${0.25 + rnd() * 0.6})`;
    x.lineWidth = 1 + rnd() * 2.5;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    x.lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len));
    x.stroke();
  }
}

/** Bild rund mit Goldring und Glühen */
export function medallion(x, img, cx, cy, R, ring = GOLD) {
  x.save();
  x.shadowColor = "rgba(255,120,30,.9)";
  x.shadowBlur = R * 0.35;
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = "#000"; x.fill();
  x.restore();
  if (img) { x.save(); x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip(); x.drawImage(img, cx - R, cy - R, R * 2, R * 2); x.restore(); }
  x.lineWidth = Math.max(4, R * 0.045);
  x.strokeStyle = ring;
  x.beginPath(); x.arc(cx, cy, R + x.lineWidth / 2 + 2, 0, Math.PI * 2); x.stroke();
}

/** Titel zweifarbig: obere Hälfte weiß, untere Hälfte Feuer-Verlauf, dazwischen ein feiner Schnitt */
export function splitTitle(x, text, tx, ty, size, { align = "left", font = "Bebas Neue" } = {}) {
  x.font = `${size}px "${font}"`;
  x.textBaseline = "alphabetic";
  const w = x.measureText(text).width;
  const left = align === "center" ? tx - w / 2 : tx;
  const cut = ty - size * 0.41;
  x.save(); x.beginPath(); x.rect(left - 20, ty - size * 1.1, w + 40, cut - (ty - size * 1.1)); x.clip(); x.fillStyle = "#ffffff"; x.fillText(text, left, ty); x.restore();
  x.save(); x.beginPath(); x.rect(left - 20, cut, w + 40, size); x.clip();
  const f = x.createLinearGradient(0, cut, 0, ty); f.addColorStop(0, GOLD); f.addColorStop(1, RED);
  x.fillStyle = f; x.fillText(text, left, ty); x.restore();
  x.fillStyle = BG; x.fillRect(left - 10, cut - size * 0.012, w + 20, Math.max(3, size * 0.022));
  return { left, width: w };
}

/** Zündschnur (gepunktet) von (x0,y0) nach (x1,y1) mit Funke am Ende */
export function fuse(x, x0, y0, x1, y1, bend = 60, rnd = rng(3)) {
  x.save();
  x.strokeStyle = "rgba(255,255,255,.75)"; x.lineWidth = 4; x.setLineDash([2, 10]); x.lineCap = "round";
  x.beginPath(); x.moveTo(x0, y0); x.bezierCurveTo(x0 + (x1 - x0) * 0.35, y0, x0 + (x1 - x0) * 0.65, y1 + bend, x1, y1); x.stroke();
  x.restore();
  sparks(x, 40, x1, y1, 2, 30, rnd);
  x.fillStyle = "#fff"; x.beginPath(); x.arc(x1, y1, 7, 0, Math.PI * 2); x.fill();
}

/** Warnband (orange/schwarz) am unteren Rand */
export function hazard(x, W, H, h = 22) {
  x.save(); x.beginPath(); x.rect(0, H - h, W, h); x.clip();
  for (let i = -2; i < W / 40 + 2; i++) {
    x.fillStyle = i % 2 ? "#141414" : OR;
    x.beginPath(); x.moveTo(i * 40, H); x.lineTo(i * 40 + 40, H); x.lineTo(i * 40 + 40 + h, H - h); x.lineTo(i * 40 + h, H - h); x.closePath(); x.fill();
  }
  x.restore();
}

/** Kopfzeile „BOMBER CUP · EA FC PRO CLUBS“ */
export function header(x, X, Y, size = 38, extra = "·  EA FC PRO CLUBS") {
  x.font = `${size}px "Bebas Neue"`; x.textBaseline = "alphabetic";
  x.fillStyle = OR; x.fillText("BOMBER CUP", X, Y);
  const w = x.measureText("BOMBER CUP ").width;
  x.fillStyle = "rgba(255,255,255,.5)"; x.fillText(extra, X + w + 12, Y);
}
