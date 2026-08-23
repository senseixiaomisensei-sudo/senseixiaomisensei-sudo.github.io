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

export async function onRequest({ request, env }) {
  const gateway = env?.POSTPREP_GATEWAY;
  if (!gateway || typeof gateway.fetch !== "function") {
    return jsonFailure(503, "RVC_RELAY_NOT_CONFIGURED", "Voice relay is not configured");
  }

  const headers = new Headers(request.headers);
  // Browsers may omit Origin on a same-origin GET. The protected Worker still
  // receives an explicit trusted origin; cross-origin and POST origins are kept.
  if (!headers.has("Origin") && request.method.toUpperCase() === "GET") {
    headers.set("Origin", new URL(request.url).origin);
  }

  try {
    return await gateway.fetch(new Request(request, { headers }));
  } catch {
    return jsonFailure(502, "RVC_RELAY_UNAVAILABLE", "Voice relay is temporarily unavailable");
  }
}
