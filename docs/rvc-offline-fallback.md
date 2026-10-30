# 带伴奏翻唱 · 电脑离线兜底（2026-10-30）

## 结论

找不到「绝对零成本、免新注册、可长期可靠」的云端兜底；最终实现的是**浏览器端完整链路兜底**：

```
电脑端云引擎在线 → 照旧走云端（BS-RoFormer 分离 + PyTorch RVC + 回混），不变
电脑端云引擎离线 → 本机：MDX-Net 人声分离（ONNX，WebGPU 优先/WASM 兜底）
                         → 现有设备端 ONNX RVC（HuBERT + RMVPE + 角色模型）
                         → 与本机分离出的原伴奏回混（同一套人声/伴奏音量与静音控件）
```

不改 Worker、不改 rvc-service、不需要任何账号或密钥；用户（站长）无需做任何操作。

## 云端候选评估

| 方案 | 结论 | 原因 |
|---|---|---|
| GitHub Actions（公开仓库免费 runner） | **排除** | ① GitHub 附加产品条款明确禁止把 Actions 用作「serverless application」或与仓库软件的构建/测试/发布无关的用途（违规可封仓库/账号）。② 浏览器无法在不暴露写权限 token 的情况下触发 workflow；只能让访客自己登录 GitHub 开 issue = 访客需注册账号。③ 排队 + 冷启动 + CPU 跑 RoFormer（本沙箱实测 6.8 秒音频 CPU 分离 ≈ 330 秒）延迟数十分钟。 |
| Modal（已有账号，约 $1/月额度） | 排除作常驻兜底 | $1 只够几十分钟 GPU；额度用完即失效；云端 .pth 权重不在仓库需另传；本沙箱无法连 Modal gRPC 部署（之前已验证）。 |
| Colab / Kaggle / HF Spaces | 排除 | Colab 无公开 HTTP 入口且需人工交互；Kaggle 需手机验证；HF Spaces 需新账号。 |

## 浏览器端实现

* 分离模型：UVR **Kim_Vocal_2**（MDX-Net，MIT，66.8 MB fp32 ONNX，来自 UVR 官方发布 `TRvlvr/model_repo` release `all_public_uvr_models`，sha256 `ce74ef3b6a6024ce44211a07be9cf8bc6d87728cc852a68ab34eb8e58cde9c8b`）。
  切成 4 片放在 `models/base/separator/chunk_{0..3}.bin`，与现有模型同样走 pages.dev / jsDelivr 镜像 + 分片 SHA-256 校验 + IndexedDB 缓存。
* 为什么不用云端同款 BS-RoFormer（ep_368 sdr 12.96）：其 ONNX 约 600 MB（fp16 约 300 MB），每 8 秒片段在桌面 GPU 上需数秒、手机与 WASM 上不可用；作为「兜底」不现实。
* DSP：`assets/rvc-engine/song-separator.mjs` 用 JS 实现 n_fft 7680 的混合基（2/3/5）实数 FFT、STFT/iSTFT、UVR 同款分块（trim = n_fft/2）与补偿系数 1.009；不复制整首歌的填充副本，伴奏原地计算（手机内存友好）。
* 推理：`assets/rvc-engine/separator.worker.js`（module worker）使用站点已带的 onnxruntime-web 1.26（`ort126/`）。优先 WebGPU；首块会与 WASM 对比一次（Adreno 6xx 等驱动已知会在 WebGPU 上静默算错此类 U-Net），不一致自动切 WASM。
* 回混：转换后的人声重采样到 44.1 kHz，与伴奏按页面上的人声/伴奏增益与静音合成，峰值超过 -0.2 dBFS 时整体缩放（不削波），输出 16-bit 立体声 WAV。

## 路由（只改 `assets/rvc.js` 的路由与少量文案）

1. 带伴奏模式点击转换：若 `state.engineReady !== true`，先探测云端；探测结果不是「就绪」→ 本机兜底。
2. 云端请求过程中出现可兜底错误（后端不可达/超时/中继不可用）→ 本机兜底。
3. 云端在线时一切照旧（不会额外探测，也不会下载分离模型）。
4. 云端离线时状态栏显示「电脑端云引擎离线 · 带伴奏翻唱将在本机完成（较慢）」。
5. 结果信息栏标注「电脑离线兜底：本机 MDX 分离（WebGPU/WASM，xx s）+ 原伴奏回混」。
6. 开关：`localStorage.setItem('rvcOfflineSongFallback','off')` 或 `window.POSTPREP_RVC_OFFLINE_SONG = false` 可关闭；默认开启。
7. 限制：歌曲 ≤ 6 分钟；iPhone/iPad Safari 沿用现有策略不启用设备端兜底（内存上限）；需要支持 module worker + WebAssembly 的浏览器。

## 实测（本沙箱：2 核共享 CPU，多个任务同时在跑，数据偏慢）

分离质量（MUSDB 风格 6.8 秒片段，人声 SDR，dB，越高越好；同一片段、同一 SDR 公式）：

| 片段 | 本机兜底 Kim_Vocal_2 | BS-RoFormer Resurrection | BS-RoFormer HyperACE v2 |
|---|---|---|---|
| Side_Effects_Project – Sing With Me | 13.90 | 15.80 | 17.03 |
| The Mountaineering Club – Mallory | 10.74 | 11.14 | 11.09 |
| Fergessen – The Wind | 12.74 | 10.71 | 10.37 |
| 平均 | **12.46** | 12.55 | 12.83 |

* 两个 RoFormer 数字来自同一沙箱里 v3-audio 的评测（`/workspace/work/v3-lab/sep_eval.log`）；云端正在用的 ep_368（sdr 12.96）在本沙箱跑不动（640 MB 权重 + 内存不足），没有同片段实测。按公开榜单，ep_368 与 Kim_Vocal_2 的人声 SDR 差距约 1–2 dB；本组 3 个短片段差距 0.1–0.4 dB，但样本太少，且这些曲目可能出现在各模型训练集里，**只能说明「同一量级」，不能说「几乎一致」**。听感差异主要在混响尾音、和声与人声重叠的高频残留（MDX 稍多伴奏渗漏）。
* JS 移植正确性：同一片段 JS（onnxruntime-web WASM）输出 vs Python 参考实现：SNR 62 dB、最大绝对误差 2.4e-4，SDR 完全一致（12.74 dB）。
* 速度（每块 = 5.75 秒音频）：本沙箱 onnxruntime-web WASM 单线程 ≈ 51 s/块，Python onnxruntime CPU 双线程 ≈ 17 s/块；JS STFT+iSTFT ≈ 1.3 s/块。
  桌面/手机无法在沙箱里实测，以下为按公开基准（musetric 对同架构 MDX-Net 的 WebGPU 实测：桌面 NVIDIA 0.33 s/块、Adreno 750 1.9 s/块、Apple M3 1.6 s/块；本模型频带 3072 约为其 1.5 倍计算量）的**估算**：
  * 4 分钟歌曲 ≈ 42 块。桌面独显 WebGPU：分离约 0.5–1.5 分钟；旗舰手机 WebGPU：约 3–5 分钟；只有 WASM 的手机：可能 20–40 分钟（不推荐）。
  * 再加现有设备端 RVC 处理同长度人声的时间（与纯人声设备端兜底相同）。
* RVC 段：沿用现有设备端 ONNX 引擎（RMVPE 单算法），不含云端的多算法音高共识与 v3-audio 的音质链路，因此兜底音质低于云端，是「能用」而非「等同」。

## 文件

* 新增：`assets/rvc-engine/song-separator.mjs`、`assets/rvc-engine/separator.worker.js`、`models/base/separator/chunk_{0..3}.bin`、`tests/rvc-offline-song-fallback.test.mjs`、本文档
* 修改：`assets/rvc.js`（路由 + 设备端翻唱函数 + 1 条状态文案）、`assets/rvc-models.json`（`baseModels.songSeparator`）

## 后续可选

* 桌面高质量档：可再提供 BS-RoFormer fp16 ONNX（约 300 MB，仅 WebGPU 桌面），与云端同模型。
* 把 STFT 移到 WebGPU 计算着色器，可省掉每块约 1 秒的 JS 开销。
