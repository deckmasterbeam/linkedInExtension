import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

// ── Shared helpers ────────────────────────────────────────────────────────────

const setCorsHeaders = (res: VercelResponse): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-install-key");
};

const checkAuth = (req: VercelRequest, res: VercelResponse): boolean => {
  const expectedKey = process.env.INSTALL_LOG_API_KEY;
  if (!expectedKey || req.headers["x-install-key"] !== expectedKey) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
};

const usernamePattern = /^[a-zA-Z0-9_-]{2,100}$/;

const parseUsername = (value: unknown, fieldName: string, res: VercelResponse): string | null => {
  if (typeof value !== "string" || !usernamePattern.test(value)) {
    res.status(400).json({ error: `Invalid ${fieldName}` });
    return null;
  }
  return value;
};

const parseIsoDate = (value: unknown, fieldName: string, res: VercelResponse): string | null => {
  const date = new Date(typeof value === "string" ? value : "");
  if (isNaN(date.getTime())) {
    res.status(400).json({ error: `Invalid ${fieldName}` });
    return null;
  }
  return date.toISOString();
};

// ── Route handlers ────────────────────────────────────────────────────────────

const handleInstall = async (body: Record<string, unknown>, res: VercelResponse): Promise<void> => {
  const username = parseUsername(body.username, "username", res);
  if (!username) {
    return;
  }

  const installedAt = parseIsoDate(body.installedAt, "installedAt", res);
  if (!installedAt) {
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    INSERT INTO install_log (linkedin_username, installed_at)
    VALUES (${username}, ${installedAt})
  `;
  res.status(200).json({ ok: true });
};

const handleProfileView = async (
  body: Record<string, unknown>,
  res: VercelResponse,
): Promise<void> => {
  const viewerUsername = parseUsername(body.viewerUsername, "viewerUsername", res);
  if (!viewerUsername) {
    return;
  }

  const viewedUsername = parseUsername(body.viewedUsername, "viewedUsername", res);
  if (!viewedUsername) {
    return;
  }

  if (typeof body.isConnected !== "boolean") {
    res.status(400).json({ error: "Invalid isConnected" });
    return;
  }

  const viewedAt = parseIsoDate(body.viewedAt, "viewedAt", res);
  if (!viewedAt) {
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    INSERT INTO profile_view_log (viewer_username, viewed_username, is_connected, viewed_at)
    VALUES (${viewerUsername}, ${viewedUsername}, ${body.isConnected}, ${viewedAt})
  `;
  res.status(200).json({ ok: true });
};

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * POST /api/log-info
 * Header: x-install-key matching INSTALL_LOG_API_KEY env var
 *
 * Body (install):
 *   { type: "install", username: string, installedAt: string (ISO 8601) }
 *
 * Body (profileView):
 *   { type: "profileView", viewerUsername: string, viewedUsername: string,
 *     isConnected: boolean, viewedAt: string (ISO 8601) }
 */
export default async (req: VercelRequest, res: VercelResponse): Promise<void> => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!checkAuth(req, res)) {
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  if (body.type === "install") {
    await handleInstall(body, res);
  } else if (body.type === "profileView") {
    await handleProfileView(body, res);
  } else {
    res.status(400).json({ error: "Unknown type" });
  }
};
