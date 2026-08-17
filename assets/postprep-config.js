// Public deployment configuration only. Never put secrets in this file.
// Set this to the deployed protected gateway URL when cloud processing is enabled.
globalThis.POSTPREP_API_ENDPOINT = "https://postprep-text-gateway.postprep.workers.dev";

// Public RVC voice-changer gateway paths only. The GPU endpoint and its token stay on the server.
globalThis.POSTPREP_RVC_API_ENDPOINT = "https://postprep-text-gateway.postprep.workers.dev/rvc";
globalThis.POSTPREP_RVC_STATUS_ENDPOINT = "https://postprep-text-gateway.postprep.workers.dev/rvc/status";
globalThis.POSTPREP_RVC_MODELS_ENDPOINT = "https://postprep-text-gateway.postprep.workers.dev/rvc/models";

// This is a public Cloudflare Turnstile site key, not its secret key.
// Its matching secret is stored only in the server-side deployment environment.
globalThis.POSTPREP_TURNSTILE_SITE_KEY = "0x4AAAAAAENiWsmUXpTMXimW";
