// =========================================================
// Sicher-Modus (Standard: AN) – für Server, auf denen schon alles läuft.
// Der Bot fasst NUR seine eigenen Kanäle, Kategorien und Rollen an: alle beginnen mit „1“.
//  - keine fremden Kanäle verknüpfen, umbenennen, Rechte ändern oder Nachrichten darin löschen
//  - keine fremden Rollen verknüpfen oder ändern, @everyone wird nicht angefasst
//  - Spitznamen nur, wenn NICKNAMES=1
// Ausschalten (z. B. auf einem eigenen, leeren Server): SAFE_MODE=0
// =========================================================
import { discord } from "./discord.mjs";

export const SAFE = process.env.SAFE_MODE !== "0";
export const PREFIX = (process.env.CHANNEL_PREFIX ?? "1").trim() || "1";
/** Kanalname mit Vorsilbe, z. B. „1・📝・ANMELDUNG“ */
export const chan = (name) => (SAFE ? `${PREFIX}・${name}` : name);
/** Kategorie mit Vorsilbe, z. B. „1 ・ 🏟️ BOMBER CUP“ */
export const cat = (name) => (SAFE ? `${PREFIX} ・ ${name}` : name);
/** Rolle mit Vorsilbe, z. B. „1 Spieler“ */
export const role = (name) => (SAFE ? `${PREFIX} ${name}` : name);
/** Gehört dieser Name dem Bot? (im Sicher-Modus nur mit Vorsilbe) */
export const isOwnName = (name) => !SAFE || String(name || "").normalize("NFKC").trimStart().startsWith(PREFIX);
/** Vorsilbe für die Erkennung entfernen */
export const stripPrefix = (name) => (SAFE ? String(name).normalize("NFKC").trimStart().slice(PREFIX.length) : String(name));
export const nicknamesAllowed = () => !SAFE || process.env.NICKNAMES === "1";

const cache = new Map(); // Kanal-ID -> { own, at }
/** Ist dieser Kanal ein eigener Bot-Kanal? (Name mit Vorsilbe oder in einer eigenen Kategorie, z. B. Tickets) */
export async function isOwnChannel(id) {
  if (!SAFE || !id) return true;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.own;
  const c = await discord(`/channels/${id}`);
  const own = Boolean(c) && (isOwnName(c.name) || Boolean(c.parent_id && isOwnName((await discord(`/channels/${c.parent_id}`))?.name)));
  cache.set(id, { own, at: Date.now() });
  return own;
}
