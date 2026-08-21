# AI 变声器（RVC）部署说明

## 架构事实

- GitHub Pages、Cloudflare Pages Functions 和 Workers 都不能运行 RVC 或其他 GPU 推理模型。
- 本仓库的公开网页、Cloudflare 网关与 Pages Function 负责：浏览器端预检（文件类型、大小、时长）、角色模型列表转发、限流、固定服务器地址转发与短期结果下载。
- Cloudflare 边缘（Worker/Pages Function）**不能**直接请求 `*.cfargotunnel.com` 命名隧道地址（返回 403 / error 1102，防 SSRF 限制）；因此本部署使用 **trycloudflare 快速隧道**作为 GPU 服务的公网入口，它可被 Cloudflare 边缘正常访问。

## 数据流

```text
浏览器 rvc.html
  -> Cloudflare Worker 网关 /rvc*（Origin 校验 + 限流）
  -> Pages Function /api/rvc*（网关密钥校验 + 字段/文件校验）
  -> trycloudflare 快速隧道 -> 本机 GPU 服务 rvc-service /v1/convert
  -> 结果回传，浏览器经 Worker /rvc/output/<job>?token= 下载
```

角色模型由 GPU 服务扫描 `RVC_MODELS_DIR` 自动发现（见 `rvc-service/models/README.md`），
网页通过 `/rvc/models` 实时获取可用角色列表；`assets/rvc-models.json` 只是静态展示目录，
两者会自动合并。

## 本机 GPU 服务（Windows + NVIDIA 显卡即可）

1. 首次安装（一次性）：

```powershell
uv python install 3.10
powershell -ExecutionPolicy Bypass -File E:\大肥鱼\rvc-local\setup-rvc.ps1
```

2. 模型放入 `E:\大肥鱼\rvc-local\models\<角色名>\`（`model.pth` 或 `<角色名>.pth` + 可选 `.index` + 可选 `meta.json`），重启服务后自动出现。
3. 每次开机后运行（一键恢复线上变声）：

```powershell
powershell -ExecutionPolicy Bypass -File E:\大肥鱼\rvc-local\start-all.ps1
```

`start-all.ps1` 会自动：启动本地 GPU 服务 → 启动 trycloudflare 快速隧道 → 用新隧道地址更新 Pages 密钥（`RVC_INFERENCE_URL`/`RVC_INFERENCE_TOKEN`）→ 重新部署 Pages → 线上自检。要求本机已执行过 `npx wrangler login`。

## Cloudflare 环境变量（由 start-all.ps1 自动维护）

- `RVC_INFERENCE_URL`：形如 `https://<随机>.trycloudflare.com/v1/convert`，随每次隧道重启变化。
- `RVC_INFERENCE_TOKEN`：与 GPU 服务 `RVC_GATEWAY_TOKEN` 相同的高熵令牌（保存在 `rvc-local/.gateway-token`）。
- Pages Function 会拒绝带查询参数、密码、其他路径或非 HTTPS 的地址；用户输入永远不能影响该地址。

手动部署（备用）：

```powershell
npx wrangler pages deploy . --project-name postprep --branch main
npx wrangler deploy --config worker/wrangler.toml
```

Worker 配置中已有独立的 `POSTPREP_RVC_RATE_LIMITER`（每 Origin/IP 1 次／分钟）。未配置 GPU 服务时，`/rvc/status` 返回 `ready: false`，网页会关闭"开始变声"按钮，不会把音频发送到一个空地址。

## 添加/更新角色

- 放入 GPU 服务的模型：`E:\大肥鱼\rvc-local\models\<id>\`（`model.pth`/`<id>.pth` + 可选 `model.index`、`meta.json`），重启服务后自动出现在网页角色列表中。
- 只改展示信息：编辑 `assets/rvc-models.json`（名称、emoji、标签、描述、跨音域预设建议值）。`defaultPitch` 不会在切换角色时自动应用，页面安全默认值始终为 `0`。
- 模型权重不要提交到仓库；GitHub 单文件上限 100 MB，且权重各有许可，请确认每个模型的许可后再挂载。

## 上线核验

1. 未配置 `RVC_INFERENCE_*`：变声页显示"服务未配置"，仍可浏览角色列表与上传音频做本机预检，浏览器网络面板不应出现任何音频上传请求。
2. 已配置 GPU 服务且至少放了一个模型：角色卡片显示"已就绪"，上传/录制 5–30 秒干净人声后点击"开始变声"，应返回可播放、可下载的结果。
3. 校验输出 URL 是 Worker 路径而不是隧道域名，并在约 15 分钟后不可用。
4. 用超大文件、错误格式、空角色 id、无效令牌和 GitHub Pages／Cloudflare Pages 两个允许 Origin 做回归测试。
5. 录音功能只在 HTTPS 页面可用；`_headers` 已为 `/rvc*` 单独放行 `microphone=(self)`。
6. 快速隧道无 SLA，重启电脑后必须重跑 `start-all.ps1`（会更新隧道地址）；长期正式运营建议购买域名后改用命名隧道 + CNAME。
