// =========================================================
// 🏅 Abzeichen (Belohnungen) – werden automatisch aus der Statistik vergeben, nicht kaufbar.
// Grundlage: stats.managers[userId] (jeder Spieler eines Teams) bzw. stats.clubs[verein].
// Nach jedem Cup werden neue Abzeichen in der Hall of Fame verkündet.
// =========================================================
import { get, mutate, getConfig } from "./store.mjs";
import { sendMessage } from "./discord.mjs";
import { COLOR } from "./data.mjs";

/** Alle Abzeichen: Reihenfolge = Anzeige. test(x) bekommt die Statistik (cups, g, s, b, w, gf, unbeaten …) */
export const BADGES = [
  { id: "debut", emoji: "🎟️", name: "Debüt", desc: "Ersten Cup gespielt", test: (x) => x.cups >= 1, goal: (x) => [x.cups, 1] },
  { id: "regular", emoji: "🔁", name: "Stammgast", desc: "10 Cups gespielt", test: (x) => x.cups >= 10, goal: (x) => [x.cups, 10] },
  { id: "veteran", emoji: "🎖️", name: "Veteran", desc: "25 Cups gespielt", test: (x) => x.cups >= 25, goal: (x) => [x.cups, 25] },
  { id: "podium", emoji: "🥉", name: "Podest", desc: "Unter den besten 3", test: (x) => x.g + x.s + x.b >= 1, goal: (x) => [x.g + x.s + x.b, 1] },
  { id: "finalist", emoji: "🥈", name: "Finalist", desc: "Ein Finale erreicht", test: (x) => x.g + x.s >= 1, goal: (x) => [x.g + x.s, 1] },
  { id: "champion", emoji: "🏆", name: "Champion", desc: "Einen Cup gewonnen", test: (x) => x.g >= 1, goal: (x) => [x.g, 1] },
  { id: "dynasty", emoji: "👑", name: "Dynastie", desc: "3 Cups gewonnen", test: (x) => x.g >= 3, goal: (x) => [x.g, 3] },
  { id: "legend", emoji: "🐐", name: "Legende", desc: "10 Cups gewonnen", test: (x) => x.g >= 10, goal: (x) => [x.g, 10] },
  { id: "unbeaten", emoji: "🛡️", name: "Ungeschlagen", desc: "Cup ohne Niederlage gewonnen", test: (x) => (x.unbeaten || 0) >= 1, goal: (x) => [x.unbeaten || 0, 1] },
  { id: "winner50", emoji: "⚡", name: "Siegertyp", desc: "50 Spiele gewonnen", test: (x) => x.w >= 50, goal: (x) => [x.w, 50] },
  { id: "goals100", emoji: "⚽", name: "Torfabrik", desc: "100 Tore geschossen", test: (x) => x.gf >= 100, goal: (x) => [x.gf, 100] },
];
export const PREMIUM_BADGE = { id: "premium", emoji: "💎", name: "Premium", desc: "Premium-Mitglied (vom Team vergeben)" };

const blank = { cups: 0, g: 0, s: 0, b: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, unbeaten: 0 };
export const badgesOf = (x) => BADGES.filter((b) => b.test({ ...blank, ...(x || {}) }));
export const badgeLine = (list) => list.map((b) => b.emoji).join(" ");

/** Abzeichen aller Spieler vor einem Cup merken (für „neu freigeschaltet“) */
export async function snapshot() {
  const S = (await get("stats")) || {};
  return Object.fromEntries(Object.entries(S.managers || {}).map(([u, x]) => [u, badgesOf(x).map((b) => b.id)]));
}

/** Nach einem Cup: neue Abzeichen ermitteln und in der Hall of Fame verkünden */
export async function announceNew(before) {
  const S = (await get("stats")) || {};
  const fresh = [];
  for (const [u, x] of Object.entries(S.managers || {})) {
    const had = new Set(before?.[u] || []);
    const now = badgesOf(x).filter((b) => !had.has(b.id));
    if (now.length) fresh.push({ u, list: now });
  }
  if (!fresh.length) return 0;
  await mutate("badgeLog", (log) => {
    log.list = [...fresh.map((f) => ({ u: f.u, ids: f.list.map((b) => b.id), at: Date.now() })), ...(log.list || [])].slice(0, 200);
  }, { initial: {} });
  const cfg = await getConfig();
  const ch = cfg.channels?.hof || cfg.channels?.log;
  if (!ch) return fresh.length;
  const lines = fresh.slice(0, 30).map((f) => `<@${f.u}> → ${f.list.map((b) => `${b.emoji} **${b.name}**`).join(", ")}`);
  await sendMessage(ch, {
    embeds: [{ color: COLOR, title: "🏅 Neue Abzeichen freigeschaltet!", description: lines.join("\n") + (fresh.length > 30 ? `\n… und ${fresh.length - 30} weitere` : ""), footer: { text: "Alle Abzeichen: /profil" } }],
  });
  return fresh.length;
}

/** Profil eines Spielers: Abzeichen + Fortschritt (für /profil) */
export function profileEmbed(uid, x, premium) {
  const s = { ...blank, ...(x || {}) };
  const have = badgesOf(s);
  const next = BADGES.filter((b) => !b.test(s)).slice(0, 4);
  const bar = ([cur, max]) => {
    const n = Math.max(0, Math.min(10, Math.round((Math.min(cur, max) / max) * 10)));
    return `${"▰".repeat(n)}${"▱".repeat(10 - n)} ${Math.min(cur, max)}/${max}`;
  };
  const all = premium ? [PREMIUM_BADGE, ...have] : have;
  return {
    color: COLOR,
    title: "🏅 Spieler-Profil",
    description:
      `<@${uid}>\n\n` +
      (all.length ? `**Abzeichen (${all.length})**\n${all.map((b) => `${b.emoji} **${b.name}** – ${b.desc}`).join("\n")}` : "Noch keine Abzeichen – spiel deinen ersten Cup! 🎟️") +
      (premium ? `\n\n💎 **Premium** ${premium.until ? `bis <t:${Math.floor(premium.until / 1000)}:D>` : "(unbegrenzt)"}` : "") +
      (next.length ? `\n\n**Als Nächstes**\n${next.map((b) => `${b.emoji} ${b.name}: ${bar(b.goal(s))}`).join("\n")}` : "\n\n🔥 Alle Abzeichen freigeschaltet!"),
    fields: [
      { name: "🏟️ Cups", value: String(s.cups), inline: true },
      { name: "🏆 Titel", value: `${s.g} 🥇 · ${s.s} 🥈 · ${s.b} 🥉`, inline: true },
      { name: "📊 Spiele", value: `${s.w} S · ${s.d} U · ${s.l} N`, inline: true },
      { name: "⚽ Tore", value: `${s.gf}:${s.ga}`, inline: true },
    ],
  };
}
