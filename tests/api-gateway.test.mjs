import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../worker/api-gateway.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { default: gateway } = await import(moduleUrl);

const SITE_ORIGIN = "https://senseixiaomisensei-sudo.github.io";
const PAGES_ORIGIN = "https://postprep-ae6.pages.dev";
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
    assert.equal(response.headers.get("Retry-After"), "60");
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

test("gateway permits the controlled Cloudflare Pages host", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return Response.json({ ok: true, content: "#测试" });
  };

  try {
    const response = await gateway.fetch(request({ origin: PAGES_ORIGIN, body: '{"action":"hashtags"}' }), BASE_ENV);
    assert.equal(response.status, 200);
    assert.equal(forwarded.options.headers.get("Origin"), PAGES_ORIGIN);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), PAGES_ORIGIN);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc route fails closed until its dedicated upstream and rate limiter exist", async () => {
  const request = new Request("https://postprep-text-gateway.example.workers.dev/rvc", {
    method: "POST",
    headers: { Origin: SITE_ORIGIN, "Content-Type": "multipart/form-data; boundary=test" },
    body: "--test--",
  });
  const response = await gateway.fetch(request, BASE_ENV);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "RVC_BACKEND_NOT_CONFIGURED");
});

test("rvc route uses a separate limiter and fixed Pages upstream", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return Response.json({ ok: true, jobId: "11111111-2222-3333-8444-555555555555" });
  };

  try {
    const request = new Request("https://postprep-text-gateway.example.workers.dev/rvc", {
      method: "POST",
      headers: { Origin: SITE_ORIGIN, "Content-Type": "multipart/form-data; boundary=test" },
      body: "--test--",
    });
    const env = {
      ...BASE_ENV,
      POSTPREP_RVC_UPSTREAM_URL: "https://postprep-ae6.pages.dev/api/rvc",
      POSTPREP_RVC_RATE_LIMITER: { limit: async ({ key }) => ({ success: key.startsWith("rvc:") }) },
    };
    const response = await gateway.fetch(request, env);
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, env.POSTPREP_RVC_UPSTREAM_URL);
    assert.equal(forwarded.options.headers.get("X-PostPrep-Gateway"), BASE_ENV.POSTPREP_GATEWAY_SECRET);
    assert.match(forwarded.options.headers.get("Content-Type"), /multipart\/form-data/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc limiter reserves one retry for mobile connection drops", async () => {
  const config = await readFile(new URL("../worker/wrangler.toml", import.meta.url), "utf8");
  const rvcLimiter = config.split('name = "POSTPREP_RVC_RATE_LIMITER"')[1] || "";
  assert.match(rvcLimiter, /limit = 2/u);
  assert.match(rvcLimiter, /period = 60/u);
});

test("rvc routes use the authenticated narrow tunnel when direct credentials are configured", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options) => {
    forwarded = { url: String(url), options };
    return Response.json({ ready: true });
  };
  try {
    const request = new Request("https://postprep-text-gateway.example.workers.dev/rvc/status", {
      headers: { Origin: PAGES_ORIGIN },
    });
    const env = {
      ...BASE_ENV,
      POSTPREP_RVC_DIRECT_BASE_URL: "https://voice-relay-example.trycloudflare.com",
      POSTPREP_RVC_INFERENCE_TOKEN: "rvc-direct-token-with-at-least-32-characters",
    };
    const response = await gateway.fetch(request, env);
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, "https://voice-relay-example.trycloudflare.com/healthz");
    assert.equal(
      forwarded.options.headers.get("Authorization"),
      `Bearer ${env.POSTPREP_RVC_INFERENCE_TOKEN}`,
    );
    assert.match(forwarded.options.headers.get("X-PostPrep-Request-Id"), /^[0-9a-f-]{36}$/u);
    assert.equal(forwarded.options.headers.has("X-PostPrep-Gateway"), false);
    assert.match(response.headers.get("X-PostPrep-Request-Id"), /^[0-9a-f-]{36}$/u);
    assert.match(response.headers.get("Access-Control-Expose-Headers"), /X-PostPrep-Request-Id/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc direct route rejects an arbitrary non-tunnel host", async () => {
  const request = new Request("https://postprep-text-gateway.example.workers.dev/rvc/status", {
    headers: { Origin: PAGES_ORIGIN },
  });
  const response = await gateway.fetch(request, {
    ...BASE_ENV,
    POSTPREP_RVC_DIRECT_BASE_URL: "https://example.com",
    POSTPREP_RVC_INFERENCE_TOKEN: "rvc-direct-token-with-at-least-32-characters",
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "RVC_BACKEND_NOT_CONFIGURED");
});

test("rvc output route rejects an arbitrary job address before any upstream fetch", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("Invalid voice output must not reach Pages");
  };
  try {
    const request = new Request("https://postprep-text-gateway.example.workers.dev/rvc/output/not-a-job?token=short", {
      headers: { Origin: SITE_ORIGIN },
    });
    const response = await gateway.fetch(request, {
      ...BASE_ENV,
      POSTPREP_RVC_OUTPUT_UPSTREAM_URL: "https://postprep-ae6.pages.dev/api/rvc-output",
      POSTPREP_RVC_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_RVC_OUTPUT_TOKEN");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
