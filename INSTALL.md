# PostPrep · 洛可可主题包（French Rococo, amplified）安装说明

这是一个**原生插入**的第三套皮肤：`<html data-ui="rococo">`。它和现有的「液态玻璃 / 纸面」并列，**不是默认主题**，不改任何业务逻辑、元素 id、`data-*` 钩子、表单字段或请求流程。GitHub Pages 直接托管，无需构建。

## 包内文件

```
INSTALL.md                         ← 本文件
assets/rococo/rococo.css           ← 全部样式（均限定在 html[data-ui="rococo"] 下）
assets/rococo/rococo.js            ← 切换器接入 + 纯装饰层（aria-hidden、pointer-events:none）
assets/rococo/DESIGN.md            ← 设计令牌：色板 / 字体 / 形状 / 动效 / 不变量
assets/rococo/img/*.webp           ← 32 张铜版画风格模切贴纸（透明底）+ 纸纹
assets/rococo/img/*.svg            ← 手写金色卷草角花、花饰分隔线、条码、邮戳、蜡封、花瓣、羽毛
assets/rococo/fonts/*.woff2        ← Pinyon Script、Cormorant Garamond、Playfair Display、DM Mono、Noto Serif SC 子集
assets/rococo/fonts/LICENSE-OFL.txt← 字体授权（SIL OFL 1.1）
tools/rococo-inject.mjs            ← 给 11 个页面写入 / 移除 <head> 引用（幂等）
tests/rococo-theme.test.mjs        ← 4 条守护测试（注入一次、样式作用域、资源本地、不碰钩子）
```

## 安装（3 步）

1. 把压缩包解压到仓库根目录（与 `index.html` 同级），让 `assets/rococo/`、`tools/rococo-inject.mjs`、`tests/rococo-theme.test.mjs` 落到对应位置。不会覆盖任何现有文件。
2. 写入页面引用：

   ```bash
   node tools/rococo-inject.mjs
   ```

   它只修改 11 个顶层页面（index、caption-formatter、hashtag-cleaner、idea-generator、length-checker、publish-trust、skills、skill-passport、rvc、privacy、404），在 `</head>` 前写入：

   ```html
   <!-- rococo:head -->
   <link rel="stylesheet" href="assets/rococo/rococo.css?v=20261102-rococo1">
   <script src="assets/rococo/rococo.js?v=20261102-rococo1"></script>
   <!-- /rococo:head -->
   ```

   `404.html` 用 `/assets/...` 绝对路径。`hoshino/`、`community/` 不会被触碰。重复执行只会刷新，不会重复插入；`node tools/rococo-inject.mjs --check` 可检查是否齐全。
3. 跑测试，确认什么都没坏：

   ```bash
   npm test
   ```

   然后照常提交、推送。

> 以后如果再运行 `node tools/v3-inject.mjs`，请**紧接着再运行一次** `node tools/rococo-inject.mjs`，让洛可可块回到 `<head>` 末尾（它需要排在 v3 之后）。

## 使用

- 页头右上角的图层按钮（`.style-toggle`）现在按 **液态玻璃 → 纸面 → 洛可可 → 液态玻璃** 循环，沿用同一个 `localStorage` 键 `postprep-ui-style`，刷新、跨标签页都会保持。
- 天空随本地时间变化：晨（Bonjour）/ 午（Bon après-midi）/ 暮（Bonsoir）/ 夜（Bonne nuit，「烛光沙龙」月光海军蓝 + 古金）。系统深色模式下也使用夜间方案。
- 调试时可强制时段：在网址后加 `?rococo-time=night`（或 `morning` / `afternoon` / `dusk`），也可设置 `localStorage["rococo-time"]`。
- 想让洛可可成为某位访客的默认：只需 `localStorage.setItem("postprep-ui-style","rococo")`。若要全站默认，请在 `liquid-ui.js` 里把默认值改为 `rococo`（本包刻意没有改这个文件）。

## 卸载

```bash
node tools/rococo-inject.mjs --remove
rm -r assets/rococo tools/rococo-inject.mjs tests/rococo-theme.test.mjs
```

## 兼容性与约束

- **CSP**：无需修改 `_headers` 或页面内的 CSP。所有资源同源（`'self'`），没有内联脚本、没有外部 CDN、没有 `eval`。
- **作用域**：所有规则都以 `html[data-ui="rococo"]` 开头（组件层使用 `html[data-ui="rococo"].v3s.v3s` 压过 v3 的 `!important`）；玻璃 / 纸面主题像素级不变（已截图比对）。
- **动效**：只动 `transform` / `opacity`；`prefers-reduced-motion: reduce` 时贴纸静止、花瓣隐藏、墨水标题直接显示成品；标签页隐藏时暂停循环动画。
- **装饰节点**：全部 `aria-hidden="true"`、`pointer-events: none`，在其他主题下 `display: none`，不会挡住任何控件。
- **缓存**：修改主题后，把 `tools/rococo-inject.mjs` 里的 `VER` 改一下再运行，即可刷新浏览器缓存。
- **体积**：约 2.3 MB（中文字体子集 2×约 0.65 MB，贴纸约 0.6 MB）。字体与贴纸只有在切到洛可可时才会下载；其他主题只多加载一份约 90 KB 的 CSS 和 22 KB 的 JS。

## 已知限制

- 中文字体子集包含 11 个页面与脚本里的全部文案，加约 1900 个常用字；用户输入里出现的生僻字会回退到系统宋体（Songti / 思源宋体）。
- 波形与频谱是 v3 的 canvas 直接绘制的白色线条，本主题用 CSS 滤镜把它们染成金色调，没有改绘制代码。
- 陀螺仪视差只在浏览器无需授权即可提供 `deviceorientation` 时启用（iOS 13+ 需要授权，本包不会弹窗申请）。
- 首页 / 变声页的部分法文 / 中文微标签（如「N° IV · La boîte à musique · 声之匣」）是装饰性的固定文案，切到英文时不翻译。
