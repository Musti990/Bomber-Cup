// ⚙️ Admin-Panel (nur Turnierleitung): alle wichtigen Werkzeuge als Buttons
import { COLOR } from "./data.mjs";
const b = (label, id, emoji, style = 2, disabled = false) => ({ type: 2, style, label, custom_id: id, emoji: { name: emoji }, disabled });
const row = (...c) => ({ type: 1, components: c });

const ST = { anmeldung: ["📝", "Anmeldung offen"], checkin: ["🕗", "Check-in läuft"], gruppen: ["⚽", "Gruppenphase"], ko: ["⚔️", "K.-o.-Phase"], fertig: ["🏁", "beendet"], abgesagt: ["❌", "abgesagt"], geloescht: ["🗑️", "ersetzt"] };
/** Übersicht aller Cups: offene zuerst, dann die letzten beendeten */
function cupList(cups = []) {
  const open = cups.filter((c) => ["anmeldung", "checkin", "gruppen", "ko"].includes(c.status)).sort((a, b) => (a.times?.kickoff || 0) - (b.times?.kickoff || 0));
  const done = cups.filter((c) => !open.includes(c) && c.status !== "geloescht").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 3);
  const line = (c) => {
    const [e, txt] = ST[c.status] || ["•", c.status];
    const extra = c.status === "anmeldung" ? ` · ${c.reg.length} Teams · Anpfiff <t:${Math.floor(c.times.kickoff / 1000)}:f>` : c.status === "checkin" ? ` · ${c.checked.length}/${c.reg.length} eingecheckt` : c.status === "gruppen" ? ` · Spieltag ${c.round}` : c.status === "fertig" && c.champion ? ` · 🏆 ${c.champion}` : "";
    return `${e} **${c.name}**${c.test ? " 🧪" : ""} · ${txt}${extra} · <#${c.channelId}>`;
  };
  return [
    `**🟢 Offene Cups (${open.length})**`, ...(open.length ? open.map(line) : ["-# keiner – mit *Neuer Cup* starten"]),
    ...(done.length ? ["", "**⚪ Zuletzt beendet**", ...done.map(line)] : []),
  ].join("\n").slice(0, 1800);
}

export function adminPanel(t, cups = []) {
  const st = t?.status;
  const statusLine = !t ? "💤 **Kein Cup aktiv** – mit *Neuer Cup* starten"
    : st === "anmeldung" ? `📝 **${t.name}** · Anmeldung offen · ${t.reg.length} Teams angemeldet`
    : st === "checkin" ? `🕗 **${t.name}** · Check-in läuft · ${t.checked.length}/${t.reg.length} eingecheckt`
    : st === "gruppen" ? `⚽ **${t.name}** · Gruppenphase · Spieltag ${t.round}`
    : st === "ko" ? `⚔️ **${t.name}** · K.-o.-Phase`
    : `🏁 **${t.name}** · beendet`;
  return {
    embeds: [{
      color: COLOR,
      title: "⚙️ ADMIN-PANEL · BOMBER CUP",
      description: [
        statusLine,
        "",
        cupList(cups),
        "",
        "**🏆 Cup** – Neuer Cup · Anmeldeschluss · Check-in beenden · Abbrechen",
        "**👥 Teams** – Team hinzufügen · abmelden · Freilos + / − · Team auflösen",
        "**⚽ Spiele** – offene Spiele · Ergebnis festlegen · EA verknüpfen · TOTT posten",
        "**🚫 Sperren** – sperren · Sperre aufheben",
        "**🧪 Test & Pflege** – Test-Cup · Test-Spiele · Kanäle säubern · Panel einzeln posten · alle Panels · Rechte · Status",
      ].join("\n"),
      footer: { text: "Nur Turnierleitung · Antworten siehst nur du" },
    }],
    components: [
      row(b("Neuer Cup", "adm:new", "🆕", 3, !!t && ["anmeldung", "checkin", "gruppen", "ko"].includes(st)), b("Anmeldeschluss", "adm:close", "⏩", 1, st !== "anmeldung"), b("Check-in beenden", "adm:ciend", "✅", 1, st !== "checkin"), b("Cup abbrechen", "adm:cancel", "🛑", 4, !t || st === "fertig")),
      row(b("Team hinzufügen", "adm:add", "➕", 2), b("Team abmelden", "adm:rem", "➖", 2), b("Freilos +", "adm:fl+", "🎟️", 2), b("Freilos −", "adm:fl-", "🎟️", 2), b("Team auflösen", "adm:del", "🗑️", 4)),
      row(b("Offene Spiele", "adm:games", "📋", 2), b("Ergebnis festlegen", "adm:result", "✏️", 1), b("EA verknüpfen", "adm:ea", "🔗", 2), b("TOTT posten", "adm:tott", "⭐", 2)),
      row(b("Sperren", "ban_start", "🚫", 4), b("Sperre aufheben", "ban_lift", "🔓", 2), b("Test-Cup", "adm:test", "🧪", 2), b("Test-Spiele ausspielen", "adm:testgo", "▶️", 2)),
      row(b("Kanäle säubern", "adm:clean", "🧹", 2), b("Panel posten", "adm:post", "📌", 2), b("Panels aktualisieren", "adm:panels", "🔄", 2), b("Rechte setzen", "adm:perms", "🔐", 2), b("Status", "adm:status", "📊", 2)),
    ],
  };
}

const modal = (id, title, fields) => ({ type: 9, data: { custom_id: id, title, components: fields.map((f) => row({ type: 4, style: f.long ? 2 : 1, required: f.req !== false, ...f, long: undefined, req: undefined })) } });
export const newCupModal = () => modal("admm:new", "Neuer Cup", [
  { custom_id: "name", label: "Name des Cups", min_length: 3, max_length: 60, placeholder: "z. B. Bomber Cup #1" },
  { custom_id: "anpfiff", label: "Anpfiff (TT.MM.JJJJ HH:MM)", min_length: 10, max_length: 16, placeholder: "28.11.2026 20:00" },
]);
export const resultModal = () => modal("admm:result", "Ergebnis festlegen", [
  { custom_id: "spiel", label: "Spiel-Nr. (siehe Offene Spiele)", max_length: 4, placeholder: "z. B. 7" },
  { custom_id: "heim", label: "Tore Heim", max_length: 2, placeholder: "2" },
  { custom_id: "gast", label: "Tore Gast", max_length: 2, placeholder: "1" },
  { custom_id: "elfmeter", label: "Elfmeter (nur K.-o. bei Unentschieden)", max_length: 5, placeholder: "4:3", req: false },
]);
export const eaModal = () => modal("admm:ea", "EA-Club verknüpfen", [
  { custom_id: "team", label: "Teamname (genau wie in der Übersicht)", max_length: 30 },
  { custom_id: "ea_id", label: "EA-Club-ID (leer = per Name suchen)", max_length: 12, req: false },
]);
export const delTeamModal = () => modal("admm:del", "Team auflösen", [
  { custom_id: "team", label: "Teamname (genau wie in der Übersicht)", max_length: 30 },
  { custom_id: "grund", label: "Grund (wird dem Manager geschickt)", max_length: 200, req: false, placeholder: "z. B. inaktiv, Regelverstoß …" },
]);

/** 📌 Auswahl: welches Panel einzeln (neu) gepostet wird */
export function panelPick() {
  const o = (label, value, emoji) => ({ label, value, emoji: { name: emoji } });
  return { content: "📌 **Welches Panel soll neu gepostet werden?**\n-# Es erscheint unten in seinem Kanal, das alte wird gelöscht. Anderer Kanal: dort `/cup-einrichten kanal typ: …` ausführen.", components: [row({ type: 3, custom_id: "adm:postpick", placeholder: "Panel wählen…", options: [
    o("Regelwerk", "rules", "📜"), o("Rollenauswahl", "roles", "🎭"), o("Team registrieren", "reg", "✍️"), o("Meine Mannschaft", "team", "🛡️"),
    o("Mannschaftsübersicht", "over", "👥"), o("Team-Statistiken", "teamstats", "📊"), o("Sperrliste", "ban", "🚫"), o("Support (Tickets)", "support", "🎫"),
    o("Staff-Bewerbung", "bewerbung", "💼"), o("Live-Spielplan", "live", "📺"), o("EA-Verknüpfungen (EA-Status)", "eastatus", "📡"), o("Admin-Panel", "adminpanel", "🛠️"),
  ] })] };
}

/** 🧹 Auswahl: welche Kanäle gesäubert werden */
export function cleanPick() {
  const o = (label, value, emoji, description) => ({ label, value, emoji: { name: emoji }, description });
  return { content: "🧹 **Welche Kanäle sollen gesäubert werden?** (Mehrfachauswahl)\n-# Panels und die Posts des laufenden Cups bleiben immer stehen. Nur Nachrichten der letzten 13 Tage lassen sich löschen.", components: [row({ type: 3, custom_id: "adm:cleanpick", placeholder: "Kanäle wählen…", min_values: 1, max_values: 6, options: [
    o("Gruppenkanäle", "groups", "⚽", "Gruppe A–H"),
    o("Ergebnis-Kanäle", "results", "📥", "A–H-Ergebnisse + KO-Ergebnisse"),
    o("K.-o.-Kanal", "ko", "⚔️", "KO-Phase"),
    o("Live-Spielplan", "live", "📺"),
    o("Admin-Panel-Kanal", "admin", "🛠️", "z. B. Reste vom Test-Cup"),
    o("Alles oben", "all", "🧹", "alle Turnier-Kanäle + Admin-Panel"),
  ] })] };
}

/** Auswahl eines Teams (für hinzufügen/abmelden) */
export function teamPick(id, names, placeholder) {
  if (!names.length) return { content: "Keine passenden Teams.", components: [] };
  return { content: placeholder, components: [row({ type: 3, custom_id: id, placeholder: "Team wählen…", options: names.slice(0, 25).map((n) => ({ label: n.slice(0, 100), value: n.slice(0, 100) })) })] };
}
