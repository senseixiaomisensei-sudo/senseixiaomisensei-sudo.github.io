import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sharedSource = await readFile(new URL("../functions/api/_rvc-shared.js", import.meta.url), "utf8");
const sharedUrl = `data:text/javascript;base64,${Buffer.from(sharedSource).toString("base64")}`;

async function importFunction(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const rewritten = source.replace(/from "\.\/_rvc-shared\.js"/gu, `from "${sharedUrl}"`);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
  return import(moduleUrl);
}

const { onRequest: rvcRequest } = await importFunction("../functions/api/rvc.js");
const { onRequest: rvcStatusRequest } = await importFunction("../functions/api/rvc-status.js");
const { onRequest: rvcModelsRequest } = await importFunction("../functions/api/rvc-models.js");
const { onRequest: rvcOutputRequest } = await importFunction("../functions/api/rvc-output.js");
const { serveRvcMedia } = await importFunction("../functions/api/_rvc-media.js");

const SITE_ORIGIN = "https://senseixiaomisensei-sudo.github.io";
const JOB_ID = "11111111-2222-3333-8444-555555555555";
const DOWNLOAD_TOKEN = "wRcxamOTds_6CkZIVCF6mMlbmzuToi9YA2Jfgj9F8pk";
const BASE_ENV = {
  POSTPREP_GATEWAY_SECRET: "gateway-secret",
  RVC_INFERENCE_URL: "https://gpu.example/v1/convert",
  RVC_INFERENCE_TOKEN: "rvc-service-token-with-enough-length-123",
};

function audioBlob() {
  return new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: "audio/wav" });
}

function rvcForm(overrides = {}) {
  const form = new FormData();
  form.set("modelId", "sweet-female");
  form.set("model_id", "sweet-female");
  form.set("pitch", "2");
  form.set("indexRate", "0.5");
  form.set("index_rate", "0.5");
  form.set("protect", "0.33");
  form.set("f0Method", "auto");
  form.set("f0_method", "auto");
  form.set("format", "wav");
  form.set("resample", "0");
  form.set("rmsMixRate", "1");
  form.set("rms_mix_rate", "1");
  form.set("filterRadius", "3");
  form.set("filter_radius", "3");
  form.set("language", "zh");
  form.set("requestId", "request_id_1234567890abcdef");
  form.set("request_id", "request_id_1234567890abcdef");
  form.set("audio", audioBlob(), "input.wav");
  for (const [key, value] of Object.entries(overrides)) {
    form.delete(key);
    if (value !== undefined && value !== null) {
      if (value instanceof Blob) form.set(key, value, "input.wav");
      else form.set(key, value);
    }
  }
  return form;
}

function context({ form = rvcForm(), origin = SITE_ORIGIN, env = BASE_ENV, gateway = "gateway-secret" } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (gateway) headers["X-PostPrep-Gateway"] = gateway;
  return {
    request: new Request("https://postprep-ae6.pages.dev/api/rvc", { method: "POST", headers, body: form }),
    env,
  };
}

function mockRvcFetch() {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    calls.push({ address, options });
    if (address === "https://gpu.example/v1/convert") {
      return Response.json({
        jobId: JOB_ID,
        downloadToken: DOWNLOAD_TOKEN,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        format: "wav",
      });
    }
    throw new Error(`Unexpected upstream: ${address}`);
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test("rvc endpoint rejects a direct browser call before it reads or forwards audio", async () => {
  const mocked = mockRvcFetch();
  try {
    const response = await rvcRequest(context({ gateway: "" }));
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "GATEWAY_NOT_ALLOWED");
    assert.equal(mocked.calls.length, 0);
  } finally {
    mocked.restore();
  }
});

test("rvc endpoint rejects an invalid model id before forwarding", async () => {
  const mocked = mockRvcFetch();
  try {
    const response = await rvcRequest(context({ form: rvcForm({ modelId: "../evil" }) }));
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, "RVC_INVALID_MODEL");
    assert.equal(mocked.calls.length, 0);
  } finally {
    mocked.restore();
  }
});

test("rvc endpoint rejects missing audio and invalid parameters", async () => {
  const mocked = mockRvcFetch();
  try {
    const noAudio = await rvcRequest(context({ form: rvcForm({ audio: null }) }));
    assert.equal(noAudio.status, 400);
    assert.equal((await noAudio.json()).code, "RVC_INVALID_AUDIO");
    const badPitch = await rvcRequest(context({ form: rvcForm({ pitch: "99" }) }));
    assert.equal(badPitch.status, 400);
    assert.equal((await badPitch.json()).code, "RVC_INVALID_PARAMETER");
    assert.equal(mocked.calls.length, 0);
  } finally {
    mocked.restore();
  }
});

test("rvc endpoint sends only sanitized fields to the fixed GPU backend", async () => {
  const mocked = mockRvcFetch();
  try {
    const response = await rvcRequest(context());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.jobId, JOB_ID);
    assert.equal(body.downloadToken, DOWNLOAD_TOKEN);
    assert.equal(mocked.calls.length, 1);
    const upstream = mocked.calls[0];
    assert.equal(upstream.address, BASE_ENV.RVC_INFERENCE_URL);
    assert.equal(upstream.options.headers.Authorization, `Bearer ${BASE_ENV.RVC_INFERENCE_TOKEN}`);
    assert.equal(upstream.options.body.get("model_id"), "sweet-female");
    assert.equal(upstream.options.body.get("pitch"), "2");
    assert.equal(upstream.options.body.get("f0_method"), "auto");
    assert.equal(upstream.options.body.get("request_id"), "request_id_1234567890abcdef");
    assert.equal(upstream.options.body.get("audio").name, "input.wav");
    assert.equal(upstream.options.body.get("language"), "zh");
  } finally {
    mocked.restore();
  }
});

test("rvc endpoint surfaces structured upstream error codes instead of masking them", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "RVC_MODEL_NOT_FOUND" }, { status: 404 });
  try {
    const response = await rvcRequest(context());
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.code, "RVC_MODEL_NOT_FOUND");
    assert.ok(String(body.message).includes("未挂载"));
    assert.equal(body.details.upstreamStatus, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc endpoint retries once when the backend connection drops before responding", async () => {
  let attempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("fetch failed");
    return Response.json({
      jobId: JOB_ID,
      downloadToken: DOWNLOAD_TOKEN,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      format: "wav",
    });
  };
  try {
    const response = await rvcRequest(context());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc status remains false when no GPU destination or token is configured", async () => {
  const request = new Request("https://postprep-ae6.pages.dev/api/rvc-status", {
    headers: { Origin: SITE_ORIGIN, "X-PostPrep-Gateway": "gateway-secret" },
  });
  const response = await rvcStatusRequest({ request, env: { POSTPREP_GATEWAY_SECRET: "gateway-secret" } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ready, false);
});

test("rvc status probes only the configured backend health endpoint with its server token", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options = {}) => {
    forwarded = { url: String(url), options };
    return Response.json({ ready: true });
  };
  try {
    const request = new Request("https://postprep-ae6.pages.dev/api/rvc-status", {
      headers: { Origin: SITE_ORIGIN, "X-PostPrep-Gateway": "gateway-secret" },
    });
    const response = await rvcStatusRequest({ request, env: BASE_ENV });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ready, true);
    assert.equal(forwarded.url, "https://gpu.example/healthz");
    assert.equal(forwarded.options.headers.Authorization, `Bearer ${BASE_ENV.RVC_INFERENCE_TOKEN}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc models passes through the mounted model list only", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options = {}) => {
    forwarded = { url: String(url), options };
    return Response.json({ models: [{ id: "sweet-female" }, { id: "bad id!" }, { nope: true }] });
  };
  try {
    const request = new Request("https://postprep-ae6.pages.dev/api/rvc-models", {
      headers: { Origin: SITE_ORIGIN, "X-PostPrep-Gateway": "gateway-secret" },
    });
    const response = await rvcModelsRequest({ request, env: BASE_ENV });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.models, [{
      id: "sweet-female",
      name: "sweet-female",
      emoji: "🎵",
      description: "",
      tags: [],
      hasIndex: false,
      license: "unverified",
      source: "",
      modelVersion: "",
      trained: false,
      createdAt: "",
    }]);
    assert.equal(forwarded.url, "https://gpu.example/v1/models");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc output requires an internal gateway and a constrained job token", async () => {
  const request = new Request(`https://postprep-ae6.pages.dev/api/rvc-output?job=${JOB_ID}&token=${DOWNLOAD_TOKEN}`, {
    headers: { Origin: SITE_ORIGIN },
  });
  const response = await rvcOutputRequest({ request, env: BASE_ENV });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, "GATEWAY_NOT_ALLOWED");
});

test("rvc output preserves an asynchronous processing response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { jobId: JOB_ID, state: "processing" },
    { status: 202, headers: { "Retry-After": "6" } },
  );
  try {
    const request = new Request(`https://postprep-ae6.pages.dev/api/rvc-output?job=${JOB_ID}&token=${DOWNLOAD_TOKEN}`, {
      headers: { Origin: SITE_ORIGIN, "X-PostPrep-Gateway": "gateway-secret" },
    });
    const response = await rvcOutputRequest({ request, env: BASE_ENV });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get("Retry-After"), "6");
    assert.equal((await response.json()).state, "processing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc media route streams only a constrained short-lived output capability", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options = {}) => {
    forwarded = { url: String(url), options };
    return new Response(audioBlob(), {
      status: 200,
      headers: { "Content-Type": "audio/wav", "Content-Length": "8", "Accept-Ranges": "bytes" },
    });
  };
  try {
    const request = new Request(`https://postprep-ae6.pages.dev/rvc-media/${JOB_ID}?token=${DOWNLOAD_TOKEN}`, {
      headers: { Origin: SITE_ORIGIN, Range: "bytes=0-7" },
    });
    const response = await serveRvcMedia({ request, env: BASE_ENV, params: { job: JOB_ID } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "audio/wav");
    assert.equal(response.headers.get("Content-Disposition"), 'inline; filename="postprep-rvc-preview"');
    assert.equal(forwarded.url, `https://gpu.example/v1/output/${JOB_ID}?token=${DOWNLOAD_TOKEN}`);
    assert.equal(forwarded.options.headers.Authorization, `Bearer ${BASE_ENV.RVC_INFERENCE_TOKEN}`);
    assert.equal(forwarded.options.headers.Range, "bytes=0-7");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc media route accepts Chromium same-origin audio metadata requests without Origin", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(audioBlob(), { status: 200, headers: { "Content-Type": "audio/wav" } });
  };
  try {
    const request = new Request(`https://postprep-ae6.pages.dev/rvc-media/${JOB_ID}?token=${DOWNLOAD_TOKEN}`, {
      headers: {
        Referer: "https://postprep-ae6.pages.dev/rvc",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "audio",
      },
    });
    const response = await serveRvcMedia({ request, env: BASE_ENV, params: { job: JOB_ID } });
    assert.equal(response.status, 200);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc media route rejects Origin-less non-browser requests", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("unexpected fetch");
  };
  try {
    const request = new Request(`https://postprep-ae6.pages.dev/rvc-media/${JOB_ID}?token=${DOWNLOAD_TOKEN}`);
    const response = await serveRvcMedia({ request, env: BASE_ENV, params: { job: JOB_ID } });
    assert.equal(response.status, 403);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rvc media route rejects an invalid capability before reaching the backend", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("unexpected fetch");
  };
  try {
    const request = new Request(`https://postprep-ae6.pages.dev/rvc-media/not-a-job?token=bad`, {
      headers: { Origin: SITE_ORIGIN },
    });
    const response = await serveRvcMedia({ request, env: BASE_ENV, params: { job: "not-a-job" } });
    assert.equal(response.status, 404);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
