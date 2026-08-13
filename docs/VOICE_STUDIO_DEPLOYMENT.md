# 声音工作台部署说明

## 已确认的架构事实

- GitHub Pages、Cloudflare Pages Functions 和 Workers 都不能运行 CosyVoice、RVC 或其他 GPU 推理模型。
- 本仓库的公开网页、Cloudflare 网关与 Pages Function 可以安全地做浏览器预检、授权门槛、人机验证、限流和固定服务器地址转发。
- 因此，真正启用文本朗读／声音转换前，必须有一个由账户所有者授权的 GPU 容器或云主机。这个步骤可能涉及登录、服务条款和计费，不能由网页或前端密钥替代。

## 当前选择

`voice-service/` 固定使用 Apache-2.0 的 CosyVoice 源码提交
`074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`：

- `read` 使用其跨语种零样本语音生成，不要求用户手写参考音频转写；
- `cover` 使用其声音转换接口，只接受授权的源干声和授权参考声音；
- 不自动下载、分离或抓取音源，不提供社区模型库，不允许运行用户命令；
- 模型权重不随本仓库发布，部署者必须先复核所选权重的独立许可。

高星项目的筛选结论不是“谁星标高就直接上线”。`myshell-ai/OpenVoice`（MIT）适合做备选文本朗读链路；`fumiama/Retrieval-based-Voice-Conversion-WebUI` 是 AGPL-3.0，若作为网络服务使用会触发其源代码提供义务，因此当前未被直接嵌入。`F5-TTS` 的预训练模型与 `fish-speech` 的许可需要另行核验，也没有被自动接入。

完整的候选、许可证信号与接入结论见 [VOICE_MODEL_RESEARCH.md](VOICE_MODEL_RESEARCH.md)。

## GPU 服务（需要账户所有者授权）

1. 在允许 Docker、NVIDIA GPU 和 HTTPS 反向代理／私有隧道的环境中部署 `voice-service/`。不要把 8080 端口直接开放给浏览器。
2. 审核并挂载 CosyVoice 权重到 GPU 环境的 `/models/CosyVoice-300M`。`voice-service` 不会替你下载权重。
3. 生成一个至少 32 字符的高熵令牌，分别作为 GPU 环境的 `VOICE_GATEWAY_TOKEN` 和 Cloudflare Pages 的 `VOICE_INFERENCE_TOKEN`。GPU 公开 HTTPS 地址以 `/v1/jobs` 结尾，例如 `https://voice.example.com/v1/jobs`。

## Cloudflare 环境变量

在 Cloudflare 已登录的终端中，设置以下 **Pages Secret**，不要写入仓库：

```powershell
npx wrangler pages secret put VOICE_INFERENCE_URL --project-name postprep
npx wrangler pages secret put VOICE_INFERENCE_TOKEN --project-name postprep
```

`VOICE_INFERENCE_URL` 只能是 HTTPS 的 `https://your-voice-service.example/v1/jobs`。Pages Function 会拒绝带查询参数、密码、其他路径或非 HTTPS 的地址；用户输入永远不能影响该地址。

随后部署 Pages Functions 和 Worker：

```powershell
npx wrangler pages deploy . --project-name postprep --branch main
npx wrangler deploy --config worker/wrangler.toml
```

Worker 配置中已有独立的 `POSTPREP_VOICE_RATE_LIMITER`（每 Origin/IP 1 次／分钟）。未配置 GPU 服务时，`/voice/status` 返回 `ready: false`，网页关闭上传与生成按钮，因此不会把音频发送到一个空地址。

## 上线核验

1. 未配置 `VOICE_INFERENCE_*`：声音页面显示“未配置”，选择文件可完成本机预检，浏览器网络面板不应出现任何音频上传请求。
2. 已配置 GPU 服务：必须选择允许的权利范围、勾选两项确认、输入 `I HAVE THE RIGHTS` 并完成人机验证；缺一项就不得发起 GPU 请求。
3. 用 5–30 秒、单人、已获授权的干声分别核验朗读和转换；确认输出 URL 是 Worker 路径而不是 GPU 域名，并在 15 分钟后返回不可用。
4. 用超大文件、错误格式、缺少源干声、无效令牌和 GitHub Pages／Cloudflare Pages 两个允许 Origin 进行回归测试。
