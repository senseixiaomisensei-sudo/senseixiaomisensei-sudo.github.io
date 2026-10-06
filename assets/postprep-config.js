// Public deployment configuration only. Never put secrets in this file.
// Set this to the deployed protected gateway URL when cloud processing is enabled.
globalThis.POSTPREP_API_ENDPOINT = "https://postprep-text-gateway.postprep.workers.dev";

// Public RVC voice-changer gateway paths only. The GPU endpoint and its token stay on the server.
// Route browser traffic through the China-reachable Pages domain. Pages invokes
// the protected Worker through a Cloudflare Service Binding, so clients no longer
// depend on a direct workers.dev connection during upload, inference, or download.
globalThis.POSTPREP_RVC_API_ENDPOINT = "https://postprep-ae6.pages.dev/rvc-api";
globalThis.POSTPREP_RVC_STATUS_ENDPOINT = "https://postprep-ae6.pages.dev/rvc-api/status";
globalThis.POSTPREP_RVC_MODELS_ENDPOINT = "https://postprep-ae6.pages.dev/rvc-api/models";
// Public, short-lived audio playback route. It accepts only an unguessable
// conversion job/token pair and never exposes the private GPU endpoint token.
globalThis.POSTPREP_RVC_MEDIA_ENDPOINT = "https://postprep-ae6.pages.dev/rvc-api/output";

// This is a public Cloudflare Turnstile site key, not its secret key.
// Its matching secret is stored only in the server-side deployment environment.
globalThis.POSTPREP_TURNSTILE_SITE_KEY = "0x4AAAAAAENiWsmUXpTMXimW";

// TTS uses the public protected RVC gateway on phones and computers.
// No GPU token, local IP or same-Wi-Fi requirement is exposed to clients.
// Optional operator override: a public HTTPS base, never a private server token.
globalThis.__RVC_TTS_BASE__ = "";
