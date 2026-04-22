/**
 * @jest-environment node
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const mockSql = jest.fn().mockResolvedValue([]);
jest.mock("@neondatabase/serverless", () => ({ neon: jest.fn(() => mockSql) }));

import handler from "../log-info";

const VALID_KEY = "test-secret-key";
const VALID_AT = "2026-04-21T12:00:00.000Z";

beforeEach(() => {
  process.env.INSTALL_LOG_API_KEY = VALID_KEY;
  process.env.DATABASE_URL = "postgresql://test";
  jest.clearAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

const makeRes = () => {
  const res = {
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res as unknown as VercelResponse & typeof res;
};

const makeReq = (overrides: Partial<Record<string, unknown>> = {}): VercelRequest => {
  const base = {
    method: "POST",
    headers: { "x-install-key": VALID_KEY, "content-type": "application/json" },
    body: { type: "install", username: "janedoe", installedAt: VALID_AT },
  };
  return { ...base, ...overrides } as unknown as VercelRequest;
};

const makeProfileViewReq = (overrides: Partial<Record<string, unknown>> = {}): VercelRequest =>
  makeReq({
    body: {
      type: "profileView",
      viewerUsername: "janedoe",
      viewedUsername: "johndoe",
      isConnected: true,
      viewedAt: VALID_AT,
    },
    ...overrides,
  });

// ── CORS / method guards (shared) ─────────────────────────────────────────────

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

// ── Auth (shared) ─────────────────────────────────────────────────────────────

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

it("responds 400 for unknown type", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { type: "unknown" } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Unknown type" });
});

// ── install — validation ──────────────────────────────────────────────────────

it("responds 400 when install username is missing", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { type: "install", installedAt: VALID_AT } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid username" });
});

it("responds 400 when install username contains invalid characters", async () => {
  const res = makeRes();
  await handler(
    makeReq({ body: { type: "install", username: "jane doe!", installedAt: VALID_AT } }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid username" });
});

it("responds 400 when install username is too short", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { type: "install", username: "x", installedAt: VALID_AT } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it("responds 400 when installedAt is missing", async () => {
  const res = makeRes();
  await handler(makeReq({ body: { type: "install", username: "janedoe" } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid installedAt" });
});

it("responds 400 when installedAt is not a valid date", async () => {
  const res = makeRes();
  await handler(
    makeReq({ body: { type: "install", username: "janedoe", installedAt: "not-a-date" } }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid installedAt" });
});

// ── install — success ─────────────────────────────────────────────────────────

it("inserts install row and responds 200 on valid request", async () => {
  const res = makeRes();
  await handler(makeReq(), res);
  expect(mockSql).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ ok: true });
});

it("accepts install usernames with hyphens and underscores", async () => {
  const res = makeRes();
  await handler(
    makeReq({ body: { type: "install", username: "jane_doe-123", installedAt: VALID_AT } }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(200);
});

it("passes username and ISO date to the install SQL query", async () => {
  const res = makeRes();
  await handler(
    makeReq({ body: { type: "install", username: "johndoe", installedAt: VALID_AT } }),
    res,
  );
  const [strings, ...values] = mockSql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  expect(strings.join("")).toContain("INSERT INTO install_log");
  expect(values).toContain("johndoe");
  expect(values).toContain(VALID_AT);
});

// ── profileView — validation ──────────────────────────────────────────────────

it("responds 400 when viewerUsername is missing", async () => {
  const res = makeRes();
  await handler(
    makeProfileViewReq({
      body: {
        type: "profileView",
        viewedUsername: "johndoe",
        isConnected: true,
        viewedAt: VALID_AT,
      },
    }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid viewerUsername" });
});

it("responds 400 when viewedUsername is missing", async () => {
  const res = makeRes();
  await handler(
    makeProfileViewReq({
      body: {
        type: "profileView",
        viewerUsername: "janedoe",
        isConnected: true,
        viewedAt: VALID_AT,
      },
    }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid viewedUsername" });
});

it("responds 400 when isConnected is not a boolean", async () => {
  const res = makeRes();
  await handler(
    makeProfileViewReq({
      body: {
        type: "profileView",
        viewerUsername: "janedoe",
        viewedUsername: "johndoe",
        isConnected: "yes",
        viewedAt: VALID_AT,
      },
    }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid isConnected" });
});

it("responds 400 when viewedAt is not a valid date", async () => {
  const res = makeRes();
  await handler(
    makeProfileViewReq({
      body: {
        type: "profileView",
        viewerUsername: "janedoe",
        viewedUsername: "johndoe",
        isConnected: false,
        viewedAt: "bad-date",
      },
    }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: "Invalid viewedAt" });
});

// ── profileView — success ─────────────────────────────────────────────────────

it("inserts profileView row and responds 200 on valid request", async () => {
  const res = makeRes();
  await handler(makeProfileViewReq(), res);
  expect(mockSql).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ ok: true });
});

it("passes all fields to the profileView SQL query", async () => {
  const res = makeRes();
  await handler(makeProfileViewReq(), res);
  const [strings, ...values] = mockSql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  expect(strings.join("")).toContain("INSERT INTO profile_view_log");
  expect(values).toContain("janedoe");
  expect(values).toContain("johndoe");
  expect(values).toContain(true);
  expect(values).toContain(VALID_AT);
});

it("accepts isConnected: false", async () => {
  const res = makeRes();
  await handler(
    makeProfileViewReq({
      body: {
        type: "profileView",
        viewerUsername: "janedoe",
        viewedUsername: "johndoe",
        isConnected: false,
        viewedAt: VALID_AT,
      },
    }),
    res,
  );
  expect(res.status).toHaveBeenCalledWith(200);
});
