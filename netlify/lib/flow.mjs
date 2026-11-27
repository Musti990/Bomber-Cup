// Abläufe mit Discord-Auswirkungen: Posts, Rollen, Phasenwechsel.
import { coList, coIds, isCo, setCos } from "./co.mjs";
import { get, set, del, mutate, keys, getConfig, getClubs, tKey } from "./store.mjs";
import { sendMessage, editMessage, upsertMessage, sendWithFile, deleteMessage } from "./discord.mjs";
import { enqueue } from "./roles.mjs";
import * as T from "./tournament.mjs";
import * as V from "./views.mjs";
import { DAYS, ROUND_ROLES, RULES_VERSION, CLUBS, flagOf, isFreilos, COLOR } from "./data.mjs";
import { viennaParts, viennaAt, shortDate, todayKey } from "./time.mjs";
import { setNick, nickFor } from "./names.mjs";
import { scheduleCleanup, purgeExcept } from "./cleanup.mjs";
import { botLog } from "./botlog.mjs";

// ---------- Hilfen ----------
export function clubOfUser(clubs, uid) {
  for (const [name, c] of Object.entries(clubs)) {
    if (c.manager === uid) return { club: name, role: "manager", data: c };
    if (isCo(c, uid)) return { club: name, role: "co", data: c };
  }
  return null;
}
export const membersOf = (clubs, name) => [clubs[name]?.manager, ...coIds(clubs[name])].filter(Boolean);

async function panels() { return (await get("panels")) || { over: [] }; }
async function savePanel(key, val) { await mutate("panels", (p) => { p[key] = val; }, { initial: { over: [] } }); }

// ---------- Dauerhafte Panels ----------
export async function refreshRegPanel() {
  const cfg = await getConfig(); if (!cfg.channels.reg) return;
  const p = await panels(), clubs = await getClubs();
  const id = await upsertMessage(cfg.channels.reg, p.reg, V.regPanel(clubs));
  if (id && id !== p.reg) { await savePanel("reg", id); }
}
export async function refreshTeamPanel() {
  const cfg = await getConfig(); if (!cfg.channels.team) return;
  const p = await panels();
  const id = await upsertMessage(cfg.channels.team, p.team, V.teamPanel());
  if (id && id !== p.team) { await savePanel("team", id); }
}
export async function refreshOverview() {
  const cfg = await getConfig(); if (!cfg.channels.over) return;
  const p = await panels(), clubs = await getClubs();
  const msgs = V.overviewMessages(clubs), ids = [];
  for (let i = 0; i < msgs.length; i++) ids.push(await upsertMessage(cfg.channels.over, p.over?.[i], msgs[i]));
  if (JSON.stringify(ids) !== JSON.stringify(p.over)) await savePanel("over", ids);
  await refreshTeamStats().catch((e) => console.error("Team-Statistik:", e?.message || e));
  await refreshEaLinks().catch((e) => console.error("EA-Verknüpfungen:", e?.message || e));
}

/** ⚙️ Admin-Panel im Admin-Kanal posten bzw. aktualisieren (Status des aktuellen Cups).
 *  Nur EIN Panel: Schlägt das Bearbeiten fehl (z. B. kurz zu viele Anfragen), wird nur neu gepostet,
 *  wenn die alte Nachricht wirklich gelöscht ist. Ändert sich nichts, wird nichts geschickt. */
export async function refreshAdminPanel({ force = false } = {}) {
  const cfg = await getConfig(); const ch = cfg.channels.adminpanel || cfg.channels.admin; if (!ch) return;
  const payload = (await import("./adminpanel.mjs")).adminPanel(await currentCup(), await allTournaments());
  const hash = JSON.stringify(payload).length + ":" + JSON.stringify(payload).slice(0, 400);
  const p = await panels();
  if (!force && p.adminpanel && p.adminpanelHash === hash) return;
  const { editMessage, discord } = await import("./discord.mjs");
  if (p.adminpanel) {
    if (await editMessage(ch, p.adminpanel, payload)) { await savePanel("adminpanelHash", hash); return; }
    const still = await discord(`/channels/${ch}/messages/${p.adminpanel}`).catch(() => null);
    if (still?.id) return; // existiert noch → beim nächsten Mal wieder versuchen, NICHT doppelt posten
  }
  // Sperre gegen gleichzeitiges Posten
  const { result: mine } = await mutate("panels", (x) => { if (x.adminpanelLock && Date.now() - x.adminpanelLock < 30000) return false; x.adminpanelLock = Date.now(); return true; }, { initial: { over: [] } });
  if (!mine) return;
  const m = await sendMessage(ch, payload);
  await mutate("panels", (x) => { if (m?.id) { x.adminpanel = m.id; x.adminpanelHash = hash; } x.adminpanelLock = 0; }, { initial: { over: [] } });
}

/** Nachricht, die nach ein paar Sekunden wieder verschwindet (Ergebnis-Bestätigungen) */
export async function sendTemp(ch, payload, ms = 5000) {
  const m = await sendMessage(ch, payload);
  if (!m?.id) return m;
  await mutate("tempdel", (l) => { l.push({ ch, id: m.id, at: Date.now() + ms }); }, { initial: [] });
  const { deleteMessage } = await import("./discord.mjs");
  setTimeout(() => deleteMessage(ch, m.id).catch(() => {}), ms); // klappt meistens sofort; sonst räumt der Minuten-Timer auf
  return m;
}
export async function runTempDeletes() {
  const { deleteMessage } = await import("./discord.mjs");
  const list = (await get("tempdel")) || [];
  const due = list.filter((x) => x.at <= Date.now());
  for (const x of due) await deleteMessage(x.ch, x.id).catch(() => {});
  if (due.length) await mutate("tempdel", (l) => l.filter((x) => x.at > Date.now()), { initial: [] });
}
/** Aktueller Cup: laufend, sonst die Anmeldung im Anmelde-Kanal, sonst der zuletzt beendete */
export async function currentCup() {
  const cfg = await getConfig();
  // ein laufender Test-Cup hat Vorrang (damit die Panel-Buttons ihn steuern)
  const tc = await get("testcup");
  if (tc) { const t = await get(tKey(tc)); if (t?.test && !["fertig", "abgesagt", "geloescht"].includes(t.status)) return t; }
  const act = await activeTournament();
  if (act) return act;
  const s = cfg.channels.signup ? await get(tKey(cfg.channels.signup)) : null;
  return s && !["abgesagt", "geloescht"].includes(s.status) ? s : null;
}

/** 📊 Team-Statistiken (All-Time) als Bild – aktualisiert sich bei neuen Teams, Logos, EA-IDs und nach jedem Cup */
export async function refreshTeamStats() {
  const cfg = await getConfig(); if (!cfg.channels.teamstats) return;
  const img = await (await import("./teamstatsgfx.mjs")).teamStatsImage(await getClubs(), await get("stats"));
  const { editWithFile } = await import("./discord.mjs");
  const p = await panels(), payload = { content: "📊 **Team-Statistiken · All-Time** – aktualisiert sich automatisch" };
  const ok = p.teamstats ? await editWithFile(cfg.channels.teamstats, p.teamstats, payload, "team-statistiken.png", img) : null;
  if (!ok) { const m = await sendWithFile(cfg.channels.teamstats, payload, "team-statistiken.png", img); if (m?.id) await savePanel("teamstats", m.id); }
}

/** 🔗 EA-Verknüpfungen aller Teams (nur Staff, im Kanal EA-Status) */
export async function refreshEaLinks() {
  const cfg = await getConfig(); if (!cfg.channels.eastatus) return;
  const clubs = await getClubs(), names = Object.keys(clubs).sort((a, b) => a.localeCompare(b, "de"));
  const ok = names.filter((n) => clubs[n].eaId && clubs[n].eaVerified !== false), warn = names.filter((n) => clubs[n].eaId && clubs[n].eaVerified === false), no = names.filter((n) => !clubs[n].eaId);
  const line = (n) => `**${V.esc(n)}** · <@${clubs[n].manager}>${clubs[n].eaId ? ` · ${V.esc(clubs[n].eaName || "?")} (ID ${clubs[n].eaId})` : ""}`;
  const embeds = [
    { color: COLOR, title: "🔗 EA-VERKNÜPFUNGEN", description: `✅ **${ok.length}** verknüpft · ⚠️ **${warn.length}** nicht bestätigt · ❌ **${no.length}** ohne EA-Club-ID\n-# Ohne Verknüpfung müssen Ergebnisse gemeldet werden – ändern: Meine Mannschaft → EA-Club-ID ändern oder \`/cup-admin ea-verknüpfen\``, footer: { text: "Aktualisiert sich automatisch" } },
    ...(no.length ? [{ color: 0xff4d4d, title: `❌ Ohne EA-Club-ID (${no.length})`, description: no.map(line).join("\n").slice(0, 4000) }] : []),
    ...(warn.length ? [{ color: 0xf2c94c, title: `⚠️ Von EA nicht bestätigt (${warn.length})`, description: warn.map(line).join("\n").slice(0, 4000) }] : []),
    ...(ok.length ? [{ color: 0x2ecc71, title: `✅ Verknüpft (${ok.length})`, description: ok.map(line).join("\n").slice(0, 4000) }] : []),
  ];
  const p = await panels();
  const id = await upsertMessage(cfg.channels.eastatus, p.ealinks, { embeds, allowed_mentions: { parse: [] } });
  if (id && id !== p.ealinks) await savePanel("ealinks", id);
}

// ---------- Regelwerk (bearbeitbar über den Button „Bearbeiten“) ----------
/** Aktueller Text: gespeicherte Fassung, sonst der Standard aus data.mjs */
export async function rulesText() {
  const { RULES } = await import("./data.mjs");
  const s = await get("rulestext");
  return s ? { ...s } : { title: RULES.title, highlight: RULES.highlight || null, sections: RULES.sections.map((x) => [...x]), version: 0 };
}
export async function saveRulesText(fn) {
  const cur = await rulesText();
  fn(cur);
  await set("rulestext", cur);
  return cur;
}
/** Version, die akzeptiert sein muss (steigt, wenn alle neu bestätigen sollen) */
async function rulesVersion() { return RULES_VERSION + ((await get("rulestext"))?.version || 0); }
export async function rulesAccepted(uid) {
  const r = (await get("rules")) || {};
  return r[uid] === (await rulesVersion());
}
export async function acceptRules(uid) {
  const ver = await rulesVersion();
  const { value } = await mutate("rules", (r) => { r[uid] = ver; }, { initial: {} });
  return Object.values(value).filter((v) => v === ver).length;
}
export async function refreshRulesPanel() {
  const cfg = await getConfig(); if (!cfg.channels.rules) return;
  const p = await panels();
  const ver = await rulesVersion();
  const count = Object.values((await get("rules")) || {}).filter((v) => v === ver).length;
  const id = await upsertMessage(cfg.channels.rules, p.rules, V.rulesPanel(count, await rulesText()));
  if (id && id !== p.rules) { await savePanel("rules", id); }
}

export async function refreshRolesPanel() {
  const cfg = await getConfig(); if (!cfg.channels.roles) return;
  const p = await panels();
  const id = await upsertMessage(cfg.channels.roles, p.roles, V.rolesPanel());
  if (id && id !== p.roles) { await savePanel("roles", id); }
}

/** Verein freigeben (Verlassen, Löschen, Inaktivität, Manager-Rolle weg). Co-VM übernimmt beim Verlassen. */
export async function releaseClub(name, { transferToCo = false, reason = "" } = {}) {
  const cfg = await getConfig();
  const { result } = await mutateClubsSafe((clubs) => {
    const c = clubs[name]; if (!c) return null;
    const cos = coList(c);
    if (transferToCo && cos.length) {
      const old = { id: c.manager, orig: c.managerOrigNick ?? null };
      const next = cos[0]; // der am längsten eingetragene Co-VM wird Manager
      c.manager = next.id; c.managerBase = next.base; c.managerOrigNick = next.orig ?? null;
      setCos(c, cos.slice(1));
      return { transferred: true, old, now: c.manager, base: c.managerBase, badge: c.badge };
    }
    delete clubs[name];
    return { transferred: false, cos, manager: c.manager, managerOrig: c.managerOrigNick ?? null, colorRole: c.colorRole ?? null, data: c };
  });
  if (!result) return null;
  // Spitznamen anpassen bzw. zurücksetzen
  if (result.transferred) {
    await setNick(result.old.id, result.old.orig);
    if (result.base) await setNick(result.now, nickFor(result.base, "manager", name, result.badge));
  } else {
    if (result.manager) await setNick(result.manager, result.managerOrig);
    for (const x of result.cos || []) await setNick(x.id, x.orig ?? null);
  }
  if (!result.transferred && result.cos?.length) await enqueue(result.cos.map((x) => ({ u: x.id, add: [cfg.roles.spieler], rem: [cfg.roles.manager], why: "Mannschaft aufgelöst – Co-VM entfernt" })));
  if (!result.transferred && result.colorRole) await (await import("./shop.mjs")).deleteColorRole(result.colorRole);
  if (!result.transferred) await (await import("./shop.mjs")).parkTreasury(name, result.data); // Kasse bleibt beim Verein
  (await import("./shop.mjs")).refreshShopPanel().catch(() => {});
  await Promise.all([refreshRegPanel(), refreshOverview()]);
  return result;
}
const mutateClubsSafe = (fn) => mutate("clubs", fn, { initial: {} });

// ---------- Turnier anlegen ----------
export async function activeTournament() {
  const ch = await get("active");
  return ch ? await get(tKey(ch)) : null;
}

export async function launchTournament({ channelId, name, times, day, date }, { replace = false } = {}) {
  const old = await get(tKey(channelId));
  // Schon eine Liste für genau diesen Cup-Tag offen? Dann nicht nochmal posten (verhindert doppelte Listen)
  if (old && old.status === "anmeldung" && old.times?.kickoff === times.kickoff && old.msgs?.panel) {
    await refreshSignup(old);
    return old;
  }
  if (old && !["fertig", "abgesagt", "geloescht"].includes(old.status)) {
    if (!replace) throw new Error("In diesem Kanal läuft bereits ein Turnier.");
    if (T.ACTIVE.includes(old.status)) throw new Error("In diesem Kanal läuft gerade noch ein Cup.");
    old.status = "geloescht";
    if (old.msgs.panel) await upsertMessage(channelId, old.msgs.panel, V.signupPanel(old, await getClubs()));
  }
  // Sperre: zwei gleichzeitige Aufrufe für denselben Kanal posten nur einmal
  const lockKey = `launch:${channelId}:${times.kickoff}`;
  const { result: got } = await mutate("launchlocks", (l) => { const now = Date.now(); for (const [k, at] of Object.entries(l)) if (now - at > 10 * 60000) delete l[k]; if (l[lockKey]) return false; l[lockKey] = now; return true; }, { initial: {} });
  if (!got) { const cur = await get(tKey(channelId)); if (cur) return cur; throw new Error("Die Liste wird gerade schon gepostet."); }
  const t = T.createTournament({ channelId, name, times, day, date });
  const msg = await sendMessage(channelId, V.signupPanel(t, await getClubs()));
  if (!msg) {
    await mutate("launchlocks", (l) => { delete l[lockKey]; }, { initial: {} });
    throw new Error(`Ich konnte in <#${channelId}> nichts posten – fehlen dem Bot dort Rechte?`);
  }
  t.msgs.panel = msg.id;
  await set(tKey(channelId), t);
  botLog(`📝 **Neuer Cup** „${t.name}“ – Anmeldeliste in <#${channelId}> · Anpfiff <t:${Math.floor(t.times.kickoff / 1000)}:f>`);
  return t;
}

export async function refreshSignup(t) {
  if (!t.msgs.panel) return;
  const id = await upsertMessage(t.channelId, t.msgs.panel, V.signupPanel(t, await getClubs()));
  if (id && id !== t.msgs.panel) await mutate(tKey(t.channelId), (x) => { x.msgs.panel = id; });
}

/** Zeiten aus dem Anpfiff: Anmeldeschluss/Auslosung 60 Min. vorher, Check-in-Ende 5 Min. vorher */
export const timesFromKickoff = (kickoff) => ({ close: kickoff - 60 * 60000, checkinEnd: kickoff - 5 * 60000, kickoff });

/** Wochenplan: zur Posting-Zeit die Liste des Tages posten */
export async function runSchedule(now = Date.now()) {
  const v = viennaParts(now);
  const plan = (await get("zeitplan")) || {};
  const e = plan[v.weekday];
  if (!e || e.lastPosted === v.dateKey || v.hhmm < e.post) return;
  if (e.advance) return runAdvance(e, v, now);
  const { result: claimed } = await mutate("zeitplan", (p) => {
    const x = p[v.weekday]; if (!x || x.lastPosted === v.dateKey) return false;
    x.lastPosted = v.dateKey; return true;
  }, { initial: {} });
  if (!claimed) return;
  const kickoff = viennaAt(v.y, v.mo, v.d, e.kickoff);
  if (kickoff - 60 * 60000 < now + 2 * 60000) return; // Anmeldeschluss schon vorbei
  await launchTournament({ channelId: e.channelId, name: `${e.name} · ${DAYS[v.weekday - 1]}, ${shortDate(v.mo, v.d)}`, day: DAYS[v.weekday - 1], date: shortDate(v.mo, v.d), times: timesFromKickoff(kickoff) }, { replace: true });
}

// ---------- Auslosung ----------
export async function doDraw(channelId) {
  botLog(`🎲 **Anmeldeschluss** in <#${channelId}> – Auslosung & Check-in starten`);
  const cfg = await getConfig(), clubs = await getClubs();
  const busy = await activeTournament();
  const { value: t, result } = await mutate(tKey(channelId), (t) => {
    if (busy && busy.channelId !== channelId && T.ACTIVE.includes(busy.status)) { t.status = "abgesagt"; return { cancelled: true, busy: true }; }
    const r = T.closeAndDraw(t);
    if (!r.cancelled) for (const c of t.playing.concat(t.wait)) t.members[c] = membersOf(clubs, c);
    return r;
  }, { missing: "Turnier nicht gefunden." });
  await refreshSignup(t);
  if (result.cancelled) {
    await sendMessage(channelId, { content: result.busy ? "⚠️ **Der Cup fällt aus** – es läuft gerade noch ein anderer Cup." : `⚠️ **Der Cup fällt heute aus** – nur ${t.reg.length} ${t.reg.length === 1 ? "Mannschaft" : "Mannschaften"} angemeldet, mindestens 8 nötig.` });
    await scheduleCleanup(t);
    return t;
  }
  await set("active", channelId);
  await sendMessage(channelId, V.drawPost(t));
  // Rollen „Gruppe X“ an Manager und Co-VM
  const ops = [];
  for (const g of t.groups) for (const c of g.teams) for (const u of t.members[c] || []) ops.push({ u, add: [cfg.roles.groups?.[g.name]], why: `Auslosung: Gruppe ${g.name}` });
  await enqueue(ops);
  // Check-in-Posts in den Gruppenkanälen
  const ids = {};
  for (const g of t.groups) {
    const ch = cfg.channels["g" + g.name];
    if (!ch) continue;
    const m = await sendMessage(ch, V.groupCheckin(t, g, cfg.roles.groups?.[g.name]));
    ids[g.name] = { checkin: m?.id ?? null, plan: null, res: null };
    const rch = cfg.channels["r" + g.name];
    if (rch) { const rm = await sendMessage(rch, V.resultPanel(t, g)); if (rm) { ids[g.name].res = rm.id; } }
  }
  const live = cfg.channels.live ? await sendMessage(cfg.channels.live, V.livePlan(t)) : null;
  await mutate(tKey(channelId), (x) => { x.msgs.groups = ids; x.msgs.live = live?.id ?? null; });
  return t;
}

// ---------- Check-in ----------
export async function refreshGroupCheckin(t, gName) {
  const cfg = await getConfig();
  const g = t.groups.find((x) => x.name === gName), ch = cfg.channels["g" + gName], id = t.msgs.groups?.[gName]?.checkin;
  if (g && ch && id) await editMessage(ch, id, V.groupCheckin(t, g, cfg.roles.groups?.[gName]));
}

export async function doCheckinEnd(channelId) {
  botLog(`✅ **Check-in beendet** in <#${channelId}> – Gruppen werden gepostet`);
  const cfg = await getConfig(), clubs = await getClubs();
  let { value: t, result } = await mutate(tKey(channelId), (t) => {
    const r = T.finishCheckin(t);
    for (const x of r.replaced) t.members[x.new] = t.members[x.new]?.length ? t.members[x.new] : membersOf(clubs, x.new);
    r.events = T.advance(t);
    return r;
  });
  // Shop: „Großer IV“ für diesen Cup einlösen
  try {
    const r = await (await import("./shop.mjs")).redeemCupItems(t);
    if (r.bigIV.length || r.boost.length) ({ value: t } = await mutate(tKey(channelId), (x) => { x.bigIV = r.bigIV; x.boost = r.boost; }));
  } catch (e) { console.error("Großer IV:", e); }
  // Rollen: Nachrücker rein, Nicht-Eingecheckte raus
  const ops = [];
  for (const x of result.replaced) {
    for (const u of t.members[x.old] || []) ops.push({ u, rem: [cfg.roles.groups?.[x.group]], why: "Nicht eingecheckt" });
    for (const u of t.members[x.new] || []) ops.push({ u, add: [cfg.roles.groups?.[x.group]], why: `Nachrücker Gruppe ${x.group}` });
  }
  for (const x of result.forfeited) for (const u of t.members[x.club] || []) ops.push({ u, rem: [cfg.roles.groups?.[x.group]], why: "Nicht eingecheckt" });
  await enqueue(ops);
  const lines = [
    ...result.replaced.map((x) => `🔁 **Gruppe ${x.group}:** ${flagOf(x.old)} ${V.esc(x.old)} nicht eingecheckt → ${flagOf(x.new)} **${V.esc(x.new)}** rückt nach.`),
    ...result.forfeited.map((x) => `❌ **Gruppe ${x.group}:** ${flagOf(x.club)} ${V.esc(x.club)} nicht eingecheckt – alle Spiele werden mit 0:3 gewertet.`),
  ];
  await refreshSignup(t);
  await sendMessage(channelId, { content: `🔒 **Check-in beendet.** ${t.playing.length - t.out.length} Mannschaften sind dabei. Anpfiff um <t:${Math.floor(t.times.kickoff / 1000)}:t> – die Spielpläne stehen in euren Gruppenkanälen.${lines.length ? "\n\n" + lines.join("\n") : ""}` });
  for (const g of t.groups) {
    const ch = cfg.channels["g" + g.name]; if (!ch) continue;
    await refreshGroupCheckin(t, g.name);
    const plan = await postGroupImage(t, g, ch, cfg);
    if (plan) { await mutate(tKey(channelId), (x) => { x.msgs.groups[g.name] = { ...(x.msgs.groups[g.name] || {}), plan: plan.id }; }); }
  }
  const fresh = await get(tKey(channelId));
  // Ergebnis-Panels von „Los geht's nach dem Check-in“ auf Spieltag 1 mit Knöpfen umstellen
  for (const g of fresh.groups) await refreshResultPanel(fresh, g.name);
  await refreshLive(fresh);
  await handleEvents(fresh, result.events);
  return fresh;
}

/** Gruppenkanal leeren (Spielplan und ggf. Ergebnis-Panel bleiben) und Freigabe posten */
async function postGroupFreigabe(t, g, round, cfg) {
  const ch = cfg.channels["g" + g.name], role = cfg.roles.groups?.[g.name];
  if (!ch) return;
  const fresh = (await get(tKey(t.channelId))) || t;
  const keep = [fresh.msgs?.groups?.[g.name]?.plan, fresh.msgs?.groups?.[g.name]?.res];
  try { await purgeExcept(ch, keep); } catch (e) { console.error("Gruppenkanal leeren:", e?.message || e); }
  // Kurze Markierung statt langem Text – Paarungen & Tabelle stehen im Gruppenbild darüber
  const playing = new Set(t.matches.filter((m) => m.group === g.name && m.round === round).flatMap((m) => [m.home, m.away]));
  const bye = g.teams.filter((c) => !playing.has(c) && !isFreilos(c));
  const rch = cfg.channels["r" + g.name];
  await sendMessage(ch, { content: `${role ? `<@&${role}> ` : ""}🟢 **Gruppe ${g.name} · Spieltag ${round}** – ihr dürft spielen!${rch ? ` Ergebnis kommt automatisch von EA, sonst in <#${rch}> melden.` : ""}${bye.length ? `\n-# Spielfrei: ${bye.map((c) => V.esc(c)).join(", ")}` : ""}`, allowed_mentions: { roles: role ? [role] : [] } });
}

/** KO-Kanal leeren (Turnierbaum und ggf. Ergebnis-Panel bleiben) und die neue Runde posten */
async function postKoFreigabe(t, cfg) {
  if (!cfg.channels.ko) return;
  const fresh = (await get(tKey(t.channelId))) || t;
  try { await purgeExcept(cfg.channels.ko, [fresh.msgs?.bracket, fresh.msgs?.koRes]); } catch (e) { console.error("KO-Kanal leeren:", e?.message || e); }
  await sendMessage(cfg.channels.ko, V.koRoundPost(t, t.members, cfg.roles.rounds || {}, cfg.channels.kor));
}

export async function doKickoff(channelId) {
  botLog(`🟢 **Anpfiff** in <#${channelId}> – Spieltag 1 freigegeben`);
  const cfg = await getConfig();
  const { value: t, result: first } = await mutate(tKey(channelId), (t) => { if (t.kickoffDone) return false; t.kickoffDone = true; return true; });
  if (!first) return;
  for (const g of t.groups) await postGroupFreigabe(t, g, t.round, cfg);
}

// ---------- Ergebniskanäle ----------
/** Wo landen Ergebnis-Nachrichten? Gruppe → eigener Ergebniskanal (sonst Gruppenkanal), K.-o. → KO-Kanal */
export const resultChannelOf = (cfg, m) => (m.phase === "gruppe" ? cfg.channels["r" + m.group] || cfg.channels["g" + m.group] : cfg.channels.kor || cfg.channels.ko);

/** Ergebnis-Panel im KO-Ergebniskanal: pro Runde neu posten (damit es unten steht), sonst aktualisieren */
export async function refreshKOResultPanel(t, fresh = false) {
  const cfg = await getConfig();
  const ch = cfg.channels.kor;
  if (!ch || !t.koSize) return;
  const old = t.msgs.koRes;
  const id = fresh ? (await sendMessage(ch, V.koResultPanel(t)))?.id : await upsertMessage(ch, old, V.koResultPanel(t));
  if (fresh && old) await editMessage(ch, old, { ...V.koResultPanel({ ...t, status: "vorbei" }), components: [] });
  if (id && id !== old) { await mutate(tKey(t.channelId), (x) => { x.msgs.koRes = id; }); }
}

export async function refreshResultPanel(t, gName) {
  const cfg = await getConfig();
  const ch = cfg.channels["r" + gName], g = t.groups.find((x) => x.name === gName);
  if (!ch || !g) return;
  const old = t.msgs.groups?.[gName]?.res;
  const id = await upsertMessage(ch, old, V.resultPanel(t, g));
  if (id && id !== old) { await mutate(tKey(t.channelId), (x) => { x.msgs.groups[gName] = { ...(x.msgs.groups[gName] || {}), res: id }; }); }
}

// ---------- Größenvideos ----------
export async function postVideoRequest(t, v, m) {
  const cfg = await getConfig();
  const ch = resultChannelOf(cfg, m);
  if (!ch) return;
  const msg = await sendMessage(ch, V.videoPost(v, t.members[v.to] || []));
  if (t.bigIV?.includes(v.to)) await sendMessage(ch, { content: `📏 Hinweis: **${V.esc(v.to)}** hat für diesen Cup den **Großen IV** aus dem Shop – 1 Innenverteidiger darf bis **1,90 m** groß sein.` });
  if (msg) await mutate(tKey(t.channelId), (x) => { const y = x.videos.find((z) => z.id === v.id); if (y) { y.msg = msg.id; y.ch = ch; } });
}
export async function videoSubmitted(t, v) {
  if (v.ch && v.msg) await editMessage(v.ch, v.msg, V.videoPost(v, []));
  const users = t.members[v.by] || [];
  if (v.ch) await sendMessage(v.ch, { content: `${users.map((u) => `<@${u}>`).join(" ")} ${v.status === "verspaetet" ? "🕓" : "✅"} **${V.esc(v.to)}** hat das Größenvideo${v.status === "verspaetet" ? " verspätet" : ""} eingereicht: ${v.link}`, allowed_mentions: { users } });
}
// ---------- Aktualisieren ----------
export async function refreshLive(t) {
  const cfg = await getConfig();
  if (!cfg.channels.live) return;
  // Live-Spielplan als Bild (Bomber-Cup-Look); falls das Bild nicht klappt: Text wie bisher
  let img = null;
  try {
    img = t.koSize && (t.status === "ko" || t.status === "fertig")
      ? await (await import("./bracketgfx.mjs")).bracketImage(t)   // ab K.-o.: Turnierbaum
      : await (await import("./livegfx.mjs")).liveImage(t);        // Gruppenphase: Spiele + Tabellen
  } catch (e) { console.error("Live-Bild:", e?.message || e); }
  if (img) {
    const { editWithFile, deleteMessage } = await import("./discord.mjs");
    const payload = { content: `📺 **Live-Spielplan · ${t.name}** – aktualisiert sich automatisch` };
    let id = t.msgs.liveImg;
    const ok = id ? await editWithFile(cfg.channels.live, id, payload, "live-spielplan.png", img) : null;
    if (!ok) { const m = await sendWithFile(cfg.channels.live, payload, "live-spielplan.png", img); id = m?.id || null; }
    if (id && id !== t.msgs.liveImg) {
      if (t.msgs.live) await deleteMessage(cfg.channels.live, t.msgs.live).catch(() => {}); // alte Text-Version weg
      await mutate(tKey(t.channelId), (x) => { x.msgs.liveImg = id; x.msgs.live = null; });
    }
    return;
  }
  const id = await upsertMessage(cfg.channels.live, t.msgs.live, V.livePlan(t));
  if (id && id !== t.msgs.live) await mutate(tKey(t.channelId), (x) => { x.msgs.live = id; });
}
/** Gruppenbild (alle Spieltage + Tabelle) posten – Notlösung: Text-Spielplan wie früher */
async function groupImg(t, gName) {
  try { return await (await import("./livegfx.mjs")).groupImage(t, gName); } catch (e) { console.error("Gruppenbild:", e?.message || e); return null; }
}
async function postGroupImage(t, g, ch, cfg) {
  const img = await groupImg(t, g.name);
  if (img) return sendWithFile(ch, { content: "" }, `gruppe-${g.name}.png`, img);
  return sendMessage(ch, V.groupPlan(t, g, cfg.channels["r" + g.name]));
}
export async function refreshGroupPlan(t, gName) {
  const cfg = await getConfig();
  const g = t.groups.find((x) => x.name === gName), ch = cfg.channels["g" + gName], id = t.msgs.groups?.[gName]?.plan;
  if (g && ch && id) {
    const img = await groupImg(t, gName);
    const { editWithFile } = await import("./discord.mjs");
    const ok = img ? await editWithFile(ch, id, { content: "", embeds: [], components: [] }, `gruppe-${gName}.png`, img) : await editMessage(ch, id, V.groupPlan(t, g, cfg.channels["r" + gName]));
    if (!ok && img) { // alte Text-Nachricht lässt sich nicht in ein Bild umbauen → neu posten
      const m = await sendWithFile(ch, { content: "" }, `gruppe-${gName}.png`, img);
      if (m?.id) { await deleteMessage(ch, id).catch(() => {}); await mutate(tKey(t.channelId), (x) => { x.msgs.groups[gName] = { ...(x.msgs.groups[gName] || {}), plan: m.id }; }); }
    }
  }
  await refreshResultPanel(t, gName);
}
export async function refreshBracket(t) {
  const cfg = await getConfig();
  if (!cfg.channels.ko || !t.koSize) return;
  // Turnierbaum als Bild (Bomber-Cup-Look); falls das nicht klappt: Text wie bisher
  let img = null;
  try { img = await (await import("./bracketgfx.mjs")).bracketImage(t); } catch (e) { console.error("Baum-Bild:", e?.message || e); }
  if (img) {
    const { editWithFile, deleteMessage } = await import("./discord.mjs");
    const payload = { content: `🌳 **Turnierbaum · ${t.name}**` };
    let id = t.msgs.bracketImg;
    const ok = id ? await editWithFile(cfg.channels.ko, id, payload, "turnierbaum.png", img) : null;
    if (!ok) { const m = await sendWithFile(cfg.channels.ko, payload, "turnierbaum.png", img); id = m?.id || null; }
    if (id && id !== t.msgs.bracketImg) {
      if (t.msgs.bracket) await deleteMessage(cfg.channels.ko, t.msgs.bracket).catch(() => {});
      await mutate(tKey(t.channelId), (x) => { x.msgs.bracketImg = id; x.msgs.bracket = null; });
    }
    return;
  }
  const id = await upsertMessage(cfg.channels.ko, t.msgs.bracket, V.bracket(t));
  if (id && id !== t.msgs.bracket) await mutate(tKey(t.channelId), (x) => { x.msgs.bracket = id; });
}

// ---------- Ergebnisse ----------
export async function afterResult(t, m, events, byAdmin = false) {
  if (m) botLog(`⚽ **Ergebnis** ${t.test ? "(Test) " : ""}${m.phase === "gruppe" ? `Gruppe ${m.group}` : "K.-o."} · ${m.home} **${m.h}:${m.a}**${m.pen ? ` (${m.pen[0]}:${m.pen[1]} i.E.)` : ""} ${m.away}${byAdmin ? " · festgelegt/EA" : " · bestätigt"}`);
  const cfg = await getConfig();
  const ch = resultChannelOf(cfg, m);
  if (ch) await sendTemp(ch, V.resultConfirmed(m, byAdmin)); // nur ca. 5 Sekunden sichtbar
  await closeAsk(t, m, m.auto ? "auto" : "bestaetigt");
  if (m.phase === "gruppe") await refreshGroupPlan(t, m.group); else { await refreshBracket(t); if (!events?.length) await refreshKOResultPanel(t); }
  await refreshLive(t);
  await handleEvents(t, events);
}

export async function askOpponent(t, m, reporterClub, h, a, pen) {
  const cfg = await getConfig();
  const opp = reporterClub === m.home ? m.away : m.home;
  const ch = resultChannelOf(cfg, m);
  if (!ch) return;
  const msg = await sendMessage(ch, V.confirmAsk(m, reporterClub, t.members[opp] || [], h, a, pen));
  if (msg) await mutate(tKey(t.channelId), (x) => { const y = x.matches.find((z) => z.id === m.id); if (y) y.ask = { ch, id: msg.id, by: reporterClub, h, a, pen }; });
  if (m.phase === "gruppe") await refreshGroupPlan(t, m.group); else await refreshKOResultPanel(t);
}

/** Bestätigungs-Nachricht abschließen (Buttons weg) */
async function closeAsk(t, m, state) {
  const fresh = (await get(tKey(t.channelId)))?.matches.find((z) => z.id === m.id);
  const ask = fresh?.ask;
  if (!ask) return;
  await editMessage(ask.ch, ask.id, V.confirmAsk(m, ask.by, [], ask.h, ask.a, ask.pen, state));
}

/** Vom Timer: Ergebnisse nach 2 Minuten ohne Reaktion automatisch bestätigen */
export async function runAutoConfirm() {
  const t0 = await activeTournament();
  if (!t0 || !["gruppen", "ko"].includes(t0.status)) return;
  if (!T.autoConfirm(structuredClone(t0)).length) return; // nichts fällig → nichts schreiben
  const { value: t, result } = await mutate(tKey(t0.channelId), (t) => {
    const ids = T.autoConfirm(t);
    return { ids, events: ids.length ? T.advance(t) : [] };
  });
  for (let k = 0; k < result.ids.length; k++) {
    const m = t.matches.find((x) => x.id === result.ids[k]);
    await afterResult(t, m, k === result.ids.length - 1 ? result.events : []);
  }
}

export async function notifyConflict(t, m) {
  const cfg = await getConfig();
  const ch = cfg.channels.log || resultChannelOf(cfg, m);
  const role = cfg.roles.turnierleitung;
  const line = (c) => { const r = m.reports[c]; return `• ${flagOf(c)} ${V.esc(c)} meldet **${r.h}:${r.a}${r.pen ? ` (${r.pen[0]}:${r.pen[1]} i.E.)` : ""}**`; };
  await closeAsk(t, m, "konflikt");
  if (ch) await sendMessage(ch, { content: `${role ? `<@&${role}> ` : ""}⚠️ **Ergebnis-Konflikt bei Spiel #${m.id}** (${V.esc(m.home)} – ${V.esc(m.away)})\n${line(m.home)}\n${line(m.away)}\nLösen: beide melden neu, oder \`/cup-admin ergebnis spiel:${m.id}\`.`, allowed_mentions: { roles: role ? [role] : [] } });
  if (m.phase === "gruppe") await refreshGroupPlan(t, m.group);
}

// ---------- Phasenwechsel ----------
async function handleEvents(t, events) {
  const cfg = await getConfig();
  for (const e of events || []) {
    if (e.type === "spieltag") {
      for (const g of t.groups) {
        await refreshGroupPlan(t, g.name);
        if (t.matches.some((m) => m.group === g.name && m.round === e.round)) await postGroupFreigabe(t, g, e.round, cfg);
      }
    }
    if (e.type === "ko-start") await startKOSideEffects(t, cfg);
    if (e.type === "ko-runde") await koRoundSideEffects(t, cfg, e);
    if (e.type === "finish") await finishCup(t, cfg);
  }
  if (events?.length) await refreshLive(await get(tKey(t.channelId)));
}

async function startKOSideEffects(t, cfg) {
  const ops = [];
  const groupRoles = Object.values(cfg.roles.groups || {});
  for (const c of t.playing) for (const u of t.members[c] || []) ops.push({ u, rem: groupRoles, why: "Gruppenphase beendet" });
  for (const c of t.qualified) { const r = T.koRoleOf(t, c); for (const u of t.members[c] || []) ops.push({ u, add: [cfg.roles.rounds?.[r], cfg.roles.koPhase], why: `K.-o.-Phase: ${r}` }); }
  await enqueue(ops);
  for (const g of t.groups) await refreshGroupPlan(t, g.name);
  await sendMessage(t.channelId, { content: `⭐ **Die Gruppenphase ist beendet!** ${t.koSize} Mannschaften stehen im ${T.koRoundName(t, 1)}.` });
  await postKoFreigabe(t, cfg);
  await refreshBracket(t);
  await refreshKOResultPanel(await get(tKey(t.channelId)), true);
}

/** Alle Rollen der K.-o.-Phase: Runden-Rollen + die gemeinsame Rolle „KO Phase“ */
const koAll = (cfg) => [...Object.values(cfg.roles.rounds || {}), cfg.roles.koPhase].filter(Boolean);

async function koRoundSideEffects(t, cfg, e) {
  const all = koAll(cfg), kp = cfg.roles.koPhase;
  const ops = [];
  const now = new Set(T.currentMatches(t).flatMap((m) => [m.home, m.away]));
  for (const c of e.losers) if (!now.has(c)) for (const u of t.members[c] || []) ops.push({ u, rem: all, why: "Ausgeschieden" });
  for (const c of now) { const r = T.koRoleOf(t, c), rr = cfg.roles.rounds?.[r]; for (const u of t.members[c] || []) ops.push({ u, add: [rr, kp], rem: all.filter((x) => x !== rr && x !== kp), why: `K.-o.: ${r}` }); }
  await enqueue(ops);
  await postKoFreigabe(t, cfg);
  await refreshBracket(t);
  await refreshKOResultPanel(await get(tKey(t.channelId)), true);
}

async function finishCup(t, cfg) {
  botLog(`🏆 **Cup beendet** „${t.name}“ – Sieger: **${t.champion || "?"}** · Aufräumen in 30 Min.`);
  const all = koAll(cfg);
  const ops = [];
  for (const c of t.qualified || []) for (const u of t.members[c] || []) ops.push({ u, rem: all, why: "Turnier beendet" });
  await enqueue(ops);
  // Statistik: alle eingecheckten Mannschaften haben gespielt
  const today = todayKey();
  let titleNo = 1;
  if (!t.test) {
    await mutate("clubs", (clubs) => {
      for (const c of t.checked) if (clubs[c]) { clubs[c].cups = (clubs[c].cups || 0) + 1; clubs[c].lastPlayed = today; clubs[c].warned = null; }
      if (clubs[t.champion]) { clubs[t.champion].titles = (clubs[t.champion].titles || 0) + 1; titleNo = clubs[t.champion].titles; }
    }, { initial: {} });
  }
  await set("active", null);
  await scheduleCleanup(t);
  if (!t.test) {
    const TR = await import("./trophies.mjs");
    const BD = await import("./badges.mjs");
    const badgesBefore = await BD.snapshot().catch(() => ({}));
    await TR.recordCup(t);
    await BD.announceNew(badgesBefore).catch((e) => console.error("Abzeichen:", e));
    await refreshTeamStats().catch(() => {});
    await TR.refreshTrophyPanel();
    try { await (await import("./shop.mjs")).payoutCup(t); await mutate(tKey(t.channelId), (x) => { x.coinsPaid = true; }); } catch (e) { console.error("Vereinskasse:", e); }
  }
  const f = t.matches.find((m) => m.final && m.round === t.koRound);
  const finalLine = `${f.home} ${f.h}:${f.a}${f.pen ? ` (${f.pen[0]}:${f.pen[1]} i.E.)` : ""} ${f.away}`;
  const hofCh = t.test ? t.channelId : cfg.channels.hof; // Test-Cup: Siegerbild nur im Turnierkanal, nicht in der Hall of Fame
  await sendMessage(t.channelId, { content: `🏆 **Das Turnier ist beendet!** Glückwunsch an ${flagOf(t.champion)} **${V.esc(t.champion)}**!${t.test ? "\n🧪 Test-Cup: keine Statistik, keine Trophäen, kein TOTT." : cfg.channels.hof ? ` Das Siegerbild steht in <#${cfg.channels.hof}>.` : ""}` });
  if (cfg.channels.ko) await sendMessage(cfg.channels.ko, { content: "🏆 **Das Turnier ist beendet!** Alle Runden-Rollen werden entfernt." });
  await refreshBracket(t);
  await refreshKOResultPanel(await get(tKey(t.channelId)));
  await refreshSignup(t);
  if (hofCh) {
    const names = await displayNames(t.podium.map((c) => (t.members[c] || [])[0]).filter(Boolean));
    const { hallOfFameImage } = await import("./image.mjs"); // erst hier laden, damit der Bot auch ohne Bild-Modul startet
    const img = await hallOfFameImage({
      podium: t.podium.map((c) => ({ club: c, mgr: names[(t.members[c] || [])[0]] || "" })),
      title: t.name, sub: `${t.fmt}er-Format · Finale: ${finalLine}`, seed: Date.now() % 1000,
    }).catch((e) => { console.error("Siegerbild:", e); return null; });
    const text = V.hofText(t, t.members, titleNo, finalLine);
    if (img) await sendWithFile(hofCh, text, "hall-of-fame.png", img); else await sendMessage(hofCh, text);
  }
}

async function displayNames(ids) {
  const { discord } = await import("./discord.mjs");
  const out = {};
  for (const id of ids) {
    const m = await discord(`/guilds/${process.env.DISCORD_GUILD_ID}/members/${id}`);
    out[id] = m?.nick || m?.user?.global_name || m?.user?.username || "";
  }
  return out;
}

/** Turnier abbrechen (Turnierleitung): Rollen weg, Status „abgebrochen“. */
export async function cancelTournament(channelId) {
  botLog(`🛑 **Cup abgebrochen** in <#${channelId}>`);
  const cfg = await getConfig();
  const { value: t } = await mutate(tKey(channelId), (t) => { t.status = "geloescht"; });
  const roles = [...Object.values(cfg.roles.groups || {}), ...koAll(cfg)];
  const ops = [];
  for (const c of Object.keys(t.members || {})) for (const u of t.members[c]) ops.push({ u, rem: roles, why: "Turnier abgebrochen" });
  await enqueue(ops);
  if ((await get("active")) === channelId) await set("active", null);
  await refreshSignup(t);
  await scheduleCleanup(t);
  return t;
}

/** Zeitgesteuerte Schritte eines Turniers (vom Timer jede Minute aufgerufen) */
export async function runTimers(t, now = Date.now()) {
  if (t.status === "anmeldung" && now >= t.times.close) return doDraw(t.channelId);
  if (t.status === "checkin" && t.autoCheckin) await mutate(tKey(t.channelId), (x) => { for (const n of x.reg) if (!x.checked.includes(n)) { try { T.checkIn(x, n); } catch { /* schon drin */ } } });
  if (t.status === "checkin" && now >= t.times.checkinEnd) return doCheckinEnd(t.channelId);
  if (t.status === "gruppen" && !t.kickoffDone && now >= t.times.kickoff) return doKickoff(t.channelId);
}

export async function allTournaments() {
  const ks = await keys("t:");
  return (await Promise.all(ks.map((k) => get(k)))).filter(Boolean);
}

export { ROUND_ROLES };

// ---------- Wochen-Vorlauf: Liste für nächste Woche direkt nach dem Cup ----------
/**
 * Vorlauf-Modus (/cup-turnier woche): Am Cup-Tag um die eingestellte Uhrzeit (z. B. 23:00) wird die Liste
 * für denselben Wochentag in 7 Tagen gepostet. Gewartet wird, bis der heutige Cup im Kanal fertig und
 * aufgeräumt ist – sonst würde das Aufräumen die neue Liste gleich wieder löschen.
 */
async function runAdvance(e, v, now) {
  const old = await get(tKey(e.channelId));
  if (old && T.ACTIVE.includes(old.status)) return; // Cup läuft noch → nächste Minute erneut prüfen
  if (old) {
    const pending = ((await get("cleanup")) || []).some((j) => j.tid === `${old.channelId}:${old.createdAt}`);
    if (pending) return; // Aufräumen steht noch aus → warten
  }
  const dt = new Date(Date.UTC(v.y, v.mo - 1, v.d + 7));
  const y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate();
  const { result: claimed } = await mutate("zeitplan", (p) => {
    const x = p[v.weekday]; if (!x || x.lastPosted === v.dateKey) return false;
    x.lastPosted = v.dateKey; return true;
  }, { initial: {} });
  if (!claimed) return;
  await launchTournament({ channelId: e.channelId, name: `${e.name} · ${DAYS[v.weekday - 1]}, ${shortDate(mo, d)}`, day: DAYS[v.weekday - 1], date: shortDate(mo, d), times: timesFromKickoff(viennaAt(y, mo, d, e.kickoff)) }, { replace: true });
}

/**
 * Ganze Woche ab einem Startdatum einrichten: für 7 Tage sofort die Listen posten
 * und alle Wochentage auf den Vorlauf-Modus stellen.
 */
export async function setupWeek({ startY, startMo, startD, kickoff, post, name }) {
  const plan = (await get("zeitplan")) || {};
  const days = [];
  for (let k = 0; k < 7; k++) {
    const dt = new Date(Date.UTC(startY, startMo - 1, startD + k));
    const y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const wd = ((dt.getUTCDay() + 6) % 7) + 1;
    days.push({ y, mo, d, wd, ch: plan[wd]?.channelId });
  }
  const missing = days.filter((x) => !x.ch).map((x) => DAYS[x.wd - 1]);
  if (missing.length) throw new Error(`Für ${missing.join(", ")} ist noch kein Tageskanal verknüpft. Führ dort einmal \`/cup-turnier setzen\` aus oder nutze \`/cup-einrichten alles\`.`);
  // Zuerst alle Tage auf Vorlauf stellen (lastPosted = heute, damit heute nichts doppelt kommt)
  const today = viennaParts().dateKey;
  await mutate("zeitplan", (p) => { for (const x of days) p[x.wd] = { ...p[x.wd], channelId: x.ch, kickoff, post, name, advance: true, lastPosted: x.wd === viennaParts().weekday ? today : p[x.wd]?.lastPosted ?? null }; }, { initial: {} });
  const out = [];
  for (const x of days) {
    const ko = viennaAt(x.y, x.mo, x.d, kickoff);
    const label = `${DAYS[x.wd - 1]}, ${shortDate(x.mo, x.d)}`;
    try {
      if (ko - 60 * 60000 < Date.now() + 2 * 60000) throw new Error("Anmeldeschluss schon vorbei");
      await launchTournament({ channelId: x.ch, name: `${name} · ${label}`, day: DAYS[x.wd - 1], date: shortDate(x.mo, x.d), times: timesFromKickoff(ko) }, { replace: true });
      out.push(`✅ **${label}** – Liste in <#${x.ch}> gepostet`);
    } catch (e) { out.push(`⚠️ **${label}** – ${e.message}`); }
  }
  return out;
}

// ---------- Test-Cup (allein testen) ----------
/**
 * Startet einen Test-Cup im Kanal: deine eigene Mannschaft (falls du Manager/Co-VM bist) + virtuelle Test-Teams
 * aus freien Vereinen. Test-Teams sind automatisch eingecheckt, ihre Spiele gegeneinander spielt der Bot selbst.
 * Keine Statistik, keine Trophäen, kein TOTT, Siegerbild nur im Turnierkanal.
 */
export async function startTestCup(channelId, uid, size = 8) {
  const busy = await activeTournament();
  if (busy && T.ACTIVE.includes(busy.status)) throw new Error("Es läuft gerade ein anderer Cup – erst abbrechen oder fertig spielen.");
  const here = await get(tKey(channelId));
  if (here && !here.test && T.ACTIVE.concat("anmeldung").includes(here.status)) throw new Error("In diesem Kanal läuft eine echte Anmeldung – bitte einen eigenen Test-Kanal nehmen.");
  const clubs = await getClubs();
  const mine = clubOfUser(clubs, uid);
  const free = Array.from({ length: 40 }, (_, k) => `Test-Team ${k + 1}`).filter((n) => !clubs[n]);
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const virtual = free.slice(0, size - (mine ? 1 : 0));
  if (virtual.length < size - (mine ? 1 : 0)) throw new Error("Nicht genug freie Vereine für einen Test-Cup.");
  await launchTournament({ channelId, name: "🧪 Test-Cup", times: timesFromKickoff(Date.now() + 3 * 3600000) }, { replace: true });
  const { value: t } = await mutate(tKey(channelId), (x) => { x.test = true; x.virtual = virtual; x.reg = [...(mine ? [mine.club] : []), ...virtual]; });
  await set("testcup", channelId);
  await refreshSignup(t);
  return { mine, virtual };
}

/** Test-Cup in einem Rutsch bis zum Anpfiff bringen: Auslosung → alle einchecken → Spieltag 1 freigeben */
export async function fastForwardTestCup(channelId) {
  // Die großen Schritte (Auslosung, Gruppen posten, Anpfiff) erledigt der Minuten-Timer –
  // so werden sie nie vom Netlify-Zeitlimit abgeschnitten (sonst fehlen z. B. Posts in Gruppe A).
  const now = Date.now() - 1000;
  const { value } = await mutate(tKey(channelId), (x) => {
    if (!x.test) throw new Error("Hier läuft kein Test-Cup.");
    x.autoCheckin = true;
    x.times = { ...x.times, close: Math.min(x.times.close, now), checkinEnd: Math.min(x.times.checkinEnd, now), kickoff: Math.min(x.times.kickoff, now) };
  });
  return value;
}

/** Spiele zwischen zwei Test-Teams sofort mit Zufallsergebnis abschließen (auch über mehrere Runden). */
export async function playVirtualMatches(channelId, maxRounds = 12) {
  let played = 0;
  for (let loop = 0; loop < maxRounds; loop++) {
    const t0 = await get(tKey(channelId));
    if (!t0?.test || !["gruppen", "ko"].includes(t0.status)) break;
    const v = new Set(t0.virtual || []);
    const todo = T.currentMatches(t0).filter((m) => m.status !== "fertig" && v.has(m.home) && v.has(m.away) && T.isEditable(t0, m));
    if (!todo.length) break;
    for (const m0 of todo) {
      const h = Math.floor(Math.random() * 5), a = Math.floor(Math.random() * 5);
      const { value: t, result } = await mutate(tKey(channelId), (t) => {
        const m = t.matches.find((x) => x.id === m0.id);
        if (!m || m.status === "fertig") return null;
        Object.assign(m, { h, a, pen: m.phase === "ko" && h === a ? (Math.random() < 0.5 ? [5, 4] : [4, 5]) : null, status: "fertig", auto: true });
        return { events: T.advance(t) };
      });
      if (!result) continue;
      played++;
      await afterResult(t, t.matches.find((x) => x.id === m0.id), result.events);
    }
  }
  return played;
}
