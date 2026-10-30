# PostPrep v3 · 前端性能记录

> 方法见 `docs/frontend-v3-direction.md` §9：Playwright + CDP，412×915 移动仿真，CPU 4× 降速，两种手势——
> `read`（慢速阅读式滚动）与 `fling`（快速甩动）。记录帧时间、长任务、Recalc Style、LCP/CLS/TBT。
> “before” = v2 首页/变声器（线上旧版），“after” = v3（main=f76b7e0 起的版本）。

## 结论（如实）

| 指标 | 旧版 | v3 | 是否达标 |
| --- | --- | --- | --- |
| 首页阅读滚动 p95 帧时间 | 516 ms，30 个长任务 | **16.7 ms，0 个长任务** | 达标 |
| 首页 CLS | — | **0.046** | 达标（< 0.05，余量小） |
| 变声器 CLS | 0.056 | **0.024** | 达标 |
| 首屏 v3 + 站点 JS（gz） | 77.1 KB | **71.8 KB** | 达标（< 80 KB） |
| 首页快速甩动 | p95 5766 ms，15 个长任务 | p50/p95 16.7 ms，但 **仍有 5 个长任务（最长 236 ms），p99 2466 ms** | **未完全达标** |
| 变声器快速甩动 | 8 个长任务 / 最长 101 ms | 3 个长任务 / 最长 841 ms | **未达标**（见下） |

- 阅读式滚动已经做到每帧 16.7 ms、零长任务、零 Recalc Style：滚动期间没有任何样式写入（无 scroll 监听，分镜用 `animation-timeline` / IntersectionObserver）。
- 快速甩动仍有长任务：推测主要来自甩动途中首次进入视口的区块做首次绘制/解码（`content-visibility: auto` 区块的首次渲染）和沙箱里共享 CPU 的噪声；尚未在真机（小米 15S Pro）上复测，不能声称已解决。
- 变声器 “after” 行的 TBT 11.7 s / DOM 1217 / JS 196 KB 来自 `rvc.js` 及角色名册（56 个新声线）整页加载，不属于 v3 外观层；v3 自身只占 `studio.js` 7.5 KB + `motion.js` 3 KB。变声器甩动中的 841 ms 长任务同样落在 rvc 初始化窗口内，需单独拆分 rvc 启动才能解决。
- 夜间这轮数据是在沙箱同时运行其他渲染任务时测得，FCP/LCP 绝对值偏大（4 s 级），只宜做新旧对比，不宜当作线上绝对值。

## 2026-10-31 最后一轮美感打磨的性能影响

- 首页“玻璃标尺扫描”：新增 1 个 DOM 节点（`.h-scan`），JS 增量约 0.3 KB（gz 远低于 3 KB 预算）；动画只动 `transform` / `opacity`，扫描期间每个打字节拍读一次光标 `offsetTop`（编辑器本身 `contain: layout paint`，读取范围被限制在设备卡内），扫描约 2 秒后彻底停止；无新增 scroll 监听。
- `prefers-reduced-motion`：标尺不渲染，文案直接显示终态；`prefers-reduced-transparency` / `gfx=lite`：标尺与播放条去掉 backdrop-filter。
- 变声器空状态的标尺刻度/播放头只在 canvas 现有的 `drawWave()` 内绘制，不增加帧循环。

## 原始数据（logs/perf-night.jsonl，perftable.py 生成）

| 版本 | 路由 | CPU | FCP ms | LCP ms | CLS | TBT ms | 长任务数 | 最长任务 ms | DOM | JS gz KB |
|---|---|---|---|---|---|---|---|---|---|---|
| before | index.html | 4× | 0 | 0 | 0 | 10502 | 10 | 3758 | 430 | 77.1 |
| after | index.html | 4× | 4093 | 4093 | 0 | 613 | 7 | 1044 | 360 | 71.8 |
| before | rvc.html | 4× | 6761 | 6761 | 0.0561 | 55 | 5 | 633 | 122 | 69.9 |
| after | rvc.html | 4× | 4472 | 4472 | 0.0243 | 11689 | 14 | 4169 | 1217 | 196.4 |

| 版本 | 路由 | CPU | 手势 | 帧数 | p50 | p95 | p99 | >16.7ms | >33ms | RecalcStyle ms (次) | Layout ms (次) | Script ms | 滚动中长任务 / 最长 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before | index.html | 4× | fling | 17 | 583.3 | 5766.4 | 5766.4 | 17 | 17 | 1407.5 (27) | 121.2 (21) | 283.2 | 15 / 1022 |
| before | index.html | 4× | read | 32 | 383.3 | 516.6 | 533.3 | 32 | 32 | 1242.5 (33) | 155.4 (33) | 451.5 | 30 / 185 |
| after | index.html | 4× | fling | 185 | 16.7 | 16.8 | 2466.5 | 9 | 7 | 302.7 (8) | 107.7 (4) | 354 | 5 / 236 |
| after | index.html | 4× | read | 669 | 16.7 | 16.7 | 16.8 | 4 | 0 | 0 (0) | 0 (0) | 726.9 | 0 / 0 |
| before | rvc.html | 4× | fling | 58 | 16.7 | 166.6 | 8949.7 | 19 | 16 | 149.5 (17) | 7.8 (4) | 327.4 | 8 / 101 |
| before | rvc.html | 4× | read | 74 | 16.7 | 50 | 1333.2 | 13 | 4 | 0 (0) | 0 (0) | 283.6 | 1 / 56 |
| after | rvc.html | 4× | fling | 119 | 16.7 | 33.4 | 2399.9 | 9 | 4 | 0.4 (1) | 0 (0) | 344.8 | 3 / 841 |
| after | rvc.html | 4× | read | 252 | 16.7 | 16.8 | 16.8 | 1 | 0 | 0 (0) | 0 (0) | 567.7 | 0 / 0 |

- after index.html 4× JS: assets/liquid-ui.js 6.2KB, assets/classic-glass.js 6.6KB, assets/v3/motion.js 3KB, assets/classic-glass/motion.js 0.5KB, assets/classic-glass/interaction-core.js 1.4KB, assets/classic-glass/characters.js 6.3KB, assets/v3/v3.js 3.5KB, assets/postprep-config.js 0.8KB, assets/postprep.js 38.8KB, assets/v3/home.js 4.8KB
- after rvc.html 4× JS: assets/liquid-ui.js 6.2KB, assets/classic-glass.js 6.6KB, assets/studio-layout.js 1.5KB, assets/classic-glass/motion.js 0.5KB, assets/classic-glass/characters.js 6.3KB, assets/classic-glass/interaction-core.js 1.4KB, assets/v3/motion.js 3KB, assets/v3/v3.js 3.5KB, assets/postprep-config.js 0.8KB, assets/postprep.js 38.8KB, assets/rvc-language.js 1KB, assets/rvc-schools.js 2.3KB, assets/rvc.js 105.5KB, assets/v3/studio.js 7.5KB, assets/rvc-chorus.js 8KB, assets/rvc-chorus-picker.js 2.6KB, assets/rvc-auto-parameters.js 1KB
