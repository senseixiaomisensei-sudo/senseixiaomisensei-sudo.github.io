# AI 变声器（RVC）部署说明

## 架构事实

- GitHub Pages、Cloudflare Pages Functions 和 Workers 都不能运行 RVC 或其他 GPU 推理模型。
- 本仓库的公开网页、Cloudflare 网关与 Pages Function 负责：浏览器端预检（文件类型、大小、时长）、角色模型列表转发、限流、固定服务器地址转发与短期结果下载。
- 因此，真正启用变声前，必须有一个由账户所有者授权的 GPU 容器或云主机。这个步骤可能涉及登录、服务条款和计费，不能由网页或前端密钥替代。

## 数据流

```text
浏览器 rvc.html
  -> Cloudflare Worker 网关 /rvc*（Origin 校验 + 限流）
  -> Pages Function /api/rvc*（网关密钥校验 + 字段/文件校验）
  -> GPU 服务 rvc-service /v1/convert（Bearer 令牌 + 模型推理）
  -> 结果回传，浏览器经 Worker /rvc/output/<job>?token= 下载
```

角色模型由 GPU 服务扫描 `RVC_MODELS_DIR` 自动发现（见 `rvc-service/models/README.md`），
网页通过 `/rvc/models` 实时获取可用角色列表；`assets/rvc-models.json` 只是静态展示目录，
两者会自动合并。

## GPU 服务（需要账户所有者授权）

1. 在允许 Docker、NVIDIA GPU 和 HTTPS 反向代理／私有隧道的环境中部署 `rvc-service/`。不要把 8080 端口直接开放给浏览器。
2. 将 RVC 模型 `.pth`（与可选 `.index`）放入 GPU 环境的 `/models/rvc`；`rvc-service` 不会替你下载模型。确认每个模型的权重许可。
3. 生成一个至少 32 字符的高熵令牌，分别作为 GPU 环境的 `RVC_GATEWAY_TOKEN` 和 Cloudflare Pages 的 `RVC_INFERENCE_TOKEN`。GPU 公开 HTTPS 地址以 `/v1/convert` 结尾，例如 `https://rvc.example.com/v1/convert`。

## Cloudflare 环境变量

在 Cloudflare 已登录的终端中，设置以下 **Pages Secret**，不要写入仓库：

```powershell
npx wrangler pages secret put RVC_INFERENCE_URL --project-name postprep
npx wrangler pages secret put RVC_INFERENCE_TOKEN --project-name postprep
```

`RVC_INFERENCE_URL` 只能是 HTTPS 的 `https://your-rvc-service.example/v1/convert`。Pages Function 会拒绝带查询参数、密码、其他路径或非 HTTPS 的地址；用户输入永远不能影响该地址。

随后部署 Pages Functions 和 Worker：

```powershell
npx wrangler pages deploy . --project-name postprep --branch main
npx wrangler deploy --config worker/wrangler.toml
```

Worker 配置中已有独立的 `POSTPREP_RVC_RATE_LIMITER`（每 Origin/IP 1 次／分钟）。未配置 GPU 服务时，`/rvc/status` 返回 `ready: false`，网页会关闭"开始变声"按钮，不会把音频发送到一个空地址。

## 添加/更新角色

- 放入 GPU 服务的模型：`/models/rvc/<id>/model.pth`（+ 可选 `model.index`、`meta.json`），重启容器后自动出现在网页角色列表中。
- 只改展示信息：编辑 `assets/rvc-models.json`（名称、emoji、标签、描述、默认音高）。
- 模型权重不要提交到仓库；GitHub 单文件上限 100 MB，且权重各有许可。

## 上线核验

1. 未配置 `RVC_INFERENCE_*`：变声页显示"服务未配置"，仍可浏览角色列表与上传音频做本机预检，浏览器网络面板不应出现任何音频上传请求。
2. 已配置 GPU 服务且至少放了一个模型：角色卡片显示"已就绪"，上传/录制 5–30 秒干净人声后点击"开始变声"，应返回可播放、可下载的结果。
3. 校验输出 URL 是 Worker 路径而不是 GPU 域名，并在约 15 分钟后不可用。
4. 用超大文件、错误格式、空角色 id、无效令牌和 GitHub Pages／Cloudflare Pages 两个允许 Origin 做回归测试。
5. 录音功能只在 HTTPS 页面可用；`_headers` 已为 `/rvc*` 单独放行 `microphone=(self)`。
