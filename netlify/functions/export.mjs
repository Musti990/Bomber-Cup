// Datenexport für den Umzug auf einen eigenen Server (Contabo).
// /api/export?key=SETUP_KEY          → Liste aller Einträge
// /api/export?key=SETUP_KEY&k=<name> → ein Eintrag (Teams, Cups, Logos …)
import { get, keys } from "../lib/store.mjs";

export default async (req) => {
  const u = new URL(req.url);
  if (!process.env.SETUP_KEY || u.searchParams.get("key") !== process.env.SETUP_KEY) return new Response("❌ Falscher oder fehlender Schlüssel.", { status: 401 });
  const k = u.searchParams.get("k");
  if (k) return Response.json({ k, v: await get(k) });
  return Response.json({ keys: await keys("") });
};

export const config = { path: "/api/export" };
