# PostPrep 前端 v3

v3 是叠加在现有站点之上的一层：页面结构、所有 id / `data-*` 钩子、`postprep.js` / `rvc.js` 的逻辑与网关协议都不变，只多加载 `assets/v3/`。纸面（classic）模式仍可从页头切换；首页和 404 只有 v3 外观。

设计方向见 `docs/frontend-v3-direction.md`（"内容是主角，玻璃只是手"）；性能实测见 `docs/frontend-v3-perf.md`。

## 文件

| 文件 | 作用 |
| --- | --- |
| `assets/v3/v3.js` | 入口（ES module，defer，约 3 KB gz）：导航液滴、揭示动画降级、SVG 透镜（CSS 档折射）、跨页标题变形、按页懒加载 `home.js` / `studio.js` |
| `assets/v3/motion.js` | 单一 rAF 调度器（空闲时零帧）、固定 1/240 s 子步弹簧、速度追踪、`Pill`（三段式液滴胶囊）、`Seg`（分段控件：点按 / 拖动滑块 / 键盘） |
| `assets/v3/home.js` | 首页：真实文案的实时检查编辑器（超限、极限词、重复话题、隐形字符、多余空格/空行，一键整理）、首次扫描演示、四工序分镜、录音棚预告 |
| `assets/v3/studio.js` | 变声器"录音棚监视器"：波形、频谱、A/B 分割、播放条、进度环（只读 UI） |
| `assets/v3/lens.js` | WebGL 透镜：只给录音棚播放条用，首次交互后才加载；画布 = 播放条包围盒，只采样它下方那一条波形 |
| `assets/v3/src/*.css` | 手写样式源（`$G` = v3 作用域前缀）：`00-base` 色板/字体/玻璃，`10-chrome` 页头/表单/按钮/分段，`50-home`，`60-pages`，`70-rvc`，`90-motion` |
| `assets/v3/src/80-rich.css` | 第二轮"极致版"：材质色 token、首屏环境光与铝边框物件、玻璃尺、分镜（一条文案四道工序：量→理→清→过，巨字动词 + 滚动驱动进度轨）、工具卡片（图标砖 + 微缩产品画面 + 悬停弹簧/光泽）、录音棚铝面板（螺丝、VU、旋钮、彩色 A/B、频谱） |
| `assets/v3/src/85-pages-rich.css` | 工具页：按 `data-page` 套材质色图标砖与彩色小标题、页头环境光、纸卡加厚阴影；404 大号淡色数字；`rvc.html` 监视器铝面板与彩色轨道 |
| `assets/v3/img/` | `amb-light.webp` / `amb-dark.webp`（窗光/月光，各约 5 KB）、`grain.webp`（纸纹平铺，约 18 KB）；由 `/workspace/work/v3-qa/gen-amb.py` 生成 |
| `assets/v3/v3.css` | 构建产物：`tools/v3-build.mjs` = Tailwind 颜色类的中性重映射（亮色纸面 + 深色 OLED）+ 源样式 |
| `tools/v3-inject.mjs` | 给所有根目录页面写入/刷新 `<!-- v3:head -->` 块（幂等，不碰 `community/`、`hoshino/`） |

构建：`npm run build:styles`（Tailwind 之后自动跑 `tools/v3-build.mjs`）。新增页面后跑 `node tools/v3-inject.mjs`。
`glass.js`（全屏 WebGL 背景+玻璃）与 `deck.js`（卡组）已移除：全屏画布是手机卡死的主因，卡组的 DOM 与每帧样式写入也不再需要。

## 色彩与模式

- 亮色默认（暖纸 `#f5f4f0`），`prefers-color-scheme: dark` 为纯黑 OLED；唯一强调色为系统蓝。状态色（红/黄/绿）只用于内容检查结果。
- 录音棚面板在两种模式下都是深色"机器"。

## 玻璃分级

只用在控件层（页头、首页编辑器工具栏、分段控件、播放条、浮动 dock），内容永远是不透明纸面。

- `css`（默认，所有设备）：`backdrop-filter: blur + saturate` + 0.5px 内高光边。
- CSS 透镜：Chromium + 精细指针时，`v3.js` 在空闲时为每个玻璃控件生成与其尺寸一致的位移贴图，`backdrop-filter: url(#lens)` 真实折射下方的 DOM 文字；页面滚动时（一次写入开始、一次写入结束，不是每帧）暂停。
- `webgl`：仅录音棚播放条，首次 pointerdown/keydown 后 `requestIdleCallback` 再加载；DPR ≤ 2（触屏 ≤ 1.5）；只在播放、拖动 A/B、指针在波形上时渲染，离屏/隐藏即停；软件光栅（SwiftShader/llvmpipe）自动放弃。
- `lite`：`prefers-reduced-transparency` 或省流量：不透明面板。
- 调试：`?gfx=webgl|css|lite`（本次会话记住）。

## 性能约定

- 动画只动 `transform` / `opacity`；液滴胶囊由三个只写 transform 的部件组成（无 width/left 写入）。
- 滚动叙事：`[data-reveal]` 用 `animation-timeline: view()`；不支持时 IntersectionObserver 一次性触发。分镜状态由 IntersectionObserver 写在分镜容器自身的 `data-step` 上。没有任何 scroll 监听写样式；滚动中不在 `<html>` 上切类。
- 首屏以下区块 `content-visibility: auto` + `contain-intrinsic-size: auto`；设备画面 `contain: layout paint`。
- 首屏文案直接写在 HTML 里（它就是 LCP 文本），JS 只做扫描演示；页头容器预留高度（CLS）。
- 拖动（分段滑块、A/B）：只认第一根手指、`pointercancel` 回弹、无 3D 透视；移动端 `touch-action: pan-y`。
- `prefers-reduced-motion`：弹簧直接到位、分镜改为静态、扫描演示跳过。
- 不引用任何外部 CDN；字体用系统字体栈 + 仓库内 Font Awesome。（原有的 AdSense 异步脚本保留未动。）

## 录音棚（rvc.html）

`studio.js` 只读取页面已有的音频：所选文件、录音/朗读预览、转换结果（仅 `blob:`/`data:` URL）。解码受限（≤20 MB，iOS 跳过，与原有内存策略一致），从不调用 `createMediaElementSource`，不写任何表单值、不发请求。进度环镜像 `#rvc-progress-bar` 宽度与 `#rvc-convert[aria-busy]`。

## 验证

`npm run build:styles && npm test`；截图：`/workspace/work/v3-qa/sections.mjs`、`shoot.mjs`；性能：`perf2.mjs`（见 perf 文档）。
