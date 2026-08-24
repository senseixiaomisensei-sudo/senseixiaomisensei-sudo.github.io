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

// 本机计算模式：文本朗读 TTS（edge-tts）与训练服务跑在部署这台页面的电脑上（rvc-service）。
// 全机免配置共享（推荐，无需改这里）：
//   1) 电脑运行 node serve.js（页面，已把 /v1/tts 反向代理到 127.0.0.1:8080）+ start-rvc.ps1；
//   2) 同一 Wi-Fi 下其他设备访问 http://<电脑局域网IP>:8124/rvc.html ；
//   3) 切到"文本朗读"点"一键适配"，走同源即可自动成功，无需知道 IP/端口/跨域。
// 只有当你希望不同来源的页面默认连到某个固定服务（而非同源代理）时，才把下面改成对应地址。
globalThis.__RVC_TTS_BASE__ = "";
