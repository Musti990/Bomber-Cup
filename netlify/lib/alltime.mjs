// =========================================================
// 📊 All-Time-Statistik + 📜 Cup-Chronik – beides kommt aus EINER Quelle: der Chronik (chronik.mjs).
// - Siege pro Team werden aus der Chronik gezählt → passt immer zusammen
// - Nach jedem echten Cup: Sieger wird als nächste Cup-Nummer angehängt
// - Im Kanal „alltime“ stehen zwei Nachrichten: All-Time-Statistik und Cup-Chronik (je mehrere Bilder)
// Es wird nur gepostet, wenn der Kanal in der Einrichtung verknüpft ist.
// =========================================================
import { get, mutate, getConfig } from "./store.mjs";
import { discord, deleteMessage } from "./discord.mjs";
import { COLOR } from "./data.mjs";
import { chronik, addCup, countWins } from "./chronik.mjs";

/** Text-Liste „Name – 5“ einlesen (nur noch für Vergleiche/Tests); gleiche Namen werden zusammengezählt */
export function parseList(text) {
  const key = (n) => String(n).trim().toLowerCase().replace(/\s+/g, " ");
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

/** Siege pro Team [{ name, wins }] – aus der Chronik gezählt */
export async function allTimeList() {
  return countWins(await chronik());
}

/** Nach einem Cup: in die Chronik eintragen (zählt damit auch in der All-Time-Statistik) */
export async function addWin(team) {
  return addCup(team);
}

/** Eine Nachricht mit bis zu 10 Bildern posten und die alte (panels[slot]) ersetzen */
async function postPanel(ch, slot, embed, pages, prefix) {
  pages = pages.slice(0, 10); // Discord: max. 10 Bilder pro Nachricht
  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    allowed_mentions: { parse: [] },
    embeds: [{ color: COLOR, ...embed, footer: { text: `Stand: ${new Date().toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" })}` } }],
    attachments: pages.map((_, i) => ({ id: i, filename: `${prefix}-${i + 1}.png` })),
  }));
  pages.forEach((b, i) => form.append(`files[${i}]`, new Blob([b], { type: "image/png" }), `${prefix}-${i + 1}.png`));
  const msg = await discord(`/channels/${ch}/messages`, "POST", undefined, { form, maxWait: 15000 });
  if (!msg) return false;
  const panels = (await get("panels")) || {};
  if (panels[slot] && panels[slot] !== msg.id) await deleteMessage(ch, panels[slot]);
  await mutate("panels", (p) => { p[slot] = msg.id; }, { initial: { over: [] } });
  return true;
}

/** Beide Nachrichten neu bauen (nur wenn Kanal „alltime“ verknüpft ist) */
export async function refreshAllTime() {
  const cfg = await getConfig();
  const ch = cfg.channels?.alltime;
  if (!ch) return false;
  const { allTimePages, chronikPages } = await import("./alltimegfx.mjs");
  const cups = await chronik();
  const a = await postPanel(ch, "alltime", { title: "📊 All-Time-Statistik", description: "Alle Cup-Sieger seit Beginn – aktualisiert sich nach jedem Cup." }, await allTimePages(countWins(cups)), "alltime");
  const b = await postPanel(ch, "chronik", { title: "📜 Cup-Chronik", description: "Jeder Bomber Cup mit seinem Sieger – der neueste kommt automatisch dazu." }, await chronikPages(cups), "chronik");
  return a && b;
}
