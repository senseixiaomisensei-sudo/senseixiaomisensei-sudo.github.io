# 连续推理候选版：验证与回滚

本文是上一轮候选的历史记录。后续 R41 修正、发布范围与未通过项见 [R41 记录](rvc-serina-distortion-r41.md)。

本轮候选针对已测得的 F0 错误、独立分片的相位相消，以及设备端 ONNX 激励计算误差。当前不能判为音质验收通过，也没有切换生产资源。UI、角色 ID、收藏映射及原模型文件保持原有结构。

## 云端开关

`RVC_TIMELINE_INFERENCE=1` 在隔离测试进程中开启共享时间轴。默认是 `0`。`RVC_TIMELINE_CONSENSUS=0` 可旁路保守的 F0 共识处理，进行同输入、模型、参数、种子的单变量对照。非 F0 模型沿用原路径。

共享时间轴包含 F0、HuBERT 特征、检索后的编码先验、随机激励及正弦相位。每个合成窗口保留真实上下文，按绝对帧裁剪，再用互补线性权重拼接。模型、索引或 profile 在任务中途变化会拒绝继续混用。没有混回原唱、八度折回、末端磨平高频或删掉困难片段。

`healthz`/网关 status 暴露 `timelineInference` 和 `pitchConsensus`；部署证据还必须包含实际进程的 `backendBuildSha`、`pipelineRevision`、资源 hash 和参数。仓库提交不等于生产进程加载。

## 设备端候选

`tools/prepare-rvc-excitation-assets.py <private-output-directory>` 保留原 ONNX，生成带实际内容 hash 的候选清单。它修正最终 LeakyReLU 斜率，并把 NSF 激励作为显式输入交给原学习解码器。Worker 只在模型声明 `source_excitation` 时使用新路径。生产角色目录没有自动改写。

`tests/test-rvc-inference.mjs` 可通过 `POSTPREP_RVC_CANDIDATE_MANIFEST` 在本地测试服务器覆盖候选资源，运行真实浏览器推理。此测试不能替代听评；用已分离人声测试时也不能声称验证了设备端分离与回混。

整段测试发现固定总超时会中断仍在推进的 WASM 推理。现在新 stage/chunk 进度可续期，重复事件不能续期，停滞超时、总上限、错误和取消都会清理 Worker。

## 可复现检查

- `tools/verify-rvc-v1-reference.py`：真实特征、F0、随机源下与固定版本原生解码器比较。
- `tools/verify-rvc-device-export.py`：真实 A 片段，比较原生、导出器、实际 ONNX 及实际 Worker 激励函数。
- `tools/rvc_offline_song_ablation.py --timeline ...`：完整歌曲，保存逐阶段证据、浮点中间结果及编码后峰值。
- `tools/rvc_cached_timeline_ablation.py ... --factor ...`：校验输入、模型、索引和缓存 hash 后进行真实合成。`--window-index` 是窗口消融，不能作为完整歌曲证据；`--device cpu` 的对照必须使用相同精度。
- `tools/rvc_timeline_role_regression.py ...`：当前角色目录的真实困难片段、长度、有限性及重复运行检查，明确不产生听感评分。
- `tools/verify-rvc-timeline-audio.py ...`：音高窗口、分片边界及统一声道、固定增益的等响度对照。

私有用户音频和诊断存放于网站仓库外。本轮证据目录为 `E:\大肥鱼\全角色音质验收\20260927\11-音高与拼接修复`，包含完整 A/C、独立人声、消融、原始失败结果、hash 和逐角色矩阵，不随网页发布。

## 发布门槛

已确认 A 原边界约 29.54 秒发生相消；共享条件后的实测重叠波形一致。若干 A 后半段 F0 错误有源波形和多算法证据，修正后原始合成音高接近源音高。这些均不是“金属感已彻底消失”的证明。

星野 C 约 57.56–57.61 秒仍未通过：源音高约 1.2 kHz，RMVPE 条件约 410 Hz。完整 Praat 消融未解决成品问题，不能直接改为默认。A 约 46.78–46.95 秒证据存在分歧；复杂发声处不可自动用平滑或插值改写。其他角色目前只有困难片段的信号/稳定性证据，完整歌曲、自然表达和身份听评不能标记通过。

进入生产前必须完成独立人声、等响度混音、整句和完整歌曲的 P0-A/B/C 验收；严重失败仍存在时不升级 active revision。模型能力不足时保留失败证据，比较同角色合格模型或训练/适配方案，不继续叠加通用 DSP。

回滚云端试验时关闭时间轴开关并重新加载明确版本；设备端恢复原资源清单和 hash。原资源未删除，候选未覆盖原文件。对外发布前另核对前端、网关、GPU 进程三个实际版本。
