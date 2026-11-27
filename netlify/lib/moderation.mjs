// =========================================================
// 🛡️ Moderation: Verwarnen, Timeout, Kick, Bann – alles landet im Mod-Log.
// Dazu: Beitritte/Austritte und Aktionen aus dem Discord-Protokoll (Audit-Log) im Mod-Log.
// Auto-Schutz (Discord-AutoMod: Einladungslinks + Massen-Erwähnungen) NUR auf Befehl /mod automod.
// =========================================================
import { get, mutate, getConfig } from "./store.mjs";
import { discord, sendMessage, sendDM } from "./discord.mjs";
import { COLOR } from "./data.mjs";

const G = () => process.env.DISCORD_GUILD_ID;
export const WARN_LIMIT = Number(process.env.WARN_LIMIT || 3); // ab so vielen Verwarnungen: automatischer Timeout
const AUTO_TIMEOUT_MIN = Number(process.env.WARN_TIMEOUT_MIN || 60);
const RED = 0xe74c3c, ORANGE = 0xe67e22, GREEN = 0x2ecc71, GREY = 0x95a5a6;

export async function modlog(embed) {
  const cfg = await getConfig();
  const ch = cfg.channels?.modlog;
  if (ch) await sendMessage(ch, { embeds: [{ timestamp: new Date().toISOString(), ...embed }] });
}

async function tellUser(uid, text) {
  // Direktnachricht – klappt nicht bei jedem (DMs aus), dann eben nur im Mod-Log
  await sendDM(uid, { embeds: [{ color: ORANGE, description: text }] }).catch(() => null);
}

/** Verwarnung speichern. Ab WARN_LIMIT gibt es automatisch einen Timeout. */
export async function warn(uid, byUid, reason) {
  const { result: count } = await mutate("warnings", (w) => {
    (w[uid] ||= []).push({ by: byUid, reason, at: Date.now() });
    return w[uid].length;
  }, { initial: {} });
  await modlog({ color: ORANGE, title: "⚠️ Verwarnung", description: `**Mitglied:** <@${uid}>\n**Von:** <@${byUid}>\n**Grund:** ${reason}\n**Verwarnungen:** ${count}/${WARN_LIMIT}` });
  await tellUser(uid, `⚠️ Du wurdest verwarnt (**${count}/${WARN_LIMIT}**).\n**Grund:** ${reason}`);
  let auto = null;
  if (count > 0 && count % WARN_LIMIT === 0) {
    auto = await timeout(uid, AUTO_TIMEOUT_MIN, byUid, `Automatisch: ${count} Verwarnungen`);
  }
  return { count, auto };
}

export async function warnings(uid) {
  return ((await get("warnings")) || {})[uid] || [];
}
export async function clearWarnings(uid, byUid) {
  const { result: n } = await mutate("warnings", (w) => { const n = (w[uid] || []).length; delete w[uid]; return n; }, { initial: {} });
  await modlog({ color: GREEN, title: "🧹 Verwarnungen gelöscht", description: `**Mitglied:** <@${uid}>\n**Von:** <@${byUid}>\n**Gelöscht:** ${n}` });
  return n;
}

/** Timeout (max. 28 Tage laut Discord). minutes = 0 → aufheben */
export async function timeout(uid, minutes, byUid, reason) {
  const until = minutes > 0 ? new Date(Date.now() + Math.min(minutes, 40320) * 60000).toISOString() : null;
  const ok = await discord(`/guilds/${G()}/members/${uid}`, "PATCH", { communication_disabled_until: until }, { reason: `${reason} (von ${byUid})` });
  if (!ok) return false;
  await modlog(until
    ? { color: RED, title: "⏳ Timeout", description: `**Mitglied:** <@${uid}>\n**Von:** <@${byUid}>\n**Dauer:** ${minutes} Min. (bis <t:${Math.floor(Date.parse(until) / 1000)}:t>)\n**Grund:** ${reason}` }
    : { color: GREEN, title: "✅ Timeout aufgehoben", description: `**Mitglied:** <@${uid}>\n**Von:** <@${byUid}>` });
  if (until) await tellUser(uid, `⏳ Du hast einen Timeout für **${minutes} Minuten**.\n**Grund:** ${reason}`);
  return true;
}

export async function kick(uid, byUid, reason) {
  await tellUser(uid, `👢 Du wurdest vom Server entfernt.\n**Grund:** ${reason}`);
  const ok = await discord(`/guilds/${G()}/members/${uid}`, "DELETE", undefined, { reason: `${reason} (von ${byUid})` });
  if (ok !== null) await modlog({ color: RED, title: "👢 Kick", description: `**Mitglied:** <@${uid}>\n**Von:** <@${byUid}>\n**Grund:** ${reason}` });
  return ok !== null;
}

export async function ban(uid, byUid, reason, deleteDays = 0) {
  await tellUser(uid, `🔨 Du wurdest gebannt.\n**Grund:** ${reason}`);
  const ok = await discord(`/guilds/${G()}/bans/${uid}`, "PUT", { delete_message_seconds: Math.min(7, deleteDays) * 86400 }, { reason: `${reason} (von ${byUid})` });
  if (ok !== null) await modlog({ color: RED, title: "🔨 Bann", description: `**Mitglied:** <@${uid}>\n**Von:** <@${byUid}>\n**Grund:** ${reason}` });
  return ok !== null;
}

export async function unban(uid, byUid) {
  const ok = await discord(`/guilds/${G()}/bans/${uid}`, "DELETE", undefined, { reason: `Entbannt von ${byUid}` });
  if (ok !== null) await modlog({ color: GREEN, title: "🕊️ Entbannt", description: `**Mitglied:** <@${uid}>\n**Von:** <@${byUid}>` });
  return ok !== null;
}

/**
 * Discord-AutoMod einschalten (nur auf ausdrücklichen Befehl): blockiert Einladungslinks zu fremden Servern
 * und Massen-Erwähnungen. Staff-Rollen sind ausgenommen. Bestehende Regeln mit gleichem Namen werden aktualisiert.
 */
export async function setupAutomod(exemptRoles = []) {
  const existing = (await discord(`/guilds/${G()}/auto-moderation/rules`)) || [];
  const cfg = await getConfig();
  const alert = cfg.channels?.modlog ? [{ type: 2, metadata: { channel_id: cfg.channels.modlog } }] : [];
  const rules = [
    {
      name: "Bomber Cup · Keine fremden Einladungen",
      event_type: 1, trigger_type: 1,
      trigger_metadata: { regex_patterns: ["(discord\\.gg|discord(app)?\\.com\\/invite)\\/[a-z0-9-]+"] },
      actions: [{ type: 1, metadata: { custom_message: "Einladungen zu anderen Servern sind hier nicht erlaubt." } }, ...alert],
    },
    {
      name: "Bomber Cup · Keine Massen-Erwähnungen",
      event_type: 1, trigger_type: 5,
      trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true },
      actions: [{ type: 1, metadata: { custom_message: "Bitte nicht so viele Leute auf einmal markieren." } }, { type: 3, metadata: { duration_seconds: 600 } }, ...alert],
    },
  ];
  const done = [];
  for (const r of rules) {
    const body = { ...r, enabled: true, exempt_roles: exemptRoles.filter(Boolean).slice(0, 20) };
    const old = existing.find((x) => x.name === r.name);
    const res = old ? await discord(`/guilds/${G()}/auto-moderation/rules/${old.id}`, "PATCH", body) : await discord(`/guilds/${G()}/auto-moderation/rules`, "POST", body);
    done.push(`${res ? "✅" : "❌"} ${r.name}`);
  }
  return done;
}

/** Jede Minute: Beitritte/Austritte erkennen (Vergleich mit der letzten Mitgliederliste) */
export async function trackJoinsLeaves(members) {
  const cfg = await getConfig();
  if (!members || !cfg.channels?.modlog) return;
  const ids = members.filter((m) => !m.user.bot).map((m) => m.user.id);
  const prev = await get("modMembers");
  await mutate("modMembers", (x) => { x.ids = ids; }, { initial: {} });
  if (!prev?.ids) return; // erster Lauf: nur merken
  const before = new Set(prev.ids), now = new Set(ids);
  const joined = ids.filter((id) => !before.has(id));
  const left = prev.ids.filter((id) => !now.has(id));
  if (joined.length > 25 || left.length > 25) return; // Liste war unvollständig – nichts melden
  const byId = new Map(members.map((m) => [m.user.id, m]));
  for (const id of joined) {
    const u = byId.get(id)?.user;
    const ageDays = Math.floor((Date.now() - Number((BigInt(id) >> 22n) + 1420070400000n)) / 86400000);
    await modlog({ color: GREEN, title: "📥 Beigetreten", description: `<@${id}> (${u?.username ?? id})\nKonto-Alter: **${ageDays} Tage**${ageDays < 7 ? " ⚠️ sehr neu" : ""}`, thumbnail: u?.avatar ? { url: `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=64` } : undefined });
  }
  for (const id of left) await modlog({ color: GREY, title: "📤 Verlassen", description: `<@${id}>` });
}

/** Jede Minute: Moderations-Aktionen aus dem Discord-Protokoll (auch die, die direkt in Discord gemacht wurden) */
const AUDIT = { 20: "👢 Kick (Discord)", 22: "🔨 Bann (Discord)", 23: "🕊️ Entbannt (Discord)", 72: "🗑️ Nachricht gelöscht (von Mod)", 73: "🗑️ Nachrichten gelöscht (Massen-Löschung)", 143: "🤖 AutoMod hat blockiert", 145: "🤖 AutoMod-Timeout" };
export async function auditToModlog() {
  const cfg = await getConfig();
  if (!cfg.channels?.modlog) return;
  const st = (await get("modAudit")) || {};
  const res = await discord(`/guilds/${G()}/audit-logs?limit=25`);
  const entries = (res?.audit_log_entries || []).filter((e) => AUDIT[e.action_type] || (e.action_type === 24 && e.changes?.some((c) => c.key === "communication_disabled_until")));
  const me = process.env.DISCORD_APP_ID;
  const fresh = st.last ? entries.filter((e) => BigInt(e.id) > BigInt(st.last)) : [];
  if (entries.length) await mutate("modAudit", (x) => { x.last = entries.map((e) => e.id).sort((a, b) => (BigInt(a) > BigInt(b) ? -1 : 1))[0]; }, { initial: {} });
  for (const e of fresh.reverse()) {
    if (e.user_id === me) continue; // eigene Aktionen stehen schon im Mod-Log
    const title = AUDIT[e.action_type] || "⏳ Timeout geändert (Discord)";
    await modlog({ color: COLOR, title, description: `${e.target_id ? `**Ziel:** <@${e.target_id}>\n` : ""}**Von:** <@${e.user_id}>${e.reason ? `\n**Grund:** ${e.reason}` : ""}` });
  }
}
