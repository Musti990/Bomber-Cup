// =========================================================
// 💎 Premium – wird vom Team vergeben (/premium geben), nicht gekauft.
// Rolle „1 💎 Premium“ (im Sicher-Modus mit Vorsilbe) + Abzeichen im Profil.
// Läuft automatisch ab (Prüfung jede Minute im Timer).
// =========================================================
import { get, mutate, getConfig } from "./store.mjs";
import { getRoles, createRole, addRole, removeRole, sendMessage } from "./discord.mjs";
import { notify } from "./notify.mjs";
import { role as roleName } from "./safe.mjs";
import { COLOR } from "./data.mjs";

const ROLE = () => roleName("💎 Premium");

/** Premium-Rolle finden oder anlegen (ID wird in der Einrichtung gemerkt) */
export async function premiumRole() {
  const cfg = await getConfig();
  if (cfg.roles?.premium) return cfg.roles.premium;
  const existing = ((await getRoles()) || []).find((r) => r.name === ROLE());
  const id = existing?.id ?? (await createRole(ROLE(), 0x5ec8ff))?.id ?? null;
  if (id) await mutate("config", (c) => { c.roles = c.roles || {}; c.roles.premium = id; }, { initial: { channels: {}, roles: {} } });
  return id;
}

export const premiumOf = async (uid) => ((await get("premium")) || {})[uid] ?? null;

/** Premium geben. days: Anzahl Tage oder 0/leer = unbegrenzt. Verlängert, wenn schon Premium. */
export async function grantPremium(uid, days, byUid, note = "") {
  const id = await premiumRole();
  if (!id) throw new Error("Premium-Rolle konnte nicht angelegt werden (Bot braucht „Rollen verwalten“).");
  const now = Date.now();
  const { result: entry } = await mutate("premium", (p) => {
    const old = p[uid];
    const base = old?.until && old.until > now ? old.until : now;
    p[uid] = { since: old?.since ?? now, until: days > 0 ? base + days * 86400000 : null, by: byUid, note: note || old?.note || "" };
    return p[uid];
  }, { initial: {} });
  await addRole(uid, id, `Premium vergeben von ${byUid}`);
  await notify([uid], { embeds: [{ color: COLOR, title: "💎 Du hast Premium!", description: `Glückwunsch <@${uid}>! Du bist jetzt **Premium-Mitglied**${entry.until ? ` bis <t:${Math.floor(entry.until / 1000)}:D>` : ""}.\nDein Abzeichen 💎 siehst du mit **/profil**.` }] }).catch(() => {});
  return entry;
}

export async function revokePremium(uid, reason = "entfernt") {
  const cfg = await getConfig();
  const { result: had } = await mutate("premium", (p) => { const h = Boolean(p[uid]); delete p[uid]; return h; }, { initial: {} });
  if (cfg.roles?.premium) await removeRole(uid, cfg.roles.premium, `Premium ${reason}`);
  return had;
}

/** Jede Minute: abgelaufenes Premium entfernen (+ Erinnerung 3 Tage vorher) */
export async function expirePremium() {
  const all = (await get("premium")) || {};
  const now = Date.now();
  for (const [uid, e] of Object.entries(all)) {
    if (!e.until) continue;
    if (e.until <= now) {
      await revokePremium(uid, "abgelaufen");
      await notify([uid], { embeds: [{ color: COLOR, title: "💎 Premium abgelaufen", description: `<@${uid}>, dein Premium ist abgelaufen. Danke, dass du dabei warst!` }] }).catch(() => {});
    } else if (!e.reminded && e.until - now < 3 * 86400000) {
      await mutate("premium", (p) => { if (p[uid]) p[uid].reminded = true; });
      await notify([uid], { embeds: [{ color: COLOR, title: "💎 Premium läuft bald ab", description: `<@${uid}>, dein Premium endet <t:${Math.floor(e.until / 1000)}:R>.` }] }).catch(() => {});
    }
  }
}

export async function premiumList() {
  const all = Object.entries((await get("premium")) || {});
  if (!all.length) return "Noch niemand hat Premium.";
  return all
    .sort((a, b) => (a[1].until ?? Infinity) - (b[1].until ?? Infinity))
    .map(([u, e]) => `💎 <@${u}> – ${e.until ? `bis <t:${Math.floor(e.until / 1000)}:D>` : "unbegrenzt"}${e.note ? ` · ${e.note}` : ""}`)
    .join("\n")
    .slice(0, 3800);
}

/** Im Mod-Log festhalten (falls vorhanden) */
export async function logPremium(text) {
  const cfg = await getConfig();
  const ch = cfg.channels?.modlog || cfg.channels?.log;
  if (ch) await sendMessage(ch, { embeds: [{ color: 0x5ec8ff, description: text }] });
}

/** Vereine mit Vorrang: Manager oder ein Co-VM hat gerade Premium → Set der Vereinsnamen */
export async function premiumClubNames(clubs) {
  const all = (await get("premium")) || {};
  const now = Date.now();
  const active = new Set(Object.entries(all).filter(([, e]) => !e.until || e.until > now).map(([u]) => u));
  const { coIds } = await import("./co.mjs");
  const out = new Set();
  for (const [name, c] of Object.entries(clubs || {})) {
    if ([c.manager, ...coIds(c)].some((u) => u && active.has(u))) out.add(name);
  }
  return out;
}

/** Premium-Vereine nach vorne (Reihenfolge innerhalb der Gruppen bleibt wie angemeldet) */
export const premiumFirst = (list, prio) => [...list.filter((c) => prio.has(c)), ...list.filter((c) => !prio.has(c))];
