# RVC v3 翻唱音质链路（rvc-v3-quality-1）

状态：**默认关闭**（`RVC_V3=0`，与旧链路逐字节同一处理路径）。本文记录 v3 各阶段、
在 CPU 沙箱里能做的轻量 A/B 证据、它的局限，以及如何在 GPU 主机上开启试验。

## 开关

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `RVC_V3` | `0` | 总开关。`0` = 旧链路，所有 v3 helper 直接返回输入。 |
| `RVC_V3_AUTO_FETCH` | `0` | 仅在 `RVC_V3=1` 且此项为 `1` 时，启动时后台下载 v3 分离模型（ModelScope → hf-mirror → HF）。 |
| `RVC_V3_<STAGE>` | 见下表 | 单项开关，仅在 `RVC_V3=1` 时生效，可单独覆盖。 |

`RVC_V3=1` 时各单项的默认值（`rvc-service/app/v3_quality.py` 的 `DEFAULTS`）：

<!-- STAGE_TABLE -->

开启试验（GPU 主机，PowerShell，启动前）：

```powershell
$env:RVC_V3 = "1"
# 可选：自动下载 v3 分离模型（BS-RoFormer 主分离 / karaoke / dereverb）
$env:RVC_V3_AUTO_FETCH = "1"
# 可选：单独打开未经 A/B 验证的阶段，例如
$env:RVC_V3_SEPARATOR = "1"; $env:RVC_V3_KARAOKE = "1"; $env:RVC_V3_DEREVERB = "1"
.\rvc-service\start-local-stack.ps1
```

`/healthz` 的 `quality` 字段会回报当前生效的阶段和模型就绪状态；每个任务的诊断
metadata 里有 `v3` 报告（去齿音/削减帧数、响度增益、F0 修复计数）。v3 开关状态计入
`source_revision()`，因此开/关切换不会命中对方的结果缓存。

## 阶段

* **F0 修复（OCTAVE_FIX）**：在 100 Hz F0 时间线上只修三类错误——≤120 ms、两侧语境
  一致（±3 st）且偏离 12±1.5 st 的“八度孤岛”；1–2 帧尖刺；≤20 ms 且有波形周期性支撑
  的追踪掉帧。持续的真实八度跳跃、无声辅音不动。
* **去齿音（DEESS）/ 4–10 kHz 动态削减（HARSH）**：相对于**分离出的原唱人声**处理——
  只削减转换后人声比原唱多出来的那部分（齿音 +2 dB 余量、元音帧 HF/中频比 +3 dB 余量），
  上限 8 dB / 6 dB，时间平滑，频率渐变（3.5–4.5 kHz），不是全局 EQ。
* **响度匹配（LOUDNESS）**：混音后按 BS.1770 积分响度对齐上传原曲，增益限制 ±6 dB；
  用户手动调过人声/伴奏增益或静音时不做。
* **真峰值限幅（LIMITER）**：4× 过采样、5 ms 前瞻、80 ms 释放，天花板 MP3 −1.5 dBTP / WAV −1.0 dBTP；
  之后仍走旧的 `finalize_true_peak_safe`。
* 其余（SEPARATOR/KARAOKE/DEREVERB/REVERB_RETURN/RANGE_GUARD/HIRES/PHRASE_OCTAVE）需要
  分离模型或完整 RVC 推理，本沙箱无法做可信 A/B，见“局限”。

## 轻量 A/B（不跑 RVC）

工具：`tools/rvc_v3_lite_ab.py`（调用 `tools/rvc_v3_metrics.py` 的指标）。
数据：MUSDB18 片段（`v3-lab/data/wav`，真值人声 / 伴奏 / 混音）与 v3-lab 已有的
BS-RoFormer 分离人声（`v3-lab/sep/`）。

<!-- AB_RESULTS -->

## Shim 偏差

沙箱是 aarch64，无法编译 `praat-parselmouth`，`v3-lab/shim/parselmouth` 是一个
**仅沙箱用**的近似：自相关基频 + Praat 风格清浊判决，**没有 Viterbi 路径搜索**，
因此比真 Praat 更容易出现逐帧八度跳动。它只被 RVC 官方代码的 `pm` 路径使用；本次轻量
A/B 的 F0 部分不经过 shim，而是用 `rvc_v3_metrics.frame_pitch`（同类自相关追踪器）。
因此“真实追踪器”一栏的错误分布≈简单自相关追踪器，**不代表 RMVPE**；生产默认 RMVPE
的八度错误通常更少，F0 修复在生产中的实际触发率会更低。shim 不随产品发布。

## 局限（不夸大）

* 没有跑完整 RVC：后处理的“转换人声”是（a）真值人声 + 合成的元音门控 4.5–9.5 kHz 噪声与
  夸大齿音（合成伪影替身，带有循环论证风险：替身恰好加入了处理器要去掉的东西），以及
  （b）真实分离人声（真实分离伪影，但没有 RVC 电音）。真实 RVC 电音/破音的改善**未被测量**。
* A 组为“直接相加、无 v3 收尾”，未包含旧链路里的 `finalize_true_peak_safe`，所以 A 组的
  峰值/削波数字比真实旧链路更差；峰值类指标只说明 v3 限幅器自身有效，不说明比旧链路更好。
* 指标全部是信号代理（HF/中频比、平坦度、自相关八度跳变率），不是听感结论；样本只有
  3 段 × 20 s。
* 分离（主模型/karaoke/dereverb）、混响回送、音域保护、48 kHz/24-bit 输出未做 A/B。

## 复现

```bash
bash /workspace/work/v3-lab/run_lite_ab.sh   # 逐段串行，单线程
python tools/rvc_v3_metrics.py --output out.wav --reference ref.wav [--mix mix.wav --original-mix orig.wav]
```
