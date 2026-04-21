import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/log-install
 * Body: { username: string, installedAt: string (ISO 8601) }
 * Header: x-install-key matching the INSTALL_LOG_API_KEY env var
 */
export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-install-key");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedKey = process.env.INSTALL_LOG_API_KEY;
  if (!expectedKey || req.headers["x-install-key"] !== expectedKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { username, installedAt } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof username !== "string" || !/^[a-zA-Z0-9_-]{2,100}$/.test(username)) {
    res.status(400).json({ error: "Invalid username" });
    return;
  }

  const installedAtDate = new Date(typeof installedAt === "string" ? installedAt : "");
  if (isNaN(installedAtDate.getTime())) {
    res.status(400).json({ error: "Invalid installedAt" });
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    INSERT INTO install_log (linkedin_username, installed_at)
    VALUES (${username}, ${installedAtDate.toISOString()})
  `;

  res.status(200).json({ ok: true });
};
