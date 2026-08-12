# PostPrep

一个无需登录的双语创作者文案工具站：发布前检查长度、整理标签、清理排版，并按所选平台从一句主题、标题或标签生成可编辑文案或标签。

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

页面使用的 Tailwind、Font Awesome 和首页插图均随仓库发布，不再让访客浏览器加载海外 CDN 或广告脚本。

## 开源与贡献

- 本项目原始代码采用 [MIT License](LICENSE)。第三方材料仍遵循各自的许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全报告流程见 [SECURITY.md](SECURITY.md)。
- 提交前运行：

```bash
npm run build:styles
npm test
```

## 部署结构

GitHub Pages 负责公开静态页面；`worker/api-gateway.js` 是唯一的公开 AI 网关，执行每 Origin/IP 的 Cloudflare Rate Limiting 后才转发到 `functions/api/text.js`。Pages Function 只接受网关持有的服务器密钥。代理只从运行环境读取 `AGNES_API_KEY`、`TURNSTILE_SECRET_KEY` 和 `POSTPREP_GATEWAY_SECRET`，前端永远不会保存或发送任一密钥。每个云端请求都要求受信任 Origin、网关限流和服务器验证的 Turnstile 一次性令牌。

完成 Cloudflare 登录后，可按下面的顺序创建/发布代理：

```bash
npx wrangler login
npx wrangler pages project create postprep --production-branch main
npx wrangler pages secret put AGNES_API_KEY --project-name postprep
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name postprep
npx wrangler pages secret put POSTPREP_GATEWAY_SECRET --project-name postprep
npx wrangler pages deploy . --project-name postprep --branch main
npx wrangler secret put POSTPREP_GATEWAY_SECRET --config worker/wrangler.toml
npx wrangler deploy --config worker/wrangler.toml
```

在 Cloudflare Turnstile 后台创建绑定到站点域名的 widget：把**公开** Site Key 填入 `assets/postprep-config.js` 的 `POSTPREP_TURNSTILE_SITE_KEY`，把 Secret Key 仅通过上一条命令存为 Pages 服务器密钥。为两个 `POSTPREP_GATEWAY_SECRET` 输入同一个高强度随机值；它用于拒绝绕过网关直连 Pages Function 的请求。再把已启用的 Worker URL 填入 `POSTPREP_API_ENDPOINT`（只填公开网关地址，不填密钥），然后推送 GitHub Pages 前端。`worker/wrangler.toml` 配置了每 Origin/IP 12 次/分钟的限流绑定。

所有 AI 输出默认使用中文，界面切到 English 后才会返回英文。若改用新的 API 域名，必须同步更新各 HTML 页面和 `_headers` 中 Content-Security-Policy 的 `connect-src` 白名单；不要为了方便改成 `https:` 或 `*`。

## 中国大陆正式上线

当前 GitHub Pages 与 Cloudflare Pages 仅保留为全球访问入口，不能承诺中国大陆稳定可用。面向中国大陆正式上线请使用自己的已备案域名和中国大陆云服务；详细迁移步骤见 [中国大陆部署说明](docs/CHINA_MAINLAND_DEPLOYMENT.md)。国内域名启用后，将它加入函数环境变量 `ALLOWED_ORIGINS`，例如 `https://postprep.example.cn`，再把 `POSTPREP_API_ENDPOINT` 指向同一国内环境的公开 `/api/text` 地址。密钥仍只保存为服务端环境变量；不得为了兼容性取消人机验证、限流或 Origin 校验。
