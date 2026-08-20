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

// 本机计算模式：文本朗读 TTS（edge-tts）与训练服务跑在部署这台页面的电脑上（rvc-service，绑 0.0.0.0）。
// 最佳用法（全机共享，无需改这里）：
//   1) 电脑运行 node serve.js（页面）+ start-rvc.ps1（TTS 服务，绑 0.0.0.0:8080）；
//   2) 同一 Wi-Fi 下其他设备访问 http://<电脑局域网IP>:8124/rvc.html ；
//   3) 切到"文本朗读"点"一键适配"，页面会按所访问的局域网 IP 自动推导并连到 <电脑IP>:8080。
// 只有当你希望不同来源的页面默认连到某个固定服务时，才把下面改成对应地址（如公网 TTS 地址）。
globalThis.__RVC_TTS_BASE__ = "";
