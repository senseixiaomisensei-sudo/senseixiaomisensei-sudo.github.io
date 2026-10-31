# RVC v3 翻唱音质链路（rvc-v3-quality-2）

状态：**默认开启**（`RVC_V3` 未设置 = `1`），默认阶段为 `OCTAVE_FIX`（r2）+ `HARSH`（r2）+
`LOUDNESS` + `LIMITER`。`RVC_V3=0`（或 `false`/`off`/`no`）恢复与旧链路完全相同的处理路径。

本文记录：端到端 A/B 的方法（真实 RVC 转换，CPU ONNX）、结果表、每个开关的决定和理由、
以及局限。上一版（rvc-v3-quality-1）的“轻量 A/B”（不跑 RVC，用合成伪影替身）结论已被本版
取代，旧数据仍在 `/workspace/work/v3-audio-ab/`，不再作为默认值依据。

## 开关

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `RVC_V3` | `1`（未设置即开） | 总开关。`0` = 旧链路，所有 v3 helper 直接返回输入。 |
| `RVC_V3_AUTO_FETCH` | `0` | 仅在总开关开且此项为 `1` 时，启动时后台下载**已开启阶段**所需的分离模型。默认阶段不需要任何新模型。 |
| `RVC_V3_<STAGE>` | 见下表 | 单项开关，仅在总开关开时生效，可单独覆盖（如 `RVC_V3_HARSH=0`）。 |

| 阶段 | 默认 | 依据（端到端 A/B，12 个对比 = 6 用例 × {自动移调, +12 st}） |
| --- | --- | --- |
| `LOUDNESS` 响度匹配 | **1** | 12/12 不劣化；与原曲响度差 0.37–3.90 LU（+12 st 时）/ 0.01–1.87 LU → ≤ 0.002 LU |
| `LIMITER` 真峰值限幅 | **1** | 12/12 真峰值不高于旧链路的 −1 dBTP 统一衰减，0 削波 |
| `HARSH` 4–10 kHz 动态削减（r2） | **1** | 决策指标 12/12 不劣化、12/12 改善：HF 超出 −2.3 ~ −3.4 dB |
| `OCTAVE_FIX` F0 修复（r2） | **1（保护性）** | 12/12 不劣化，但在真实输入上几乎不触发（见下）；注入八度孤岛可修回 |
| `DEESS` 去齿音（r2） | 0 | 决策指标 0/12 劣化但效果很小（HF 超出最多 −0.6 dB）；与 HARSH 合用时 Mallory 干声 F0 RMSE +2.1 ¢，超过 2 ¢ 容差 |
| `RANGE_GUARD` / `DEREVERB` | 0 | 未做 A/B，按要求不开 |
| `SEPARATOR` / `KARAOKE` / `REVERB_RETURN` / `HIRES` / `PHRASE_OCTAVE` | 0 | 未做 A/B（需分离模型 / 仅格式变化 / 一直是 opt-in） |

浏览器端（`assets/rvc-engine/v3-master.mjs` + Worker）只做母带两步：BS.1770 响度匹配到原曲 +
4× 过采样真峰值限幅，`mixDeviceSongCover` 传入 `sourceVocals`。默认开，可用
`localStorage["postprep.v3Master"]="0"` 或 `?v3master=0` 关闭。浏览器端没有 HARSH / OCTAVE_FIX。

`/healthz` 的 `quality` 字段回报生效阶段；每个任务的诊断 metadata 里有 `v3` 报告（HARSH 块数、
响度增益、F0 修复计数）。v3 开关状态计入 `source_revision()`，改默认值后旧缓存不会被误用。

## 阶段（r2）

* **OCTAVE_FIX r2**：只折叠 RMVPE 自己“不确定”的短八度孤岛——孤岛帧的最大 salience 明显低于
  两侧语境，且离开、返回同一音区；持续的真实八度跳跃、装饰音、无声辅音不动。服务端
  `analysis_timeline.py` 现在把 RMVPE salience 传给 `repair_pitch(confidence=…)`。
  r1（只看几何形状）在端到端上劣化（The Wind 干声 F0 RMSE 136.5→216.8 ¢），保留为
  `_repair_pitch_r1` 仅作对照。
* **HARSH r2**：零相位（`sosfiltfilt`）4–10 kHz 分频带，只在元音块（300–3000 Hz 占主导）上、
  且该带相对中频的比值比**原唱人声**多出 4 dB 以上时下调；10 ms 前瞻、10/120 ms 起落、上限 4 dB。
  输出 = `x + band·(g−1)`，增益为 1 的块逐样本不变，低频（F0 和低次谐波）不动，没有 STFT 拖尾。
* **DEESS r2**：零相位 5–11 kHz 带，只在齿音块上、齿音相对 ±150 ms 语境比原唱多 2 dB 以上时
  下调，上限 6 dB。11 kHz 以上的“空气”频段不处理——这也是它整体效果小的原因之一。
* **LOUDNESS / LIMITER**：混音后按 BS.1770 积分响度对齐上传原曲（±6 dB，用户手动调过增益/静音
  时不做），再 4× 过采样前瞻限幅（MP3 −1.5 dBTP / WAV −1.0 dBTP），之后仍走旧的
  `finalize_true_peak_safe`。

## 端到端 A/B 方法

* **RVC**：`tools/rvc_onnx_cpu.py` 用浏览器引擎自己的 ONNX 图（HuBERT + RMVPE + RVC v2 角色
  `arona`，noise scale 0.35，`OMP_NUM_THREADS=1`）在 CPU 上做真实转换，同一种子与分窗。
* **用例（6）**：MUSDB18 的 The Wind（Fergessen）、Sing With Me（Side Effects Project）、
  Mallory（The Mountaineering Club），各 6.8 s；每首两种输入——`clean` = 真值人声干声，
  `sep` = BS-RoFormer 分离人声（服务实际喂给 RVC 的东西）。每例再做两种移调：自动移调
  （`raw`）与 +12 st 压力测试（`hi_raw`），所以每个后处理/母带阶段有 12 个对比。
* **F0 参考**：RMVPE（干净真值人声）× 2^(shift/12)；被测 = RMVPE（转换后人声）。
* **分支**：F0 分支各自单独跑一次 RVC（raw / fix2 / fix1 / inj / injfix2 / hi_raw / hi_fix2；
  inj = 在干净轮廓上注入 2 个 +12 st 低 salience 孤岛，作为正对照）。后处理分支作用于 raw
  转换结果（none / deess2 / harsh2 / finish2 = deess+harsh / finish1 = r1 STFT 版）。母带分支：
  legacy = 相加 + 统一衰减到 −1 dBTP；v3 = 响度匹配 + 限幅 + 同样的衰减。
  **默认链路（combo）**：fix2 转换 → HARSH r2 → 相加 → 响度匹配 + 限幅 → 衰减，对比 legacy 链路
  （raw 转换、无收尾、legacy 母带）。
* **决策指标**（判定开关用）：F0 RMSE（¢，容差 2）、粗误差 >600 ¢、八度错误率、RMVPE 八度跳变率、
  破音率（breakup）、清音召回、HF 超出（dB，容差 0.1）、HF p90、与原曲响度差、真峰值、削波。
  “通过” = 无任何用例超出容差变差，且至少一例超出容差变好。
* **仅参考指标**：自相关（AC）八度跳变率和 HF 瞬态“咔嗒”计数。两者在 RVC 输出上失效（AC
  追踪器锁到声码器谐波；咔嗒计数在原始 RVC 输出上本身就是每分钟数百次的声码器噪声），表中
  照列，但不参与默认值判定，`table.md` 中每个阶段都同时给出“含这两项”的判定以便核对。

## 结果

完整表格：`/workspace/work/v3-lab/e2e/ab/table.md`（原始 JSON `ab/results.json`）。

### 默认链路端到端（RVC_V3=1 默认 vs 旧链路）

决策指标 **12/12 不劣化、12/12 改善**（含 AC/咔嗒时有 2 例“变差”：Sing With Me 分离 +12 st 的 AC
八度跳变 0.011→0.021〔同例 RMVPE 八度跳变 0→0〕；Mallory 分离 +12 st 咔嗒 582→617/分）。

| 用例 | 移调 | 链路 | 响度差 LU | 真峰值 dBTP | F0 RMSE ¢ | 破音率 | HF 超出 dB |
|---|---|---|---|---|---|---|---|
| The Wind 干声 | 自动 | 旧 → v3 | 0.46 → 0.00 | −1.02 → −1.44 | 136.5 → 135.0 | 0.042 → 0.024 | 6.65 → 4.14 |
| The Wind 干声 | +12 | 旧 → v3 | 1.59 → 0.00 | −1.02 → −2.72 | 225.5 → 225.8 | 0.049 → 0.049 | 6.31 → 3.22 |
| The Wind 分离 | 自动 | 旧 → v3 | 0.43 → 0.00 | −1.02 → −1.44 | 461.9 → 461.9 | 0.010 → 0.010 | 13.04 → 10.22 |
| The Wind 分离 | +12 | 旧 → v3 | 1.84 → 0.00 | −1.02 → −2.74 | 423.0 → 422.3 | 0.055 → 0.055 | 14.59 → 11.15 |
| Sing With Me 干声 | 自动 | 旧 → v3 | 1.87 → 0.00 | −1.02 → −2.82 | 77.7 → 77.7 | 0 → 0 | 6.15 → 3.88 |
| Sing With Me 干声 | +12 | 旧 → v3 | 3.90 → 0.00 | −1.02 → −4.85 | 68.9 → 68.9 | 0.016 → 0.012 | 5.61 → 3.11 |
| Sing With Me 分离 | 自动 | 旧 → v3 | 1.23 → 0.00 | −1.02 → −2.45 | 99.2 → 99.1 | 0.004 → 0.004 | 8.47 → 5.78 |
| Sing With Me 分离 | +12 | 旧 → v3 | 2.30 → 0.00 | −1.02 → −3.41 | 124.1 → 124.0 | 0.004 → 0.004 | 7.82 → 4.80 |
| Mallory 干声 | 自动 | 旧 → v3 | 0.04 → 0.00 | −1.02 → −1.07 | 27.4 → 29.1 | 0 → 0 | 5.88 → 3.22 |
| Mallory 干声 | +12 | 旧 → v3 | 0.58 → 0.00 | −1.02 → −1.54 | 16.9 → 17.0 | 0.008 → 0.008 | 3.10 → 0.75 |
| Mallory 分离 | 自动 | 旧 → v3 | 0.01 → 0.00 | −1.02 → −1.01 | 40.7 → 42.3 | 0.035 → 0.032 | 7.16 → 4.51 |
| Mallory 分离 | +12 | 旧 → v3 | 0.37 → 0.00 | −1.02 → −1.39 | 27.4 → 27.4 | 0.045 → 0.045 | 5.74 → 2.66 |

削波：两条链路全部 0。需要如实说明的两处“接近容差”：Mallory 两例 F0 RMSE +1.6/+1.7 ¢
（在 2 ¢ 容差内，远低于约 5 ¢ 的音高可感阈；来自 HARSH，转换本身 fix2 = raw）；Mallory 分离
自动移调真峰值 −1.017→−1.01 dBTP（+0.007 dB，容差 0.05，两者都在 −1 dBTP 统一衰减线上）。

### 各阶段判定（决策指标）

| 阶段 | 对比数 | 变差 | 改善 | 判定 | 要点 |
|---|---|---|---|---|---|
| OCTAVE_FIX r2（fix2） | 6 | 0 | 0 | 无影响 | 只有 The Wind 干声改了 2 帧（F0 RMSE 136.5→134.8，< 容差），其余 0 帧 |
| OCTAVE_FIX r2，+12 st | 6 | 0 | 0 | 无影响 | 同上 |
| 正对照 inj→injfix2 | 3 | 1* | 2 | — | The Wind 干声 176.0→134.8 ¢，Mallory 干声 228.9→27.4 ¢，均**完全回到未注入值**；*唯一“变差”是 The Wind 破音率 0.036→0.042，即回到未注入的 0.042 |
| OCTAVE_FIX r1（fix1） | 6 | 2 | 1 | 失败 | The Wind 干声 F0 RMSE 136.5→216.8、粗误差 0.010→0.030 |
| HARSH r2 | 12 | 0 | 12 | **通过** | HF 超出 −2.3 ~ −3.4 dB；The Wind 干声破音率 0.042→0.024 |
| DEESS r2 | 12 | 0 | 6 | 通过但效果小 | HF 超出最多 −0.63 dB（Sing With Me），The Wind 上几乎为 0 |
| finish2（DEESS+HARSH r2） | 12 | 1 | 12 | 失败 | Mallory 干声 F0 RMSE 27.4→29.4（+2.06 ¢ > 2 ¢） |
| finish1（r1 STFT） | 12 | 0 | 12 | 通过（不采用） | HF 降得更多，但含 AC 指标时 Sing With Me 分离八度跳变翻倍 0.038→0.077，且 r1 有 STFT 拖尾；r2 已取代 |
| 母带 LOUDNESS+LIMITER | 12 | 0 | 10 | **通过** | 另 2 例（Mallory 自动移调）原本就已对齐，持平 |
| 默认链路（combo） | 12 | 0 | 12 | **通过** | 见上表 |

## 开关决定与理由

* **HARSH = 1**：满足“6 用例全部不劣化且显著改善”。在决策指标上 12/12 不劣化、HF 超出每例降
  2.3–3.4 dB（不是边缘值）。含 AC/咔嗒的参考判定里有 2 例“变差”（The Wind 分离 +12 st 咔嗒
  35→53/分，Sing With Me 分离 +12 st AC 八度跳变 0.011→0.021），都是已知在 RVC 输出上失效的指标，
  同例的 RMVPE 八度跳变均为 0→0。
* **OCTAVE_FIX = 1（保护性）**：12/12 不劣化，所以开着无代价；但必须说清楚——在 6 个真实用例上它
  几乎不做事（12 个对比里只有 1 例改了 2 帧），**没有证据表明它改善了真实输入**。开启的理由是：
  当 RMVPE 在低 salience 处出现短八度孤岛时（正对照注入的情形），它能把结果完整修回（228.9→27.4 ¢），
  而在没有这种错误时它不动。分离人声上约 460 ¢ 的 F0 误差（The Wind）不是短孤岛，r2 修不了。
* **DEESS = 0**：单独不劣化但改善很小，没有足够证据；与 HARSH 组合时 Mallory 干声 F0 RMSE 越过容差。
* **RANGE_GUARD / DEREVERB = 0**：未做 A/B。
* **LOUDNESS / LIMITER = 1**：保留（12/12 不劣化）。
* **全局 RVC_V3 = 1**：默认组合在 6 个端到端用例（含 +12 st 共 12 个对比）上，响度、真峰值、
  F0 RMSE、HF、破音率全部不劣化（F0 RMSE 最大 +1.7 ¢ 在容差内），所以把未设置时的默认改为开。
  `RVC_V3=0` 仍是一键回到旧链路。

## 局限（不夸大）

* **没有在 GPU 云端 RVC 上 A/B。** 端到端用的是浏览器引擎的 ONNX 图在 CPU 上跑一个角色（arona v2）；
  云端服务用的是 PyTorch 官方管线与用户自己的模型，伪影分布可能不同。上线后应在 GPU 主机用
  `tools/rvc_v3_bench.py` 以 `RVC_V3=0/1` 各跑一次复核，并加盲听。
* 链路顺序与生产不完全一致：A/B 中 HARSH 直接作用于 RVC 输出后相加；生产中它在
  activity guard / `apply_dynamics` 之后、`calibrate_song_vocals` 之前，且 MP3 天花板是 −1.5 dBTP
  （A/B 用 −1.0）。响度匹配在最后，会吸收 HARSH 造成的少量电平变化，但这一顺序没有单独测。
* **分离人声的 F0 误差（The Wind ~460 ¢，粗误差 0.12）r2 修不了**：这是分离残留/和声被 RMVPE
  追到，而不是短八度孤岛；要靠更好的分离（SEPARATOR/KARAOKE，未 A/B）解决。
* 样本小：3 首 × 6.8 s × 2 种输入。指标全是信号代理（RMVPE F0 误差、HF/中频比、响度、真峰值），
  不是听感结论。AC 八度跳变和咔嗒计数在 RVC 输出上失效，已排除出判定。
* 浏览器端只有母带两步，没有 HARSH / OCTAVE_FIX；浏览器端母带的 A/B 是用同一算法的 Python 实现
  （`master_file`）在上述混音上测的；JS 版只由 `tests/rvc-v3-master.test.mjs` 对 BS.1770 参考音
（−23 / −20 LUFS）、真峰值天花板、±6 dB 增益上限做单元测试，**没有**与 Python 版逐样本对拍。
* 分离（主模型/karaoke/dereverb）、混响回送、音域保护、48 kHz/24-bit 输出仍未做 A/B。

## 复现

```bash
cd <repo>; export OMP_NUM_THREADS=1; P=/workspace/work/v3-lab/venv/bin/python; E=/workspace/work/v3-lab/e2e
$P tools/rvc_v3_e2e.py rvc   --clips $E/clips --sep /workspace/work/v3-lab/sep --onnx /workspace/work/v3-lab/onnx --out $E/ab
$P tools/rvc_v3_e2e.py post  --clips $E/clips --sep /workspace/work/v3-lab/sep --onnx /workspace/work/v3-lab/onnx --out $E/ab
$P tools/rvc_v3_e2e.py combo --clips $E/clips --sep /workspace/work/v3-lab/sep --onnx /workspace/work/v3-lab/onnx --out $E/ab
$P tools/rvc_v3_e2e_table.py $E/ab/results.json > $E/ab/table.md
$P tools/rvc_v3_e2e.py mp3   --out $E/ab --mp3 /workspace/work/v3-audio-ab2
```

试听：`/workspace/work/v3-audio-ab2/`（`raw__*` 各 F0 分支转换人声，`post__*` 收尾分支，
`mix__*__legacy|v3` 母带对比，`combo__*__v3mix` 默认链路成品，`combo__*__v3vocal` 默认链路人声）。
