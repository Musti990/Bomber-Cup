import nacl from "tweetnacl";
import { coList, coIds, addCo, removeCo, MAX_CO } from "../lib/co.mjs";
import { get, set, del, mutate, getConfig, getClubs, tKey } from "../lib/store.mjs";
import { editOriginal, discord, sendMessage } from "../lib/discord.mjs";
import { enqueue, processQueue } from "../lib/roles.mjs";
import * as T from "../lib/tournament.mjs";
import * as V from "../lib/views.mjs";
import * as F from "../lib/flow.mjs";
import { CLUBS, LEAGUES, GROUP_NAMES, ROUND_ROLES, CHANNEL_TYPES, BASE_CHANNEL_TYPES, DAYS, COLOR, VIDEO_LIMIT, VIDEO_WINDOW_MIN, flagOf } from "../lib/data.mjs";
import * as B from "../lib/bans.mjs";
import { baseNameOf, nickFor, setNick } from "../lib/names.mjs";
import * as AS from "../lib/autosetup.mjs";
import * as EAF from "../lib/eaflow.mjs";
import * as EA from "../lib/ea.mjs";
import * as AP from "../lib/adminpanel.mjs";
import * as SUP from "../lib/support.mjs";
import * as AU from "../lib/audit.mjs";
import * as SH from "../lib/shop.mjs";
import * as L from "../lib/i18n.mjs";
import { parseVienna, parseTime, toMinutes, nextOccurrence, dateKey, shortDate, todayKey, daysBetween, minutesToHHMM } from "../lib/time.mjs";

// ---------- Hilfen ----------
const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
const eph = (content, extra = {}) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, ...extra } });
const uidOf = (i) => i.member?.user?.id ?? i.user?.id;
const isEphemeralMsg = (i) => ((i.message?.flags ?? 0) & 64) === 64;
/** Antwort auf einen Button: im eigenen Fenster aktualisieren, sonst neues privates Fenster */
const reply = (i, payload) => (isEphemeralMsg(i) ? { type: 7, data: { allowed_mentions: { parse: [] }, ...payload } } : { type: 4, data: { flags: 64, allowed_mentions: { parse: [] }, ...payload } });
const opts = (list = []) => Object.fromEntries(list.map((x) => [x.name, x.value]));
function modalValues(i) { const o = {}; for (const r of i.data.components ?? []) { const c = r.components?.[0] ?? r.component; if (c?.custom_id) o[c.custom_id] = c.value ?? (Array.isArray(c.values) ? c.values : ""); } return o; }

const hasRole = (i, id) => !!id && (i.member?.roles ?? []).includes(id);
function isAdmin(i, cfg) {
  if (hasRole(i, cfg.roles.turnierleitung) || hasRole(i, process.env.ADMIN_ROLE_ID)) return true;
  return (BigInt(i.member?.permissions ?? "0") & 8n) === 8n;
}
const isStaff = (i, cfg) => isAdmin(i, cfg) || hasRole(i, cfg.roles.moderator);
const banText = (b) => `ist bis <t:${Math.floor(b.until / 1000)}:F> gesperrt (${["Eingecheckt, aber nicht erschienen","Während laufendem Turnierbetrieb rausgegangen","Gruppen- oder K.-o.-Phase ohne Abmeldung verlassen","Beleidigungen, Respektlosigkeit oder unsportliches Verhalten","Sonstiger schwerer Regelverstoß"][b.reason]})`;

/** Private Antworten (nur für den Klickenden), Formulare und Updates privater Fenster in seine Sprache übersetzen */
async function personal(i, res) {
  const lang = await L.getLang(uidOf(i));
  if (lang === "de" || !res) return res;
  const priv = res.type === 9 || (res.data && ((res.data.flags ?? 0) & 64)) || (res.type === 7 && isEphemeralMsg(i));
  return priv ? L.localize(res, lang) : res;
}

/** Längere Aktionen: Discord sofort antworten, im Hintergrund weiterarbeiten */
function background(i, context, work, { update = false } = {}) {
  const run = async () => { try { return await work(); } catch (e) { console.error(e); return `❌ ${e.message}`; } };
  if (typeof context?.waitUntil === "function") {
    context.waitUntil(run().then(async (content) => { if (content) { const lang = await L.getLang(uidOf(i)); await editOriginal(i, L.localize(typeof content === "string" ? { content, embeds: [], components: [] } : content, lang)); } await processQueue(4000); }));
    return update ? { type: 6 } : { type: 5, data: { flags: 64 } };
  }
  return run().then((content) => (update ? { type: 7, data: typeof content === "string" ? { content, embeds: [], components: [] } : content } : eph(typeof content === "string" ? content : "", typeof content === "string" ? {} : content)));
}
const later = (context, fn) => { const p = Promise.resolve().then(fn).catch((e) => console.error(e)); if (context?.waitUntil) context.waitUntil(p.then(() => processQueue(4000))); return p; };

async function resolveTournament(i) {
  const own = await get(tKey(i.channel_id));
  if (own && !["fertig", "abgesagt", "geloescht"].includes(own.status)) return own;
  const active = await F.activeTournament();
  if (active) return active;
  throw new Error("Gerade läuft kein Cup.");
}

// ---------- Einstieg ----------
export default async (req, context) => {
  const body = await req.text();
  const sig = req.headers.get("x-signature-ed25519"), time = req.headers.get("x-signature-timestamp");
  let ok = false;
  try { ok = !!sig && !!time && nacl.sign.detached.verify(Buffer.from(time + body), Buffer.from(sig, "hex"), Buffer.from(process.env.DISCORD_PUBLIC_KEY, "hex")); } catch {}
  if (!ok) return new Response("Ungültige Signatur", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 });
  // Zweiter Auslöser für die automatische Bestätigung (zusätzlich zum Minuten-Timer)
  if (context?.waitUntil) context.waitUntil(F.runAutoConfirm().catch((e) => console.error("Auto-Bestätigung:", e)));
  // Protokoll für die Admins: Aktionen von Turnierleitung & Staff in den Admin-Kanal
  try {
    const text = auditEntry(i, await getConfig());
    if (text) { const p = AU.audit(uidOf(i), text, i.channel_id).catch((e) => console.error("Protokoll:", e)); if (context?.waitUntil) context.waitUntil(p); }
  } catch (e) { console.error("Protokoll:", e); }
  try {
    const res = i.type === 2 ? await command(i, context) : i.type === 3 ? await component(i, context) : i.type === 5 ? await modal(i, context) : null;
    if (res) return json(await personal(i, res));
    return json(eph("Unbekannte Aktion."));
  } catch (e) {
    console.error(e);
    return json(isEphemeralMsg(i) && i.type === 3 ? { type: 7, data: { content: `❌ ${e.message}` } } : eph(`❌ ${e.message}`));
  }
};
export const config = { path: "/api/interactions" };

/** Nach dem Verknüpfen eines Kanals das passende Panel dort sofort (neu) posten */
async function refreshLinkedPanel(key) {
  if (key === "support") return SUP.refreshTicketPanel();
  if (key === "shop" || key === "feedback") return SH.refreshShopPanel();
  if (key === "bewerbung") return SUP.refreshApplyPanel();
  const map = { rules: F.refreshRulesPanel, roles: F.refreshRolesPanel, reg: F.refreshRegPanel, team: F.refreshTeamPanel, over: F.refreshOverview, ban: B.refreshBanPanel, adminpanel: () => F.refreshAdminPanel({ force: true }), teamstats: F.refreshTeamStats, eastatus: F.refreshEaLinks };
  if (key === "live") { const tc = await F.currentCup(); return tc ? F.refreshLive(tc) : null; }
  if (map[key]) return map[key]();
  const t = await F.activeTournament();
  if (!t) return;
  if (key === "kor" && t.koSize) return F.refreshKOResultPanel(t, true);
  if (/^r[A-H]$/.test(key) && ["checkin", "gruppen"].includes(t.status) && t.groups.some((g) => g.name === key[1])) return F.refreshResultPanel(t, key[1]);
  if (key === "ko" && t.koSize) return F.refreshBracket(t);
}

// ---------- Protokoll ----------
function auditEntry(i, cfg) {
  if (i.type === 2) {
    const name = i.data.name;
    if (name === "cup-ergebnis") return null; // normale Spieler-Aktion
    const ok = name === "cup-bewerbung" ? SUP.isServerAdmin(i.member) : isAdmin(i, cfg);
    return ok ? `\`${AU.describeCommand(i.data)}\`` : null;
  }
  if (i.type !== 3 && i.type !== 5) return null;
  const id = i.data.custom_id || "";
  let ok = false;
  if (id.startsWith("ban_")) ok = isStaff(i, cfg);
  else if (id.startsWith("reset_ok:")) ok = isAdmin(i, cfg);
  else if (id.startsWith("tk_")) ok = SUP.isTicketStaff(i.member, cfg);
  else if (id.startsWith("ap_")) ok = SUP.isServerAdmin(i.member);
  return ok ? AU.describeComponent(i) : null;
}

// ---------- Team-Logo ----------
async function uploadLogo(i, context) {
  const uid = uidOf(i);
  const clubs = await getClubs();
  const mine = F.clubOfUser(clubs, uid);
  if (!mine) return eph("Du hast keine Mannschaft. Registriere zuerst eine im Kanal **Registrieren**.");
  const attId = i.data.options?.find((o) => o.name === "bild")?.value;
  const att = i.data.resolved?.attachments?.[attId];
  if (!att) return eph("Bitte ein Bild anhängen.");
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(att.content_type || "")) return eph("Bitte ein **PNG**, **JPG**, **WEBP** oder **GIF** hochladen.");
  if (att.size > 2 * 1024 * 1024) return eph("Das Bild ist zu groß – maximal **2 MB**.");
  return background(i, context, async () => {
    const res = await fetch(att.url);
    if (!res.ok) throw new Error("Bild konnte nicht geladen werden – bitte nochmal versuchen.");
    const buf = Buffer.from(await res.arrayBuffer());
    const v = Date.now().toString(36);
    await set(`logo:${mine.club}`, { type: att.content_type, b64: buf.toString("base64"), v });
    await mutate("clubs", (cl) => { if (cl[mine.club]) cl[mine.club].logoV = v; }, { initial: {} });
    await F.refreshOverview().catch(() => {});
    return { content: `🖼️ Logo für **${V.esc(mine.club)}** gespeichert!`, embeds: [{ color: COLOR, title: mine.club, thumbnail: { url: V.logoUrl(mine.club, v) } }], components: [] };
  });
}

// ---------- Team anlegen / EA setzen ----------
async function createTeam(i, uid, name, ea, logo, eaGuess = "") {
  const cfg = await getConfig();
  const v0 = Date.now().toString(36);
  const { result } = await mutate("clubs", (cl) => {
    if (F.clubOfUser(cl, uid)) return "schon";
    if (Object.keys(cl).some((k) => k.toLowerCase() === name.toLowerCase())) return "vergeben";
    if (ea && Object.values(cl).some((c) => String(c.eaId) === String(ea.id))) return "eavergeben";
    cl[name] = { manager: uid, cos: [], ea: ea?.name || eaGuess, eaId: ea?.id || null, eaName: ea?.name || null, eaVerified: !!ea, eaLookup: { at: Date.now(), ok: !!ea }, since: Date.now(), lastPlayed: todayKey(), cups: 0, titles: 0, managerBase: baseNameOf(i.member), managerOrigNick: i.member?.nick ?? null, custom: true, ...(logo ? { logoV: v0 } : {}) };
    return "ok";
  }, { initial: {} });
  if (result === "vergeben") return `Den Namen **${V.esc(name)}** gibt es schon – bitte einen anderen wählen.`;
  if (result === "schon") return "Du hast bereits eine Mannschaft.";
  if (result === "eavergeben") return "Dieser EA-Club ist schon bei einem anderen Team eingetragen.";
  if (logo) await set(`logo:${name}`, { ...logo, v: v0 });
  (await import("../lib/botlog.mjs")).botLog(`🛡️ **Neues Team** „${name}“ von <@${uid}>${ea ? ` · EA: ${ea.name}` : " · ohne EA"}${logo ? " · mit Logo" : ""}`);
  await setNick(uid, nickFor(baseNameOf(i.member), "manager", name));
  await F.refreshRegPanel(); await F.refreshOverview();
  return { content: `🛡️ **Willkommen, Manager von ${V.esc(name)}!**\n🔗 EA-Club: ${ea ? `**${V.esc(ea.name || "?")}** ✅ verknüpft` : `⚠️ EA war gerade nicht erreichbar – später unter *Meine Mannschaft → EA-Club ändern* verknüpfen`}\n${logo ? "🖼️ Logo gespeichert" : "🖼️ Kein Logo – nachholen mit `/cup-logo bild:`"}\nDeine Mannschaft findest du in ${cfg.channels.team ? `<#${cfg.channels.team}>` : "Meine-Mannschaft"}.`, embeds: logo ? [{ color: COLOR, title: name, thumbnail: { url: V.logoUrl(name, v0) } }] : [], components: [] };
}
async function setTeamEa(team, ea) {
  await mutate("clubs", (cl) => { const x = cl[team]; if (x) Object.assign(x, { eaId: ea.id, ea: ea.name || x.ea, eaName: ea.name || null, eaVerified: true, eaLookup: { at: Date.now(), ok: true } }); }, { initial: {} });
  await F.refreshOverview().catch(() => {});
  return { content: `✅ EA-Club verknüpft: **${V.esc(ea.name || "?")}**.`, embeds: [], components: [] };
}

// ---------- Team auflösen ----------
function delTeamConfirm(name, reason) {
  if (!name) return eph("Kein Team gewählt.");
  const cid = `adm:delok:${encodeURIComponent(name)}`.slice(0, 100);
  return eph(`⚠️ **${V.esc(name)} wirklich auflösen?**\nManager und Co-VMs verlieren das Team, Spitznamen werden zurückgesetzt, Logo und EA-Verknüpfung gelöscht. Ist das Team in einer laufenden Anmeldung, wird es abgemeldet.${reason ? `\nGrund: ${reason}` : ""}`, { components: [{ type: 1, components: [{ type: 2, style: 2, label: "Nein", custom_id: "adm:nop" }, { type: 2, style: 4, label: "Ja, auflösen", custom_id: cid }] }] });
}
async function dissolveTeam(name, reason, by) {
  const clubs = await getClubs(), c = clubs[name];
  if (!c) return "Dieses Team gibt es nicht mehr.";
  // aus laufender Anmeldung / Check-in streichen (laufende Spiele bleiben unberührt)
  const t = await F.currentCup();
  if (t && ["anmeldung", "checkin"].includes(t.status) && t.reg.includes(name)) {
    const { value } = await mutate(tKey(t.channelId), (x) => { x.reg = x.reg.filter((n) => n !== name); x.checked = (x.checked || []).filter((n) => n !== name); });
    await F.refreshSignup(value).catch(() => {});
  }
  await F.releaseClub(name, { reason: reason || "Von der Turnierleitung aufgelöst" });
  await del(`logo:${name}`).catch(() => {});
  await F.refreshOverview().catch(() => {});
  // Manager per DM informieren (klappt nicht, wenn er DMs gesperrt hat – dann einfach weiter)
  try {
    const { discord } = await import("../lib/discord.mjs");
    const dmc = await discord("/users/@me/channels", "POST", { recipient_id: c.manager });
    if (dmc?.id) await discord(`/channels/${dmc.id}/messages`, "POST", { content: `🗑️ Dein Team **${name}** wurde von der Turnierleitung der Bomber Cup aufgelöst.${reason ? `\nGrund: ${reason}` : ""}\nDu kannst jederzeit ein neues Team registrieren.` });
  } catch { /* egal */ }
  (await import("../lib/botlog.mjs")).botLog(`🗑️ **Team aufgelöst** „${name}“ von <@${by}>${reason ? ` · Grund: ${reason}` : ""}`);
  return `🗑️ **${V.esc(name)}** wurde aufgelöst.${reason ? ` Grund: ${reason}` : ""}`;
}

// ---------- ⚙️ Admin-Panel ----------
/** Kanal des aktuellen Cups (laufend, sonst Anmelde-Kanal) */
async function cupChannel(cfg) { const t = await F.currentCup(); return t?.channelId || cfg.channels.signup || null; }
/** Panel-Klick → gleicher Ablauf wie der passende /cup-admin-Befehl */
const asCmd = (i, ch, name, sub, options = []) => ({ ...i, channel_id: ch || i.channel_id, data: { name, options: [{ name: sub, type: 1, options }] } });

async function adminPanelClick(i, context, cfg) {
  if (!isAdmin(i, cfg)) return eph("Das Admin-Panel darf nur die **Turnierleitung** benutzen.");
  let id = i.data.custom_id; const ch = await cupChannel(cfg);
  const run = (sub, options = []) => admin(asCmd(i, ch, "cup-admin", sub, options), context, cfg);
  if (id.startsWith("adm:delok:")) { const enc = id.slice(10); id = "adm:delok"; i = { ...i, data: { ...i.data, custom_id: "adm:delok:" + enc } }; }
  switch (id) {
    case "adm:new": return AP.newCupModal();
    case "adm:close": case "adm:ciend": {
      const t = await F.currentCup();
      if (!t) return eph("Gerade läuft kein Cup.");
      if (id === "adm:close" && t.status !== "anmeldung") return eph("Die Anmeldung ist schon geschlossen.");
      if (id === "adm:ciend" && t.status !== "checkin") return eph("Gerade läuft kein Check-in.");
      const now = Date.now() - 1000;
      await mutate(tKey(t.channelId), (x) => { if (id === "adm:close") x.times.close = Math.min(x.times.close, now); else { x.times.checkinEnd = Math.min(x.times.checkinEnd, now); x.times.kickoff = Math.min(x.times.kickoff, now); } });
      return eph(id === "adm:close" ? "⏩ **Anmeldeschluss gesetzt** – in der nächsten Minute wird ausgelost und der Check-in startet." : "✅ **Check-in endet jetzt** – in der nächsten Minute werden die Gruppen gepostet, danach wird **Spieltag 1** freigegeben.");
    }
    case "adm:cancel": return eph("⚠️ **Cup wirklich abbrechen?** Alle Turnier-Rollen werden entfernt, Ergebnisse zählen nicht.", { components: [{ type: 1, components: [{ type: 2, style: 2, label: "Nein", custom_id: "adm:nop" }, { type: 2, style: 4, label: "Ja, abbrechen", custom_id: "adm:cancelok" }] }] });
    case "adm:cancelok": { const r = await run("abbrechen"); return r; }
    case "adm:nop": return { type: 7, data: { content: "Abgebrochen – nichts passiert.", components: [] } };
    case "adm:add": {
      const t = await F.currentCup();
      if (!t || !["anmeldung", "checkin"].includes(t.status)) return eph("Teams hinzufügen geht nur während **Anmeldung** oder **Check-in**.");
      const names = Object.keys(await getClubs()).filter((n) => !t.reg.includes(n)).sort((a, b) => a.localeCompare(b, "de"));
      return eph("", AP.teamPick("adm:addpick", names, "**➕ Welches Team soll auf die Liste?**" + (t.status === "checkin" ? "\n-# Im Check-in wird es gleich eingecheckt." : "")));
    }
    case "adm:addpick": {
      const name = i.data.values?.[0];
      return background(i, context, async () => {
        const { value: t } = await mutate(tKey(ch), (x) => { if (!["anmeldung", "checkin"].includes(x.status)) throw new Error("Anmeldung/Check-in ist schon vorbei."); if (!x.reg.includes(name)) T.register(x, name); if (x.status === "checkin" && !x.checked.includes(name)) T.checkIn(x, name); });
        await F.refreshSignup(t);
        return `✅ **${V.esc(name)}** ist jetzt auf der Liste${t.status === "checkin" ? " und eingecheckt" : ""}.`;
      }, { update: true });
    }
    case "adm:rem": {
      const t = await F.currentCup();
      if (!t || !t.reg?.length) return eph("Gerade ist niemand angemeldet.");
      return eph("", AP.teamPick("adm:rempick", t.reg.filter((n) => !/^freilos/i.test(n)), "**➖ Welches Team soll abgemeldet werden?**"));
    }
    case "adm:rempick": return admin(asCmd(i, ch, "cup-admin", "abmelden", [{ name: "verein", value: i.data.values?.[0] }]), context, cfg);
    case "adm:del": {
      const names = Object.keys(await getClubs()).sort((a, b) => a.localeCompare(b, "de"));
      if (!names.length) return eph("Es gibt noch keine Teams.");
      if (names.length > 25) return AP.delTeamModal(); // zu viele für eine Auswahl → Name eintippen
      return eph("", AP.teamPick("adm:delpick", names, "**🗑️ Welches Team soll aufgelöst werden?**\n-# Manager und Co-VMs verlieren das Team, Logo und EA-Verknüpfung werden gelöscht."));
    }
    case "adm:delpick": return delTeamConfirm(i.data.values?.[0], "");
    case "adm:delok": {
      const enc = i.data.custom_id.slice("adm:delok:".length); // adm:delok:<Team>
      return background(i, context, () => dissolveTeam(decodeURIComponent(enc || ""), i.message?.content?.match(/Grund: (.*)$/m)?.[1] || "", uidOf(i)), { update: true });
    }
    case "adm:fl+": return run("freilos-hinzufügen");
    case "adm:fl-": return run("freilos-entfernen");
    case "adm:games": return run("spiele");
    case "adm:result": return AP.resultModal();
    case "adm:ea": return AP.eaModal();
    case "adm:tott": return run("tott");
    case "adm:test": {
      const tch = cfg.channels.adminpanel || cfg.channels.admin || i.channel_id;
      return background(i, context, async () => {
        const r = await F.startTestCup(tch, uidOf(i), 8);
        await F.fastForwardTestCup(tch);
        return `🧪 **Test-Cup gestartet!** 8 Teams, alle werden automatisch eingecheckt.\n⏳ In **ca. 1–3 Minuten** ist ausgelost und **Spieltag 1** freigegeben – die Posts erscheinen nach und nach in den Gruppenkanälen.\n${r.mine ? `• Deine Mannschaft **${V.esc(r.mine.club)}** spielt mit – melde deine Spiele über die Knöpfe.` : "• Du hast kein eigenes Team – es spielen nur Test-Teams."}\n• Die Test-Spiele laufen **jede Minute von selbst** – mit **▶️ Test-Spiele ausspielen** geht's sofort.\n• Beenden: **🛑 Cup abbrechen**.\n-# Keine Statistik, kein TOTT.`;
      });
    }
    case "adm:testgo": return background(i, context, async () => {
      const t0 = await F.currentCup();
      if (!t0?.test) return "Gerade läuft kein Test-Cup – erst **🧪 Test-Cup** klicken.";
      if (["anmeldung", "checkin"].includes(t0.status) || (t0.status === "gruppen" && !t0.kickoffDone)) return "⏳ Der Test-Cup wird gerade ausgelost bzw. angepfiffen – bitte noch 1–2 Minuten warten.";
      const n = await F.playVirtualMatches(t0.channelId, 1); // 1 Runde pro Klick (Netlify-Zeitlimit)
      const t = await get(tKey(t0.channelId));
      return t.status === "fertig" ? `🏆 Test-Cup beendet – Sieger: **${V.esc(t.podium?.[0] || "?")}**. Siegerbild & Turnierbaum stehen in den Kanälen.` : n ? `🧪 ${n} Test-Spiele gespielt – jetzt: **${t.status === "gruppen" ? `Spieltag ${t.round}` : "K.-o.-Phase"}**. Nochmal klicken für die nächste Runde.` : "🧪 Keine offenen Test-Spiele – jetzt bist du mit deinem Spiel dran (oder Ergebnis festlegen).";
    });
    case "adm:clean": return eph("", AP.cleanPick());
    case "adm:post": return eph("", AP.panelPick());
    case "adm:postpick": {
      const key = i.data.values?.[0];
      return background(i, context, async () => {
        const ch = cfg.channels[key];
        if (!ch) return `⚠️ Für **${CHANNEL_TYPES[key] || BASE_CHANNEL_TYPES[key] || key}** ist noch kein Kanal verknüpft – im gewünschten Kanal \`/cup-einrichten kanal typ: ${CHANNEL_TYPES[key] || BASE_CHANNEL_TYPES[key] || key}\` ausführen.`;
        // alte Panel-Nachricht löschen, damit das neue unten im Kanal steht
        const p = (await get("panels")) || {};
        const old = p[key];
        const { deleteMessage } = await import("../lib/discord.mjs");
        for (const id of (Array.isArray(old) ? old : [old]).filter(Boolean)) await deleteMessage(ch, id).catch(() => {});
        await mutate("panels", (x) => { delete x[key]; if (key === "over") x.over = []; }, { initial: { over: [] } });
        await refreshLinkedPanel(key);
        return `📌 **${CHANNEL_TYPES[key] || BASE_CHANNEL_TYPES[key] || key}** neu gepostet in <#${ch}>.`;
      }, { update: true });
    }
    case "adm:cleanpick": {
      const pick = new Set(i.data.values || []), all = pick.has("all"), G8 = ["A", "B", "C", "D", "E", "F", "G", "H"];
      const c = cfg.channels, chans = [];
      if (all || pick.has("groups")) chans.push(...G8.map((g) => c["g" + g]));
      if (all || pick.has("results")) chans.push(...G8.map((g) => c["r" + g]), c.kor);
      if (all || pick.has("ko")) chans.push(c.ko);
      if (all || pick.has("live")) chans.push(c.live);
      if (all || pick.has("admin")) chans.push(c.adminpanel || c.admin);
      const list = [...new Set(chans.filter(Boolean))];
      if (!list.length) return { type: 7, data: { content: "Keine passenden Kanäle verknüpft.", components: [] } };
      return background(i, context, async () => {
        const CL = await import("../lib/cleanup.mjs");
        await CL.queueClean(list);
        const n = await CL.runCleanJobs(5000); // Rest erledigt der Minuten-Timer
        (await import("../lib/botlog.mjs")).botLog(`🧹 **Kanäle säubern** von <@${uidOf(i)}> – ${n} Nachrichten gelöscht (${list.length} Kanäle)`);
        const left = ((await get("cleanjobs")) || []).length;
        return `🧹 **${n} Nachrichten gelöscht** in ${list.length - left} von ${list.length} Kanälen.${left ? `\n⏳ ${left} Kanäle folgen in der nächsten Minute automatisch.` : " ✅ Fertig."}\n-# Panels und die Posts des laufenden Cups sind geblieben.`;
      }, { update: true });
    }
    case "adm:panels": return setup(asCmd(i, i.channel_id, "cup-einrichten", "panels"), context, cfg);
    case "adm:perms": return setup(asCmd(i, i.channel_id, "cup-einrichten", "rechte"), context, cfg);
    case "adm:status": return setup(asCmd(i, i.channel_id, "cup-einrichten", "status"), context, cfg);
    case "adm:refresh": return { type: 7, data: AP.adminPanel(await F.currentCup()) };
  }
  return eph("Unbekannte Aktion.");
}

async function adminPanelModal(i, context, cfg, v) {
  if (!isAdmin(i, cfg)) return eph("Nur für die Turnierleitung.");
  const id = i.data.custom_id, ch = await cupChannel(cfg);
  if (id === "admm:new") {
    const target = cfg.channels.signup || i.channel_id;
    return manualCup({ ...i, channel_id: target, data: { name: "cup-turnier", options: [{ name: "name", value: v.name }, { name: "anpfiff", value: v.anpfiff }] } }, context);
  }
  if (id === "admm:result") {
    const num = (x) => (/^\d{1,3}$/.test(String(x || "").trim()) ? Number(x) : null);
    const spiel = num(v.spiel), heim = num(v.heim), gast = num(v.gast);
    if (spiel == null || heim == null || gast == null) return eph("Bitte Spiel-Nr. und beide Torzahlen als Zahl eintragen.");
    const opt = [{ name: "spiel", value: spiel }, { name: "heim", value: heim }, { name: "gast", value: gast }, ...(v.elfmeter?.trim() ? [{ name: "elfmeter", value: v.elfmeter.trim() }] : [])];
    return admin(asCmd(i, ch, "cup-admin", "ergebnis", opt), context, cfg);
  }
  if (id === "admm:del") {
    const name = Object.keys(await getClubs()).find((c) => c.toLowerCase() === String(v.team || "").trim().toLowerCase());
    if (!name) return eph("Dieses Team gibt es nicht – bitte genau wie in der Übersicht schreiben.");
    return delTeamConfirm(name, String(v.grund || "").trim());
  }
  if (id === "admm:ea") return admin(asCmd(i, ch, "cup-admin", "ea-verknüpfen", [{ name: "verein", value: v.team }, ...(v.ea_id?.trim() ? [{ name: "ea_id", value: v.ea_id.trim() }] : [])]), context, cfg);
  return eph("Unbekanntes Formular.");
}

// ---------- Slash-Befehle ----------
// ---------- Bomber Cup: Profil, Premium, Moderation ----------
async function profileCmd(i) {
  const uid = opts(i.data.options).spieler || uidOf(i);
  const BD = await import("../lib/badges.mjs");
  const PR = await import("../lib/premium.mjs");
  const S = (await get("stats")) || {};
  return eph("", { embeds: [BD.profileEmbed(uid, S.managers?.[uid], await PR.premiumOf(uid))] });
}

async function premiumCmd(i, context, cfg) {
  if (!isAdmin(i, cfg)) return eph("Premium darf nur die Turnierleitung vergeben.");
  const sub = i.data.options[0], o = opts(sub.options);
  const PR = await import("../lib/premium.mjs");
  const by = uidOf(i);
  if (sub.name === "liste") return eph("", { embeds: [{ color: COLOR, title: "💎 Premium-Mitglieder", description: await PR.premiumList() }] });
  if (sub.name === "geben") {
    return background(i, context, async () => {
      const e = await PR.grantPremium(o.mitglied, o.tage || 0, by, o.notiz || "");
      await PR.logPremium(`💎 <@${o.mitglied}> hat Premium bekommen von <@${by}> – ${e.until ? `bis <t:${Math.floor(e.until / 1000)}:D>` : "unbegrenzt"}`);
      return `✅ <@${o.mitglied}> hat jetzt 💎 **Premium** ${e.until ? `bis <t:${Math.floor(e.until / 1000)}:D>` : "(unbegrenzt)"}.`;
    });
  }
  if (sub.name === "entfernen") {
    return background(i, context, async () => {
      const had = await PR.revokePremium(o.mitglied, `entfernt von ${by}`);
      if (had) await PR.logPremium(`💎 Premium von <@${o.mitglied}> entfernt durch <@${by}>`);
      return had ? `✅ Premium von <@${o.mitglied}> entfernt.` : `<@${o.mitglied}> hatte kein Premium.`;
    });
  }
  return eph("Unbekannt.");
}

async function modCmd(i, context, cfg) {
  if (!isStaff(i, cfg) && !((BigInt(i.member?.permissions ?? "0") & (1n << 40n)) === (1n << 40n))) return eph("Das dürfen nur Moderatoren und die Turnierleitung.");
  const sub = i.data.options[0], o = opts(sub.options);
  const M = await import("../lib/moderation.mjs");
  const by = uidOf(i);
  const target = o.mitglied;
  if (target && target === by && sub.name !== "verwarnungen") return eph("Das geht nicht bei dir selbst. 🙂");
  const memberOf = (id) => i.data.resolved?.members?.[id];
  if (target && ["verwarnen", "timeout", "kick", "bann"].includes(sub.name)) {
    const m = memberOf(target);
    const isTeam = m && (m.roles || []).some((r) => [cfg.roles?.turnierleitung, cfg.roles?.moderator, process.env.ADMIN_ROLE_ID].filter(Boolean).includes(r));
    if (isTeam && !isAdmin(i, cfg)) return eph("Team-Mitglieder kann nur die Turnierleitung bestrafen.");
  }
  if (sub.name === "verwarnungen") {
    const list = await M.warnings(target);
    return eph("", { embeds: [{ color: COLOR, title: `⚠️ Verwarnungen (${list.length})`, description: list.length ? `<@${target}>\n\n` + list.slice(-15).map((w, k) => `**${k + 1}.** <t:${Math.floor(w.at / 1000)}:d> – ${w.reason} (von <@${w.by}>)`).join("\n") : `<@${target}> hat keine Verwarnungen. ✅` }] });
  }
  return background(i, context, async () => {
    if (sub.name === "verwarnen") {
      const r = await M.warn(target, by, o.grund);
      return `⚠️ <@${target}> verwarnt (${r.count}/${M.WARN_LIMIT}).${r.auto ? " ⏳ Automatischer Timeout wurde vergeben." : ""}`;
    }
    if (sub.name === "verwarnungen-löschen") return `🧹 ${await M.clearWarnings(target, by)} Verwarnung(en) von <@${target}> gelöscht.`;
    if (sub.name === "timeout") return (await M.timeout(target, o.minuten, by, o.grund || "kein Grund angegeben")) ? (o.minuten ? `⏳ <@${target}> hat ${o.minuten} Min. Timeout.` : `✅ Timeout von <@${target}> aufgehoben.`) : "❌ Hat nicht geklappt – steht die Bot-Rolle über der Rolle des Mitglieds?";
    if (sub.name === "kick") return (await M.kick(target, by, o.grund)) ? `👢 <@${target}> wurde gekickt.` : "❌ Hat nicht geklappt – steht die Bot-Rolle über der Rolle des Mitglieds?";
    if (sub.name === "bann") return (await M.ban(target, by, o.grund, o["nachrichten_löschen"] || 0)) ? `🔨 <@${target}> wurde gebannt.` : "❌ Hat nicht geklappt – steht die Bot-Rolle über der Rolle des Mitglieds?";
    if (sub.name === "entbannen") return (await M.unban(String(o.user_id).trim(), by)) ? `🕊️ <@${o.user_id}> wurde entbannt.` : "❌ Diese ID ist nicht gebannt.";
    if (sub.name === "automod") {
      if (!isAdmin(i, cfg)) return "AutoMod darf nur die Turnierleitung einschalten.";
      const done = await M.setupAutomod([cfg.roles?.turnierleitung, cfg.roles?.moderator, cfg.roles?.support, process.env.ADMIN_ROLE_ID]);
      return `🤖 **Discord-AutoMod**\n${done.join("\n")}\n-# Team-Rollen sind ausgenommen. Ausschalten: Servereinstellungen → AutoMod.`;
    }
    return "Unbekannt.";
  });
}

async function command(i, context) {
  const cfg = await getConfig();
  const name = i.data.name;
  if (name === "cup-ergebnis") return resultOpen(i);
  if (name === "cup-logo") return uploadLogo(i, context);
  if (name === "profil") return profileCmd(i);
  if (name === "premium") return premiumCmd(i, context, cfg);
  if (name === "mod") return modCmd(i, context, cfg);
  if (name === "cup-bewerbung") {
    if (!SUP.isServerAdmin(i.member)) return eph("Das dürfen nur Server-Admins.");
    const open = i.data.options[0].name === "öffnen";
    return background(i, context, async () => { await SUP.setApplicationsOpen(open); return open ? "✅ Bewerbungen sind jetzt **geöffnet**." : "🔒 Bewerbungen sind jetzt **geschlossen**."; });
  }
  if (!isAdmin(i, cfg)) return eph("Das darf nur die Turnierleitung.");
  if (name === "cup-einrichten") return setup(i, context, cfg);
  if (name === "cup-turnier") return manualCup(i, context);
  if (name === "cup-admin") return admin(i, context, cfg);
  return eph("Unbekannter Befehl.");
}

async function setup(i, context, cfg) {
  const sub = i.data.options[0], o = opts(sub.options);
  o.kanal = o.kanal || i.channel_id; // ohne Auswahl: aktueller Kanal
  if (sub.name === "kanal") {
    const ch = o.kanal || i.channel_id; // ohne Auswahl: der Kanal, in dem der Befehl ausgeführt wird
    await mutate("config", (c) => { c.channels = c.channels || {}; c.channels[o.typ] = ch; }, { initial: { channels: {}, roles: { groups: {}, rounds: {} } } });
    later(context, () => refreshLinkedPanel(o.typ));
    return eph(`✅ **${CHANNEL_TYPES[o.typ]}** → <#${ch}>`);
  }
  if (sub.name === "schrift") {
    return background(i, context, async () => {
      const n = await AS.setupRename();
      if (!n) return "✅ Alle Kanäle stehen schon in der fetten Schrift.";
      await AS.processSetupJobs(5000); // kurz halten: Netlify beendet Funktionen nach ca. 10 s – der Rest läuft im Minuten-Timer weiter
      const pr = await AS.setupProgress();
      return `🔤 **${n} Kanäle werden umbenannt** (z. B. 𝐊𝐎-𝐄𝐫𝐠𝐞𝐛𝐧𝐢𝐬𝐬𝐞).\n${pr?.left ? `⏳ Noch ${pr.left} offen – läuft im Hintergrund weiter (etwa ${Math.ceil(pr.left / 8)} Min.).` : "✅ Fertig."}\n-# Verknüpfungen bleiben erhalten. Kategorien und Ticket-Kanäle werden nicht angefasst. Umlaute werden zu ae/oe/ue.`;
    });
  }
  if (sub.name === "rechte") {
    return background(i, context, async () => {
      const n = await AS.setupPerms();
      if (!n) return "Es sind noch keine Kanäle verknüpft.";
      const cfgNow = await getConfig();
      const lock = await AS.lockServer(cfgNow.roles || {}).catch((e) => ({ err: e.message }));
      await AS.processSetupJobs(5000); // kurz halten: Netlify beendet Funktionen nach ca. 10 s – der Rest läuft im Minuten-Timer weiter
      const pr = await AS.setupProgress();
      return `🔒 **Rechte für ${n} Kanäle werden gesetzt.**\n• Willkommen, Regelwerk, Rollenauswahl: für **alle** sichtbar\n• **Alle anderen Kanäle des Servers:** erst mit Rolle **Spieler** oder **Manager** (Staff sieht alles)\n${lock?.err ? `⚠️ Server-Sperre fehlgeschlagen (${lock.err}) – Bot-Rolle ganz nach oben ziehen.\n` : "🔒 @everyone sieht ohne Rolle keine anderen Kanäle mehr.\n"}${pr?.left ? `⏳ Noch ${pr.left} offen – läuft im Hintergrund weiter (ca. 1 Minute).` : "✅ Fertig."}\n-# Ausnahme: Kanäle, bei denen @everyone ausdrücklich „Kanal ansehen ✅“ hat – dort das Häkchen entfernen.`;
    });
  }
  if (sub.name === "alles") {
    return background(i, context, async () => {
      const r = await AS.setupAll({ create: o.fehlende_erstellen ?? true, perms: o.rechte_setzen ?? true, kickoff: o.anpfiff ?? "20:00" });
      await AS.processSetupJobs(5000); // kurz halten: Netlify beendet Funktionen nach ca. 10 s – der Rest läuft im Minuten-Timer weiter
      const pr = await AS.setupProgress();
      const name = (k) => (k.startsWith("day") ? DAYS[Number(k.slice(3)) - 1] : CHANNEL_TYPES[k] || k);
      const found = Object.keys(r.found);
      return [
        "✅ **Einrichtung gestartet**",
        `👥 Rollen verknüpft bzw. angelegt.`,
        `🔎 **${found.length} Kanäle erkannt:** ${found.map(name).join(", ") || "–"}`,
        r.lock && !r.lock.err ? "🔒 **Server abgeschlossen:** ohne Rolle sieht man nur Willkommen, Regelwerk und Rollenauswahl – mit **Spieler** oder **Manager** alles andere." : r.lock?.err ? `⚠️ Server konnte nicht abgeschlossen werden (${r.lock.err}) – Bot-Rolle nach oben ziehen und \`/cup-einrichten rechte\` nochmal.` : "",
        r.missing.length ? `🆕 **${r.missing.length} Kanäle werden angelegt:** ${r.missing.map((m) => name(m.key)).join(", ")}` : "🆕 Keine fehlenden Kanäle.",
        r.perms ? "🔒 Rechte werden gesetzt (wer welchen Kanal sieht)." : "🔒 Rechte nicht verändert.",
        "",
        pr?.left ? `⏳ **${pr.done}/${pr.total} erledigt** – der Rest läuft automatisch weiter (ca. 1–3 Minuten). Danach mit \`/cup-einrichten status\` prüfen.` : "🎉 **Alles erledigt!** Prüfen mit `/cup-einrichten status`.",
        "",
        "-# Wichtig: Die Rolle des Bots muss in der Rollenliste ganz oben stehen.",
      ].join("\n");
    });
  }
  if (sub.name === "zurücksetzen" && o.umfang === "stats") {
    return eph("⚠️ **Statistik zurücksetzen?**\nGelöscht werden: Medaillenspiegel, Top-Manager, Rekorde, letzte Sieger, alle persönlichen Statistiken sowie Titel- und Cup-Zähler der Vereine. Die Team-Statistiken starten wieder bei null.\nVereine, Manager, Sperren, Einrichtung und die Hall of Fame bleiben erhalten. Das kann nicht rückgängig gemacht werden.",
      { components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "reset_no" }, { type: 2, style: 4, label: "Ja, Statistik zurücksetzen", custom_id: "reset_ok:stats" }] }] });
  }
  if (sub.name === "zurücksetzen") {
    const all = o.umfang === "all";
    return eph(all
      ? "⚠️ **Wirklich ALLES zurücksetzen?**\nGelöscht werden: Kanal- und Rollen-Verknüpfungen, Panels **und** alle Vereine/Manager, Sperren, Regel-Bestätigungen, Turniere und Statistiken. Spitznamen werden zurückgesetzt.\nDeine Discord-Kanäle und -Rollen bleiben bestehen. Das kann nicht rückgängig gemacht werden."
      : "⚠️ **Einrichtung zurücksetzen?**\nGelöscht werden: Kanal- und Rollen-Verknüpfungen und die Panel-Posts. Vereine, Sperren und Turniere bleiben erhalten.\nDeine Discord-Kanäle und -Rollen bleiben bestehen.",
      { components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "reset_no" }, { type: 2, style: 4, label: all ? "Ja, alles zurücksetzen" : "Ja, Einrichtung zurücksetzen", custom_id: `reset_ok:${all ? "all" : "setup"}` }] }] });
  }
  if (sub.name === "gruppe") {
    const key = (o.art === "ergebnisse" ? "r" : "g") + o.gruppe;
    const ch = o.kanal || i.channel_id;
    await mutate("config", (c) => { c.channels = c.channels || {}; c.channels[key] = ch; }, { initial: { channels: {}, roles: { groups: {}, rounds: {} } } });
    later(context, () => refreshLinkedPanel(key));
    return eph(`✅ **${CHANNEL_TYPES[key]}** → <#${ch}>`);
  }
  if (sub.name === "rollen") {
    return background(i, context, async () => {
      const roles = await AS.setupRoles();
      const missing = [roles.turnierleitung, roles.moderator, roles.support, roles.manager, roles.spieler, ...Object.values(roles.groups), ...Object.values(roles.rounds), roles.koPhase].filter((x) => !x).length;
      return missing ? `⚠️ ${missing} Rollen konnten nicht angelegt werden – hat der Bot „Rollen verwalten“?` : "✅ Alle Rollen sind verknüpft (vorhandene übernommen, fehlende angelegt). Zieh die Rolle des Bots in der Rollenliste über alle diese Rollen.";
    });
  }
  if (sub.name === "panels") {
    return background(i, context, async () => { await F.refreshRulesPanel(); await F.refreshRolesPanel(); await F.refreshRegPanel(); await F.refreshTeamPanel(); await F.refreshOverview(); await B.refreshBanPanel(); await SUP.refreshTicketPanel(); await SUP.refreshApplyPanel(); await F.refreshAdminPanel(); await SH.refreshShopPanel(); return "✅ Panels in Regelwerk, Rollenauswahl, Team-registrieren, Meine-Mannschaft, Mannschaftsübersicht, Sperrliste, Support und Staff-Bewerbung gepostet bzw. aktualisiert."; });
  }
  if (sub.name === "status") return background(i, context, async () => {
    // Prüfen, ob die verknüpften Kanäle noch existieren (gelöschte Kanäle erscheinen in Discord als „#unbekannt“)
    const linked = Object.keys(CHANNEL_TYPES).filter((k) => cfg.channels?.[k]);
    const exists = Object.fromEntries(await Promise.all(linked.map(async (k) => [k, !!(await discord(`/channels/${cfg.channels[k]}`))])));
    const broken = linked.filter((k) => !exists[k]);
    const lines = Object.entries(CHANNEL_TYPES).map(([k, n]) => !cfg.channels?.[k] ? `▫️ **${n}**` : exists[k] ? `✅ **${n}** → <#${cfg.channels[k]}>` : `❌ **${n}** → Kanal existiert nicht mehr – neu verknüpfen!`);
    const r = cfg.roles || {};
    const roleOk = r.manager && r.spieler && r.turnierleitung && GROUP_NAMES.every((g) => r.groups?.[g]) && ROUND_ROLES.every((x) => r.rounds?.[x]);
    const pr = await AS.setupProgress();
    const memOk = !!(await discord(`/guilds/${process.env.DISCORD_GUILD_ID}/members?limit=1`));
    const memLine = memOk ? "**Mitgliederliste:** ✅ lesbar (Willkommen & Rollen-Abgleich laufen)" : "**Mitgliederliste:** ❌ nicht lesbar – im Discord Developer Portal unter *Bot* den **Server Members Intent** einschalten. Ohne den gibt es keine Willkommensnachrichten.";
    return `${memLine}\n${broken.length ? `\n⚠️ **${broken.length} ${broken.length === 1 ? "verknüpfter Kanal existiert" : "verknüpfte Kanäle existieren"} nicht mehr** – im richtigen Kanal \`/cup-einrichten kanal\` bzw. \`/cup-einrichten gruppe\` ausführen.\n` : ""}\n${pr?.left ? `⏳ **Einrichtung läuft noch:** ${pr.done}/${pr.total} erledigt\n\n` : ""}**Kanäle**\n${lines.join("\n")}\n\n**Rollen:** ${roleOk ? "✅ alle verknüpft" : "⚠️ noch nicht vollständig – \`/cup-einrichten rollen\`"}\n-# Gruppenkanäle brauchst du nur so viele, wie es Gruppen gibt (8 bei 32 Mannschaften).`.slice(0, 1990);
  });
  return eph("Unbekannter Befehl.");
}

async function schedule(i, context) {
  const sub = i.data.options[0], o = opts(sub.options);
  o.kanal = o.kanal || i.channel_id; // ohne Auswahl: aktueller Kanal
  if (sub.name === "setzen") {
    const kickoff = parseTime(o.anpfiff), post = parseTime(o.posten ?? "12:00");
    if (!kickoff) return eph("Anpfiff bitte so angeben: `20:00`");
    if (!post) return eph("Posting-Zeit bitte so angeben: `12:00`");
    if (toMinutes(post) > toMinutes(kickoff) - 62) return eph(`Die Liste muss vor dem Anmeldeschluss (${minutesToHHMM(toMinutes(kickoff) - 60)}) gepostet werden.`);
    const entry = { channelId: o.kanal, kickoff, post, name: (o.name ?? "Bomber Cup").trim(), advance: false };
    await mutate("zeitplan", (p) => { const old = p[o.tag]; p[o.tag] = { ...entry, lastPosted: old?.channelId === o.kanal ? old.lastPosted ?? null : null }; }, { initial: {} });
    return eph(`✅ **${DAYS[o.tag - 1]}:** Liste um ${post} in <#${o.kanal}> · Anmeldeschluss & Auslosung ${minutesToHHMM(toMinutes(kickoff) - 60)} · Check-in-Ende ${minutesToHHMM(toMinutes(kickoff) - 5)} · Anpfiff ${kickoff}`);
  }
  if (sub.name === "anzeigen") {
    const p = (await get("zeitplan")) || {};
    return eph("🗓️ **Wochenplan** (Wiener Zeit)\n\n" + DAYS.map((d, k) => { const e = p[k + 1]; return e ? `**${d}** → <#${e.channelId}> · Anpfiff ${e.kickoff} · ${e.advance ? `Liste für nächste Woche nach dem Cup ab ${e.post}` : `Liste am selben Tag um ${e.post}`}` : `**${d}** → –`; }).join("\n"));
  }
  if (sub.name === "woche") {
    const m = String(o.start || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return eph("Startdatum bitte so angeben: `29.10.2026`");
    const kickoff = parseTime(o.anpfiff ?? "20:00"), post = parseTime(o.posten ?? "23:00");
    if (!kickoff || !post) return eph("Uhrzeiten bitte so angeben: `20:00`");
    if (toMinutes(post) <= toMinutes(kickoff)) return eph("Die neue Liste muss **nach** dem Anpfiff gepostet werden (z. B. 23:00), sonst kollidiert sie mit dem laufenden Cup.");
    return background(i, context, async () => {
      const lines = await F.setupWeek({ startY: Number(m[3]), startMo: Number(m[2]), startD: Number(m[1]), kickoff, post, name: (o.name ?? "Bomber Cup").trim() });
      return `🗓️ **Woche eingerichtet** – Anpfiff jeden Tag um ${kickoff}\n\n${lines.join("\n")}\n\n🔁 **Ab jetzt automatisch:** Nach jedem Cup wird um **${post}** die Liste für denselben Tag **nächste Woche** gepostet (ist der Cup um ${post} noch nicht vorbei, kommt sie direkt danach).`;
    });
  }
  if (sub.name === "entfernen") {
    await mutate("zeitplan", (p) => { delete p[o.tag]; }, { initial: {} });
    return eph(`✅ ${DAYS[o.tag - 1]} entfernt.`);
  }
  if (sub.name === "jetzt-posten") {
    return background(i, context, async () => {
      const e = ((await get("zeitplan")) || {})[o.tag];
      if (!e) throw new Error(`Für ${DAYS[o.tag - 1]} ist nichts eingestellt.`);
      const n = nextOccurrence(o.tag, e.kickoff, 62 * 60000);
      if (!n) throw new Error("Kein passender Termin gefunden.");
      await F.launchTournament({ channelId: e.channelId, name: `${e.name} · ${DAYS[o.tag - 1]}, ${shortDate(n.mo, n.d)}`, day: DAYS[o.tag - 1], date: shortDate(n.mo, n.d), times: F.timesFromKickoff(n.ms) }, { replace: true });
      await mutate("zeitplan", (p) => { if (p[o.tag]) p[o.tag].lastPosted = dateKey(n.y, n.mo, n.d); }, { initial: {} });
      return `✅ Liste für ${DAYS[o.tag - 1]}, ${shortDate(n.mo, n.d)} in <#${e.channelId}> gepostet.`;
    });
  }
  return eph("Unbekannter Befehl.");
}

async function manualCup(i, context) {
  const o = opts(i.data.options);
  const kickoff = parseVienna(o.anpfiff);
  if (!kickoff) return eph("Anpfiff bitte so angeben: `31.10.2026 20:00`");
  if (kickoff - 60 * 60000 < Date.now() + 2 * 60000) return eph("Der Anmeldeschluss (60 Min. vor Anpfiff) muss in der Zukunft liegen.");
  return background(i, context, async () => {
    const cfg0 = await getConfig();
    const target = cfg0.channels?.signup || i.channel_id; // Anmelde-Kanal, sonst der aktuelle Kanal
    let t = await F.launchTournament({ channelId: target, name: o.name.trim(), times: F.timesFromKickoff(kickoff) });
    
    return `✅ **${t.name}** ist erstellt.${o.nur_mit_ticket ? "\n🎫 Sonderturnier: Anmelden kann nur, wer ein Sonderturnier-Ticket hat. Es wird beim Check-in eingelöst." : ""}`;
  });
}

async function admin(i, context, cfg) {
  const sub = i.data.options[0], o = opts(sub.options);
  if (sub.name === "anmeldeschluss") return background(i, context, async () => { const t = await get(tKey(i.channel_id)); if (!t || t.status !== "anmeldung") throw new Error("In diesem Kanal ist keine Anmeldung offen."); await F.doDraw(i.channel_id); return "✅ Anmeldung geschlossen und ausgelost."; });
  if (sub.name === "checkin-ende") return background(i, context, async () => { const t = await resolveTournament(i); if (t.status !== "checkin") throw new Error("Es läuft gerade kein Check-in."); await F.doCheckinEnd(t.channelId); await F.doKickoff(t.channelId); if (t.test) await F.playVirtualMatches(t.channelId); return "✅ Check-in beendet – Spieltag 1 ist sofort freigegeben."; });
  if (sub.name === "spiele") {
    const t = await resolveTournament(i);
    const open = T.currentMatches(t).filter((m) => m.status !== "fertig");
    if (!open.length) return eph("Keine offenen Spiele.");
    return eph(open.map((m) => `${V.matchLine(m)}${Object.keys(m.reports).length ? `\n  ↳ ${Object.entries(m.reports).map(([c, r]) => `${V.esc(c)}: ${r.h}:${r.a}${r.pen ? ` (${r.pen.join(":")} i.E.)` : ""}`).join(" | ")}` : ""}`).join("\n").slice(0, 1900));
  }
  if (sub.name === "ergebnis") {
    return background(i, context, async () => {
      const pen = o.elfmeter ? T.parseScore(o.elfmeter) : null;
      if (o.elfmeter && !pen) throw new Error("Elfmeter bitte so angeben: `4:3`");
      const t0 = await resolveTournament(i);
      const { value: t, result } = await mutate(tKey(t0.channelId), (t) => { const m = T.adminSet(t, o.spiel, o.heim, o.gast, pen); return { id: m.id, events: T.advance(t) }; });
      const m = t.matches.find((x) => x.id === result.id);
      await F.afterResult(t, m, result.events, true);
      return `✅ Spiel #${m.id} festgelegt: ${V.matchLine(m, false)}`;
    });
  }
  if (sub.name === "freilos-hinzufügen" || sub.name === "freilos-entfernen") {
    const add = sub.name === "freilos-hinzufügen";
    const { value: t, result: count } = await mutate(tKey(i.channel_id), (t) => (add ? T.addFreilos(t) : T.removeFreilos(t)), { missing: "In diesem Kanal gibt es gerade keine Anmeldung – bitte im Tageskanal benutzen." });
    later(context, () => F.refreshSignup(t));
    return eph(`🎟️ ${add ? "Freilos hinzugefügt" : "Freilos entfernt"} – jetzt ${count} ${count === 1 ? "Freilos" : "Freilose"} in der Liste.`);
  }
  if (sub.name === "abbrechen") return background(i, context, async () => { const t = await resolveTournament(i); await F.cancelTournament(t.channelId); return "✅ Turnier abgebrochen, Rollen werden entfernt."; });
  if (sub.name === "ea-verknüpfen") {
    return background(i, context, async () => {
      const name = Object.keys(await getClubs()).find((c) => c.toLowerCase() === String(o.verein).trim().toLowerCase());
      if (!name) throw new Error("Diesen Verein gibt es nicht. Bitte genau wie in der Übersicht schreiben.");
      const id = o.ea_id ? String(o.ea_id).trim() : null;
      if (id && !/^\d{1,12}$/.test(id)) throw new Error("Die EA-Club-ID besteht nur aus Ziffern.");
      const r = await EAF.linkEaClub(name, { force: true, id });
      await F.refreshOverview().catch(() => {});
      if (r.found) return `✅ ${flagOf(name)} **${V.esc(name)}** ist mit EA verknüpft${r.found.name ? ` → **${V.esc(r.found.name)}**` : ""} (ID ${r.found.id}).`;
      return r.err ? `⚠️ EA ist gerade nicht erreichbar (${r.err}). Später nochmal probieren oder die ID direkt angeben.` : `⚠️ Für ${flagOf(name)} **${V.esc(name)}** wurde bei EA kein eindeutiger Club gefunden. Namen prüfen oder die EA-Club-ID mit \`ea_id\` direkt eintragen.`;
    });
  }
  if (sub.name === "ea-status") {
    return background(i, context, async () => {
      const t = (await F.activeTournament()) || (await EAF.latestTournament(i.channel_id));
      if (!t) throw new Error("Es gibt noch kein Turnier.");
      return `🎮 **EA-Daten fürs TOTT · ${t.name}**${EAF.eaEnabled() ? "" : "\n⛔ Das TOTT ist ausgeschaltet (EA_AUTO=0)."}\n${await EAF.eaStatus(t)}`.slice(0, 1990);
    });
  }
  if (sub.name === "abmelden") {
    return background(i, context, async () => {
      const name = Object.keys(await getClubs()).find((c) => c.toLowerCase() === String(o.verein).trim().toLowerCase());
      if (!name) throw new Error("Diesen Verein gibt es nicht. Bitte genau wie in der Liste schreiben.");
      const ch = o.tag ? ((await get("zeitplan")) || {})[o.tag]?.channelId : i.channel_id;
      if (!ch) throw new Error(`Für ${DAYS[o.tag - 1]} ist kein Tageskanal eingestellt.`);
      const t0 = await get(tKey(ch));
      if (!t0) throw new Error(o.tag ? `Für ${DAYS[o.tag - 1]} gibt es gerade keine Anmeldeliste.` : "In diesem Kanal gibt es keine Anmeldeliste – gib den Tag an, z. B. `tag: Montag`.");
      const { value: t } = await mutate(tKey(ch), (t) => {
        if (t.status === "anmeldung") return T.unregister(t, name);
        if (t.status === "checkin" && t.wait?.includes(name)) { t.wait = t.wait.filter((c) => c !== name); t.waitChecked = (t.waitChecked || []).filter((c) => c !== name); return; }
        throw new Error(t.status === "checkin" ? "Nach der Auslosung kann nur noch die Warteliste bearbeitet werden. Spielt das Team schon mit, lass es nicht einchecken – es wird dann automatisch ersetzt." : "Die Anmeldung ist schon vorbei.");
      });
      await F.refreshSignup(t);
      const users = F.membersOf(await getClubs(), name);
      if (users.length) await (await import("../lib/notify.mjs")).notify(users, { embeds: [{ color: COLOR, title: `${flagOf(name)} Von der Anmeldung entfernt`, description: `Eure Mannschaft **${name}** wurde von der Turnierleitung aus der Liste für **${t.name}** entfernt.${o.grund ? `\n**Grund:** ${o.grund}` : ""}` }] });
      return `✅ ${flagOf(name)} **${V.esc(name)}** wurde aus der Liste entfernt${users.length ? " und benachrichtigt" : ""}.`;
    });
  }
  if (sub.name === "coins") {
    return background(i, context, async () => {
      const name = Object.keys(await getClubs()).find((c) => c.toLowerCase() === String(o.verein).trim().toLowerCase());
      if (!name) throw new Error("Diesen Verein gibt es nicht. Bitte genau wie in der Übersicht schreiben.");
      const now = await SH.adminCoins(name, Number(o.betrag), o.grund?.trim() || "");
      return `💰 ${flagOf(name)} **${V.esc(name)}** ${o.betrag >= 0 ? "+" : ""}${o.betrag} 🪙 → Kasse: **${now}** 🪙`;
    });
  }
  if (sub.name === "testcup-start") {
    return background(i, context, async () => {
      const size = Number(o.teams || 8);
      const r = await F.startTestCup(i.channel_id, uidOf(i), size);
      return `🧪 **Test-Cup erstellt** (${size} Teams).\n${r.mine ? `• Deine Mannschaft: ${flagOf(r.mine.club)} **${V.esc(r.mine.club)}** – du bekommst echte Gruppen- und KO-Rollen.` : "• ⚠️ Du hast keine eigene Mannschaft – registrier dich als Manager, damit du die Rollen mittesten kannst."}\n• ${r.virtual.length} Test-Teams (automatisch eingecheckt, spielen gegeneinander von selbst)\n\n**So geht's weiter:**\n1. \`/cup-admin anmeldeschluss\` → Auslosung\n2. Im Gruppenkanal einchecken, dann \`/cup-admin checkin-ende\`\n3. Deine Spiele über die Knöpfe melden (der Test-Gegner bestätigt nach 2 Min. automatisch) oder \`/cup-admin ergebnis\`\n4. \`/cup-admin testcup-weiter\` spielt die Test-Spiele sofort, sonst passiert es jede Minute von selbst\n5. \`/cup-admin rollen-check\` zum Prüfen der Rollen\n-# Keine Statistik, keine Trophäen, kein TOTT. Abbrechen: \`/cup-admin abbrechen\`.`;
    });
  }
  if (sub.name === "testcup-weiter") {
    return background(i, context, async () => {
      const t = await F.activeTournament();
      if (!t?.test) throw new Error("Gerade läuft kein Test-Cup (oder er ist noch nicht ausgelost).");
      const n = await F.playVirtualMatches(t.channelId);
      return n ? `🧪 ${n} Test-Spiele gespielt.` : "🧪 Gerade gibt es keine offenen Spiele zwischen Test-Teams – jetzt bist du dran (oder der Check-in läuft noch).";
    });
  }
  if (sub.name === "rollen-check") {
    return background(i, context, async () => {
      const { listMembers } = await import("../lib/discord.mjs");
      const M = await import("../lib/maintenance.mjs");
      const members = await listMembers();
      if (!members) return "❌ Ich kann die Mitgliederliste nicht lesen. Im Discord Developer Portal unter *Bot* den **Server Members Intent** einschalten – ohne den kann ich fehlende Rollen weder erkennen noch nachholen.";
      const r = await M.cupRoleDiff(members, { includePending: true });
      if (!r) return "Gerade läuft kein Cup mit Gruppen- oder K.-o.-Phase.";
      const q = (await get("rolequeue")) || [];
      const head = `🔎 **Rollen-Check · ${r.t.name}**\n📥 Warteschlange: **${q.length}** offene Rollen-Änderungen${q.length ? ` (nächster Versuch <t:${Math.ceil(Math.min(...q.map((o) => o.nextAt || Date.now())) / 1000)}:R>)` : ""}`;
      if (!r.missing.length) return `${head}\n✅ Alle Teilnehmer haben genau die richtigen Turnier-Rollen.`;
      const lines = r.missing.slice(0, 25).map((x) => x.gone
        ? `• <@${x.u}> (${V.esc(x.club || "?")}) – **nicht mehr auf dem Server**`
        : `• <@${x.u}> (${V.esc(x.club || "?")})${x.add.length ? ` fehlt: ${x.add.map((id) => `<@&${id}>`).join(" ")}` : ""}${x.rem.length ? ` zu viel: ${x.rem.map((id) => `<@&${id}>`).join(" ")}` : ""}${x.pending ? " ⏳" : ""}`);
      await enqueue(r.ops.map((o) => ({ ...o, why: "Rollen-Check" })));
      await processQueue(8000);
      return `${head}\n⚠️ **${r.missing.length} Abweichungen** – ich korrigiere sie jetzt:\n${lines.join("\n")}${r.missing.length > 25 ? `\n… und ${r.missing.length - 25} weitere` : ""}\n-# ⏳ = war schon in der Warteschlange. Führ den Check in 1–2 Minuten nochmal aus. Bleibt jemand übrig, steht die Bot-Rolle wahrscheinlich unter dieser Rolle (Servereinstellungen → Rollen → Bot-Rolle nach oben ziehen).`.slice(0, 1990);
    });
  }
  if (sub.name === "willkommen-test") {
    if (!cfg.channels.welcome) return eph("Der Willkommens-Kanal ist noch nicht verknüpft: `/cup-einrichten kanal typ: Willkommen`.");
    return background(i, context, async () => {
      const m = await sendMessage(cfg.channels.welcome, V.welcomePost(uidOf(i), cfg.channels));
      return m ? `✅ Test-Begrüßung in <#${cfg.channels.welcome}> gepostet.` : "❌ Ich konnte im Willkommens-Kanal nicht posten – fehlen dem Bot dort die Rechte „Nachrichten senden“ und „Links einbetten“?";
    });
  }
  if (sub.name === "tott") {
    return background(i, context, async () => {
      const t = await EAF.latestTournament(i.channel_id);
      if (!t) throw new Error("Es gibt noch kein Turnier mit Anpfiff.");
      const r = await EAF.postTott(t, { force: true });
      return r.posted ? `✅ TOTT für **${t.name}** in <#${r.channel}> gepostet.` : `⚠️ TOTT nicht gepostet: ${r.reason}.`;
    });
  }
  if (sub.name === "verein-freigeben") {
    return background(i, context, async () => {
      const name = Object.keys(await getClubs()).find((c) => c.toLowerCase() === String(o.verein).trim().toLowerCase());
      if (!name) throw new Error("Diesen Verein gibt es nicht. Bitte genau wie in der Übersicht schreiben.");
      const r = await F.releaseClub(name, { reason: "Von der Turnierleitung freigegeben" });
      return r ? `✅ ${flagOf(name)} ${name} ist wieder frei.` : "Dieser Verein war gar nicht vergeben.";
    });
  }
  return eph("Unbekannter Befehl.");
}

// ---------- Ergebnis melden ----------
async function resultOpen(i) {
  const t = await resolveTournament(i);
  const mine = F.clubOfUser(await getClubs(), uidOf(i));
  if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
  const open = T.openMatchesOf(t, mine.club);
  if (!open.length) return eph("Deine Mannschaft hat gerade kein offenes Spiel.");
  if (open.length === 1) return V.resultModal(open[0], T.koRoundName(t));
  return { type: 4, data: { flags: 64, ...V.matchPicker(open) } };
}

// ---------- Buttons & Menüs ----------
async function component(i, context) {
  const cfg = await getConfig();
  const id = i.data.custom_id, uid = uidOf(i);
  if (id.startsWith("adm:")) return adminPanelClick(i, context, cfg);
  if (id === "rules_edit" || id === "rules_edsel") {
    if (!isAdmin(i, cfg)) return eph("Das Regelwerk darf nur die **Turnierleitung** bearbeiten.");
    const R = await F.rulesText();
    if (id === "rules_edit") return eph("", V.rulesEditMenu(R));
    const which = i.data.values?.[0];
    if (which === "reaccept") return background(i, context, async () => { await F.saveRulesText((r) => { r.version = (r.version || 0) + 1; }); await F.refreshRulesPanel(); return "🔁 Erledigt – **alle Mitglieder müssen das Regelwerk neu akzeptieren**, bevor sie sich wieder anmelden können."; }, { update: true });
    if (which === "reset") return background(i, context, async () => { const v = (await F.rulesText()).version || 0; await del("rulestext"); if (v) await set("rulestext", { ...(await F.rulesText()), version: v }); await F.refreshRulesPanel(); return "↩️ Standard-Regelwerk wiederhergestellt."; }, { update: true });
    return V.rulesEditModal(which, R);
  }
  if (id === "reg_eapick" || id === "team_eapick") {
    const eaId = i.data.values?.[0];
    const opt = i.message?.components?.[0]?.components?.[0]?.options?.find((o) => o.value === eaId);
    const ea = { id: eaId, name: opt?.label || null };
    return background(i, context, async () => {
      const clubs = await getClubs();
      if (Object.values(clubs).some((c) => String(c.eaId) === String(eaId))) return "Dieser EA-Club ist schon bei einem anderen Team eingetragen.";
      if (id === "team_eapick") { const mine = F.clubOfUser(clubs, uid); if (!mine) return "Du bist keiner Mannschaft zugeordnet."; return setTeamEa(mine.club, ea); }
      const d = await get(`regdraft:${uid}`);
      if (!d) return "Die Registrierung ist abgelaufen – bitte nochmal auf *Mannschaft registrieren* klicken.";
      await del(`regdraft:${uid}`).catch(() => {});
      return createTeam(i, uid, d.name, ea, d.logo);
    }, { update: true });
  }

  // --- Shop ---
  if (id.startsWith("shop_")) return shopComponent(i, context, id, uid);
  // --- Support-Tickets ---
  if (id.startsWith("tk_")) return ticketComponent(i, context, cfg, id, uid);
  // --- Staff-Bewerbungen ---
  if (id.startsWith("ap_")) return applyComponent(i, context, id, uid);

  // --- Trophäenhalle ---
  if (id === "stats_me") return eph(await (await import("../lib/trophies.mjs")).myStats(uid));

  // --- Zurücksetzen ---
  if (id === "reset_no") return reply(i, { content: "Abgebrochen – nichts wurde verändert.", components: [] });
  if (id.startsWith("reset_ok:")) {
    if (!isAdmin(i, cfg)) return reply(i, { content: "Das darf nur die Turnierleitung.", components: [] });
    const scope = id.split(":")[1];
    return background(i, context, async () => {
      const r = await AS.resetBot(scope);
      if (scope === "stats") { await F.refreshTeamStats().catch(() => {}); return "✅ **Statistik zurückgesetzt.** Die Team-Statistiken starten wieder bei null."; }
      return `✅ **${scope === "all" ? "Alles" : "Einrichtung"} zurückgesetzt.** ${r.deleted} Panel-Posts gelöscht${scope === "all" ? `, ${r.nicks} Spitznamen zurückgesetzt` : ""}.\nNeu einrichten mit \`/cup-einrichten alles\`.`;
    }, { update: true });
  }

  // --- Rollenauswahl ---
  if (id === "role_player") {
    if (hasRole(i, cfg.roles.manager)) return eph("Du bist Manager – die Spieler-Rolle brauchst du nicht zusätzlich.");
    if (hasRole(i, cfg.roles.spieler)) {
      // Zweiter Klick: Rolle wieder entfernen
      await enqueue([{ u: uid, rem: [cfg.roles.spieler], why: "Rollenauswahl: Spieler abgewählt" }]);
      later(context, () => processQueue(3000));
      return eph("➖ Die Rolle **Spieler** wurde entfernt.\n-# Ohne Rolle siehst du nur noch Willkommen, Regelwerk und Rollenauswahl. Ein Klick auf „Spieler werden“ gibt sie dir zurück.");
    }
    await enqueue([{ u: uid, add: [cfg.roles.spieler], why: "Rollenauswahl: Spieler" }]);
    later(context, () => processQueue(3000));
    return eph("✅ Du hast jetzt die Rolle **Spieler**. Viel Spaß bei der Bomber Cup!");
  }
  if (id === "role_manager") {
    if (hasRole(i, cfg.roles.manager)) {
      // Zweiter Klick: erst nachfragen, weil dabei der Verein abgegeben wird
      const mine = F.clubOfUser(await getClubs(), uid);
      const what = !mine ? "" : mine.role === "co"
        ? `\nDu bist dann nicht mehr Co-VM von ${flagOf(mine.club)} **${V.esc(mine.club)}**.`
        : coIds(mine.data).length ? `\nDein Verein ${flagOf(mine.club)} **${V.esc(mine.club)}** geht an deinen Co-VM <@${coIds(mine.data)[0]}>.` : `\n⚠️ Dein Verein ${flagOf(mine.club)} **${V.esc(mine.club)}** wird **frei** und kann von jemand anderem übernommen werden.`;
      return { type: 4, data: { flags: 64, allowed_mentions: { parse: [] }, content: `**Manager-Rolle wirklich abgeben?**${what}\nDu bekommst stattdessen die Rolle **Spieler**.`, components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "role_manager_keep" }, { type: 2, style: 4, label: "Ja, abgeben", custom_id: "role_manager_off" }] }] } };
    }
    const b = await B.findBan([uid]);
    if (b) return eph(`❌ Du ${banText(b).replace(/^ist/, "bist")} und kannst gerade nicht Manager werden.`);
    await enqueue([{ u: uid, add: [cfg.roles.manager], rem: [cfg.roles.spieler], why: "Rollenauswahl: Manager" }]);
    later(context, () => processQueue(3000));
    return eph(`✅ Du bist jetzt **Manager**! Die Spieler-Rolle wurde entfernt.\nSuch dir jetzt deinen Verein aus${cfg.channels.reg ? ` in <#${cfg.channels.reg}>` : ""}.`);
  }

  if (id === "role_manager_keep") return reply(i, { content: "👍 Du bleibst Manager.", components: [] });
  if (id === "role_manager_off") {
    if (!hasRole(i, cfg.roles.manager)) return reply(i, { content: "Du bist kein Manager mehr.", components: [] });
    return background(i, context, async () => {
      const mine = F.clubOfUser(await getClubs(), uid);
      if (mine?.role === "manager") await F.releaseClub(mine.club, { transferToCo: true, reason: "Manager-Rolle abgegeben" });
      if (mine?.role === "co") {
        const orig = coList(mine.data).find((x) => x.id === uid)?.orig ?? null;
        await mutate("clubs", (cl) => { if (cl[mine.club]) removeCo(cl[mine.club], uid); }, { initial: {} });
        await setNick(uid, orig);
        await F.refreshOverview();
      }
      await enqueue([{ u: uid, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: "Rollenauswahl: Manager abgegeben" }]);
      await processQueue(3000);
      return `➖ Du bist kein Manager mehr${mine ? ` – ${mine.role === "co" ? "Co-VM-Platz" : "Verein"} abgegeben` : ""}. Du hast jetzt die Rolle **Spieler**.`;
    }, { update: true });
  }

  // --- Regelwerk ---
  if (id.startsWith("lang:")) {
    const [, panel, lang] = id.split(":");
    await L.setLang(uid, lang);
    let p = null;
    if (panel === "roles") p = V.rolesPanel();
    else if (panel === "team") p = V.teamPanel();
    else if (panel === "ticket") p = SUP.ticketPanel();
    else if (panel === "apply") p = SUP.applyPanel(await SUP.applicationsOpen().catch(() => true));
    else if (panel === "signup") { const t = await get(tKey(i.channel_id)); if (t) { const clubs = await getClubs(); p = V.signupPanel(t, clubs, await (await import("../lib/premium.mjs")).premiumClubNames(clubs)); } }
    const note = { de: "🇩🇪 Sprache: **Deutsch** – private Antworten des Bots kommen jetzt auf Deutsch.", en: "🇬🇧 Language: **English** – the bot's private replies are now in English.", tr: "🇹🇷 Dil: **Türkçe** – botun özel yanıtları artık Türkçe." }[lang] || "";
    if (!p) return eph(note);
    const isV2 = ((p.flags ?? 0) & (1 << 15)) !== 0;
    const body = isV2 ? { ...p, flags: (1 << 15) | 64 } : { ...p, content: note, flags: 64 };
    if (Array.isArray(body.components)) body.components = body.components.map((c) => (c?.type === 17 ? { ...c, components: c.components.filter((x) => !(x.type === 1 && x.components?.some((b) => String(b.custom_id || "").startsWith("lang:")))) } : c)).filter((c) => !(c?.type === 1 && c.components?.some((b) => String(b.custom_id || "").startsWith("lang:"))));
    return { type: 4, data: L.localize({ allowed_mentions: { parse: [] }, ...body }, lang) };
  }
  if (id.startsWith("rules_lang:")) {
    const lang = id.split(":")[1];
    await L.setLang(uid, lang);
    const { RULES_BY_LANG } = await import("../lib/rules-i18n.mjs");
    return eph("", V.rulesTranslated(RULES_BY_LANG[lang] || RULES_BY_LANG.en, lang));
  }
  if (id === "rules_ok") {
    if (await F.rulesAccepted(uid)) return eph("✅ Du hast das Regelwerk bereits akzeptiert.");
    await F.acceptRules(uid);
    later(context, F.refreshRulesPanel);
    return eph("✅ Danke! Du hast das Regelwerk akzeptiert und kannst dich jetzt zum Cup anmelden.");
  }

  // --- Registrierung ---
  if (id.startsWith("reg_lang:")) {
    const lang = id.split(":")[1];
    await L.setLang(uid, lang);
    return { type: 4, data: { ...V.regPanel(await getClubs(), lang), flags: (1 << 15) | 64 } }; // nur für den Klickenden
  }
  if (id === "reg_start" || id.startsWith("reg_start:") || id.startsWith("reg_league:") || id.startsWith("reg_club:")) {
    if (!hasRole(i, cfg.roles.manager)) return reply(i, { content: "Mannschaften registrieren können nur Mitglieder mit der Rolle **Manager**." });
    const clubs = await getClubs();
    const mine = F.clubOfUser(clubs, uid);
    if (mine) return reply(i, { content: mine.role === "co" ? `Du bist Co-VM von **${V.esc(mine.club)}** und kannst keine eigene Mannschaft registrieren.` : `Du bist bereits Manager von ${flagOf(mine.club)} **${V.esc(mine.club)}**.`, components: [] });
    return V.regModal(id.startsWith("reg_start:") ? id.split(":")[1] : "de"); // eigene Mannschaft: Name + EA-Club
  }

  // --- Meine Mannschaft ---
  if (id.startsWith("team_")) {
    const clubs = await getClubs();
    const mine = F.clubOfUser(clubs, uid);
    if (!mine) return reply(i, { content: hasRole(i, cfg.roles.manager) ? "Du hast noch keine Mannschaft – registriere dich in Team-registrieren." : "Das können nur Mitglieder mit der Rolle **Manager**.", embeds: [], components: [] });
    const teamStats = ((await get("stats")) || {}).clubs || {};
    const detail = (c, note) => ({ ...V.teamDetail(c.club, c.data, c.role, daysBetween(SH.lastActiveKey(c.data, todayKey), todayKey()), teamStats[c.club]), content: note || "" });
    if (id === "team_open") return reply(i, detail(mine));
    if (id === "team_ea") return V.eaIdModal("team_ea_m", "EA-Club ändern", mine.data.eaName || mine.data.ea || "");
    if (id === "team_stream") return V.streamModal(mine.data.stream || "");
    if (mine.role === "co") {
      if (id === "team_co_quit") {
        const orig = coList(mine.data).find((x) => x.id === uid)?.orig ?? null;
        await mutate("clubs", (cl) => { if (cl[mine.club]) removeCo(cl[mine.club], uid); }, { initial: {} });
        await enqueue([{ u: uid, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: "Als Co-VM ausgetreten" }]);
        later(context, async () => { await setNick(uid, orig); await F.refreshOverview(); });
        return reply(i, { content: `Du bist als Co-VM von ${flagOf(mine.club)} **${V.esc(mine.club)}** ausgetreten.`, embeds: [], components: [] });
      }
      return reply(i, { content: "Das kann nur der Manager der Mannschaft.", embeds: [], components: [] });
    }
    if (id === "team_co_add") {
      if (coIds(mine.data).length >= MAX_CO) return reply(i, detail(mine, `Ihr habt schon ${MAX_CO} Co-VMs – mehr gehen nicht.`));
      return reply(i, V.coSelect());
    }
    if (id === "team_co_pick") {
      const target = i.data.values?.[0];
      const user = i.data.resolved?.users?.[target];
      if (!target || target === uid) return reply(i, { ...V.coSelect(), content: "Du kannst dich nicht selbst als Co-VM eintragen." });
      if (user?.bot) return reply(i, { ...V.coSelect(), content: "Bots können keine Co-VMs sein." });
      if (F.clubOfUser(clubs, target)) return reply(i, { ...V.coSelect(), content: "Dieses Mitglied gehört schon zu einer Mannschaft." });
      if (coIds(mine.data).length >= MAX_CO) return reply(i, detail(mine, `Ihr habt schon ${MAX_CO} Co-VMs – mehr gehen nicht.`));
      const tb = await B.findBan([target]);
      if (tb) return reply(i, { ...V.coSelect(), content: `<@${target}> ${banText(tb)} und kann gerade kein Co-VM werden.` });
      const tm = i.data.resolved?.members?.[target];
      const coBase = baseNameOf(tm, user);
      const { value, result: added } = await mutate("clubs", (cl) => {
        const c = cl[mine.club];
        if (c?.manager !== uid || coIds(c).length >= MAX_CO) return false;
        addCo(c, { id: target, base: coBase, orig: tm?.nick ?? null });
        return true;
      }, { initial: {} });
      if (!added) return reply(i, detail({ ...mine, data: value[mine.club] || mine.data }, `Ihr habt schon ${MAX_CO} Co-VMs – mehr gehen nicht.`));
      await enqueue([{ u: target, add: [cfg.roles.manager], rem: [cfg.roles.spieler], why: `Co-VM von ${mine.club}` }]);
      later(context, async () => { await setNick(target, nickFor(coBase, "co", mine.club, value[mine.club]?.badge)); await F.refreshOverview(); });
      return reply(i, detail({ ...mine, data: value[mine.club] }, `✅ <@${target}> ist jetzt Co-VM – Rolle Manager vergeben, Rolle Spieler entfernt.`));
    }
    if (id === "team_co_rem" || id === "team_co_rem_pick") {
      const cos = coList(mine.data);
      if (!cos.length) return reply(i, detail(mine));
      if (id === "team_co_rem" && cos.length > 1) return reply(i, V.coRemoveSelect(cos));
      const co = id === "team_co_rem_pick" ? i.data.values?.[0] : cos[0].id;
      const entry = cos.find((x) => x.id === co);
      if (!entry) return reply(i, detail(mine, "Dieser Co-VM ist nicht mehr eingetragen."));
      const orig = entry.orig ?? null;
      const { value } = await mutate("clubs", (cl) => { if (cl[mine.club]) removeCo(cl[mine.club], co); }, { initial: {} });
      await enqueue([{ u: co, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: `Co-VM von ${mine.club} entfernt` }]);
      later(context, async () => { await setNick(co, orig); await F.refreshOverview(); });
      return reply(i, detail({ ...mine, data: value[mine.club] }, `✅ <@${co}> ist kein Co-VM mehr – Rolle Manager entfernt, Rolle Spieler wieder vergeben.`));
    }
    const busy = async () => { for (const t of await F.allTournaments()) if (!["fertig", "abgesagt", "geloescht"].includes(t.status) && (t.reg.includes(mine.club) || t.playing.includes(mine.club))) return true; return false; };
    if (id === "team_leave") return reply(i, V.confirmView(coIds(mine.data).length ? `Mannschaft verlassen? <@${coIds(mine.data)[0]}> wird neuer Manager.` : `Mannschaft verlassen? ${V.esc(mine.club)} wird für alle frei.`, "team_leave_ok", "Verlassen"));
    if (id === "team_del") return reply(i, V.confirmView(`Mannschaft wirklich löschen? ${V.esc(mine.club)} wird für alle frei, und eure Statistiken werden gelöscht. Das kann nicht rückgängig gemacht werden.`, "team_del_ok", "Endgültig löschen"));
    if (id === "team_leave_ok" || id === "team_del_ok") {
      if (await busy()) return reply(i, { content: "Während eure Mannschaft für einen Cup angemeldet ist, geht das nicht. Meldet euch zuerst ab oder wartet bis nach dem Cup.", embeds: [], components: [] });
      later(context, () => F.releaseClub(mine.club, { transferToCo: id === "team_leave_ok", reason: id === "team_del_ok" ? "Mannschaft gelöscht" : "Manager hat die Mannschaft verlassen" }));
      return reply(i, { content: id === "team_del_ok" ? `Mannschaft gelöscht. ${V.esc(mine.club)} ist wieder frei.` : coIds(mine.data).length ? `Du hast die Mannschaft verlassen. <@${coIds(mine.data)[0]}> ist jetzt Manager.` : `Du hast die Mannschaft verlassen. ${V.esc(mine.club)} ist wieder frei.`, embeds: [], components: [] });
    }
  }

  // --- Anmeldeliste ---
  if (id === "cup_join" || id === "cup_leave" || id === "cup_waitci") {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph(hasRole(i, cfg.roles.manager) ? "Du brauchst zuerst eine Mannschaft – registriere dich in Team-registrieren." : "Anmelden können nur Manager mit einer Mannschaft.");
    if (id !== "cup_leave") {
      const b = await B.findBan(F.membersOf(await getClubs(), mine.club));
      if (b) return eph(`❌ ${flagOf(mine.club)} **${V.esc(mine.club)}** kann sich nicht anmelden: <@${b.user}> ${banText(b)}.`);
    }
    if (id === "cup_join" && !(await F.rulesAccepted(uid))) return eph(`📜 Bitte akzeptiere zuerst das Regelwerk${cfg.channels.rules ? ` in <#${cfg.channels.rules}>` : ""} – danach kannst du deine Mannschaft anmelden.`);
    if (id === "cup_join" && (await get(tKey(i.channel_id)))?.ticketOnly && !(mine.data.tickets > 0)) return eph(`🎫 Das ist ein **Sonderturnier** – zum Anmelden braucht ${flagOf(mine.club)} **${V.esc(mine.club)}** ein **Sonderturnier-Ticket** aus dem Shop${cfg.channels.shop ? ` in <#${cfg.channels.shop}>` : ""} (${SH.ITEMS.ticket.price.toLocaleString("de-DE")} 🪙).`);
    const { value: t, result } = await mutate(tKey(i.channel_id), (t) => {
      if (id === "cup_join") { const pos = T.register(t, mine.club); const f = T.fmtOf(t.reg.length); return f && pos > f ? `${flagOf(mine.club)} **${V.esc(mine.club)}** ist angemeldet – **Warteliste Platz ${pos - f}**.` : `${flagOf(mine.club)} **${V.esc(mine.club)}** ist angemeldet – Platz ${pos}.`; }
      if (id === "cup_leave") { T.unregister(t, mine.club); return "Deine Mannschaft wurde abgemeldet."; }
      const r = T.checkIn(t, mine.club); return r === "warteliste" ? "✅ Auf der Warteliste eingecheckt – du rückst nach, falls eine Mannschaft nicht eincheckt." : "✅ Eingecheckt.";
    }, { missing: "In diesem Kanal gibt es gerade keine Anmeldung." });
    later(context, () => F.refreshSignup(t));
    return eph(result);
  }

  // --- Check-in in der Gruppe ---
  if (id === "grp_ci") {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    const t0 = await resolveTournament(i);
    const { value: t } = await mutate(tKey(t0.channelId), (t) => T.checkIn(t, mine.club));
    later(context, () => F.refreshGroupCheckin(t, T.groupOf(t, mine.club)));
    return eph(`✅ ${flagOf(mine.club)} **${V.esc(mine.club)}** ist eingecheckt. Viel Erfolg!`);
  }

  // --- Sperrliste ---
  if (id.startsWith("ban_")) {
    if (!isStaff(i, cfg)) return reply(i, { content: "❌ Sperren können nur die **Turnierleitung** und **Mods**.", components: [] });
    if (id === "ban_start") return reply(i, V.banStep1());
    if (id === "ban_user") {
      const u = i.data.values?.[0];
      if (!u || i.data.resolved?.users?.[u]?.bot) return reply(i, { ...V.banStep1(), content: "Bitte eine echte Person auswählen." });
      return reply(i, V.banStep2(u));
    }
    if (id.startsWith("ban_r:")) return reply(i, V.banStep3(id.split(":")[1], Number(i.data.values[0])));
    if (id.startsWith("ban_d:")) {
      const [, u, r] = id.split(":");
      const clubs = await getClubs(), mine = F.clubOfUser(clubs, u);
      const partners = mine ? F.membersOf(clubs, mine.club).filter((x) => x !== u) : [];
      return reply(i, V.banStep4(u, Number(r), Number(i.data.values[0]), partners));
    }
    if (id.startsWith("ban_note:")) return V.banNoteModal(id.slice("ban_note:".length));
    if (id.startsWith("ban_ok:")) return doBan(i, context, id.slice("ban_ok:".length), "");
    if (id === "ban_lift") { const bans = await B.getActiveBans(); return reply(i, bans.length ? V.banLiftPicker(bans) : { content: "Aktuell ist niemand gesperrt.", components: [] }); }
    if (id === "ban_lift_pick") { const u = i.data.values[0]; later(context, () => B.lift(u, uid)); return reply(i, { content: `✅ Sperre von <@${u}> wird aufgehoben.`, components: [] }); }
  }

  // --- Größenvideo ---
  if (id === "vid_req") {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    return V.videoMinuteModal(VIDEO_WINDOW_MIN);
  }

  // --- Ergebnis ---
  if (id === "res_open") return resultOpen(i);
  if (id.startsWith("res_ok:")) {
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    const matchId = Number(id.split(":")[1]);
    return background(i, context, async () => {
      const t0 = await resolveTournament(i);
      const { value: t, result } = await mutate(tKey(t0.channelId), (t) => { T.confirmPending(t, matchId, mine.club); return T.advance(t); });
      const m = t.matches.find((x) => x.id === matchId);
      await F.afterResult(t, m, result);
      return `✅ Ergebnis bestätigt: ${V.matchLine(m, false)}`;
    });
  }
  if (id === "res_pick") {
    const t = await resolveTournament(i);
    const m = t.matches.find((x) => x.id === Number(i.data.values?.[0]));
    if (!m || m.status === "fertig") return reply(i, { content: "Dieses Spiel ist nicht mehr offen.", components: [] });
    return V.resultModal(m, T.koRoundName(t));
  }
  return eph("Unbekannter Button.");
}

// ---------- Formulare ----------
async function modal(i, context) {
  const cfg = await getConfig();
  const id = i.data.custom_id, uid = uidOf(i), v = modalValues(i);
  if (id.startsWith("admm:")) return adminPanelModal(i, context, cfg, v);
  if (id.startsWith("rules_ed:")) {
    if (!isAdmin(i, cfg)) return eph("Nur für die Turnierleitung.");
    const which = id.split(":")[1], t = String(v.t || "").trim(), x = String(v.x || "").trim();
    let msg = "✅ Regelwerk gespeichert.";
    await F.saveRulesText((r) => {
      if (which === "title") r.title = t || r.title;
      else if (which === "hl") { r.highlight = t || x ? { title: t, text: x } : null; if (!r.highlight) msg = "✅ Roter Hinweis-Kasten entfernt."; }
      else if (which === "new") r.sections.push([t, x]);
      else { const k = Number(which.slice(1)); if (!t && !x) { r.sections.splice(k, 1); msg = "🗑️ Abschnitt gelöscht."; } else r.sections[k] = [t || "\u200b", x || "\u200b"]; }
    });
    later(context, async () => { await F.refreshRulesPanel(); (await import("../lib/botlog.mjs")).botLog(`📜 **Regelwerk geändert** von <@${uid}> (${which})`); });
    return eph(msg + "\n-# Sollen alle neu bestätigen? → *Bearbeiten* → **Alle müssen neu akzeptieren**.");
  }

  if (id === "reg_new") {
    if (!hasRole(i, cfg.roles.manager)) return reply(i, { content: "Nur Mitglieder mit der Rolle **Manager** können registrieren.", components: [] });
    const name = String(v.name || "").replace(/\s+/g, " ").trim();
    const eaName = String(v.ea || "").trim();
    if (name.length < 3) return eph("Der Teamname braucht mindestens 3 Zeichen.");
    if (/^freilos/i.test(name) || /[<>@#`*_~|]/.test(name)) return eph("Dieser Teamname ist nicht erlaubt (keine Sonderzeichen wie @ # * < >).");
    if (eaName.length < 2) return eph("Bitte den **EA-Clubnamen** eintragen – genau wie in EA FC.");
    const clubs0 = await getClubs();
    if (F.clubOfUser(clubs0, uid)) return eph("Du hast bereits eine Mannschaft.");
    if (Object.keys(clubs0).some((k) => k.toLowerCase() === name.toLowerCase())) return eph(`Den Namen **${V.esc(name)}** gibt es schon – bitte einen anderen wählen.`);
    const att = i.data.resolved?.attachments?.[(Array.isArray(v.logo) ? v.logo : [])[0]];
    if (att && !/^image\/(png|jpe?g|webp)$/.test(att.content_type || "")) return eph("Das Logo muss ein **PNG**, **JPG** oder **WEBP** sein.");
    if (att && att.size > 2 * 1024 * 1024) return eph("Das Logo ist zu groß – maximal **2 MB**.");
    return background(i, context, async () => {
      // Logo gleich sichern (Discord-Links laufen ab)
      let logo = null;
      if (att) { const r = await fetch(att.url).catch(() => null); if (r?.ok) logo = { type: att.content_type, b64: Buffer.from(await r.arrayBuffer()).toString("base64") }; }
      // EA-Club per Name suchen
      let res = null;
      try { res = await EA.searchClubs(eaName); } catch { res = null; }
      const taken = new Set(Object.values(await getClubs()).map((c) => String(c.eaId || "")));
      const pick = (l) => l.filter((c) => !taken.has(c.id));
      if (res) {
        const exact = pick(res.exact), all = pick(res.list);
        if (exact.length === 1 || (!exact.length && all.length === 1)) return createTeam(i, uid, name, exact[0] || all[0], logo);
        if (!all.length) return `❌ EA hat keinen freien Club **${V.esc(eaName)}** gefunden. Bitte den Namen **genau wie in EA FC** schreiben (Groß/Klein egal) und nochmal registrieren.`;
        // mehrere Treffer → auswählen lassen
        await set(`regdraft:${uid}`, { name, logo, at: Date.now() });
        return V.eaPick("reg_eapick", exact.length ? exact : all, `🔎 EA hat **${(exact.length ? exact : all).length}** Clubs zu „${V.esc(eaName)}“ gefunden. **Welcher ist deiner?**`);
      }
      // EA nicht erreichbar → Team trotzdem anlegen, ohne Verknüpfung
      return createTeam(i, uid, name, null, logo, eaName);
    });
  }

  if (id.startsWith("tk_m:")) {
    const cat = id.slice(5);
    if (!SUP.TICKET_CATS[cat]) return eph("Unbekannte Kategorie.");
    return background(i, context, async () => {
      const r = await SUP.createTicket({ uid, name: i.member?.user?.username, cat, text: v.text?.trim() || "" });
      return r.existing ? `Du hast schon ein offenes Ticket: <#${r.channelId}>` : `✅ Dein Ticket ist offen: <#${r.channelId}>`;
    }, { update: isEphemeralMsg(i) });
  }
  if (id.startsWith("ap_m:")) {
    const pos = id.slice(5);
    if (!SUP.POSITIONS[pos]) return eph("Unbekannte Position.");
    return background(i, context, async () => {
      const a = await SUP.submitApplication(uid, pos, v);
      return `✅ Deine Bewerbung als **${SUP.POSITIONS[pos].label}** (#${a.id}) ist eingegangen. Die Antwort bekommst du im Benachrichtigungs-Kanal.`;
    }, { update: isEphemeralMsg(i) });
  }
  if (id.startsWith("ap_no_m:")) {
    if (!SUP.isServerAdmin(i.member)) return eph("Über Bewerbungen entscheiden nur Server-Admins.");
    const appId = Number(id.split(":")[1]);
    return background(i, context, async () => { await SUP.decideApplication(appId, false, uid, v.reason?.trim() || ""); return `❌ Bewerbung #${appId} abgelehnt. Die Person wurde benachrichtigt.`; });
  }

  if (id.startsWith("ban_m:")) {
    if (!isStaff(i, cfg)) return reply(i, { content: "❌ Sperren können nur die **Turnierleitung** und **Mods**.", components: [] });
    return doBan(i, context, id.slice("ban_m:".length), v.note?.trim() || "");
  }

  if (id === "vid_min") {
    const min = /^\d{1,3}$/.test((v.min || "").trim()) ? Number(v.min) : null;
    if (min === null) return eph("Bitte die aktuelle Spielminute als Zahl eintragen.");
    if (min > VIDEO_WINDOW_MIN || min < 1) return eph(`⏱️ Größenvideos können nur in den ersten **${VIDEO_WINDOW_MIN} Spielminuten** angefordert werden.`);
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    const t0 = await resolveTournament(i);
    const extra = mine.data.extraVideos || 0; // im Shop gekaufte Extra-Videos
    const { value: t, result } = await mutate(tKey(t0.channelId), (t) => T.requestVideo(t, mine.club, VIDEO_LIMIT + extra, VIDEO_WINDOW_MIN, min));
    const usedExtra = VIDEO_LIMIT + extra - result.left > VIDEO_LIMIT; // diese Anforderung ging über die normalen hinaus
    if (usedExtra) await mutate("clubs", (cl) => { if (cl[mine.club]?.extraVideos > 0) cl[mine.club].extraVideos--; }, { initial: {} });
    later(context, () => F.postVideoRequest(t, result.v, result.m));
    return eph(`✅ Größenvideo bei ${flagOf(result.v.to)} **${V.esc(result.v.to)}** angefordert (${min}. Spielminute).${usedExtra ? " 📏 Dafür wurde ein **Extra-Größenvideo** aus dem Shop verbraucht." : ""} Noch **${result.left}** Anforderungen übrig.`);
  }

  if (id === "team_stream_m") {
    const { parseStream } = await import("../lib/stream.mjs");
    const r = parseStream(v.stream);
    if (r.error) return eph(`❌ ${r.error}`);
    const mine = F.clubOfUser(await getClubs(), uidOf(i));
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    await mutate("clubs", (cl) => { if (!cl[mine.club]) return; if (r.url) cl[mine.club].stream = r.url; else delete cl[mine.club].stream; }, { initial: {} });
    later(context, async () => { await F.refreshOverview(); const t = await F.activeTournament().catch(() => null); if (t?.status === "anmeldung") await F.refreshSignup(t); for (const x of await F.allTournaments()) if (x.status === "anmeldung" && x !== t) await F.refreshSignup(x); });
    return eph(r.url ? `📺 Stream-Link für **${V.esc(mine.club)}** gespeichert: ${r.url}` : `🗑️ Stream-Link von **${V.esc(mine.club)}** gelöscht.`);
  }
  if (id === "team_ea_m") {
    const eaName = String(v.ea || "").trim();
    if (eaName.length < 2) return eph("Bitte den **EA-Clubnamen** eintragen.");
    const clubs = await getClubs(), mine = F.clubOfUser(clubs, uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    return background(i, context, async () => {
      let res = null; try { res = await EA.searchClubs(eaName); } catch { return "⚠️ EA ist gerade nicht erreichbar – bitte später nochmal versuchen."; }
      const taken = new Set(Object.entries(await getClubs()).filter(([n]) => n !== mine.club).map(([, c]) => String(c.eaId || "")));
      const exact = res.exact.filter((c) => !taken.has(c.id)), all = res.list.filter((c) => !taken.has(c.id));
      if (exact.length === 1 || (!exact.length && all.length === 1)) return setTeamEa(mine.club, exact[0] || all[0]);
      if (!all.length) return `❌ EA hat keinen freien Club **${V.esc(eaName)}** gefunden – nichts geändert.`;
      return V.eaPick("team_eapick", exact.length ? exact : all, `🔎 Mehrere Clubs zu „${V.esc(eaName)}“ gefunden. **Welcher ist deiner?**`);
    });
  }

  if (id.startsWith("res:")) {
    const matchId = Number(id.split(":")[1]);
    const h = /^\d{1,2}$/.test(v.h?.trim()) ? Number(v.h) : null, a = /^\d{1,2}$/.test(v.a?.trim()) ? Number(v.a) : null;
    if (h === null || a === null) return eph("Bitte bei beiden Mannschaften die Tore als Zahl eintragen.");
    const pen = v.pen?.trim() ? T.parseScore(v.pen) : null;
    if (v.pen?.trim() && !pen) return eph("Elfmeter bitte so angeben: `4:3`");
    const mine = F.clubOfUser(await getClubs(), uid);
    if (!mine) return eph("Du bist keiner Mannschaft zugeordnet.");
    return background(i, context, async () => {
      const t0 = await resolveTournament(i);
      const { value: t, result } = await mutate(tKey(t0.channelId), (t) => {
        const r = T.report(t, matchId, mine.club, h, a, pen);
        return { state: r.state, events: r.state === "bestaetigt" ? T.advance(t) : [] };
      });
      const m = t.matches.find((x) => x.id === matchId);
      if (result.state === "wartet") { await F.askOpponent(t, m, mine.club, h, a, pen); return "📨 Ergebnis eingetragen. Der Gegner hat 2 Minuten zum Bestätigen – danach gilt es automatisch."; }
      if (result.state === "konflikt") { await F.notifyConflict(t, m); return "⚠️ Euer Ergebnis weicht vom Gegner ab. Die Turnierleitung wurde markiert und entscheidet."; }
      await F.afterResult(t, m, result.events);
      return `✅ Ergebnis bestätigt: ${V.matchLine(m, false)}`;
    });
  }
  return eph("Unbekanntes Formular.");
}

// ---------- Shop ----------
async function shopComponent(i, context, id, uid) {
  const mine = F.clubOfUser(await getClubs(), uid);
  if (id === "shop_me") {
    if (!mine) return eph("Du gehörst zu keinem Verein – registrier eine Mannschaft oder lass dich als Co-VM eintragen.");
    return { type: 4, data: { flags: 64, ...SH.balanceView(mine.club, mine.data) } };
  }
  if (!mine || mine.role !== "manager") return eph("Im Shop kaufen darf nur der **Manager** eines Vereins.");
  const coins = mine.data.coins || 0;
  if (id.startsWith("shop_buy:")) {
    const item = id.split(":")[1], it = SH.ITEMS[item];
    if (!it) return eph("Unbekannter Artikel.");
    if (coins < it.price) return eph(`Dafür reicht eure Kasse nicht: **${coins.toLocaleString("de-DE")}** von **${it.price.toLocaleString("de-DE")}** 🪙.`);
    if (item === "abzeichen" && mine.data.badge) return eph("Ihr habt das 👑 König-Abzeichen schon.");
    return { type: 4, data: { flags: 64, content: `${it.emoji} **${it.label}** für **${it.price}** 🪙 kaufen?\n-# ${it.text}\nKasse danach: ${coins - it.price} 🪙`, components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "shop_no" }, { type: 2, style: 3, label: "Kaufen", custom_id: `shop_ok:${item}` }] }] } };
  }
  if (id === "shop_no") return reply(i, { content: "Abgebrochen.", components: [] });
  if (id === "shop_ok:abzeichen") return background(i, context, async () => { await SH.buyBadge(mine.club, uid, "👑"); await SH.refreshShopPanel(); return "👑 **König-Abzeichen** gekauft – eure Spitznamen enden jetzt mit 👑."; }, { update: true });
  if (id === "shop_ok:ticket") return background(i, context, async () => { const n = await SH.buyTicket(mine.club, uid); await SH.refreshShopPanel(); return `🎫 **Sonderturnier-Ticket** gekauft (${n}× auf Lager). Ihr könnt euch damit beim nächsten Sonderturnier wie dem Cash Cup anmelden – eingelöst wird es beim Check-in.`; }, { update: true });
  if (id === "shop_ok:boost") return background(i, context, async () => { const n = await SH.buyBoost(mine.club, uid); await SH.refreshShopPanel(); return `🟣 **Große Verstärkung** gekauft (${n}× auf Lager). Sie wird beim nächsten Cup, in dem ihr eincheckt, automatisch eingelöst: Das ganze Team darf dann **lila Verstärkung** benutzen.`; }, { update: true });
  if (id === "shop_ok:iv") return background(i, context, async () => { const n = await SH.buyIV(mine.club, uid); await SH.refreshShopPanel(); return `📏 **Großer IV** gekauft (${n}× auf Lager). Er wird beim nächsten Cup, in dem ihr eincheckt, automatisch eingelöst: 1 Innenverteidiger darf dann bis **1,90 m** groß sein.`; }, { update: true });
  if (id === "shop_ok:urlaub") return background(i, context, async () => { const until = await SH.buyVacation(mine.club, uid); await SH.refreshShopPanel(); return `🛡️ Urlaubsschutz gekauft – die 7-Tage-Regel pausiert bis <t:${Math.floor(until / 1000)}:f>.`; }, { update: true });
  return eph("Unbekannte Aktion.");
}

// ---------- Support-Tickets ----------
async function ticketComponent(i, context, cfg, id, uid) {
  if (id === "tk_open") {
    const open = (await get("tickets"))?.open?.[uid];
    if (open && !String(open).startsWith("p:") && (await SUP.ticketOf(open)) && (await discord(`/channels/${open}`))) return eph(`Du hast schon ein offenes Ticket: <#${open}>`);
    return { type: 4, data: { flags: 64, ...SUP.ticketCatSelect() } };
  }
  if (id === "tk_cat") return SUP.ticketModal(i.data.values[0]);
  const tk = await SUP.ticketOf(i.channel_id);
  if (!tk) return eph("Dieses Ticket gibt es nicht mehr.");
  const staff = SUP.isTicketStaff(i.member, cfg);
  if (id === "tk_claim") {
    if (!staff) return eph("Übernehmen kann nur das Staff-Team.");
    return background(i, context, async () => { await SUP.claimTicket(i.channel_id, uid); return "✅ Du hast das Ticket übernommen."; });
  }
  if (id === "tk_add") {
    if (!staff) return eph("Personen hinzufügen kann nur das Staff-Team.");
    return { type: 4, data: { flags: 64, content: "Wen möchtest du hinzufügen?", components: [{ type: 1, components: [{ type: 5, custom_id: "tk_add_pick", placeholder: "Person wählen" }] }] } };
  }
  if (id === "tk_add_pick") {
    if (!staff) return eph("Personen hinzufügen kann nur das Staff-Team.");
    const target = i.data.values?.[0];
    return background(i, context, async () => { await SUP.addToTicket(i.channel_id, target); return `✅ <@${target}> hinzugefügt.`; }, { update: true });
  }
  if (id === "tk_close") {
    if (!staff && tk.uid !== uid) return eph("Schließen kann nur die Person selbst oder das Staff-Team.");
    return { type: 4, data: { flags: 64, content: "🔒 **Ticket wirklich schließen?** Der Kanal wird gelöscht, der Verlauf wird nicht gespeichert.", components: [{ type: 1, components: [{ type: 2, style: 2, label: "Abbrechen", custom_id: "tk_close_no" }, { type: 2, style: 4, label: "Ja, schließen", custom_id: "tk_close_ok" }] }] } };
  }
  if (id === "tk_close_no") return reply(i, { content: "Abgebrochen.", components: [] });
  if (id === "tk_close_ok") {
    if (!staff && tk.uid !== uid) return eph("Schließen kann nur die Person selbst oder das Staff-Team.");
    later(context, () => SUP.closeTicket(i.channel_id, uid));
    return reply(i, { content: "🔒 Das Ticket wird geschlossen …", components: [] });
  }
  return eph("Unbekannte Aktion.");
}

// ---------- Staff-Bewerbungen ----------
async function applyComponent(i, context, id, uid) {
  if (id === "ap_open") {
    try { await SUP.applyCheck(uid); } catch (e) { return eph(`❌ ${e.message}`); }
    return { type: 4, data: { flags: 64, ...SUP.applyPosSelect() } };
  }
  if (id === "ap_pos") {
    try { await SUP.applyCheck(uid); } catch (e) { return reply(i, { content: `❌ ${e.message}`, components: [] }); }
    return SUP.applyModal(i.data.values[0]);
  }
  if (!SUP.isServerAdmin(i.member)) return eph("Über Bewerbungen entscheiden nur Server-Admins.");
  const appId = Number(id.split(":")[1]);
  if (id.startsWith("ap_yes:")) return background(i, context, async () => { const r = await SUP.decideApplication(appId, true, uid); return `✅ Bewerbung #${appId} angenommen.${r.roleMissing ? " ⚠️ Die Rolle ist noch nicht verknüpft – `/cup-einrichten rollen` ausführen und die Rolle von Hand vergeben." : " Die Rolle wird vergeben."}`; });
  if (id.startsWith("ap_no:")) return SUP.rejectModal(appId);
  if (id.startsWith("ap_talk:")) {
    return background(i, context, async () => {
      const a = await SUP.getApplication(appId);
      if (!a) throw new Error("Diese Bewerbung gibt es nicht mehr.");
      const r = await SUP.createTicket({ uid: a.uid, name: `bewerbung-${a.id}`, cat: "gespraech", text: `Gespräch zur Bewerbung #${a.id} als ${SUP.POSITIONS[a.pos].label}.`, extra: [uid] });
      return `💬 ${r.existing ? "Die Person hatte schon ein offenes Ticket – du wurdest hinzugefügt" : "Gesprächs-Ticket erstellt"}: <#${r.channelId}>`;
    });
  }
  return eph("Unbekannte Aktion.");
}

async function doBan(i, context, rest, note) {
  const [u, r, d, both] = rest.split(":");
  const users = [u];
  if (both === "2") {
    const clubs = await getClubs(), mine = F.clubOfUser(clubs, u);
    if (mine) users.push(...F.membersOf(clubs, mine.club).filter((x) => x !== u));
  }
  later(context, () => B.ban(users, Number(r), Number(d), uidOf(i), note));
  return reply(i, { content: `✅ ${users.map((x) => `<@${x}>`).join(", ").replace(/, ([^,]*)$/, " und $1")} ${users.length > 1 ? "sind" : "ist"} für **${d} ${d === "1" ? "Tag" : "Tage"}** gesperrt. Die Sperrliste wird aktualisiert, und die Betroffenen werden im Benachrichtigungs-Kanal markiert.`, components: [] });
}
