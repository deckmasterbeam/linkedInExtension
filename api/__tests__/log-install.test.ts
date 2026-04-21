/**
 * @jest-environment node
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Must be hoisted above the handler import so the mock is in place when the
// module is first evaluated.
const mockSql = jest.fn().mockResolvedValue([]);
jest.mock("@neondatabase/serverless", () => ({ neon: jest.fn(() => mockSql) }));

import handler from "../log-install";

const VALID_KEY = "test-secret-key";
const VALID_AT = "2026-04-21T12:00:00.000Z";

beforeEach(() => {
  process.env.INSTALL_LOG_API_KEY = VALID_KEY;
  process.env.DATABASE_URL = "postgresql://test";
  jest.clearAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

const makeReq = (overrides: Partial<Record<string, unknown>> = {}): VercelRequest => {
  const base = {
    method: "POST",
    headers: { "x-install-key": VALID_KEY, "content-type": "application/json" },
    body: { username: "janedoe", installedAt: VALID_AT },
  };
  return { ...base, ...overrides } as unknown as VercelRequest;
};

const makeRes = () => {
  const res = {
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res as unknown as VercelResponse & typeof res;
};

// ── CORS / method guards ──────────────────────────────────────────────────────

it("responds 204 to OPTIONS preflight", async () => {
  const res = makeRes();
  await handler(makeReq({ method: "OPTIONS" }), res);
  expect(res.status).toHaveBeenCalledWith(204);
  expect(res.end).toHaveBeenCalled();
});

it("sets CORS headers on every response", async () => {
  const res = makeRes();
  await handler(makeReq(), res);
  expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
  expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Methods", "POST, OPTIONS");
});

it("responds 405 to GET requests", async () => {
  const res = makeRes();
  await handler(makeReq({ method: "GET" }), res);
  expect(res.status).toHaveBeenCalledWith(405);
  expect(res.json).toHaveBeenCalledWith({ error: "Method not allowed" });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

it("responds 401 when x-install-key header is missing", async () => {
  const res = makeRes();
  await handler(makeReq({ headers: {} }), res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
});

it("responds 401 when x-install-key header is wrong", async () => {
  const res = makeRes();
  await handler(makeReq({ headers: { "x-install-key": "bad-key" } }), res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it("responds 401 when INSTALL_LOG_API_KEY env var is not set", async () => {
  delete process.env.INSTALL_LOG_API_KEY;
  const res = makeRes();
  await handler(makeReq(), res);
  expect(res.status).toHaveBeenCalledWith(401);
});

// ── Input validation ──────────────────────────────────────────────────────────

it("responds 400 when username is missing", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { installedAt: VALID_AT } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid username" });
});

it("responds 400 when username contains invalid characters", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { username: "jane doe!", installedAt: VALID_AT } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid username" });
});

it("responds 400 when username is too short", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { username: "x", installedAt: VALID_AT } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it("responds 400 when installedAt is missing", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { username: "janedoe" } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid installedAt" });
});

it("responds 400 when installedAt is not a valid date string", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { username: "janedoe", installedAt: "not-a-date" } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid installedAt" });
});

// ── Success ───────────────────────────────────────────────────────────────────

it("inserts a row and responds 200 on a valid request", async () => {
  const res = makeRes();
  await handler(makeReq(), res);
  expect(mockSql).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ ok: true });
});

it("accepts usernames with hyphens and underscores", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { username: "jane_doe-123", installedAt: VALID_AT } }), res);
  expect(res.status).toHaveBeenCalledWith(200);
});

it("passes the username and ISO date to the SQL query", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { username: "johndoe", installedAt: VALID_AT } }), res);
  const [strings, ...values] = mockSql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  expect(strings.join("")).toContain("INSERT INTO install_log");
  expect(values).toContain("johndoe");
  expect(values).toContain(VALID_AT);
});
