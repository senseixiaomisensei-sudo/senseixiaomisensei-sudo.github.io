const TEXT_RATE_LIMITER_BINDING = "POSTPREP_RATE_LIMITER";
const RVC_RATE_LIMITER_BINDING = "POSTPREP_RVC_RATE_LIMITER";
const GATEWAY_SECRET_BINDING = "POSTPREP_GATEWAY_SECRET";
const RVC_DIRECT_BASE_BINDING = "POSTPREP_RVC_DIRECT_BASE_URL";
const RVC_DIRECT_TOKEN_BINDING = "POSTPREP_RVC_INFERENCE_TOKEN";
const MAX_RVC_UPLOAD_BYTES = 25 * 1024 * 1024;
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
  if (path === "/rvc") {
    return {
      id: "rvc",
      upstreamBinding: "POSTPREP_RVC_UPSTREAM_URL",
      method: "POST",
      rateBinding: RVC_RATE_LIMITER_BINDING,
      ratePrefix: "rvc",
      maxBytes: MAX_RVC_UPLOAD_BYTES,
      message: "Use POST for voice conversion",
    };
  }
  if (path === "/rvc/status") {
    return {
      id: "rvc-status",
      upstreamBinding: "POSTPREP_RVC_STATUS_UPSTREAM_URL",
      method: "GET",
      rateBinding: TEXT_RATE_LIMITER_BINDING,
      ratePrefix: "rvc-status",
      message: "Use GET for service status",
    };
  }
  if (path === "/rvc/models") {
    return {
      id: "rvc-models",
      upstreamBinding: "POSTPREP_RVC_MODELS_UPSTREAM_URL",
      method: "GET",
      rateBinding: TEXT_RATE_LIMITER_BINDING,
      ratePrefix: "rvc-models",
      message: "Use GET for the voice list",
    };
  }
  const outputMatch = path.match(/^\/rvc\/output\/([^/]+)$/u);
  if (outputMatch) {
    const jobId = outputMatch[1];
    const token = url.searchParams.get("token") || "";
    if (!isOutputJobId(jobId) || !isOutputToken(token)) {
      return { error: { status: 400, code: "INVALID_RVC_OUTPUT_TOKEN", message: "Invalid voice output address" } };
    }
    return {
      id: "rvc-output",
      upstreamBinding: "POSTPREP_RVC_OUTPUT_UPSTREAM_URL",
      method: "GET",
      rateBinding: TEXT_RATE_LIMITER_BINDING,
      ratePrefix: "rvc-output",
      message: "Use GET for voice output",
      jobId,
      token,
    };
  }
  return { error: { status: 404, code: "ROUTE_NOT_FOUND", message: "This gateway route is not available" } };
}

function directRvcToken(env) {
  return configuredUpstream(env, RVC_DIRECT_TOKEN_BINDING);
}

function resolvedDirectRvcUrl(route, env) {
  if (!route.id.startsWith("rvc")) return "";
  const configured = configuredUpstream(env, RVC_DIRECT_BASE_BINDING);
  const token = directRvcToken(env);
  if (!configured && !token) return "";
  if (!configured || token.length < 32) return "";
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:"
      || !url.hostname.endsWith(".trycloudflare.com")
      || url.username
      || url.password
      || url.port
    ) return "";
    const paths = {
      rvc: "/v1/convert",
      "rvc-status": "/healthz",
      "rvc-models": "/v1/models",
      "rvc-output": `/v1/output/${route.jobId || ""}`,
    };
    url.pathname = paths[route.id] || "/";
    url.search = "";
    url.hash = "";
    if (route.id === "rvc-output") url.searchParams.set("token", route.token);
    return url.toString();
  } catch {
    return "";
  }
}

function resolvedUpstreamUrl(route, env) {
  const direct = resolvedDirectRvcUrl(route, env);
  if (direct) return direct;
  const configured = configuredUpstream(env, route.upstreamBinding);
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") return "";
    if (route.id === "rvc-output") {
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
      return failure(request, env, 413, "RVC_AUDIO_TOO_LARGE", "The audio upload is too large");
    }

    const gatewaySecret = protectedGatewaySecret(env);
    const directRvc = route.id.startsWith("rvc") && Boolean(configuredUpstream(env, RVC_DIRECT_BASE_BINDING));
    const upstreamUrl = resolvedUpstreamUrl(route, env);
    if ((!directRvc && !gatewaySecret) || !upstreamUrl) {
      const code = route.id.startsWith("rvc") ? "RVC_BACKEND_NOT_CONFIGURED" : "GATEWAY_NOT_CONFIGURED";
      return failure(request, env, 503, code, "Cloud processing safeguards are not configured");
    }

    const rateLimit = await enforceRateLimit(request, env, route.rateBinding, route.ratePrefix);
    if (rateLimit.error) {
      const response = failure(request, env, rateLimit.error.status, rateLimit.error.code, rateLimit.error.message);
      if (rateLimit.error.status === 429) response.headers.set("Retry-After", "60");
      return response;
    }

    const headers = new Headers();
    const requestId = crypto.randomUUID();
    const contentType = request.headers.get("Content-Type");
    const origin = request.headers.get("Origin");
    const visitorIp = request.headers.get("CF-Connecting-IP");
    if (contentType && route.method === "POST") headers.set("Content-Type", contentType);
    headers.set("X-PostPrep-Request-Id", requestId);
    if (origin) headers.set("Origin", origin);
    if (visitorIp) headers.set("CF-Connecting-IP", visitorIp);
    if (directRvc) headers.set("Authorization", `Bearer ${directRvcToken(env)}`);
    else headers.set("X-PostPrep-Gateway", gatewaySecret);

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
      upstreamHeaders.set("Access-Control-Expose-Headers", "Retry-After, X-PostPrep-Request-Id");
      upstreamHeaders.set("X-PostPrep-Request-Id", requestId);
      return new Response(upstream.body, { status: upstream.status, headers: upstreamHeaders });
    } catch {
      const response = failure(request, env, 502, "UPSTREAM_UNAVAILABLE", "Cloud processing is temporarily unavailable");
      response.headers.set("Access-Control-Expose-Headers", "Retry-After, X-PostPrep-Request-Id");
      response.headers.set("X-PostPrep-Request-Id", requestId);
      return response;
    }
  },
};
