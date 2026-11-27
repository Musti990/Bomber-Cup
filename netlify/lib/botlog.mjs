// 🧾 Bot-Log: alles, was der Bot selbst macht (und was die Turnierleitung macht), landet im Kanal „BOT-LOG“.
// Fehler werden ignoriert – das Log darf nie etwas blockieren.
import { getConfig } from "./store.mjs";
import { sendMessage } from "./discord.mjs";

export async function botLog(text) {
  try {
    console.log("[Bot-Log]", String(text).replace(/\n/g, " | "));
    const cfg = await getConfig();
    const ch = cfg.channels.botlog || cfg.channels.admin;
    if (!ch) return;
    await sendMessage(ch, { content: `${String(text).slice(0, 1900)} · <t:${Math.floor(Date.now() / 1000)}:t>`, allowed_mentions: { parse: [] } });
  } catch { /* egal */ }
}
