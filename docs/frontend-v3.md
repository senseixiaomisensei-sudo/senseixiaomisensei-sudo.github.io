# PostPrep 前端 v3 · 液态玻璃

v3 是叠加在现有站点之上的一层：页面结构、所有 id / `data-*` 钩子、`postprep.js` / `rvc.js` 的逻辑与网关协议都不变，只多加载 `assets/v3/`。纸面（classic）模式仍可从页头切换；首页和 404 只有 v3 外观。

## 文件

| 文件 | 作用 |
| --- | --- |
| `assets/v3/v3.js` | 入口（ES module，defer）：设备分级、滚动/指针状态、玻璃面注册、揭示动画、磁吸按钮、按压涟漪、跨页转场；按页面动态加载 `home.js` / `studio.js` |
| `assets/v3/glass.js` | 液态玻璃渲染器：一块固定 WebGL 画布绘制背景（极光、音频波形带、点阵）和所有玻璃面：SDF 圆角形状平滑融合、边缘折射、RGB 色散、磨砂、随指针的高光边、接触阴影 |
| `assets/v3/motion.js` | 单一 rAF 调度器、固定 1/240 s 子步的弹簧（30/60/120 Hz 手感一致）、速度追踪 |
| `assets/v3/deck.js` | 首页工具卡组：堆叠 ⇄ 网格、拖动/甩出/洗牌、悬停扇开、键盘、后排卡 `inert` |
| `assets/v3/home.js` | 首页：可拖动液态水滴（速度挤压形变）、滚动叙事、合成频谱、数字滚动 |
| `assets/v3/studio.js` | 变声器"录音棚监视器"：波形、频谱、A/B 对比滑块、播放切换、进度环（只读 UI） |
| `assets/v3/src/*.css` | 手写样式源（`$G` = v3 作用域前缀） |
| `assets/v3/v3.css` | 构建产物：`tools/v3-build.mjs` = Tailwind 颜色类的深色玻璃重映射 + 源样式 |
| `tools/v3-inject.mjs` | 给所有根目录页面写入/刷新 `<!-- v3:head -->` 块（幂等，不碰 `community/`、`hoshino/`） |

构建：`npm run build:styles`（Tailwind 之后自动跑 `tools/v3-build.mjs`）。新增页面后跑 `node tools/v3-inject.mjs`。

## 玻璃分级

- `webgl`：真折射。`<head>` 内联脚本只做廉价判断（不建 WebGL 上下文，不阻塞首屏），`v3.js` 建上下文时再检查 GPU，软件光栅（SwiftShader/llvmpipe）自动降级。
- `css`：`backdrop-filter` 模糊 + 渐变边缘高光。
- `lite`：`prefers-reduced-transparency` 或省流量模式，不透明面板。
- 调试：`?gfx=webgl|css|lite`（本次会话记住）。

## 性能约定

- 每帧一次 draw call，无回读；玻璃面位置缓存为文档坐标，帧内不读布局。
- 页面滚动时，跟随文档滚动的玻璃面在 ~80 ms 内淡出折射，之后完全停止重绘（只剩视口固定的玻璃，如首页水滴）；停止滚动 170 ms 后恢复。滚动期间不在 `<html>` 上切换任何类（v2 的样式失效风暴）。
- 动态分辨率：按帧间隔 p80 调整画布缩放（0.38–0.8×DPR）；空闲时背景降到 30 fps；标签页隐藏即停。
- 卡组/水滴：只写 `transform`，字符串缓存去重；无 3D 透视；抓取时冻结当前绘制位置；旋转以抓取点为轴（手指下的点不漂移）；只认第一根手指；`pointercancel` 回弹。
- `prefers-reduced-motion`：弹簧直接到位、背景静止只绘一帧、滚动叙事与视图转场关闭。
- 不引用任何外部 CDN；字体用系统字体栈 + 仓库内 Font Awesome。（原有的 AdSense 异步脚本保留未动。）

## 录音棚（rvc.html）

`studio.js` 只读取页面已有的音频：所选文件、录音/朗读预览、转换结果（仅 `blob:`/`data:` URL）。解码受限（≤20 MB，iOS 跳过，与原有内存策略一致），从不调用 `createMediaElementSource`，不写任何表单值、不发请求。进度环镜像 `#rvc-progress-bar` 宽度与 `#rvc-convert[aria-busy]`。

## 验证

`npm run build:styles && npm test`；截图与帧时间脚本见交付说明。
