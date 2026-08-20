import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8124;
const ROOT = "E:\\大肥鱼\\site";
// 本机 rvc-service（edge-tts 文本朗读）的目标地址。
// serve.js 会把 /v1/tts* 反向代理到这里，从而同一 Wi-Fi 下所有设备只需连 8124 页面即可，
// 点「一键适配」走同源即可自动配置成功，无需知道这个 8080、也无需跨域。
const TTS_PROXY_TARGET = process.env.RVC_TTS_TARGET || "http://127.0.0.1:8080";

const MIME_MAP = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".onnx": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  if (req.method === "OPTIONS") {
    // 允许对 /v1/tts 的跨源预检（保留 CORS，兼容不走代理的直连场景）
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return;
  }

  let reqPath = decodeURIComponent(req.url.split("?")[0]);

  // 反向代理：把 /v1/tts* 转发到本机 rvc-service（edge-tts），实现全机免配置共享
  if (reqPath === "/v1/tts" || reqPath === "/v1/tts-health") {
    proxy(req, res, reqPath);
    return;
  }
  if (reqPath === "/") reqPath = "/rvc.html";
  const filePath = path.join(ROOT, reqPath.replace(/^\//, ""));

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.end("Not Found: " + reqPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME_MAP[ext] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
});

// 把 /v1/tts* 转发到本机 rvc-service；请求体原样转发，响应原样回传（含 CORS）。
function proxy(req, res, targetPath) {
  const target = new URL(TTS_PROXY_TARGET + targetPath);
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""),
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (up) => {
      res.statusCode = up.statusCode || 502;
      res.setHeader("Content-Type", up.headers["content-type"] || "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ code: "RVC_TTS_UNAVAILABLE", message: "本机 rvc-service 未启动，请先运行 start-rvc.ps1" }));
  });
  req.pipe(upstream);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`====================================================`);
  console.log(`  RVC AI 变声器网站服务已启动 (支持局域网多设备访问)`);
  console.log(`  电脑本机访问: http://localhost:${PORT}/rvc.html`);
  console.log(`  手机访问 (同Wi-Fi): http://192.168.1.3:${PORT}/rvc.html`);
  console.log(`  文本朗读代理: /v1/tts → ${TTS_PROXY_TARGET} (一键适配走同源，全机可用)`);
  console.log(`====================================================`);
});
