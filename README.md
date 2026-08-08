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

页面使用的 Tailwind、Font Awesome 和首页图片均已放入仓库，不再让访客浏览器加载海外 CDN。

## 部署结构

GitHub Pages 负责公开静态页面；`functions/api/text.js` 是独立的 Cloudflare Pages Function 代理。代理只从运行环境的 `AGNES_API_KEY` 密钥读取 Agnes 凭据，前端永远不会保存或发送密钥。

完成 Cloudflare 登录后，可按下面的顺序创建/发布代理：

```bash
npx wrangler login
npx wrangler pages project create postprep --production-branch main
npx wrangler pages secret put AGNES_API_KEY --project-name postprep
npx wrangler pages deploy . --project-name postprep --branch main
```

部署完成后，把 Cloudflare Pages 地址填入 `assets/postprep-config.js` 的 `POSTPREP_API_ENDPOINT`（只填公开的 `/api/text` 地址，不填密钥），再推送 GitHub Pages 前端。`functions/api/text.js` 已限制请求来源为本站域名，并统一返回结构化错误；所有 AI 输出默认使用中文，界面切到 English 后才会返回英文。

## 中国大陆正式上线

当前 GitHub Pages 与 Cloudflare Pages 仅保留为全球访问入口，不能承诺中国大陆稳定可用。面向中国大陆正式上线请使用自己的已备案域名和中国大陆云服务；详细迁移步骤见 [中国大陆部署说明](docs/CHINA_MAINLAND_DEPLOYMENT.md)。国内域名启用后，将它加入函数环境变量 `ALLOWED_ORIGINS`，例如 `https://postprep.example.cn`，再把 `POSTPREP_API_ENDPOINT` 指向同一国内环境的公开 `/api/text` 地址。密钥仍只保存为服务端环境变量 `AGNES_API_KEY`。
