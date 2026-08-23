import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("functions/rvc-api/[[path]].js", root), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { onRequest } = await import(moduleUrl);

test("Pages RVC relay uses the Worker service binding and supplies same-origin GET origin", async () => {
  let forwarded;
  const response = await onRequest({
    request: new Request("https://postprep-ae6.pages.dev/rvc-api/status"),
    env: {
      POSTPREP_GATEWAY: {
        async fetch(request) {
          forwarded = request;
          return Response.json({ ready: true });
        },
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded.url, "https://postprep-ae6.pages.dev/rvc/status");
  assert.equal(forwarded.headers.get("Origin"), "https://postprep-ae6.pages.dev");
});

test("Pages RVC relay preserves a GitHub Pages browser origin", async () => {
  let origin;
  const response = await onRequest({
    request: new Request("https://postprep-ae6.pages.dev/rvc-api/models", {
      headers: { Origin: "https://senseixiaomisensei-sudo.github.io" },
    }),
    env: {
      POSTPREP_GATEWAY: {
        async fetch(request) {
          origin = request.headers.get("Origin");
          return Response.json({ models: [] });
        },
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(origin, "https://senseixiaomisensei-sudo.github.io");
});

test("Pages RVC relay remaps the upload path without consuming the audio body", async () => {
  let forwarded;
  const response = await onRequest({
    request: new Request("https://postprep-ae6.pages.dev/rvc-api", {
      method: "POST",
      headers: {
        Origin: "https://senseixiaomisensei-sudo.github.io",
        "Content-Type": "audio/wav",
      },
      body: new Uint8Array([1, 2, 3, 4]),
      duplex: "half",
    }),
    env: {
      POSTPREP_GATEWAY: {
        async fetch(request) {
          forwarded = request;
          return Response.json({ jobId: "test" });
        },
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded.url, "https://postprep-ae6.pages.dev/rvc");
  assert.equal(forwarded.method, "POST");
  assert.deepEqual([...new Uint8Array(await forwarded.arrayBuffer())], [1, 2, 3, 4]);
});

test("Pages RVC relay fails closed when its binding is missing", async () => {
  const response = await onRequest({
    request: new Request("https://postprep-ae6.pages.dev/rvc-api/status"),
    env: {},
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "RVC_RELAY_NOT_CONFIGURED");
});

test("Pages routes and Wrangler config include the RVC relay", async () => {
  const [routes, wrangler] = await Promise.all([
    readFile(new URL("_routes.json", root), "utf8"),
    readFile(new URL("wrangler.toml", root), "utf8"),
  ]);
  assert.ok(JSON.parse(routes).include.includes("/rvc-api/*"));
  assert.ok(!JSON.parse(routes).include.includes("/rvc/*"));
  assert.match(wrangler, /binding = "POSTPREP_GATEWAY"/u);
  assert.match(wrangler, /service = "postprep-text-gateway"/u);
});
