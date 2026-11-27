// Team-Logos ausliefern: /api/logo?t=Teamname
import { get } from "../lib/store.mjs";

export default async (req) => {
  const t = new URL(req.url).searchParams.get("t") || "";
  const logo = t ? await get(`logo:${t}`) : null;
  if (!logo?.b64) return new Response("Kein Logo", { status: 404 });
  return new Response(Buffer.from(logo.b64, "base64"), { headers: { "Content-Type": logo.type || "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
};

export const config = { path: "/api/logo" };
