// =========================================================
// 📜 Cup-Chronik: jeder Cup mit seinem Sieger (Cup 1 → FC Bollwerk, Cup 2 → Blue Samurai …).
// - Startwerte aus daten/chronik-bereinigt.txt (Nr|Sieger|Sonder-Cup)
// - Nach jedem echten Cup wird der Sieger als nächste Nummer angehängt
// - Die All-Time-Statistik (Siege pro Team) wird aus der Chronik berechnet
// =========================================================
import fs from "node:fs";
import path from "node:path";
import { get, set, mutate } from "./store.mjs";

export const key = (n) => String(n).trim().toLowerCase().replace(/\s+/g, " ");

export function parseChronik(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [nr, name, special] = line.split("|");
    if (!name?.trim()) continue;
    out.push({ nr: nr ? Number(nr) : null, winner: name.trim(), special: special?.trim() || null });
  }
  return out;
}

function seed() {
  const f = path.resolve(process.cwd(), "daten/chronik-bereinigt.txt");
  return fs.existsSync(f) ? parseChronik(fs.readFileSync(f, "utf8")) : [];
}

/** Alle Cups in Reihenfolge [{ nr, winner, special, at? }] */
export async function chronik() {
  let s = await get("chronik");
  if (!s) {
    s = { cups: seed(), updated: Date.now() };
    await set("chronik", s);
  }
  return s.cups;
}

/** Neuer Cup: Sieger mit der nächsten Nummer anhängen (gleiche Schreibweise wie bisher, wenn bekannt) */
export async function addCup(winner, special = null) {
  if (!winner) return null;
  await chronik();
  const { result } = await mutate("chronik", (s) => {
    const known = s.cups.find((c) => key(c.winner) === key(winner));
    const nr = Math.max(0, ...s.cups.map((c) => c.nr || 0)) + 1;
    const entry = { nr, winner: known ? known.winner : winner, special, at: Date.now() };
    s.cups.push(entry);
    s.updated = Date.now();
    return entry;
  });
  return result;
}

/** Siege pro Team aus der Chronik → [{ name, wins }] */
export function countWins(cups) {
  const map = new Map();
  for (const c of cups) {
    const k = key(c.winner);
    const t = map.get(k) || { name: c.winner, wins: 0 };
    t.wins++;
    map.set(k, t);
  }
  return [...map.values()];
}
