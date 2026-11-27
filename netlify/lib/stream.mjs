// =========================================================
// 📺 Stream-Links der Teams (Twitch, YouTube, Kick, TikTok).
// Manager oder Co-VM tragen ihn unter „Meine Mannschaft → Stream-Link“ ein.
// Angezeigt in der Anmeldung, der Mannschaftsübersicht und bei „Meine Mannschaft“.
// =========================================================
const ALLOWED = [
  { host: /(^|\.)twitch\.tv$/i, name: "Twitch", emoji: "🟣" },
  { host: /(^|\.)(youtube\.com|youtu\.be)$/i, name: "YouTube", emoji: "🔴" },
  { host: /(^|\.)kick\.com$/i, name: "Kick", emoji: "🟢" },
  { host: /(^|\.)tiktok\.com$/i, name: "TikTok", emoji: "⚫" },
];

/** Eingabe prüfen → { url, name } oder { error } ; leer = löschen */
export function parseStream(input) {
  let s = String(input || "").trim();
  if (!s) return { url: null };
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return { error: "Das ist kein gültiger Link." }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Das ist kein gültiger Link." };
  const p = ALLOWED.find((a) => a.host.test(u.hostname));
  if (!p) return { error: "Erlaubt sind nur Links zu **Twitch**, **YouTube**, **Kick** oder **TikTok**." };
  u.protocol = "https:";
  return { url: u.toString().slice(0, 200), name: p.name };
}

export const streamInfo = (url) => {
  if (!url) return null;
  try { const h = new URL(url).hostname; const p = ALLOWED.find((a) => a.host.test(h)); return p ? { url, name: p.name, emoji: p.emoji } : null; } catch { return null; }
};

/** Kurzer Link für Listen: „ · [📺 Twitch](url)“ (leer, wenn kein Stream) */
export function streamTag(club) {
  const s = streamInfo(club?.stream);
  return s ? ` · [📺 ${s.name}](${s.url})` : "";
}
