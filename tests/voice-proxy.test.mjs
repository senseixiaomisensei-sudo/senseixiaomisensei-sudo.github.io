import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sharedSource = await readFile(new URL("../functions/api/_voice-shared.js", import.meta.url), "utf8");
const sharedUrl = `data:text/javascript;base64,${Buffer.from(sharedSource).toString("base64")}`;

async function importFunction(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const rewritten = source.replace(/from "\.\/_voice-shared\.js"/gu, `from "${sharedUrl}"`);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
  return import(moduleUrl);
}

const { onRequest: voiceRequest } = await importFunction("../functions/api/voice.js");
const { onRequest: voiceStatusRequest } = await importFunction("../functions/api/voice-status.js");
const { onRequest: voiceOutputRequest } = await importFunction("../functions/api/voice-output.js");

const SITE_ORIGIN = "https://senseixiaomisensei-sudo.github.io";
const JOB_ID = "11111111-2222-3333-8444-555555555555";
const DOWNLOAD_TOKEN = "wRcxamOTds_6CkZIVCF6mMlbmzuToi9YA2Jfgj9F8pk";
const BASE_ENV = {
  POSTPREP_GATEWAY_SECRET: "gateway-secret",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  VOICE_INFERENCE_URL: "https://gpu.example/v1/jobs",
  VOICE_INFERENCE_TOKEN: "voice-service-token-with-enough-length-123",
};

function audioBlob() {
  return new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: "audio/wav" });
}

function voiceForm(overrides = {}) {
  const form = new FormData();
  form.set("mode", "read");
  form.set("text", "这是一段经过授权的测试文本。");
  form.set("referenceAudio", audioBlob(), "reference.wav");
  form.set("rightsScope", "self");
  form.set("rightsDeclaration", "I HAVE THE RIGHTS");
  form.set("aiDisclosure", "confirmed");
  form.set("language", "zh");
  form.set("turnstileToken", "valid-human-token");
  for (const [key, value] of Object.entries(overrides)) {
    form.delete(key);
    if (value !== undefined && value !== null) {
      if (value instanceof Blob) form.set(key, value, key === "referenceAudio" ? "reference.wav" : "source.wav");
      else form.set(key, value);
    }
  }
  return form;
}

function context({ form = voiceForm(), origin = SITE_ORIGIN, env = BASE_ENV, gateway = "gateway-secret" } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (gateway) headers["X-PostPrep-Gateway"] = gateway;
  return {
    request: new Request("https://postprep-ae6.pages.dev/api/voice", { method: "POST", headers, body: form }),
    env,
  };
}

function mockVoiceFetch() {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    calls.push({ address, options });
    if (address.includes("turnstile/v0/siteverify")) {
      return Response.json({
        success: true,
        action: "postprep_voice",
        hostname: "senseixiaomisensei-sudo.github.io",
      });
    }
    if (address === "https://gpu.example/v1/jobs") {
      return Response.json({
        jobId: JOB_ID,
        downloadToken: DOWNLOAD_TOKEN,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    }
    throw new Error(`Unexpected upstream: ${address}`);
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test("voice endpoint rejects a direct browser call before it reads or forwards audio", async () => {
  const mocked = mockVoiceFetch();
  try {
    const response = await voiceRequest(context({ gateway: "" }));
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "GATEWAY_NOT_ALLOWED");
    assert.equal(mocked.calls.length, 0);
  } finally {
    mocked.restore();
  }
});

test("voice endpoint rejects an unconfirmed voice before verification or GPU forwarding", async () => {
  const mocked = mockVoiceFetch();
  try {
    const response = await voiceRequest(context({ form: voiceForm({ rightsDeclaration: "" }) }));
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.code, "VOICE_RIGHTS_CONFIRMATION_REQUIRED");
    assert.equal(mocked.calls.length, 0);
  } finally {
    mocked.restore();
  }
});

test("voice endpoint sends only sanitized authorized fields to the fixed GPU backend", async () => {
  const mocked = mockVoiceFetch();
  try {
    const response = await voiceRequest(context());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.jobId, JOB_ID);
    assert.equal(body.downloadToken, DOWNLOAD_TOKEN);
    assert.equal(mocked.calls.length, 2);
    assert.match(mocked.calls[0].address, /turnstile\/v0\/siteverify/);
    const upstream = mocked.calls[1];
    assert.equal(upstream.address, BASE_ENV.VOICE_INFERENCE_URL);
    assert.equal(upstream.options.headers.Authorization, `Bearer ${BASE_ENV.VOICE_INFERENCE_TOKEN}`);
    assert.equal(upstream.options.body.get("rights_declaration"), "I HAVE THE RIGHTS");
    assert.equal(upstream.options.body.get("ai_disclosure"), "confirmed");
    assert.equal(upstream.options.body.get("turnstileToken"), null);
    assert.equal(upstream.options.body.get("reference_audio").name, "reference.wav");
  } finally {
    mocked.restore();
  }
});

test("voice status remains false when no GPU destination or token is configured", async () => {
  const request = new Request("https://postprep-ae6.pages.dev/api/voice-status", {
    headers: { Origin: SITE_ORIGIN, "X-PostPrep-Gateway": "gateway-secret" },
  });
  const response = await voiceStatusRequest({ request, env: { POSTPREP_GATEWAY_SECRET: "gateway-secret" } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ready, false);
});

test("voice status probes only the configured backend health endpoint with its server token", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, options = {}) => {
    forwarded = { url: String(url), options };
    return Response.json({ ready: true });
  };
  try {
    const request = new Request("https://postprep-ae6.pages.dev/api/voice-status", {
      headers: { Origin: SITE_ORIGIN, "X-PostPrep-Gateway": "gateway-secret" },
    });
    const response = await voiceStatusRequest({ request, env: BASE_ENV });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ready, true);
    assert.equal(forwarded.url, "https://gpu.example/healthz");
    assert.equal(forwarded.options.headers.Authorization, `Bearer ${BASE_ENV.VOICE_INFERENCE_TOKEN}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice output requires an internal gateway and a constrained job token", async () => {
  const request = new Request(`https://postprep-ae6.pages.dev/api/voice-output?job=${JOB_ID}&token=${DOWNLOAD_TOKEN}`, {
    headers: { Origin: SITE_ORIGIN },
  });
  const response = await voiceOutputRequest({ request, env: BASE_ENV });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, "GATEWAY_NOT_ALLOWED");
});
