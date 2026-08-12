# PostPrep 中国大陆部署说明

## 已完成的前端改造

- Tailwind CSS、Font Awesome 图标和首页图片已随网站仓库发布；访客不再请求 `cdn.tailwindcss.com`、`cdnjs.cloudflare.com` 或 Unsplash。
- AI 密钥继续只在服务器环境变量 `AGNES_API_KEY` 中保存，绝不放进浏览器代码。
- AI 网关要求带 Origin 的请求、服务端人机验证和限流；`ALLOWED_ORIGINS` 支持把已备案的正式域名加入跨域白名单。
- 当前公开构建不加载广告、统计或任意第三方广告脚本。

## 正式可访问的目标结构

```text
中国大陆用户
  -> 已备案自有域名
  -> 国内静态托管 / 国内 CDN（网站页面与本地静态资源）
  -> 国内 API 网关（限流、Origin 校验）
  -> 国内 Serverless API（/api/text，保存 AGNES_API_KEY）
  -> Agnes 文本接口
```

不能把 `github.io` 或 `pages.dev` 当作中国大陆正式入口：它们没有提供本项目所需的中国大陆 Pages 托管保证。Cloudflare 官方说明其 China Network 需要 Enterprise 订阅与每个顶级域名的有效 ICP 备案，且 Pages 本身不在中国大陆网络中。

## 上线前需要的项目资料

1. 一个你能控制、已完成 ICP 备案的自有域名（不是 `github.io` 子域名）。
2. 腾讯云或阿里云的中国大陆账号与对应项目权限。
3. 选择国内函数运行环境，并将 `AGNES_API_KEY` 和人机验证服务的 Secret Key 作为服务端密钥写入；不要提交到 Git，也不要写入 `assets/`。
4. 国内 API 的正式 URL，例如 `https://api.example.cn/api/text`；将它填入 `assets/postprep-config.js` 的 `POSTPREP_API_ENDPOINT`。
5. 把页面正式域名写入 API 的 `ALLOWED_ORIGINS`，例如 `https://postprep.example.cn`。多个域名用英文逗号分隔。

## 推荐执行顺序

1. 在所选国内云完成 ICP 备案和域名接入备案。
2. 把本仓库的静态文件部署到国内静态托管或对象存储 + CDN，并绑定该域名。
3. 把 `worker/api-gateway.js` 迁移为所选国内 API 网关或边缘函数，把 `functions/api/text.js` 迁移为所选国内 Serverless 平台的 HTTP 函数；保留现有限流、输入限制、超时、结构化错误、Origin 校验和服务端人机验证。
4. 在国内网关与函数之间配置一段仅服务端可见的共享密钥，并在国内函数的环境变量中配置 `AGNES_API_KEY`、人机验证 Secret Key 和 `ALLOWED_ORIGINS`。
5. 选择在中国大陆可稳定访问、支持**服务端验证**的人机验证服务；不要只在浏览器端放一个验证码组件，也不要为了兼容性跳过验证。
6. 修改 `assets/postprep-config.js` 指向国内 API，并将该验证服务的公开 Site Key 写入 `POSTPREP_TURNSTILE_SITE_KEY` 或替换为等价的前端配置。同步把国内 API 域名加入各 HTML 页面和 `_headers` 的 CSP `connect-src` 白名单。
7. 发布后从中国大陆网络实测首页、所有工具页、一次 AI 请求和限流/验证失败时的提示。

## 需要注意

- 国内页面与 API 可消除 GitHub Pages、Cloudflare Pages 及海外静态 CDN 的访问风险；但 Agnes 上游文本接口仍是独立的跨境依赖，需在最终国内环境中实测可用性。
- 当前 Function 直接使用 Cloudflare Turnstile Siteverify。若该服务在目标中国大陆网络不可用，必须在迁移时替换为可用的、服务端验证的同等方案；不能仅删除验证逻辑。
- 若不使用中国大陆服务器，通常不需要 ICP 备案，但无法承诺中国大陆网络的稳定性。
- Cloudflare China Network 是另一条路线，但官方要求 Enterprise 订阅、有效 ICP 备案及内容审核，通常不适合这个小型工具站的首选部署方式。
