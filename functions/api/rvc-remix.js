import {
  configuredRvcBackend,
  failure,
  fetchWithTimeout,
  responseHeaders,
  sameOrigin,
  validOutputJobId,
  validOutputToken,
  verifyGateway,
} from "./_rvc-shared.js";

export async function onRequest({ request, env }) {
  if (!sameOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  const gateway = verifyGateway(request, env);
  if (gateway.error) return failure(request, env, gateway.error.status, gateway.error.code, gateway.error.message);
  if (request.method.toUpperCase() !== "POST") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use POST to update a song mix");
  const url = new URL(request.url);
  const job = url.searchParams.get("job") || "";
  const token = url.searchParams.get("token") || "";
  if (!validOutputJobId(job) || !validOutputToken(token)) return failure(request, env, 400, "INVALID_RVC_OUTPUT_TOKEN", "Invalid voice output address");
  const backend = configuredRvcBackend(env);
  if (!backend) return failure(request, env, 503, "RVC_BACKEND_NOT_CONFIGURED", "Voice conversion is not configured");
  if (Number(request.headers.get("Content-Length") || 0) > 64 * 1024) return failure(request, env, 413, "RVC_REMIX_TOO_LARGE", "Mix settings are too large");

  let form;
  try {
    form = await request.formData();
  } catch {
    return failure(request, env, 400, "RVC_INVALID_FORM", "Invalid mix settings");
  }
  const keys = ["vocalGainDb", "accompanimentGainDb", "vocalMute", "accompanimentMute",
    "vocal_gain_db", "accompaniment_gain_db", "vocal_mute", "accompaniment_mute"];
  if ([...form.keys()].some((key) => !keys.includes(key))) return failure(request, env, 400, "RVC_INVALID_FIELD", "Unsupported mix setting");
  const pair = (camel, snake, fallback) => {
    const a = form.get(camel);
    const b = form.get(snake);
    return a != null && b != null && String(a) !== String(b) ? null : String(a ?? b ?? fallback);
  };
  const vocal = pair("vocalGainDb", "vocal_gain_db", "0");
  const accompaniment = pair("accompanimentGainDb", "accompaniment_gain_db", "0");
  const vocalMute = pair("vocalMute", "vocal_mute", "false");
  const accompanimentMute = pair("accompanimentMute", "accompaniment_mute", "false");
  if (![vocal, accompaniment].every((value) => /^-?(?:\d+)(?:\.\d+)?$/u.test(value) && Number(value) >= -24 && Number(value) <= 6)
    || ![vocalMute, accompanimentMute].every((value) => value === "true" || value === "false")) {
    return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Invalid mix settings");
  }
  const upstreamBody = new FormData();
  upstreamBody.set("vocal_gain_db", vocal);
  upstreamBody.set("accompaniment_gain_db", accompaniment);
  upstreamBody.set("vocal_mute", vocalMute);
  upstreamBody.set("accompaniment_mute", accompanimentMute);
  const upstreamUrl = new URL(`/v1/output/${encodeURIComponent(job)}/remix`, backend.url.origin);
  upstreamUrl.searchParams.set("token", token);
  try {
    const upstream = await fetchWithTimeout(upstreamUrl.toString(), {
      method: "POST", headers: { Authorization: `Bearer ${backend.token}` }, body: upstreamBody,
    }, 60000);
    const body = await upstream.text();
    return new Response(body, { status: upstream.status, headers: responseHeaders(request, env) });
  } catch {
    return failure(request, env, 502, "RVC_REMIX_UNAVAILABLE", "Mix update is temporarily unavailable");
  }
}
