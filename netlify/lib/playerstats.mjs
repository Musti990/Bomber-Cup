// =========================================================
// 👟 All-Time-Spielerwerte aus den EA-Daten: Tore, Vorlagen, Zu-null-Spiele (Torhüter).
// Nach jedem echten Cup (beim TOTT) werden die Werte aller Spieler dazugezählt.
// Schlüssel = Spielername (wechselt ein Spieler das Team, zählt er weiter – angezeigt wird das letzte Team).
// Bestenlisten als Bilder im Kanal „alltime“ (eigene Nachricht), werden nach jedem Cup ersetzt.
// =========================================================
import { get, mutate, getConfig } from "./store.mjs";
import { discord, deleteMessage } from "./discord.mjs";
import { COLOR } from "./data.mjs";

const key = (n) => String(n).trim().toLowerCase();

/** Werte eines Cups dazuzählen. players: Objekt aus dem TOTT-Sammler ({ club, name, games, goals, assists, cs, pos }) */
export async function addCupPlayers(players, cupId) {
  const list = Object.values(players || {});
  if (!list.length) return 0;
  const { result } = await mutate("playerstats", (S) => {
    S.players ||= {};
    S.cups ||= [];
    if (cupId && S.cups.includes(cupId)) return 0; // nie doppelt zählen
    if (cupId) S.cups.push(cupId);
    for (const p of list) {
      const k = key(p.name);
      const x = S.players[k] ||= { name: p.name, club: p.club, goals: 0, assists: 0, cs: 0, games: 0, gkGames: 0, cups: 0 };
      const isGk = Object.entries(p.pos || {}).sort((a, b) => b[1] - a[1])[0]?.[0] === "goalkeeper";
      x.name = p.name; x.club = p.club;
      x.goals += p.goals || 0; x.assists += p.assists || 0; x.games += p.games || 0; x.cups += 1;
      if (isGk) { x.cs += p.cs || 0; x.gkGames += p.games || 0; }
    }
    S.updated = Date.now();
    return list.length;
  }, { initial: {} });
  return result;
}

/** Bestenlisten: { scorers, assists, keepers } – je Top N */
export async function boards(n = 10) {
  const all = Object.values(((await get("playerstats")) || {}).players || {});
  const top = (field, filter = () => true) => all.filter((p) => p[field] > 0 && filter(p)).sort((a, b) => b[field] - a[field] || a.games - b.games || a.name.localeCompare(b.name)).slice(0, n);
  return { scorers: top("goals"), assists: top("assists"), keepers: top("cs", (p) => p.gkGames > 0), total: all.length };
}

/** Bilder bauen und im Kanal „alltime“ die alte Bestenlisten-Nachricht ersetzen */
export async function refreshPlayerBoards() {
  const cfg = await getConfig();
  const ch = cfg.channels?.alltime;
  if (!ch) return false;
  const b = await boards(10);
  if (!b.total) return false;
  const { leaderboardImage } = await import("./alltimegfx.mjs");
  const pages = [
    await leaderboardImage({ title: "TOP-TORSCHÜTZEN", sub: "All-Time · Tore", rows: b.scorers, field: "goals", unit: "TORE" }),
    await leaderboardImage({ title: "TOP-VORLAGEN", sub: "All-Time · Assists", rows: b.assists, field: "assists", unit: "ASSISTS" }),
    await leaderboardImage({ title: "TOP-TORHÜTER", sub: "All-Time · Zu-null-Spiele", rows: b.keepers, field: "cs", unit: "CLEAN SHEETS" }),
  ];
  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    allowed_mentions: { parse: [] },
    embeds: [{ color: COLOR, title: "👟 All-Time-Bestenlisten", description: "Torschützen, Vorlagengeber und Torhüter (Zu-null-Spiele) über alle Cups – Daten direkt von EA, aktualisiert sich nach jedem Cup.", footer: { text: `Stand: ${new Date().toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" })}` } }],
    attachments: pages.map((_, i) => ({ id: i, filename: `bestenliste-${i + 1}.png` })),
  }));
  pages.forEach((buf, i) => form.append(`files[${i}]`, new Blob([buf], { type: "image/png" }), `bestenliste-${i + 1}.png`));
  const msg = await discord(`/channels/${ch}/messages`, "POST", undefined, { form, maxWait: 15000 });
  if (!msg) return false;
  const panels = (await get("panels")) || {};
  if (panels.players && panels.players !== msg.id) await deleteMessage(ch, panels.players);
  await mutate("panels", (p) => { p.players = msg.id; }, { initial: { over: [] } });
  return true;
}
