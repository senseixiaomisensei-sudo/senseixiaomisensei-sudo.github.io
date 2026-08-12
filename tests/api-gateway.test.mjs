import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../worker/api-gateway.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { default: gateway } = await import(moduleUrl);

const SITE_ORIGIN = "https://senseixiaomisensei-sudo.github.io";
const BASE_ENV = {
  POSTPREP_UPSTREAM_URL: "https://postprep-ae6.pages.dev/api/text",
  POSTPREP_GATEWAY_SECRET: "gateway-secret",
  POSTPREP_RATE_LIMITER: { limit: async () => ({ success: true }) },
};

function request({ origin = SITE_ORIGIN, method = "POST", body = "{}" } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (method === "POST") headers["Content-Type"] = "application/json";
  return new Request("https://postprep-text-gateway.example.workers.dev/api/text", {
    method,
    headers,
    body: method === "POST" ? body : undefined,
  });
}

test("gateway rejects calls without an allowed Origin", async () => {
  const response = await gateway.fetch(request({ origin: "" }), BASE_ENV);
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, "ORIGIN_NOT_ALLOWED");
});

test("gateway fails closed when the global rate-limit binding is absent", async () => {
  const response = await gateway.fetch(request(), {
    POSTPREP_UPSTREAM_URL: BASE_ENV.POSTPREP_UPSTREAM_URL,
    POSTPREP_GATEWAY_SECRET: BASE_ENV.POSTPREP_GATEWAY_SECRET,
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "RATE_LIMITER_NOT_CONFIGURED");
});

test("gateway stops a limited request before it reaches the Pages Function", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("Rate-limited traffic must not reach the upstream function");
  };

  try {
    const response = await gateway.fetch(request(), {
      ...BASE_ENV,
      POSTPREP_RATE_LIMITER: { limit: async () => ({ success: false }) },
    });
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(body.code, "RATE_LIMITED");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gateway forwards an allowed request only with its internal header", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return Response.json({ ok: true, content: "#测试" });
  };

  try {
    const response = await gateway.fetch(request({ body: '{"action":"hashtags"}' }), BASE_ENV);
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, BASE_ENV.POSTPREP_UPSTREAM_URL);
    assert.equal(forwarded.options.headers.get("X-PostPrep-Gateway"), BASE_ENV.POSTPREP_GATEWAY_SECRET);
    assert.equal(forwarded.options.headers.get("Origin"), SITE_ORIGIN);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), SITE_ORIGIN);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
