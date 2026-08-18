# 声音模型技术筛选记录

复核日期：2026-08-13。GitHub 星标是社区热度信号，不是安全、质量、侵权风险或模型权重许可的证明；数字会持续变化。

| 候选 | GitHub 快照 | 许可证信号 | 结论 |
| --- | --- | --- | --- |
| [QwenAudio/CosyVoice](https://github.com/QwenAudio/CosyVoice) | 22,735 Stars、2,622 Forks | 源码 Apache-2.0 | 选作本仓库可选 GPU 服务的适配目标。它同时覆盖零样本文本朗读和声音转换；模型权重不随本仓库分发，部署者必须逐个核查权重条款。 |
| [myshell-ai/OpenVoice](https://github.com/myshell-ai/OpenVoice) | 37,141 Stars、4,145 Forks | 源码 MIT | 保留为文本朗读备选，未自动接入。引入前仍需核对所用模型、语种和部署依赖的许可证。 |
| [SWivid/F5-TTS](https://github.com/SWivid/F5-TTS) | 15,116 Stars、2,192 Forks | 仓库标注 MIT | 不自动接入。代码许可证不能替代预训练模型、语料或发行条件的审查。 |
| [fumiama/Retrieval-based-Voice-Conversion-WebUI](https://github.com/fumiama/Retrieval-based-Voice-Conversion-WebUI) | 高星 RVC 路线候选；星标实时变化 | 当前上游为 AGPL-3.0 | 不嵌入 PostPrep。若运营者另行以网络服务方式部署，须自行履行 AGPL 的网络服务源代码提供义务，并处理模型与声音权利。 |

## 不直接复制 Weights 的产品边界

Weights 一类产品可作为“上传参考声音 + 文本生成/声音转换”的交互参考，但本项目不会把这种交互理解为可以处理任何声音。PostPrep 仅接受：本人声音、覆盖本次克隆与使用范围的书面许可，或用户拥有角色和表演权利的原创虚构声音。公众人物、未获许可的真人、演员/主播表演以及受保护角色或配音都不属于可用素材。

## 技术与质量边界

- 不在 GitHub Pages、Cloudflare Pages 或 Workers 中运行模型；真正推理仅能部署在经账户所有者授权的 GPU 环境。
- 前端不保存推理密钥；浏览器先在本机检查格式、时长、声道、静音和削波风险，只有用户确认授权并点击生成后才上传。
- 服务端不提供媒体下载、伴奏分离、社区模型安装、任意 URL 抓取或用户命令执行。
- 清晰、单人、无音乐的 15–90 秒参考音频通常更稳定，但不能承诺“自然无破音”。输出必须以 AI 合成音频标示。

## 复核来源

本记录中的 Stars、Forks 与仓库许可证来自各仓库的 GitHub 公开 API 快照。上线前应再次打开相应仓库的 LICENSE、模型权重页及依赖清单复核，而不是仅依赖本记录。
