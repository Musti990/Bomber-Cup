// Team-Logos (hochgeladen mit /cup-logo) als Bild für Canvas-Grafiken
import { loadImage } from "@napi-rs/canvas";
import { get } from "./store.mjs";
const cache = new Map();
/** Bild vollständig in ein Quadrat (Größe s, linke obere Ecke X/Y) einpassen – egal ob hoch, breit oder quadratisch */
export function drawFit(x, img, X, Y, s) {
  const k = Math.min(s / img.width, s / img.height), w = img.width * k, h = img.height * k;
  x.drawImage(img, X + (s - w) / 2, Y + (s - h) / 2, w, h);
}

export async function teamLogo(name) {
  if (cache.has(name)) return cache.get(name);
  const l = await get(`logo:${name}`).catch(() => null);
  const img = l?.b64 ? await loadImage(Buffer.from(l.b64, "base64")).catch(() => null) : null;
  cache.set(name, img);
  return img;
}
