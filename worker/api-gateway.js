const TEXT_RATE_LIMITER_BINDING = "POSTPREP_RATE_LIMITER";
const VOICE_RATE_LIMITER_BINDING = "POSTPREP_VOICE_RATE_LIMITER";
const GATEWAY_SECRET_BINDING = "POSTPREP_GATEWAY_SECRET";
const MAX_VOICE_UPLOAD_BYTES = 45 * 1024 * 1024;
const DEFAULT_PUBLIC_SITE_ORIGINS = Object.freeze([
  "https://senseixiaomisensei-sudo.github.io",
  "https://postprep-ae6.pages.dev",
]);

function normalizedHttpOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function publicSiteOrigins(env) {
  const configured = env && typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : "";
  const extraOrigins = configured.split(",").map(normalizedHttpOrigin).filter(Boolean);
  return new Set([...DEFAULT_PUBLIC_SITE_ORIGINS, ...extraOrigins]);
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return Boolean(origin && publicSiteOrigins(env).has(origin));
}

function responseHeaders(request, env) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=UTF-8",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  });
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(request, env)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function failure(request, env, status, code, message) {
  return new Response(JSON.stringify({ code, message, details: {} }), {
    status,
    headers: responseHeaders(request, env),
  });
}

function protectedGatewaySecret(env) {
  return env && typeof env[GATEWAY_SECRET_BINDING] === "string" ? env[GATEWAY_SECRET_BINDING].trim() : "";
}

function configuredUpstream(env, binding) {
  return env && typeof env[binding] === "string" ? env[binding].trim() : "";
}

function clientRateLimitKey(request, prefix) {
  const origin = normalizedHttpOrigin(request.headers.get("Origin")) || "unknown-origin";
  const ip = String(request.headers.get("CF-Connecting-IP") || "unknown-ip").trim();
  return `${prefix}:${origin}:${ip.slice(0, 128)}`;
}

async function enforceRateLimit(request, env, binding, prefix) {
  const limiter = env && env[binding];
  if (!limiter || typeof limiter.limit !== "function") {
    return { error: { status: 503, code: "RATE_LIMITER_NOT_CONFIGURED", message: "Cloud processing safeguards are not configured" } };
  }
  try {
    const result = await limiter.limit({ key: clientRateLimitKey(request, prefix) });
    if (result && result.success === true) return { ok: true };
    if (result && result.success === false) {
      return { error: { status: 429, code: "RATE_LIMITED", message: "Please wait before requesting more cloud processing" } };
    }
    return { error: { status: 503, code: "RATE_LIMITER_UNAVAILABLE", message: "Cloud processing safeguards are temporarily unavailable" } };
  } catch {
    return { error: { status: 503, code: "RATE_LIMITER_UNAVAILABLE", message: "Cloud processing safeguards are temporarily unavailable" } };
  }
}

function isOutputJobId(value) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(String(value || ""));
}

function isOutputToken(value) {
  return /^[A-Za-z0-9_-]{32,128}$/u.test(String(value || ""));
}

function requestRoute(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return { error: { status: 400, code: "INVALID_REQUEST_URL", message: "Invalid request URL" } };
  }
  const path = url.pathname.replace(/\/+$/u, "") || "/";
  if (path === "/" || path === "/api/text" || path === "/text") {
    return {
      id: "text",
      upstreamBinding: "POSTPREP_UPSTREAM_URL",
      method: "POST",
      rateBinding: TEXT_RATE_LIMITER_BINDING,
      ratePrefix: "text",
      message: "Use POST for text processing",
    };
  }
  if (path === "/voice") {
    return {
      id: "voice",
      upstreamBinding: "POSTPREP_VOICE_UPSTREAM_URL",
      method: "POST",
      rateBinding: VOICE_RATE_LIMITER_BINDING,
      ratePrefix: "voice",
      maxBytes: MAX_VOICE_UPLOAD_BYTES,
      message: "Use POST for voice processing",
    };
  }
  if (path === "/voice/status") {
    return {
      id: "voice-status",
      upstreamBinding: "POSTPREP_VOICE_STATUS_UPSTREAM_URL",
      method: "GET",
      rateBinding: TEXT_RATE_LIMITER_BINDING,
      ratePrefix: "voice-status",
      message: "Use GET for voice service status",
    };
  }
  const outputMatch = path.match(/^\/voice\/output\/([^/]+)$/u);
  if (outputMatch) {
    const jobId = outputMatch[1];
    const token = url.searchParams.get("token") || "";
    if (!isOutputJobId(jobId) || !isOutputToken(token)) {
      return { error: { status: 400, code: "INVALID_VOICE_OUTPUT_TOKEN", message: "Invalid voice output address" } };
    }
    return {
      id: "voice-output",
      upstreamBinding: "POSTPREP_VOICE_OUTPUT_UPSTREAM_URL",
      method: "GET",
      rateBinding: TEXT_RATE_LIMITER_BINDING,
      ratePrefix: "voice-output",
      message: "Use GET for voice output",
      jobId,
      token,
    };
  }
  return { error: { status: 404, code: "ROUTE_NOT_FOUND", message: "This gateway route is not available" } };
}

function resolvedUpstreamUrl(route, env) {
  const configured = configuredUpstream(env, route.upstreamBinding);
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") return "";
    if (route.id === "voice-output") {
      url.searchParams.set("job", route.jobId);
      url.searchParams.set("token", route.token);
    }
    return url.toString();
  } catch {
    return "";
  }
}

function declaredRequestIsTooLarge(request, maxBytes) {
  if (!maxBytes) return false;
  const declaredLength = Number.parseInt(request.headers.get("Content-Length") || "", 10);
  return Number.isFinite(declaredLength) && declaredLength > maxBytes;
}

function preflightResponse(request, env, route) {
  const headers = responseHeaders(request, env);
  headers.set("Allow", `${route.method}, OPTIONS`);
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", `${route.method}, OPTIONS`);
  headers.set("Access-Control-Max-Age", "600");
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request, env) {
    if (!isAllowedOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");

    const routeResult = requestRoute(request);
    if (routeResult.error) return failure(request, env, routeResult.error.status, routeResult.error.code, routeResult.error.message);
    const route = routeResult;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return preflightResponse(request, env, route);
    if (method !== route.method) return failure(request, env, 405, "METHOD_NOT_ALLOWED", route.message);
    if (declaredRequestIsTooLarge(request, route.maxBytes)) {
      return failure(request, env, 413, "VOICE_AUDIO_TOO_LARGE", "The voice upload is too large");
    }

    const gatewaySecret = protectedGatewaySecret(env);
    const upstreamUrl = resolvedUpstreamUrl(route, env);
    if (!gatewaySecret || !upstreamUrl) {
      const code = route.id.startsWith("voice") ? "VOICE_BACKEND_NOT_CONFIGURED" : "GATEWAY_NOT_CONFIGURED";
      return failure(request, env, 503, code, "Cloud processing safeguards are not configured");
    }

    const rateLimit = await enforceRateLimit(request, env, route.rateBinding, route.ratePrefix);
    if (rateLimit.error) return failure(request, env, rateLimit.error.status, rateLimit.error.code, rateLimit.error.message);

    const headers = new Headers();
    const contentType = request.headers.get("Content-Type");
    const origin = request.headers.get("Origin");
    const visitorIp = request.headers.get("CF-Connecting-IP");
    if (contentType && route.method === "POST") headers.set("Content-Type", contentType);
    if (origin) headers.set("Origin", origin);
    if (visitorIp) headers.set("CF-Connecting-IP", visitorIp);
    headers.set("X-PostPrep-Gateway", gatewaySecret);

    try {
      const upstream = await fetch(upstreamUrl, {
        method: route.method,
        headers,
        body: route.method === "POST" ? request.body : undefined,
      });
      const upstreamHeaders = new Headers(upstream.headers);
      upstreamHeaders.set("Cache-Control", "no-store");
      upstreamHeaders.set("X-Content-Type-Options", "nosniff");
      upstreamHeaders.set("Vary", "Origin");
      upstreamHeaders.set("Access-Control-Allow-Origin", origin);
      return new Response(upstream.body, { status: upstream.status, headers: upstreamHeaders });
    } catch {
      return failure(request, env, 502, "UPSTREAM_UNAVAILABLE", "Cloud processing is temporarily unavailable");
    }
  },
};
