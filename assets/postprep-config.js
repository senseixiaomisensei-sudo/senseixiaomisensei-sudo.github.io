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

// 本机计算模式：文本朗读 TTS（edge-tts）与训练服务跑在你的电脑（rvc-service）。
// 留空则与页面同源；若在局域网用手机/其他设备访问，且 rvc-service 跑在本机 8080 端口，
// 请把下面改成你的电脑局域网 IP，例如 "http://192.168.1.3:8080"。
globalThis.__RVC_TTS_BASE__ = "";
