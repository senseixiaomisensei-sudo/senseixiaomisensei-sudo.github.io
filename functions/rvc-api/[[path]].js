function jsonFailure(status, code, message) {
  return Response.json(
    { code, message, details: {} },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function workerRequest(request) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/rvc-api(?=\/|$)/u, "/rvc");
  const headers = new Headers(request.headers);
  const method = request.method.toUpperCase();
  // Browsers may omit Origin on a same-origin GET. The protected Worker still
  // receives an explicit trusted origin; cross-origin and POST origins are kept.
  if (!headers.has("Origin") && method === "GET") {
    headers.set("Origin", new URL(request.url).origin);
  }
  const init = {
    method: request.method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    redirect: request.redirect,
  };
  // Node's fetch implementation requires duplex for a streamed request body;
  // Workers accepts the same RequestInit and keeps the body streaming end-to-end.
  if (init.body) init.duplex = "half";
  return new Request(url, init);
}

export async function onRequest({ request, env }) {
  const gateway = env?.POSTPREP_GATEWAY;
  if (!gateway || typeof gateway.fetch !== "function") {
    return jsonFailure(503, "RVC_RELAY_NOT_CONFIGURED", "Voice relay is not configured");
  }

  try {
    return await gateway.fetch(workerRequest(request));
  } catch {
    return jsonFailure(502, "RVC_RELAY_UNAVAILABLE", "Voice relay is temporarily unavailable");
  }
}
