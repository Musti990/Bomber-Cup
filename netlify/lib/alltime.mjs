// =========================================================
// 📊 All-Time-Statistik: Cup-Siege aller Zeiten (alte Liste + jeder neue Cup).
// - Startwerte aus daten/alltime.txt (einmalig in den Speicher übernommen)
// - Nach jedem echten Cup: Sieger +1 (gleicher Name ohne Groß/Klein = gleiches Team)
// - Bilder (alle Teams, mehrere Seiten) als EINE Nachricht im Kanal „alltime“, wird bei Änderung ersetzt
// Es wird nur gepostet, wenn der Kanal in der Einrichtung verknüpft ist.
// =========================================================
import fs from "node:fs";
import path from "node:path";
import { get, set, mutate, getConfig } from "./store.mjs";
import { discord, deleteMessage } from "./discord.mjs";
import { COLOR } from "./data.mjs";

const key = (n) => String(n).trim().toLowerCase().replace(/\s+/g, " ");

/** Text-Liste „Name – 5“ einlesen; gleiche Namen (Groß/Klein egal) werden zusammengezählt */
export function parseList(text) {
  const map = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^(.*?)\s+[–-]\s+(\d+)\s*(?:Cups?)?\s*$/);
    if (!m) continue;
    const name = m[1].trim(), k = key(name);
    const old = map.get(k);
    map.set(k, { name: old?.name ?? name, wins: (old?.wins ?? 0) + Number(m[2]) });
  }
  return [...map.values()];
}

function seed() {
  const tries = [path.resolve(process.cwd(), "daten/alltime.txt")];
  for (const f of tries) if (fs.existsSync(f)) return parseList(fs.readFileSync(f, "utf8"));
  return [];
}

/** Aktuelle Liste [{ name, wins }] (beim ersten Aufruf aus daten/alltime.txt) */
export async function allTimeList() {
  let s = await get("alltime");
  if (!s) {
    s = { teams: seed(), updated: Date.now() };
    await set("alltime", s);
  }
  return s.teams;
}

/** Nach einem Cup: Sieger +1 */
export async function addWin(team) {
  if (!team) return;
  await allTimeList();
  await mutate("alltime", (s) => {
    const t = s.teams.find((x) => key(x.name) === key(team));
    if (t) t.wins++;
    else s.teams.push({ name: team, wins: 1 });
    s.updated = Date.now();
  });
}

/** Ein Team suchen → { name, wins, place, of } oder Vorschläge */
export async function findTeam(q) {
  const { rank } = await import("./alltimegfx.mjs");
  const R = rank(await allTimeList());
  const k = key(q);
  const hit = R.find((t) => key(t.name) === k);
  if (hit) return { hit, of: R.length };
  const like = R.filter((t) => key(t.name).includes(k)).slice(0, 10);
  return { like, of: R.length };
}

/** Bilder neu bauen und die alte Nachricht ersetzen (nur wenn Kanal „alltime“ verknüpft ist) */
export async function refreshAllTime() {
  const cfg = await getConfig();
  const ch = cfg.channels?.alltime;
  if (!ch) return false;
  const { allTimePages } = await import("./alltimegfx.mjs");
  const pages = (await allTimePages(await allTimeList())).slice(0, 10); // Discord: max. 10 Bilder pro Nachricht
  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    allowed_mentions: { parse: [] },
    embeds: [{ color: COLOR, title: "📊 All-Time-Statistik", description: "Alle Cup-Sieger seit Beginn – aktualisiert sich nach jedem Cup.", footer: { text: `Stand: ${new Date().toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" })}` } }],
    attachments: pages.map((_, i) => ({ id: i, filename: `alltime-${i + 1}.png` })),
  }));
  pages.forEach((b, i) => form.append(`files[${i}]`, new Blob([b], { type: "image/png" }), `alltime-${i + 1}.png`));
  const msg = await discord(`/channels/${ch}/messages`, "POST", undefined, { form, maxWait: 15000 });
  if (!msg) return false;
  const panels = (await get("panels")) || {};
  if (panels.alltime && panels.alltime !== msg.id) await deleteMessage(ch, panels.alltime);
  await mutate("panels", (p) => { p.alltime = msg.id; }, { initial: { over: [] } });
  return true;
}
