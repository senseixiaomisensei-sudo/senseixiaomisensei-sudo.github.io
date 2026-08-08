# PostPrep 中国大陆部署说明

## 已完成的前端改造

- Tailwind CSS、Font Awesome 图标和首页图片已随网站仓库发布；访客不再请求 `cdn.tailwindcss.com`、`cdnjs.cloudflare.com` 或 Unsplash。
- AI 密钥继续只在服务器环境变量 `AGNES_API_KEY` 中保存，绝不放进浏览器代码。
- API 函数新增 `ALLOWED_ORIGINS` 环境变量，支持把已备案的正式域名加入严格的跨域白名单。

## 正式可访问的目标结构

```text
中国大陆用户
  -> 已备案自有域名
  -> 国内静态托管 / 国内 CDN（网站页面与本地静态资源）
  -> 国内 Serverless API / API 网关（/api/text，保存 AGNES_API_KEY）
  -> Agnes 文本接口
```

不能把 `github.io` 或 `pages.dev` 当作中国大陆正式入口：它们没有提供本项目所需的中国大陆 Pages 托管保证。Cloudflare 官方说明其 China Network 需要 Enterprise 订阅与每个顶级域名的有效 ICP 备案，且 Pages 本身不在中国大陆网络中。

## 上线前需要的项目资料

1. 一个你能控制、已完成 ICP 备案的自有域名（不是 `github.io` 子域名）。
2. 腾讯云或阿里云的中国大陆账号与对应项目权限。
3. 选择国内函数运行环境，并将 `AGNES_API_KEY` 作为服务端密钥写入；不要提交到 Git，也不要写入 `assets/`。
4. 国内 API 的正式 URL，例如 `https://api.example.cn/api/text`；将它填入 `assets/postprep-config.js` 的 `POSTPREP_API_ENDPOINT`。
5. 把页面正式域名写入 API 的 `ALLOWED_ORIGINS`，例如 `https://postprep.example.cn`。多个域名用英文逗号分隔。

## 推荐执行顺序

1. 在所选国内云完成 ICP 备案和域名接入备案。
2. 把本仓库的静态文件部署到国内静态托管或对象存储 + CDN，并绑定该域名。
3. 把 `functions/api/text.js` 迁移为所选国内 Serverless 平台的 HTTP 函数；保留现有输入限制、超时、结构化错误和 CORS 白名单。
4. 在国内函数的环境变量中配置 `AGNES_API_KEY` 和 `ALLOWED_ORIGINS`。
5. 修改 `assets/postprep-config.js` 指向国内 API，发布后从中国大陆网络实测首页、所有工具页和一次 AI 请求。

## 需要注意

- 国内页面与 API 可消除 GitHub Pages、Cloudflare Pages 及海外静态 CDN 的访问风险；但 Agnes 上游文本接口仍是独立的跨境依赖，需在最终国内环境中实测可用性。
- 若不使用中国大陆服务器，通常不需要 ICP 备案，但无法承诺中国大陆网络的稳定性。
- Cloudflare China Network 是另一条路线，但官方要求 Enterprise 订阅、有效 ICP 备案及内容审核，通常不适合这个小型工具站的首选部署方式。
