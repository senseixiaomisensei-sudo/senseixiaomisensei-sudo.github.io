# PostPrep

一个无需登录的双语创作者文案工具站：发布前检查长度、整理标签、清理排版，并按所选平台从一句主题、标题或标签生成可编辑文案或标签。网站还提供“发布可信包”：在浏览器本机整理格式、字符、标签、链接、待确认表述与 AIGC 发布提醒；只有主动点击后才会请求深度编辑建议。

Skills 中心提供本项目原创的 MIT Skills、本机预览 `SKILL.md`，以及经人机验证和服务端代理保护的 GitHub 公开 Skill 发现。Skill 权限护照可静态展示来源、许可证、固定提交版本、脚本/网络/环境变量/文件/Shell/动态执行/混淆与提示注入信号；它不会自动下载、安装或执行第三方代码。

AI 变声器（RVC）提供角色声音选择、上传或录制自己的声音、一键 RVC 声音转换：先在本机做文件预检，再经受保护网关调用 GPU 服务；角色模型由 GPU 服务自动发现并即时列出，输出为短期、令牌保护的下载。用户还可以逐段上传获授权的纯人声音频，按固定 RVC v2 训练链路生成自定义名称的 `.pth` 与 FAISS 索引，并在独立训练模型分区使用。模型权重不随仓库发布。部署说明见 [RVC_DEPLOYMENT.md](docs/RVC_DEPLOYMENT.md) 与 [rvc-service](rvc-service/README.md)。

## 访问

<https://senseixiaomisensei-sudo.github.io/>

## 本地预览

```bash
python -m http.server 8000
# 打开 http://localhost:8000/
```

首次拉取源码或修改 Tailwind 类名后，先生成本地样式：

```bash
npm install
npm run build:styles
```

页面使用的 Tailwind、Font Awesome 和首页插图均随仓库发布，不再让访客浏览器加载海外 CDN 或广告脚本。`skills/` 中的三个 PostPrep 原创 Skills 采用本项目的 MIT License；页面不会复制、安装或重新发布第三方 GitHub Skills。本机导入仅在浏览器内预览，不会上传文件。

## 开源与贡献

- 本项目原始代码采用 [MIT License](LICENSE)。第三方材料仍遵循各自的许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全报告流程见 [SECURITY.md](SECURITY.md)。
- 提交前运行：

```bash
npm run build:styles
npm test
```

## 部署结构

GitHub Pages 负责公开静态页面；`worker/api-gateway.js` 是唯一的公开云端网关，执行每 Origin/IP 的 Cloudflare Rate Limiting 后才转发到 Pages Functions。`functions/api/text.js` 处理文本；`functions/api/rvc.js`、`rvc-status.js`、`rvc-models.js` 和 `rvc-output.js` 只经网关访问受保护的 GPU 服务。Pages Function 只接受网关持有的服务器密钥。代理只从运行环境读取 `AGNES_API_KEY`、`TURNSTILE_SECRET_KEY`、`POSTPREP_GATEWAY_SECRET`、`RVC_INFERENCE_URL` 和 `RVC_INFERENCE_TOKEN`，前端永远不会保存或发送任一密钥。文本请求要求受信任 Origin、网关限流和服务器验证的 Turnstile 一次性令牌；变声请求要求受信任 Origin、网关限流与服务端参数校验。

Skills 发现由 Pages Function 在服务端调用 GitHub 的公开仓库搜索 API：固定筛去无许可证、归档和 Fork 候选，再以公开星标与维护日期为基础排序。若 `AGNES_API_KEY` 已配置，会对已过滤的公开元数据做额外的 AI 排序；若未配置或模型不可用，页面仍返回透明的公开数据排序。

公开 GitHub Skill 护照只接受 `https://github.com/owner/repo`、指定版本的 `tree` 路径，或指向 `SKILL.md` 的 `blob` 路径。服务端只会以固定 GitHub API 读取仓库元数据、指定 `SKILL.md` 和其提交 SHA，限制为 96 KB、6.5 秒超时以及短时内存缓存；不会代理任意 URL，也不会读取、下载或执行引用的脚本和资源。GitHub 星标、静态信号或“未发现匹配”都不是安全审计、兼容性保证或官方背书；在使用第三方 Skill 前，请阅读其 `SKILL.md`、脚本和许可。

完成 Cloudflare 登录后，可按下面的顺序创建/发布代理：

```bash
npx wrangler login
npx wrangler pages project create postprep --production-branch main
npx wrangler pages secret put AGNES_API_KEY --project-name postprep
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name postprep
npx wrangler pages secret put POSTPREP_GATEWAY_SECRET --project-name postprep
npx wrangler pages secret put RVC_INFERENCE_URL --project-name postprep
npx wrangler pages secret put RVC_INFERENCE_TOKEN --project-name postprep
npx wrangler pages deploy . --project-name postprep --branch main
npx wrangler secret put POSTPREP_GATEWAY_SECRET --config worker/wrangler.toml
npx wrangler deploy --config worker/wrangler.toml
```

在 Cloudflare Turnstile 后台创建绑定到站点域名的 widget：把**公开** Site Key 填入 `assets/postprep-config.js` 的 `POSTPREP_TURNSTILE_SITE_KEY`，把 Secret Key 仅通过上一条命令存为 Pages 服务器密钥。为两个 `POSTPREP_GATEWAY_SECRET` 输入同一个高强度随机值；它用于拒绝绕过网关直连 Pages Function 的请求。再把已启用的 Worker URL 填入 `POSTPREP_API_ENDPOINT`（只填公开网关地址，不填密钥），然后推送 GitHub Pages 前端。`worker/wrangler.toml` 配置了每 Origin/IP 12 次/分钟的限流绑定。

所有 AI 输出默认使用中文，界面切到 English 后才会返回英文。若改用新的 API 域名，必须同步更新各 HTML 页面和 `_headers` 中 Content-Security-Policy 的 `connect-src` 白名单；不要为了方便改成 `https:` 或 `*`。

## 变声 GPU 服务

GitHub Pages、Cloudflare Pages Functions 和 Workers 不能运行 RVC 声音转换模型。要开启变声，账户所有者必须先授权一个 GPU 容器／云主机及其计费；在此之前，网页会保留角色浏览与本机预检并关闭转换按钮。部署后端请使用本仓库的 [rvc-service](rvc-service/README.md) 与 [AI 变声器部署说明](docs/RVC_DEPLOYMENT.md)。不要把 GPU URL、网关令牌、模型权重许可或任意第三方模型下载链接放进前端；模型文件只挂载在 GPU 主机上，由服务自动发现。

## 中国大陆正式上线

当前 GitHub Pages 与 Cloudflare Pages 仅保留为全球访问入口，不能承诺中国大陆稳定可用。面向中国大陆正式上线请使用自己的已备案域名和中国大陆云服务；详细迁移步骤见 [中国大陆部署说明](docs/CHINA_MAINLAND_DEPLOYMENT.md)。国内域名启用后，将它加入函数环境变量 `ALLOWED_ORIGINS`，例如 `https://postprep.example.cn`，再把 `POSTPREP_API_ENDPOINT` 指向同一国内环境的公开 `/api/text` 地址。密钥仍只保存为服务端环境变量；不得为了兼容性取消人机验证、限流或 Origin 校验。
