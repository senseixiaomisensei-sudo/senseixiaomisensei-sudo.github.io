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

| 阶段 | `RVC_V3=1` 时默认 | 依据 |
| --- | --- | --- |
| `LOUDNESS` 响度匹配 | **1** | 轻量 A/B 全部 6 例不劣化（容差 0.1 dB） |
| `LIMITER` 真峰值限幅 | **1** | 轻量 A/B 全部 6 例 ≤ −1.0 dBTP、0 削波 |
| `DEESS` / `HARSH` 去齿音 / 4–10 kHz 削减 | 0 | 轻量 A/B 有劣化（见下） |
| `OCTAVE_FIX` F0 修复 | 0 | 轻量 A/B 有劣化（见下） |
| `SEPARATOR` / `KARAOKE` / `DEREVERB` | 0 | 未做 A/B（需要分离模型，沙箱会 OOM） |
| `REVERB_RETURN` / `RANGE_GUARD` / `HIRES` | 0 | 未做 A/B（需完整 RVC 推理或仅格式变化） |
| `PHRASE_OCTAVE` | 0 | 一直是 opt-in |

注意：`RVC_V3_AUTO_FETCH=1` 只下载当前**已开启**阶段需要的模型，所以只有同时设
`RVC_V3_SEPARATOR=1`（及 `KARAOKE`/`DEREVERB`）才会下载。

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

片段：MUSDB18 的 Sing With Me（Side Effects Project）、Mallory（The Mountaineering Club）、
The Wind（Fergessen），各 6.8 s（沙箱数据只有这么长）。A = 不加 v3 收尾（直接相加），
B = v3 收尾（去齿音+HF 削减）+ 对原曲响度匹配 + −1 dBTP 限幅。“↓”越小越好。
完整 JSON：`/workspace/work/v3-audio-ab/*__lite_ab.json`；试听 mp3 在同目录（每段：
A/B 人声、A/B 混音、F0 声化 A/B）。

### 后处理 —— 合成伪影替身

| 片段 | HF 超出参考 dB ↓ A→B | 八度跳变率 ↓ A→B | 粗音高误差 ↓ A→B | 混音真峰值 dBTP A→B | 削波 A→B | 响度差 dB A→B |
|---|---|---|---|---|---|---|
| Sing With Me | 14.15→7.52 | 0.042→**0.096** | 0.0074→**0.0123** | −0.26→−2.38 | 0→0 | +1.13→+0.00 |
| Mallory | 15.04→8.68 | 0.183→**0.190** | 0.0113→0.0113 | **+0.38**→−1.00 | 1.7e-6→0 | +0.16→−0.05 |
| The Wind | 18.08→11.97 | 0.353→0.297 | 0.0342→0.0152 | −1.11→−1.56 | 0→0 | +0.26→−0.00 |

对照：干净真值人声过同样的收尾，改动 < −150 dB（即没有多余量时不处理）。

### 后处理 —— 真实分离人声（无合成伪影）

| 片段 | HF 超出参考 dB ↓ A→B | 八度跳变率 ↓ A→B | 粗音高误差 A→B | 混音真峰值 dBTP A→B | 响度差 dB A→B |
|---|---|---|---|---|---|
| Sing With Me | −1.48→**−1.28** | 0.102→0.101 | 0.0296→0.0296 | −2.48→−2.28 | −0.06→+0.00 |
| Mallory | −2.54→−2.57 | 0.141→0.141 | 0.130→0.130 | −0.10→−1.02 | +0.01→**−0.06** |
| The Wind | −3.43→**−3.42** | 0.348→0.343 | 0.112→0.112 | −2.18→−1.81 | −0.34→−0.00 |

### F0 修复

“注入”：在真值人声的追踪轮廓上注入 2 个八度孤岛 + 2 个尖刺后修复；“真实”：直接修复
分离人声的追踪轮廓，与真值人声的轮廓比较。粗误差 = 偏差 > 600 cent 的帧比例。

| 片段 | 注入：粗误差 ↓ A→B | 注入：八度跳变率 A→B | 干净轮廓被误改帧 | 真实：粗误差 ↓ A→B | 真实：八度跳变率 A→B |
|---|---|---|---|---|---|
| Sing With Me | 0.014→**0.025** | 0.090→0.075 | 5 / 442 | 0.033→**0.038** | 0.102→0.098 |
| Mallory | 0.031→**0.052** | 0.213→0.049 | 15 / 385 | 0.127→0.116 | 0.141→0.044 |
| The Wind | 0.021→**0.086** | 0.325→0.244 | 46 / 569 | 0.113→**0.154** | 0.348→0.196 |

### 判定（粗体 = 劣化）

* **LOUDNESS**：6 例中 5 例响度差缩到 ≤0.05 dB；Mallory 分离人声一例 0.01→0.06 dB，
  这是限幅器在响度匹配之后压峰造成的，差值 < 0.1 dB（低于可感知/测量意义），按 0.1 dB 容差
  判为持平 → **RVC_V3=1 时默认开**。
* **LIMITER**：B 组 6 例真峰值全部 ≤ −1.00 dBTP、削波 0；A 组有一例 +0.38 dBTP 并削波 →
  **默认开**。（A 组未包含旧链路的 `finalize_true_peak_safe`，所以这只证明限幅器有效、无害。）
* **DEESS/HARSH**：合成替身上 HF 超出降 6–6.6 dB（预期内，替身正是加了这部分），但
  自相关追踪的八度跳变率在 2/3 段变差、粗误差 1/3 段变差；真实分离人声上 HF 超出 2/3 段
  轻微变高（+0.19 / +0.002 dB）；The Wind 合成替身上咔嗒指标 0→8.8 次/分。不满足“所有片段不劣化” → **默认关**。（两项在本工具里
  一起测，无法区分是哪一项引起。）
* **OCTAVE_FIX**：八度跳变率普遍下降，但相对“真值”轮廓的粗误差在注入测试 3/3、真实
  测试 2/3 变差，且对干净轮廓有 5–46 帧误改。注意“真值”本身由同一个简单自相关追踪器
  得到，自身就有八度跳变（The Wind 真值跳变率 0.32），修复把这些“真值错误”修掉也被
  算成误差，所以这个结论对修复器偏严；但证据不足以默认开启 → **默认关**。
* **全局 `RVC_V3`**：只有两个母带级阶段通过、核心音质阶段没有证据 → **保持 0**。

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

* 片段仅 6.8 s × 3 段；自相关指标在短片段上方差大（例如咔嗒/分在对照组也有 0–635 的波动）。
* A 组未经过旧链路的 `finalize_true_peak_safe`，B 组的 LOUDNESS/LIMITER 也会再经过它；
  两者叠加后的结果没有在本沙箱单独测量。

## 下一步（GPU 主机）

用 `tools/rvc_v3_bench.py` 跑完整 RVC：同一模型、同一歌曲，分别 `RVC_V3=0` 与 `RVC_V3=1`
（再逐项打开 `RVC_V3_DEESS/HARSH/OCTAVE_FIX/SEPARATOR...`），用 `tools/rvc_v3_metrics.py`
比较真实转换人声，并加上盲听。只有在真实 RVC 输出上所有片段不劣化，才把对应
`DEFAULTS` 改为 `1`；全局 `RVC_V3` 默认值同理。

## 复现

```bash
bash /workspace/work/v3-lab/run_lite_ab.sh   # 逐段串行，单线程
python tools/rvc_v3_lite_table.py /workspace/work/v3-audio-ab   # 汇总表
python tools/rvc_v3_metrics.py --output out.wav --reference ref.wav [--mix mix.wav --original-mix orig.wav]
```
