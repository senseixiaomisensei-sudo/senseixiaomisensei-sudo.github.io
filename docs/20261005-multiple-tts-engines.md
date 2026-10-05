# 多引擎 TTS：真实模型与部署验收

本轮新增三套独立模型。旧 AIShell 保留为兼容备用，默认改用 Qwen3 0.6B。名称表示用途，不表示已通过用户盲听的品质排名。

| 引擎 | 完整必要模型下载字节数 | 语言 | 独立语气指令 |
| --- | ---: | --- | --- |
| Kokoro v1.1-zh FP32 | 364,816,464 | 中文、英语 | 无，只提供自然朗读 |
| CosyVoice-300M-Instruct FP32 | 2,295,734,364 | 中文、英语、日语、韩语、粤语 | 自然、温柔、开心、低落、认真 |
| Qwen3-TTS-12Hz-0.6B-CustomVoice BF16 | 2,498,383,610 | 中文、英语、日语、韩语、德语、法语、俄语、葡萄牙语、西班牙语、意大利语 | 官方 0.6B 不支持；界面禁止选择额外语气 |

3 GB 使用更严格的十进制 3,000,000,000 字节上限，包含推理所需权重、声码器/语音 tokenizer、词表和配置；不包含共享 Python/CUDA 软件运行环境。三套同时保留的总磁盘占用超过 3 GB。手机不下载模型。

官方来源：

- [Kokoro 官方 ONNX 文档](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_1.html)，固定发布包 SHA-256 `a3f4c73d043860e3fd2e5b06f36795eb81de0fc8e8de6df703245edddd87dbad`。
- [CosyVoice 官方项目](https://github.com/QwenAudio/CosyVoice)，源码固定 `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`，Matcha 子模块 `dd9105b34bf2be2230f4aa1e4769fb586a3c824e`。模型 [300M-Instruct](https://huggingface.co/FunAudioLLM/CosyVoice-300M-Instruct) revision `706bee1915e9fd1f1214929e2a0509c874cff433`。
- [Qwen3-TTS 官方项目](https://github.com/QwenLM/Qwen3-TTS)，模型 [0.6B-CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice) revision `85e237c12c027371202489a0ec509ded67b5e4b5`。主权重 SHA-256 `bc3c7e785eb961179c25450d1acff03f839e0002f2f3a5aeb67b5735c0fa2adb`，语音 tokenizer SHA-256 `836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258`。

每个必要文件的尺寸及 SHA-256 / Git blob 校验记录在 `rvc-service/app/tts_catalog.json`；安装时校验实际内容，禁止用户指定模型下载 URL。完整模型均使用官方授权的公开资源，来源模型卡标注 Apache-2.0。

CosyVoice 3 当前完整必要资源超过本轮上限，未接入。Qwen 1.7B 的语气指令能力没有套用到不支持它的 0.6B 版本。

## 执行方式

`setup-tts-engines.ps1` 准备独立 TTS 环境，覆盖 TTS 所需版本；借用已有 CUDA Torch，不升级生产 RVC / Seed-VC 环境。CosyVoice 保留官方源码，使用 `weights_only=True` 的 checkpoint 读取方式。不安装会隐式下载未固定资源的可选 WeText 前端；本轮用普通文本及标点合成，复杂数字、日期读法尚未专项验收。

网页选择引擎、语言、原生声线和该模型实际支持的语气。点击下载只安装所选固定模型。安装和每次服务重启均校验文件并生成真实探针，通过前不标记为 ready。

大模型通过 `/v1/tts/jobs` 后台生成，复用现有任务鉴权、最多两个活动任务、幂等键、持久化、结果 token、到期清理及自动结果轮询。参数及实际模型 revision 存入 OutputRecord。沿用 `/v1/tts` 兼容接口。

GPU 合成与现有转换使用同一推理信号量；使用隔离子进程，结束时释放显存。只保留输出余量，不加入激励、饱和、伪空气噪声、角色混回或额外“音质增强”。生成结果仍可作为现有角色变声的输入。

## 验证证据

实际音频、日志、哈希、语言及语气样本放在 `E:\大肥鱼\多引擎TTS\20261005`。三套中文音频使用同一段文本，MP3 为实际生成 WAV 的 96 kbps 导出，原始 WAV 同时保留。

- 初次完整前端回归 231/231；后续局部语言标签与 TTS 操作回归 6/6。
- TTS 契约回归 10/10，原有损坏文件、错误下载与合成失败测试均保留。
- 真实语言、原生语气、生产进程与公网后台合成，以该目录中的最终验收 JSON 为准，不能用上述契约测试代替实际音频。
- 没有用户听评或母语者评价的项目标记为未验收；未测的语言不能宣称全部通过。
- 本轮未改变角色资源、翻唱声码器、原有 UI 风格或已验证的角色转换参数。

回滚点：`4c8455a0b55e57168840d95d9c7d60d6e411ad08`。旧引擎和旧资源未删除。
