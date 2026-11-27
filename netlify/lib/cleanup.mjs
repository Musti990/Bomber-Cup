// Aufräumen nach dem Cup: alle Nachrichten des Cups in den Turnier-Kanälen löschen.
import { get, mutate, getConfig } from "./store.mjs";
import { discord, deleteMessage } from "./discord.mjs";
import { isOwnChannel } from "./safe.mjs";
import { GROUP_NAMES } from "./data.mjs";

export const CLEANUP_DELAY_MIN = 30; // so viele Minuten nach Turnierende wird aufgeräumt

/** Aufräumen für ein Turnier einplanen */
export async function scheduleCleanup(t, delayMin = CLEANUP_DELAY_MIN) {
  const cfg = await getConfig();
  const c = cfg.channels || {};
  const channels = [
    t.channelId, c.live, c.log, c.ko, c.kor,
    ...GROUP_NAMES.flatMap((g) => [c["g" + g], c["r" + g]]),
  ].filter(Boolean);
  const since = (t.createdAt || Date.now()) - 60 * 1000;
  // alle Nachrichten-IDs dieses Cups (Gruppenbilder, Live-Spielplan, Turnierbaum …) – auch wenn sie älter sind als der Cup
  const ids = []; const walk = (o) => { if (!o) return; if (typeof o === "string" && /^\d{15,}$/.test(o)) ids.push(o); else if (typeof o === "object") Object.values(o).forEach(walk); };
  walk(t.msgs);
  const done = (await get("cleanupDone")) || [];
  if (done.includes(t.channelId + ":" + t.createdAt)) return; // schon aufgeräumt
  await mutate("cleanup", (l) => {
    if (l.some((j) => j.tid === t.channelId + ":" + t.createdAt)) return;
    l.push({ tid: t.channelId + ":" + t.createdAt, at: Date.now() + delayMin * 60000, since, until: Date.now() + 60 * 1000, ids, channels: [...new Set(channels)] });
  }, { initial: [] });
}

/** Nachrichten eines Kanals seit `since` holen (neueste zuerst) */
async function messagesSince(ch, since, max = 500, until = Infinity) {
  const out = [];
  let before = null;
  while (out.length < max) {
    const batch = await discord(`/channels/${ch}/messages?limit=100${before ? `&before=${before}` : ""}`);
    if (!batch?.length) break;
    for (const m of batch) { const ts = Date.parse(m.timestamp); if (ts >= since && ts <= until) out.push(m.id); }
    if (batch.length < 100 || Date.parse(batch[batch.length - 1].timestamp) < since) break;
    before = batch[batch.length - 1].id;
  }
  return out;
}

async function wipe(ch, since, cupIds = [], keep = [], until = Infinity) {
  if (!(await isOwnChannel(ch))) return 0; // Sicher-Modus: fremde Kanäle nie leeren
  const keepSet = new Set(keep);
  // Nachrichten seit Cup-Beginn + die bekannten Cup-Posts in diesem Kanal (z. B. ein älteres Live-Bild)
  const recent = await messagesSince(ch, since, 500, until); // nur bis zum Cup-Ende – spätere Posts (z. B. eine neue Anmeldeliste) bleiben
  const all = (await discord(`/channels/${ch}/messages?limit=100`)) || [];
  const known = all.filter((m) => cupIds.includes(m.id)).map((m) => m.id);
  const ids = [...new Set([...recent, ...known])].filter((id) => !keepSet.has(id));
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (chunk.length === 1) await deleteMessage(ch, chunk[0]);
    else if (!(await discord(`/channels/${ch}/messages/bulk-delete`, "POST", { messages: chunk }))) for (const id of chunk) await deleteMessage(ch, id);
  }
  return ids.length;
}

/**
 * Vor jeder Freigabe: alle Nachrichten im Kanal löschen, außer `keep` (z. B. der Spielplan).
 * Nur Nachrichten der letzten 13 Tage – ältere kann Discord nicht in einem Rutsch löschen.
 */
export async function purgeExcept(ch, keep = []) {
  if (!ch) return 0;
  if (!(await isOwnChannel(ch))) return 0; // Sicher-Modus: fremde Kanäle nie leeren
  const keepSet = new Set(keep.filter(Boolean));
  const ids = (await messagesSince(ch, Date.now() - 13 * 86400000, 300)).filter((id) => !keepSet.has(id));
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (chunk.length === 1) await deleteMessage(ch, chunk[0]);
    else if (!(await discord(`/channels/${ch}/messages/bulk-delete`, "POST", { messages: chunk }))) for (const id of chunk) await deleteMessage(ch, id);
  }
  return ids.length;
}

/** 🧹 Manuelles Säubern (Admin-Panel): Kanäle in die Warteschlange, Panels & aktuelle Cup-Posts bleiben */
export async function queueClean(channels) {
  await mutate("cleanjobs", (l) => { for (const ch of channels) if (ch && !l.includes(ch)) l.push(ch); }, { initial: [] });
}
/** Nachrichten aller noch laufenden/offenen Cups (Anmeldelisten usw.) – werden nie gelöscht */
async function runningCupIds() {
  const ids = new Set();
  const F = await import("./flow.mjs");
  const walk = (o) => { if (!o) return; if (typeof o === "string" && /^\d{15,}$/.test(o)) ids.add(o); else if (typeof o === "object") Object.values(o).forEach(walk); };
  for (const t of await F.allTournaments()) if (!["fertig", "abgesagt", "geloescht"].includes(t.status)) walk(t.msgs);
  return [...ids];
}

/** Alle Panel-Nachrichten (Admin-Panel, Ergebnis-Panels usw.) – werden beim Aufräumen nie gelöscht */
async function keepPanelIds() {
  const keep = new Set();
  const p = (await get("panels")) || {};
  for (const v of Object.values(p)) (Array.isArray(v) ? v : [v]).forEach((x) => typeof x === "string" && /^\d+$/.test(x) && keep.add(x));
  return [...keep];
}

/** IDs, die nie gelöscht werden: alle Panels + Posts des aktuellen Cups */
async function keepIds() {
  const keep = new Set();
  const p = (await get("panels")) || {};
  for (const v of Object.values(p)) (Array.isArray(v) ? v : [v]).forEach((x) => typeof x === "string" && /^\d+$/.test(x) && keep.add(x));
  const F = await import("./flow.mjs");
  const t = await F.currentCup().catch(() => null);
  const walk = (o) => { if (!o) return; if (typeof o === "string" && /^\d{15,}$/.test(o)) keep.add(o); else if (typeof o === "object") Object.values(o).forEach(walk); };
  if (t && !["fertig", "abgesagt", "geloescht"].includes(t.status)) walk(t.msgs);
  for (const id of await runningCupIds()) keep.add(id);
  return [...keep];
}
export async function runCleanJobs(budgetMs = 6000) {
  const deadline = Date.now() + budgetMs;
  let list = (await get("cleanjobs")) || [];
  if (!list.length) return 0;
  const keep = await keepIds();
  let n = 0;
  while (list.length && Date.now() < deadline - 1500) {
    const ch = list[0];
    try { n += await purgeExcept(ch, keep); } catch (e) { console.error("Säubern:", e?.message || e); }
    await mutate("cleanjobs", (l) => { const i = l.indexOf(ch); if (i >= 0) l.splice(i, 1); }, { initial: [] });
    list = list.slice(1);
  }
  return n;
}

/** Vom Timer: fällige Aufräum-Aufträge abarbeiten */
export async function runCleanup(budgetMs = 8000, now = Date.now()) {
  const deadline = Date.now() + budgetMs;
  const list = (await get("cleanup")) || [];
  const due = list.filter((j) => j.at <= now);
  const keep = due.length ? [...(await keepPanelIds()), ...(await runningCupIds())] : [];
  let total = 0;
  for (const job of due) {
    while (job.channels.length && Date.now() < deadline - 1500) {
      const ch = job.channels[0];
      try { total += await wipe(ch, job.since, job.ids || [], keep, job.until || Infinity); } catch (e) { console.error("Aufräumen:", e?.message || e); }
      job.channels.shift();
      await mutate("cleanup", (l) => { const j = l.find((x) => x.tid === job.tid); if (j) j.channels = [...job.channels]; }, { initial: [] });
    }
    if (!job.channels.length) {
      await mutate("cleanup", (l) => { const i = l.findIndex((x) => x.tid === job.tid); if (i >= 0) l.splice(i, 1); }, { initial: [] });
      await mutate("cleanupDone", (l) => { if (!l.includes(job.tid)) l.push(job.tid); while (l.length > 200) l.shift(); }, { initial: [] });
      // nur melden, wenn wirklich etwas gelöscht wurde
      if (total > 0) (await import("./botlog.mjs")).botLog(`🧹 **Aufräumen nach dem Cup** erledigt – ${total} Nachrichten gelöscht (Panels und offene Anmeldungen bleiben).`);
      total = 0;
    }
    if (Date.now() >= deadline - 1500) break;
  }
}
