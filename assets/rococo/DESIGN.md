# PostPrep · Rococo（法式洛可可·加强版）设计令牌

> 一句话：**一封装在信封里的工作台。** 天空是粉蓝的晨昏，纸是象牙色的，墨是海军蓝；金箔只镶在边上，蜡封只在"确认"时落下。

## 1. 作用域

- 全部样式挂在 `html[data-ui="rococo"]`（组件层用 `html[data-ui="rococo"].v3s.v3s`，压过 v3 的 `html.v3s.v3s … !important`）。
- 夜间：`html[data-ui="rococo"][data-rc-night]`（时段为 night，或系统深色模式）。
- 时段：`data-rc-sky = morning | afternoon | dusk | night`，由本地时钟决定，每 10 分钟复核；可用 `?rococo-time=night` 或 `localStorage["rococo-time"]` 强制。

## 2. 色板

| Token | 白昼 | 烛光夜（salon aux chandelles） | 用途 |
| --- | --- | --- | --- |
| `--rc-ink` | `#1b2a4a` 海军墨 | `#f1e6cc` 烛光象牙 | 正文、标题 |
| `--rc-ink-2` | `#3a4866` | `#d9cba8` | 次要文字 |
| `--rc-ink-3` | `#56617e`（纸上 ≥ 5:1） | `#b9ab8a` | 注释、标签 |
| `--rc-paper` | `#fbf8f2` | `#17213e` | 卡片、输入框 |
| `--rc-blue` / `--rc-blue-2` | `#a9c1de` / `#d8e4f1` 粉蓝 | `#3b5384` / `#24345a` | 邮票齿孔带、选中底 |
| `--rc-blush` | `#efcfd1` 腮红 | `#5a3346` | 选中、高亮、缎带 |
| `--rc-blush-ink` | `#9a4c60` | `#eab2bd` | 法文花体小字、N° |
| `--rc-gold` | `#b08d4a` 古金 | `#d6b26b` | 金线、角花、焦点环 |
| `--rc-gold-leaf` | 7 段金箔渐变 | 同 | 金箔边、主按钮（夜） |
| `--rc-enamel` | `#2c416c → #13203b` 珐琅 | 更深 | 主按钮、徽章、控制台 |
| `--rc-wax` | `#8f2c2c` 火漆红 | 同 | 蜡封 |

天空：晨 `#dbe5f2 → #f4e1dc`，午 `#c9dbef → #f5efe9`，暮 `#b9c5e0 → #f2d6cf`，夜为月光海军蓝 + 星点 + 底部烛光暖晕（不是简单反色）。纸纹 `img/paper-grain.webp`（256px 平铺，26 KB）。

v3 的 `--v3-*` 与工具材质色 `--m-*` 在本主题下全部重定向到上表，所以 v3 画出的一切自动换色。

## 3. 字体（全部本地，OFL）

| 角色 | 字体 | 说明 |
| --- | --- | --- |
| 法文花体 | Pinyon Script | 页面法文名（墨水书写动画）、问候语、品牌 |
| 正文（拉丁） | Cormorant Garamond（可变 300–700） | Didone/Garalde 气质 |
| 标题/大数字 | Playfair Display（可变 400–900） | 罗马/阿拉伯描边大数字 |
| 中文 | Noto Serif SC 500 / 700（子集：11 页 + JS 文案 + ~1900 常用字，约 3150 字） | 未收录字回退 Songti/思源宋体 |
| 小标签 | DM Mono，字距 .2em 大写 | N°、FR/CN 微标签、条码旁注 |

## 4. 形状语言

- **卡片**：磨砂象牙纸 + 石膏浮雕边（`--rc-relief`：金线 / 纸白隔线 / 金线 三层）+ 四角金色卷草 SVG。
- **输入框**：邮票齿孔边（CSS mask：中心实心矩形 ∪ 圆孔网格），粉蓝齿孔带 + 金线；焦点时齿孔带变腮红。
- **主按钮**：珐琅票根——两端半圆缺口（mask），金线三重内框；夜间换成金箔底海军字。
- **次按钮**：雕版标签（金线 + 内细线）。
- **选中态**：腮红缎带 + 金边。
- **进度条**：金箔斜纹管；滑块：黄铜轨 + 珐琅旋钮。
- **折叠区**：左侧金色书签线的缎带条。

## 5. 版式

- 每页一个巨大中文字（描边金线 + 粉蓝投影）：首页「信」、长度「量」、标签「签」、排版「排」、生成「思」、变声「声」、可信「证」、护照「照」、Skills「艺」、隐私「密」、404「迷」。
- 每页罗马大数字（I–XI，描边）、`N° 0x · PostPrep · Paris`、裁切标记「+」、条码、FR/CN 双语微标签、按时段的法文问候（Bonjour 早安 / Bon après-midi 午安 / Bonsoir 晚上好 / Bonne nuit 晚安）。
- 首页：编辑器 = 封好的信（帘纹纸、缎带、邮票、邮戳、蜡封）；四步流程 = 四张明信片（邮票格 + 邮戳 + 地址线）；工具 = 悬挂书签挂件（金线吊绳 + 金色铆眼，悬停轻摆）；录音棚演示 = 珐琅音乐盒。
- 变声页（主秀）：控制台 = 镀金珐琅留声机/八音盒柜（金箔边、角花、怀表表盘进度、蜡封 A/B 拨杆、留声机与八音盒贴纸、铭牌）；角色卡 = 浮雕卡梅奥（椭圆头像章 + 选中蜡封）；三种音源 = 三封信（选中者落蜡封）；上传区 = 航空信封边 + 邮戳；转换按钮 = 蜡封压印；训练区 = 工坊账簿（红色页边线 + 横格）；结果 = 证书（角花 + 浮雕边 + 落印）。

## 6. 动效（只动 transform / opacity）

| 效果 | 实现 | 降级 |
| --- | --- | --- |
| 贴纸视差（3 层） | 指针 / 陀螺仪 / 少量滚动 → `translate3d` | 减少动态效果时静止 |
| 贴纸轻摆 | `rotate ±2.2deg` + `translateY` 循环 | 同上；标签页隐藏时暂停 |
| 墨水书写标题 | SVG clipPath 矩形 `scaleX` 擦除 + 笔尖 `translateX` + 填充 `opacity` | 直接显示成品 |
| 金箔光泽 | 金箔环（mask exclude）内的高光 `translate3d` 跟随指针 | 触屏/减少动态时不跟随 |
| 蜡封落印 | `scale + rotate + opacity` 一次性 | 0.01s |
| 花瓣/羽毛 | 7 片，`translate3d + rotate` 下落 | 隐藏 |

## 7. 不变量（Do-not-touch）

- 不改任何 `id`、`data-*`、`name`、`for`、表单结构与请求流程；不删节点。
- 新增节点只有：`.rc-stage`（body 末尾）、`.rc-greet / .rc-ink / .rc-head`（标题前）、`.rc-foil`（卡片末尾）、`.rc-console-deco`（#v3-studio 末尾）、`.rc-letter-deco`（.h-obj 末尾）、`.rc-script-label`（工作台标题前）、临时 `.rc-seal-fx`。全部 `aria-hidden="true"` + `pointer-events:none`，在其他主题下 `display:none`。
- 不在 HTML 内联脚本；`rococo.js` 为外链文件，符合 `_headers` 的 CSP（`script-src 'self'`、`font-src 'self'`、`img-src 'self'`）。
