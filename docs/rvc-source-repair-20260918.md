# 角色音源与音高修复（2026-09-18）

## 已确认并修复

- 云端星野已使用 momofu 模型，网页 ONNX、检索码本和目录却仍指向旧 ryzusaku 模型。本次重新安全导出并同步网页资产，更新校验清单、来源及缓存版本。
- 来源固定为 [momofu/Hoshino_RVCv2](https://huggingface.co/momofu/Hoshino_RVCv2/tree/3dc4401ffa1802d8d5cf86bc74c631600031cdea)。权重 SHA-256 为 `4e17a69cb37a7e26e84445ebeedae539eff2a3aac896a451675906c5703b9145`；索引为 `d1d9a80ef06864297302693239b6966783724997a265fa9521b2e65144a0b4b4`，与上游 LFS 元数据一致。
- 本机未提交的音高代码曾将超过 1050 Hz 的连续音高折半，1100 Hz 测试实际得到约 550 Hz。已移除这段处理，保留连续音高及用户变调，仅限制离散嵌入范围，并补充跨阈值滑音、静音和升调回归测试。
- 安全导出器允许历史模型的 `typing.OrderedDict` 元数据，仍坚持 `weights_only=True`。

## 候选比较

同一 5.47 秒人声，RMVPE、index=0.3、protect=0.25，分别测试原调及升高 12 半音。HNR 是周期性噪声代理指标，不是角色相似度或主观听感评分。

| 模型 | 原调 HNR | 升调 HNR | 决定 |
|---|---:|---:|---|
| 旧星野 | 9.10 dB | 10.48 dB | 替换网页旧资产 |
| momofu 星野 | 13.21 dB | 16.22 dB | 网页与云端统一 |
| 现有爱丽丝 | 8.59 dB | 10.81 dB | 保留 |
| 社区爱丽丝 v2 候选 | 8.15 dB | 10.13 dB | 没有改善证据，不替换 |

爱丽丝候选来自 [Ilzhabimantara 的固定版本仓库](https://huggingface.co/spaces/Ilzhabimantara/rvc-Blue-archives-hoyogames/tree/900c7eeaeb2dcdedf9c853ff9ce04495f92f5556/weights/blue-archive/tendou-arisu-2)，权重 `76ea9c132654336f978de74e8e53297c699fed229b4b9438ffa2ce55bcc4dde0`、索引 `3ab1f785cb292f15e04c4b306dfefb744d26791511c0ec4fa12d170fce6e4932`。首次索引下载不完整的结果已排除，表中仅使用完整哈希验证后的结果。

## 验证范围

- Python 音频测试 22 项、JavaScript 测试 133 项通过；样式重建无差异。
- 重启后的实际 GPU 服务逐一转换全部 30 个公开角色：无非有限值、无满幅削波、无静音，时长保持在 0.15 秒容差内；最大 MP3 解码峰值为 0.894491。
- 新星野通过浏览器本地 ONNX/WebGPU 完整转换。
- 以上不能证明任意录音、尖叫或歌曲都无破音，也不能证明角色授权或主观相似度。未把所有社区新模型一概视为更好。
- 原有 `main.py` 未提交修改保留，不混入本次提交。原始备份、候选、对比音频和验收记录位于本机 `E:\大肥鱼\网站音色修复\20260918`。
