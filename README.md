# PostPrep

一个无需登录的双语创作者文案工具站：发布前检查长度、整理标签、清理排版，并按所选平台从一句主题、标题或标签生成可编辑文案或标签。

## 访问

<https://senseixiaomisensei-sudo.github.io/>

## 本地预览

```bash
python -m http.server 8000
# 打开 http://localhost:8000/
```

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
