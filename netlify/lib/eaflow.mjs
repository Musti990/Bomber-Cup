// TOTT (Team of the Tournament) aus EA-Daten.
// Läuft jede Minute (functions/ea-check.mjs): Für jedes beendete Cup-Spiel wird das passende Pro-Clubs-Spiel
// zwischen den beiden EA-Clubs gesucht und die Spielerwerte gesammelt. Nach dem Finale wird das TOTT
// (3-4-1-2) aus den besten Spielern aller Mannschaften gepostet.
// NEU: Ergebnisse werden direkt von EA übernommen (Spiel zwischen den beiden EA-Clubs nach der Freigabe).
// Melden per Hand bleibt als Notlösung (z. B. wenn ein Club nicht mit EA verknüpft ist).
import { get, mutate, getConfig, getClubs, tKey } from "./store.mjs";
import { sendMessage, sendWithFile } from "./discord.mjs";
import * as T from "./tournament.mjs";
import { allTournaments, afterResult, resultChannelOf, sendTemp } from "./flow.mjs";
import { isFreilos, flagOf } from "./data.mjs";
import * as EA from "./ea.mjs";

const MAX_TRIES = 20;            // pro Spiel ca. 20 Minuten lang nach den EA-Daten suchen
const SINCE_MARGIN = 5 * 60000;  // EA-Spiel darf bis 5 Min. vor Freigabe der Runde begonnen haben
const WAIT_AFTER_FINAL = 20 * 60000; // spätestens 20 Min. nach dem Finale wird gepostet
const RETRY_NOT_FOUND = 6 * 3600000, RETRY_ERROR = 30 * 60000;

export const eaEnabled = () => process.env.EA_AUTO !== "0";
export const eaResults = () => process.env.EA_RESULTS !== "0"; // Ergebnisse automatisch von EA
const sKey = (channelId) => `tott:${channelId}`;
const emptyState = (t) => ({ cup: t.createdAt, since: {}, links: {}, tries: {}, used: [], players: {}, finishSeen: null, posted: false });

// ---------- EA-Status (nur Staff) ----------
async function eaStatusPost(content) {
  const cfg = await getConfig();
  const ch = cfg.channels.eastatus;
  if (ch) await sendMessage(ch, { content: content.slice(0, 1990), allowed_mentions: { parse: [] } });
}
/** Kurze Zusammenfassung der erfassten Spielerdaten */
function statLine(players, home, away) {
  const by = (c) => players.filter((p) => p.club === c);
  const avg = (l) => { const r = l.filter((p) => p.rating != null); return r.length ? (r.reduce((a, p) => a + p.rating, 0) / r.length).toFixed(1) : "–"; };
  const mom = players.find((p) => p.mom);
  const scorers = players.filter((p) => p.goals > 0).map((p) => `${p.name} ${p.goals}×`).join(", ");
  return `👥 ${home}: **${by(home).length}** Spieler (Ø ${avg(by(home))}) · ${away}: **${by(away).length}** Spieler (Ø ${avg(by(away))})${scorers ? `\n⚽ ${scorers}` : ""}${mom ? `\n⭐ MOTM: ${mom.name}` : ""}`;
}

// ---------- EA-Club eines Vereins verknüpfen ----------
/**
 * Sucht die EA-Club-ID zum eingetragenen EA-Clubnamen und speichert sie (eaId, eaName).
 * id: ID direkt setzen (Turnierleitung). force: neu suchen, auch wenn schon verknüpft.
 */
export async function linkEaClub(name, { force = false, id = null } = {}) {
  const c = (await getClubs())[name];
  if (!c) throw new Error("Dieser Verein ist nicht vergeben.");
  if (id) {
    await mutate("clubs", (cl) => { if (cl[name]) Object.assign(cl[name], { eaId: String(id), eaName: null, eaLookup: { at: Date.now(), ok: true, manual: true } }); }, { initial: {} });
    return { found: { id: String(id), name: null } };
  }
  if (!c.ea) return { found: null, err: "Kein EA-Clubname eingetragen." };
  if (!force && c.eaId) return { found: { id: c.eaId, name: c.eaName } };
  const lk = c.eaLookup;
  if (!force && lk && !lk.ok && Date.now() - lk.at < (lk.err ? RETRY_ERROR : RETRY_NOT_FOUND)) return { found: null, err: lk.err };
  let found = null, err = null;
  try { found = await EA.searchClub(c.ea); } catch (e) { err = e.message; }
  await mutate("clubs", (cl) => {
    const x = cl[name]; if (!x || x.ea !== c.ea) return; // Name wurde zwischendurch geändert
    if (found) { x.eaId = found.id; x.eaName = found.name; } else if (!err) { x.eaId = null; x.eaName = null; }
    x.eaLookup = { at: Date.now(), ok: !!found, err };
  }, { initial: {} });
  return { found, err };
}

// ---------- Hauptlauf ----------
export async function runEaCheck(budgetMs = 22000) {
  if (!eaEnabled()) return;
  const start = Date.now(), left = () => budgetMs - (Date.now() - start);
  const recent = Date.now() - 36 * 3600000;
  const list = (await allTournaments()).filter((t) => !t.test && (["gruppen", "ko"].includes(t.status) || (t.status === "fertig" && t.createdAt > recent)));
  for (const t of list) {
    if (left() < 3000) break;
    try { await checkTournament(t, left); } catch (e) { console.error(`TOTT ${t.channelId}:`, e?.message || e); }
  }
}

async function loadState(t) {
  const s = await get(sKey(t.channelId));
  return s && s.cup === t.createdAt ? s : null;
}
const mutateState = (t, fn) => mutate(sKey(t.channelId), (s) => { if (s.cup !== t.createdAt) Object.assign(s, emptyState(t)); return fn(s); }, { initial: emptyState(t) });

async function checkTournament(t, left) {
  if (!t.kickoffDone && t.status !== "fertig") return; // erst ab Anpfiff (z. B. 20 Uhr)
  let s = await loadState(t);
  if (s?.posted) return;

  // 1) Freigabezeitpunkt der aktuellen Runde merken (Zeitfenster für die EA-Suche)
  const cur = T.currentMatches(t).filter((m) => !s?.since?.[m.id]);
  if (cur.length || !s || (t.status === "fertig" && !s.finishSeen)) {
    ({ value: s } = await mutateState(t, (x) => {
      for (const m of cur) if (!x.since[m.id]) x.since[m.id] = Date.now() - SINCE_MARGIN;
      if (t.status === "fertig" && !x.finishSeen) x.finishSeen = Date.now();
    }));
  }

  // 1b) NEU: Offene Spiele der aktuellen Runde → Ergebnis direkt von EA übernehmen
  if (eaResults() && ["gruppen", "ko"].includes(t.status)) {
    const open = T.currentMatches(t).filter((m) => m.status !== "fertig" && !m.ff && !isFreilos(m.home) && !isFreilos(m.away));
    if (open.length) {
      let clubs = await getClubs();
      const need = [...new Set(open.flatMap((m) => [m.home, m.away]))].filter((c) => clubs[c] && !clubs[c].eaId && !(clubs[c].eaLookup && Date.now() - clubs[c].eaLookup.at < 10 * 60000));
      for (const c of need) { if (left() < 8000) break; await linkEaClub(c).catch(() => {}); }
      if (need.length) clubs = await getClubs();
      const cache = new Map();
      for (const m of open) {
        if (left() < 5000) break;
        const H = clubs[m.home]?.eaId, A = clubs[m.away]?.eaId;
        if (!H || !A) {
          // nicht verknüpft → Teams melden selbst (einmal pro Spiel an den Staff)
          if (!s.noLink?.[m.id]) {
            ({ value: s } = await mutateState(t, (x) => { x.noLink = { ...(x.noLink || {}), [m.id]: true }; }));
            await eaStatusPost(`🔗 **Spiel #${m.id}** ${m.home} – ${m.away}: ${[!H && m.home, !A && m.away].filter(Boolean).map((c) => `**${c}**`).join(" und ")} nicht mit EA verknüpft → Ergebnis muss gemeldet werden (\`/cup-admin ea-verknüpfen\`).`);
          }
          continue;
        }
        let ms = cache.get(H);
        if (!ms) { ms = await EA.recentMatches(H, 10).catch(() => []); cache.set(H, ms); }
        const since = s.since[m.id] ?? t.times.kickoff - SINCE_MARGIN;
        const cfg = await getConfig();
        const ch = resultChannelOf(cfg, m);
        // Alle Spiele der beiden seit der Freigabe – abgebrochene (Quit / zu kurz) zählen NICHT
        const list = EA.findMatchBetween(ms, H, A, since, s.used, { all: true }).sort((x, y) => Number(x.timestamp) - Number(y.timestamp));
        let em = null;
        for (const cand of list) {
          const ab = EA.abortInfo(cand), cid = EA.matchIdOf(cand);
          if (!ab.aborted) { em = cand; break; }
          if (!s.used.includes(cid)) {
            ({ value: s } = await mutateState(t, (x) => { if (!x.used.includes(cid)) x.used.push(cid); x.aborted = { ...(x.aborted || {}), [cid]: m.id }; }));
            // Nur für die Turnierleitung (eigener Kanal) – die Teams starten ohnehin neu
            (await import("./botlog.mjs")).botLog(`🚨 **EA-Abbruch** ignoriert · ${m.home} – ${m.away} (${ab.why})`);
            const staffCh = cfg.channels.eaabort || cfg.channels.log;
            if (staffCh) await sendMessage(staffCh, { content: `⚠️ **Abgebrochenes Spiel (nicht gewertet):** ${flagOf(m.home)} **${m.home}** ${EA.goalsOf(cand, H)}:${EA.goalsOf(cand, A)} **${m.away}** ${flagOf(m.away)} · Spiel #${m.id} – ${ab.why}. Der Bot wartet auf das neue Spiel.`, allowed_mentions: { parse: [] } });
          }
        }
        if (!em) continue;
        const h = EA.goalsOf(em, H), a = EA.goalsOf(em, A), eid = EA.matchIdOf(em);
        if (m.phase === "ko" && h === a) {
          // K.-o. unentschieden: Elfmeter stehen nicht in den EA-Daten → Teams melden das Elfmeterschießen
          if (!s.drawNote?.[m.id]) {
            ({ value: s } = await mutateState(t, (x) => { x.drawNote = { ...(x.drawNote || {}), [m.id]: true }; }));
            if (ch) await sendMessage(ch, { content: `📡 Laut EA: ${flagOf(m.home)} **${m.home}** ${h}:${a} **${m.away}** ${flagOf(m.away)} – unentschieden. Bitte das **Elfmeterschießen** über *Ergebnis melden* eintragen.`, allowed_mentions: { parse: [] } });
          }
          continue;
        }
        let res;
        try {
          ({ value: t, result: res } = await mutate(tKey(t.channelId), (x) => {
            const mm = x.matches.find((z) => z.id === m.id);
            if (!mm || mm.status === "fertig") return null; // inzwischen erledigt
            T.adminSet(x, m.id, h, a, null);
            return { events: T.advance(x) };
          }));
        } catch (e) { console.error("EA-Ergebnis:", e.message); continue; }
        if (!res) continue;
        // Spielerwerte gleich fürs TOTT merken
        const players = EA.playersOf(em, [{ club: m.home, eaId: H, oppEaId: A }, { club: m.away, eaId: A, oppEaId: H }]);
        ({ value: s } = await mutateState(t, (x) => {
          if (x.links[m.id] || x.used.includes(eid)) return;
          x.links[m.id] = eid; x.used.push(eid);
          for (const p of players) addPlayer(x.players, p);
        }));
        const done = t.matches.find((z) => z.id === m.id);
        await afterResult(t, done, res.events, true);
        const info = EA.abortInfo(em);
        await eaStatusPost(`✅ **EA-Daten erfasst · Spiel #${m.id}** (${m.phase === "gruppe" ? `Gruppe ${m.group}, Spieltag ${m.round}` : "K.-o."})\n📊 ${m.home} **${h}:${a}** ${m.away} · Ergebnis automatisch übernommen${info.min != null ? ` · ${info.min} Min.` : ""}\n${statLine(players, m.home, m.away)}`);
        if (ch) await sendTemp(ch, { content: `📡 **Ergebnis automatisch von EA übernommen:** ${flagOf(m.home)} **${m.home}** ${h}:${a} **${m.away}** ${flagOf(m.away)}${info.overtime && m.phase === "gruppe" ? "\n-# ⚠️ Laut EA wurde über 90 Minuten hinaus gespielt – Tore aus der Verlängerung zählen mit. In der Gruppenphase bei Unentschieden direkt nach Abpfiff verlassen." : ""}`, allowed_mentions: { parse: [] } });
      }
    }
  }

  // 2) Beendete Spiele, zu denen noch EA-Daten fehlen
  const cand = t.matches.filter((m) => m.status === "fertig" && !m.ff && !isFreilos(m.home) && !isFreilos(m.away) && !s.links[m.id] && (s.tries[m.id] || 0) < MAX_TRIES);

  if (cand.length) {
    let clubs = await getClubs();
    const need = [...new Set(cand.flatMap((m) => [m.home, m.away]))].filter((c) => clubs[c] && !clubs[c].eaId);
    for (const c of need) { if (left() < 6000) break; await linkEaClub(c); }
    if (need.length) clubs = await getClubs();

    const cache = new Map(), missed = [], found = [];
    const used = new Set(s.used);
    for (const m of cand) {
      if (left() < 4000) break;
      const H = clubs[m.home]?.eaId, A = clubs[m.away]?.eaId;
      if (!H || !A) { missed.push(m.id); continue; }
      let ms = cache.get(H);
      if (!ms) { ms = await EA.recentMatches(H, 10).catch((e) => { console.error("EA:", e.message); return []; }); cache.set(H, ms); }
      const since = s.since[m.id] ?? t.times.kickoff - SINCE_MARGIN;
      const em = EA.findMatchBetween(ms, H, A, since, [...used], { all: true }).sort((x, y) => Number(x.timestamp) - Number(y.timestamp)).find((z) => !EA.abortInfo(z).aborted) || null;
      if (!em) { missed.push(m.id); continue; }
      used.add(EA.matchIdOf(em));
      const fp = EA.playersOf(em, [{ club: m.home, eaId: H, oppEaId: A }, { club: m.away, eaId: A, oppEaId: H }]);
      found.push({ id: m.id, eid: EA.matchIdOf(em), players: fp });
      const eh = EA.goalsOf(em, H), eaA = EA.goalsOf(em, A);
      await eaStatusPost(`✅ **EA-Daten erfasst · Spiel #${m.id}** (Statistik zum gemeldeten Ergebnis)\n📊 gemeldet ${m.home} **${m.h}:${m.a}** ${m.away}${eh !== m.h || eaA !== m.a ? ` · ⚠️ **laut EA ${eh}:${eaA}** – bitte prüfen` : " · stimmt mit EA überein"}\n${statLine(fp, m.home, m.away)}`);
    }
    if (missed.length || found.length) {
      ({ value: s } = await mutateState(t, (x) => {
        for (const id of missed) { x.tries[id] = (x.tries[id] || 0) + 1; if (x.tries[id] === MAX_TRIES) (x.gaveUp ||= []).push(id); }
        for (const f of found) {
          if (x.links[f.id] || x.used.includes(f.eid)) continue;
          x.links[f.id] = f.eid; x.used.push(f.eid);
          for (const p of f.players) addPlayer(x.players, p);
        }
      }));
    }
  }

  // 2b) Spiele ohne EA-Daten (nach allen Versuchen) einmal melden
  if (s.gaveUp?.length) {
    const ids = s.gaveUp.filter((id) => !(s.gaveUpPosted || []).includes(id));
    for (const id of ids) { const m = t.matches.find((z) => z.id === id); if (m) await eaStatusPost(`❌ **Keine EA-Daten · Spiel #${id}** ${m.home} ${m.h}:${m.a} ${m.away} – EA hat das Spiel nicht geliefert (andere Plattform/Modus, falscher Club oder nicht gespielt). Zählt nicht fürs TOTT.`); }
    if (ids.length) ({ value: s } = await mutateState(t, (x) => { x.gaveUpPosted = [...(x.gaveUpPosted || []), ...ids]; }));
  }

  // 3) Nach dem Finale posten: wenn alle Spiele erledigt sind oder die Wartezeit um ist
  if (t.status !== "fertig") return;
  const open = t.matches.some((m) => m.status === "fertig" && !m.ff && !isFreilos(m.home) && !isFreilos(m.away) && !s.links[m.id] && (s.tries[m.id] || 0) < MAX_TRIES);
  if (open && Date.now() - (s.finishSeen || Date.now()) < WAIT_AFTER_FINAL) return;
  await postTott(t);
}

function addPlayer(players, p) {
  const k = `${p.club}|${p.name}`;
  const x = players[k] ||= { club: p.club, name: p.name, games: 0, rSum: 0, rGames: 0, goals: 0, assists: 0, mom: 0, cs: 0, pos: {} };
  x.games++;
  if (p.rating != null) { x.rSum += p.rating; x.rGames++; }
  x.goals += p.goals; x.assists += p.assists; x.mom += p.mom ? 1 : 0; x.cs += p.cs ? 1 : 0;
  if (p.pos) x.pos[p.pos] = (x.pos[p.pos] || 0) + 1;
}

// ---------- Posten ----------
/** TOTT posten. force: auch wenn schon gepostet / Cup noch läuft (Turnierleitung). */
export async function postTott(t, { force = false } = {}) {
  const { value: s, result: claim } = await mutateState(t, (x) => { if (x.posted && !force) return false; x.posted = true; return true; });
  if (!claim) return { posted: false, reason: "schon gepostet" };
  const { pickTott, tottImage } = await import("./tott.mjs");
  const team = pickTott(Object.values(s.players));
  const cfg = await getConfig();
  const ch = cfg.channels.tott || t.channelId;
  if (!team.count) {
    if (cfg.channels.log) await sendMessage(cfg.channels.log, { content: `⭐ **TOTT · ${t.name}:** Keine EA-Spielerdaten gefunden – sind die EA-Clubs verknüpft? (\`/cup-admin ea-status\`)` });
    return { posted: false, reason: "keine EA-Daten" };
  }
  const potT = team.pot;
  const text = { content: `⭐ **TOTT · ${t.name}**\n🏅 Spieler des Turniers: **${potT.name}** · ${flagOf(potT.club)} ${potT.club} · Ø ${potT.avg.toFixed(1)} · ${potT.goals} T · ${potT.assists} V\n-# Aus ${Object.keys(s.links).length} Spielen mit EA-Daten · 4-3-3` };
  try {
    const img = await tottImage({ title: t.name, team, matches: Object.keys(s.links).length });
    await sendWithFile(ch, text, "tott.png", img);
  } catch (e) {
    console.error("TOTT-Bild:", e);
    await sendMessage(ch, { content: text.content + "\n\n" + team.lines.map((l) => `**${l.label}:** ${l.players.map((p) => p ? `${p.name} (${p.club}, ${p.avg.toFixed(1)})` : "–").join(" · ")}`).join("\n") });
  }
  return { posted: true, channel: ch };
}

/** Kurzer Status für /cup-admin ea-status */
export async function eaStatus(t) {
  const clubs = await getClubs();
  const teams = [...new Set((t.playing?.length ? t.playing : t.reg || []))].filter((c) => !isFreilos(c));
  const s = await loadState(t);
  const line = (c) => {
    const x = clubs[c];
    if (!x) return `${flagOf(c)} ${c} – nicht mehr vergeben`;
    if (x.eaId) return `✅ ${flagOf(c)} ${c} → **${x.eaName || x.ea}** (ID ${x.eaId})`;
    return `⚠️ ${flagOf(c)} ${c} → „${x.ea || "–"}“ ${x.eaLookup?.err ? "(EA nicht erreichbar)" : x.eaLookup ? "nicht gefunden" : "noch nicht gesucht"}`;
  };
  const head = s ? `📊 ${Object.keys(s.links).length} Spiele mit EA-Daten · ${Object.keys(s.players).length} Spieler gesammelt${s.posted ? " · TOTT gepostet" : ""}\n` : "📊 Noch keine EA-Daten gesammelt\n";
  return head + (teams.length ? teams.map(line).join("\n") : "Keine Mannschaften.");
}

/** Letztes Turnier für /cup-admin tott: das im aktuellen Kanal, sonst das neueste mit Anpfiff. */
export async function latestTournament(channelId) {
  const own = await get(tKey(channelId));
  if (own && (own.kickoffDone || own.status === "fertig")) return own;
  const all = (await allTournaments()).filter((t) => t.kickoffDone || t.status === "fertig");
  return all.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}
