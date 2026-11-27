// Läuft jede Minute: Wochenplan, Turnier-Zeitpunkte, Rollen-Abgleich, Inaktivität, Rollen-Warteschlange.
import { runSchedule, runTimers, allTournaments, runAutoConfirm } from "../lib/flow.mjs";
import { syncManagerRoles, dailyInactivity, welcomeNewMembers, reconcileCupRoles, goodbyeLeftMembers } from "../lib/maintenance.mjs";
import { listMembers } from "../lib/discord.mjs";
import { processQueue } from "../lib/roles.mjs";
import { expireBans } from "../lib/bans.mjs";
import { runAutoDelete } from "../lib/notify.mjs";
import { processSetupJobs } from "../lib/autosetup.mjs";
import { runCleanup } from "../lib/cleanup.mjs";

export default async () => {
  const start = Date.now();
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.error(`${name}:`, e?.message || e); } };
  // Mitglieder zuerst laden und begrüßen, damit die Willkommensnachricht nicht hinter langen Schritten wartet
  let members = null;
  await step("Mitglieder laden", async () => { members = await listMembers(); });
  await step("Willkommen", () => welcomeNewMembers(members));
  await step("Tschüss", () => goodbyeLeftMembers(members));
  await step("Einrichtung", () => processSetupJobs(18000)); // geplante Funktionen dürfen länger laufen (bis 30 s)
  await step("Wochenplan", () => runSchedule());
  await step("Turniere", async () => {
    for (const t of await allTournaments()) if (["anmeldung", "checkin", "gruppen"].includes(t.status)) await step(`Turnier ${t.channelId}`, () => runTimers(t));
  });
  await step("Ergebnisse automatisch bestätigen", () => runAutoConfirm());
  await step("Aufräumen nach dem Cup", () => runCleanup(7000));
  await step("Kanäle säubern", async () => (await import("../lib/cleanup.mjs")).runCleanJobs(5000));
  await step("Test-Cup", async () => { const F = await import("../lib/flow.mjs"); const t = await F.activeTournament(); if (t?.test) await F.playVirtualMatches(t.channelId, 1); }); // 1 Runde pro Minute – bleibt sicher unter dem Netlify-Zeitlimit
  await step("Rollen-Abgleich", () => syncManagerRoles(members));
  await step("Turnier-Rollen prüfen", () => reconcileCupRoles(members));
  await step("Vereinsfarben", async () => (await import("../lib/shop.mjs")).syncColorRoles(members));
  // 7-Tage-Aktivitätsregel ist aus (Cups werden von Hand erstellt)
  await step("Sperren", () => expireBans());
  await step("Premium", async () => (await import("../lib/premium.mjs")).expirePremium());
  await step("Mod-Log Beitritte", async () => (await import("../lib/moderation.mjs")).trackJoinsLeaves(members));
  await step("Mod-Log Protokoll", async () => (await import("../lib/moderation.mjs")).auditToModlog());
  await step("Benachrichtigungen löschen", () => runAutoDelete());
  await step("Kurze Nachrichten löschen", async () => (await import("../lib/flow.mjs")).runTempDeletes());
  await step("Admin-Panel", async () => (await import("../lib/flow.mjs")).refreshAdminPanel());
  await step("Rollen-Warteschlange", () => processQueue(Math.max(3000, 26000 - (Date.now() - start))));
};

export const config = { schedule: "* * * * *" };
