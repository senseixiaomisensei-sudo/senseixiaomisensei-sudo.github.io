# 蔚蓝档案角色补全 v3（2026-10-31）

## 结论

- 新增角色 56 个：浏览器端（ONNX 分块，同时可走云端）9 个，仅云端 47 个。
- 浏览器目录 `assets/rvc-models.json`：52 → 61 个模型（蔚蓝档案标签 47 → 56）。
- 云端清单 `assets/rvc-cloud-roster.json` 记录全部 56 个新角色（固定 Hugging Face revision + 权重/索引/压缩包 SHA-256）。
- 新增浏览器资源体积约 1024 MB（单个 ONNX 均 < 100 MB）。
- 已有角色、`hoshino/` 与音频链路未改；`assets/rvc.js`、`assets/rvc-schools.js` 只改数据块。

## 验收标准

1. 安全加载：`torch.load(weights_only=True)`，不反序列化模型代码。
2. 结构：RVC v2、768 维 HuBERT 特征、启用 F0，配对 FAISS 索引可读。
3. 端到端信号门槛：官方 RVC 推理（rmvpe，pitch 0，index_rate 0.35，protect 0.33）转换固定 11.444 s 测试音频（正常段 5.984 s + 喊叫压力段），
   无非有限值、无满幅削波、|DC| ≤ 0.01、相邻样本跳变 < 1、两段 RMS ≥ 0.01、8 kHz 以上能量占比 ≤ 0.35。
4. 浏览器端额外要求：仓库导出器 `tools/export-rvc-character-package.py` 导出成功，并通过真实特征下原生/ONNX 一致性校验。

信号门槛不是试听，不能证明音色像角色本人；社区模型的角色/声优授权未经独立核实（许可一栏仅为仓库元数据）。

## 云端启用（用户需在 RVC 服务所在电脑上执行一次）

```
python tools/install-ba-roster-v3.py --models-dir <RVC_MODELS_DIR> [--mirror]
```

逐个校验压缩包、权重、索引 SHA-256 后才写入，不覆盖不同的已有文件；完成后重启 RVC 服务即可在云端列出新角色。

## 收录

| ID | 角色 | 交付 | 采样率 | 索引向量 | 训练信息 | 来源（固定 revision） | 发布者 | 许可声明 | 权重 SHA-256 | 索引 SHA-256 | 正常/压力 RMS / 峰值 |
|---|---|---|---:|---:|---|---|---|---|---|---|---|
| `akane` | 室笠茜 (Akane) | 浏览器+云端 | 40000 | 30572 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/MurokasaAkane.zip) | LordDavis778 | openrail | `5746e9f31f46bd89c6e9013a4fab9227f8dfbe75ecfbd214600c11a7f609d090` | `d89ea3ed7db76fe3c6cf304998ccff46a08093f6fd2b54130b5bb641d91bba18` | 0.128/0.152/0.884 |
| `akari` | 鳄渊明里 (Akari) | 仅云端 | 48000 | 17564 | 500epoch | [Cinnamomo/rvc_models](https://huggingface.co/Cinnamomo/rvc_models/blob/751fa73d636b7026a94702470f7722d57d0bee8b/blue_archive/akari_e500_s10000.pth) | Cinnamomo | cc-by-nc-sa-4.0 | `0ed11b0764edd084e56b70496a27ecd31562e87e8ef903a596e92b8a0d06b820` | `7a0caf687fe1faaf423597761c8fcba3a7e932a8bfc3272514974f91b106dbba` | 0.121/0.144/0.763 |
| `ako` | 天雨亚子 (Ako) | 浏览器+云端 | 48000 | 15027 | 500epoch | [TokiBotan/AmauAkoRVCV2](https://huggingface.co/TokiBotan/AmauAkoRVCV2/blob/99f3f95cba108c58a5b0e65a640dd7de9f15f0c0/AmauAko.zip) | TokiBotan | openrail | `7e88de7f18780a39404fdefbbd963905497c621efa37edae9617f1579a98ecb8` | `41a2941677a5d0cea9d3393599ba85366eb9d5607991e645572604e1aa7a4b7e` | 0.112/0.133/0.778 |
| `aoi` | 扇喜葵 (Aoi) | 仅云端 | 48000 | 22434 | 360epoch | [ryzusaku/rvc_v2_models](https://huggingface.co/ryzusaku/rvc_v2_models/blob/78ebb8fe3e14088eedcdfe67b4a235a742f2bf17/OkiAoi.zip) | ryzusaku | openrail | `3b19da05c2f5c803f8d035d4f5f5d6f111afba115d006ac879eddecb0b713a74` | `d853a2de4d59c70149d55e52432b88170ae907fc0ba1bb24d95f6356567d178a` | 0.195/0.218/0.808 |
| `atsuko` | 秤亚津子 (Atsuko) | 仅云端 | 40000 | 11719 | 500epoch | [idontgoddamn/HakariAtsuko](https://huggingface.co/idontgoddamn/HakariAtsuko/blob/14c51926abbed8247acf1b11ebf9b92b82fb4415/%5BBlue%20Archive%5D%20Hakari%20Atsuko%20-%20Weights.gg%20Model.zip) | idontgoddamn (weights.gg mirror) | Not specified by publisher; character/performer authorization not independently verified | `43b6ea13e1fcb3b817a4d7a3d292633e2c4de04dd8872b1ca6beb7f99d14d29a` | `77a925074910f2327d5f84d535a9ebd6d33a46a6a05f68cca30e1e2d56add038` | 0.137/0.159/0.833 |
| `chiaki` | 元宫千明 (Chiaki) | 仅云端 | 40000 | 19287 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/MotomiyaChiaki.zip) | LordDavis778 | openrail | `4e7a85ff908c3ab50d69e708fefe7b4522dc98f81bb1bcb6fc510788ac57e680` | `e3d280ca11945be980685375abc443a2f5a64bab3ebc75b7953d33d4d27a63fa` | 0.113/0.132/0.633 |
| `chihiro` | 各务千寻 (Chihiro) | 仅云端 | 48000 | 13791 | 500epoch | [TokiBotan/KagamiChihiroRVCV2](https://huggingface.co/TokiBotan/KagamiChihiroRVCV2/blob/c8bb635ac69c09343664f27513a25f1f8c111d36/KagamiChihiro.zip) | TokiBotan | openrail | `8c7ed3e839b16973f454e69cefd3f477bfcc5388b265edbe0c58355f59dcad58` | `f2ef5103412b84c1323f57561b4752dd9c5bca9847a0c0c65a2b7f7923b1f254` | 0.106/0.127/0.765 |
| `chinatsu` | 火宫千夏 (Chinatsu) | 仅云端 | 40000 | 26851 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/HinomiyaChinatsu.zip) | LordDavis778 | openrail | `61784cb367aaf360e5735ca80d7f14f7b2252fe1195f9e0af20e97a1083b2f7c` | `d99f27295fb928a11c2a3e7a8f8bcd7bdd221a5a90bf73469c2b13de9a8d3864` | 0.139/0.160/0.719 |
| `chise` | 和乐千世 (Chise) | 仅云端 | 32000 | 7865 | 185epoch | [brookieisthatyou/MY-RVC-V2-MODELS](https://huggingface.co/brookieisthatyou/MY-RVC-V2-MODELS/blob/e6680da4b9700f32ee689726246f3f6cdee45345/WarakuChise.zip) | brookieisthatyou | Not specified by publisher; character/performer authorization not independently verified | `1789199dd9432248d2f941c9f7a9cdf8a5d06b874270e3c2a573bd61cdad885b` | `96c8b6c0607e0684f42b2bf5505f4282169823078e847750aff1c6de0466441c` | 0.152/0.177/0.884 |
| `eimi` | 和泉元艾米 (Eimi) | 仅云端 | 40000 | 28294 | 520epoch | [sxndypz/rvc-v2-models](https://huggingface.co/sxndypz/rvc-v2-models/blob/12ce2b49d86d65141de73ba680c8b27c6e2136f5/eimi.zip) | sxndypz | openrail | `61d471b568d96a831d71657f516c31f0cdaa6ef3f00e22419952da1aa2b91f49` | `c70372bb25193e1bfa373e60c20a0de2c93f4431591dae297a503cedba854998` | 0.124/0.145/0.793 |
| `fuuka` | 爱清风香 (Fuuka) | 仅云端 | 40000 | 27422 | 523epoch | [sxndypz/rvc-v2-models](https://huggingface.co/sxndypz/rvc-v2-models/blob/12ce2b49d86d65141de73ba680c8b27c6e2136f5/fuukav2.zip) | sxndypz | openrail | `18442df0fd9025ad795763a95fffbdbaa7fa3cc62f1935a128faf57d56608496` | `e2223c3d25ba6c49b3645422698e0e3e9debf18293f0559045f21d76be7f26d2` | 0.106/0.136/0.830 |
| `haruna` | 黑馆晴奈 (Haruna) | 浏览器+云端 | 48000 | 16965 | 350epoch | [TokiBotan/KurodateHarunaRVCV2](https://huggingface.co/TokiBotan/KurodateHarunaRVCV2/blob/576faab3cbc9b08577af2bdf85a4703ffc617042/KurodateHaruna.zip) | TokiBotan | openrail | `872f7fe71e18d9963abf44c6996092447b72c85d952dd24c381a09271434b679` | `b1a52718cb9ba027995f486a2dff3f371b00e359c0523881230f6f289d1dd50a` | 0.138/0.161/0.871 |
| `hibiki` | 猫冢响 (Hibiki) | 仅云端 | 40000 | 41553 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/NekozukaHibiki.zip) | LordDavis778 | openrail | `908d0f7dc9e439d0dc863f4b1149b9f198e75d6f2f338e7bc45ebcfd11a14ad8` | `cd65db28d15812bd746f53e33e537dd00d102ddf0d06e7385a9a53afd3362307` | 0.119/0.141/0.701 |
| `himari` | 明星日鞠 (Himari) | 浏览器+云端 | 40000 | 36510 | 190epoch | [ryzusaku/rvc_v2_models](https://huggingface.co/ryzusaku/rvc_v2_models/blob/78ebb8fe3e14088eedcdfe67b4a235a742f2bf17/AkeboshiHimari.zip) | ryzusaku | openrail | `f0e2a07f2709582c5ce50b20b034dda5bcc1a3520c92b0ae68af2b27e78d14e5` | `1b9106b99fad3553cd07ae240b5eb655e102347a9cdb9da92fc6a7744c8312d4` | 0.139/0.181/0.823 |
| `ibuki` | 丹花伊吹 (Ibuki) | 仅云端 | 40000 | 19015 | 300epoch | [RegalHyperus/MiscellaneousRVCModels](https://huggingface.co/RegalHyperus/MiscellaneousRVCModels/blob/537d98b9524f85d8671fb2daae6e700cc48725b1/IbukiTangaJP.zip) | RegalHyperus | openrail | `c1ccfbd7bb02ca627621a0caf4886751cf184089570e2b679ade717c76680184` | `30e91f9f8540b3fca19e545fee56d39ca4a7275015fe8375bbec907842221481` | 0.111/0.133/0.736 |
| `iori` | 银镜伊织 (Iori) | 浏览器+云端 | 40000 | 30494 | 500epoch | [ryzusaku/rvc_v2_models](https://huggingface.co/ryzusaku/rvc_v2_models/blob/78ebb8fe3e14088eedcdfe67b4a235a742f2bf17/ShiromiIori.zip) | ryzusaku | openrail | `21037106266bfeb392d8fd4a319f0fc627e20b1fa7ab623929ef9648736c254f` | `f4955df2c43ee4111534e9e970b2b814276db90eab130aa9a82eb09a074b72d3` | 0.128/0.155/0.880 |
| `izuna` | 久田泉奈 (Izuna) | 仅云端 | 40000 | 48145 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KudaIzuna.zip) | LordDavis778 | openrail | `eb3b941e7a552848609e653e7784bf67771bb3f19cc6bddcc4ebdb25e8501a1b` | `d2f650f571ea17363af512c220265bb9b4471fa7ea0094c922aa198669ba3968` | 0.086/0.110/0.888 |
| `junko` | 赤司纯子 (Junko) | 仅云端 | 40000 | 36085 | 400epoch | [snowarakin/Akashi_Junko](https://huggingface.co/snowarakin/Akashi_Junko/blob/5c572834893a348cca5e026952b34e2498875b5a/AkashiJunko.zip) | snowarakin | openrail | `59983983d40eb6999d7b2da86425221b4c78ef77bc0dfba5e72e424a1bb97d97` | `a71c8dd89e49a3ef8fc99198aed9dc513ba91fafc8f4af1574fc7d51ea190a2e` | 0.122/0.147/0.834 |
| `juri` | 牛牧朱莉 (Juri) | 仅云端 | 48000 | 13198 | 250epoch | [TokiBotan/UshimakiJuriRVCV2](https://huggingface.co/TokiBotan/UshimakiJuriRVCV2/blob/864791685bd1655c3f4934ca142165a3d4945b27/UshimakiJuri.zip) | TokiBotan | openrail | `167aadc437155b21975c4b3cca463067b8b3cc8b53acdfdedb94cf10b28cc9b4` | `dc45d7bcf74aeae51effcab3e3e90599389b0f5c2f256b9346da213dacab65d0` | 0.169/0.196/0.808 |
| `kaho` | 桑上果穗 (Kaho) | 仅云端 | 40000 | 19076 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KuwakamiKaho.zip) | LordDavis778 | openrail | `e3cd23194d898ba5e1bf8e42d4e50d0216fd86f0b73e9c2fad3cf20cf3d94497` | `c598ef3b6c03256df46a6ea71fbd9b373927975876d4a94bf9145afce19ba133` | 0.169/0.187/0.821 |
| `kanna` | 尾刃康娜 (Kanna) | 仅云端 | 40000 | 32258 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/OgataKanna.zip) | LordDavis778 | openrail | `97d5ffc6768dcda478880bc2ef33b8865cadf91b3ce82b45379a6df3dc4c4b78` | `ad33196bd93e81d5cfcd01dfa8b50011f8951cb9cd7a6edc94080cbf38c57199` | 0.180/0.215/0.889 |
| `karin` | 角楯花凛 (Karin) | 浏览器+云端 | 40000 | 29133 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KakudateKarin.zip) | LordDavis778 | openrail | `20fe45d60851d0c7731a31e17b6bb9bccb67d5ebe62a8065a609f12398a958d3` | `6e933bc9d9982f4c142c8b90ba28b6b97ffbbd40364c9d04717ec5a1b7082c00` | 0.128/0.153/0.752 |
| `kasumi` | 鬼怒川霞 (Kasumi) | 仅云端 | 40000 | 19887 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KinugawaKasumi.zip) | LordDavis778 | openrail | `ac3171cf3cc1a886f61f151c43528e5f92a5da852e37bfc831cc2b42fbc601c8` | `58d03d024abd988217c209ecb147aa2a8f392e90c472dae943965ba06c65af0d` | 0.178/0.204/0.885 |
| `kikyou` | 桐生桔梗 (Kikyou) | 仅云端 | 40000 | 21134 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KiryuKikyou.zip) | LordDavis778 | openrail | `15c95bc423c895f3dc83394d3935a0c516264aa7ed1a2040ba4293d8bbc35b07` | `65d667040a014936a9294b6cfbe279d0db33208b5eb733dcc91da5bb609a4ec0` | 0.166/0.188/0.886 |
| `kirino` | 中务桐乃 (Kirino) | 仅云端 | 40000 | 26455 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/NakatsukasaKirino.zip) | LordDavis778 | openrail | `40950efda90db2f9c3353086e1120404319bb20e390c369e4639434e9a36138c` | `a2778a17854fcd63415a69abf9303fa5790ea12835a1e064288fcb0c1a578457` | 0.121/0.145/0.886 |
| `kotama` | 音濑小玉 (Kotama) | 仅云端 | 40000 | 11689 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/OtoseKotama.zip) | LordDavis778 | openrail | `1f5415ae0aefd15223c422ed856c8029dbacb6df987dd57e1a3f2ba81b9c3258` | `ad36d8fc4d7a6396f36581abc1a3e2f13215288454fb3a313f5d2f478c57d17d` | 0.169/0.189/0.815 |
| `kotori` | 丰见琴里 (Kotori) | 仅云端 | 40000 | 36007 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/ToyomiKotori.zip) | LordDavis778 | openrail | `6821d5461a58c6ade549b3d1937b64128cb78f947a1ba7b4cac3243e3ca9abbb` | `34dc0b61a8dc94da98458b714308c2bf43eefda8412c998851eca96824a3a08e` | 0.133/0.154/0.829 |
| `makoto` | 羽沼真琴 (Makoto) | 仅云端 | 40000 | 21926 | 300epoch | [RegalHyperus/RequestedRVCModels](https://huggingface.co/RegalHyperus/RequestedRVCModels/blob/133c4d1b9a5452ceba20a3bdafbc3d6908927b1d/MakotoHanumaJP.zip) | RegalHyperus | openrail | `ed03428b6710e12cc701fe99c1942b89de16fb244ae9012766c74f9289f6d41d` | `98ffd144e325ec78ae8bac055aebc709ec5010c176aada1f9e7e0cd0ea24a952` | 0.180/0.208/0.889 |
| `marina` | 池仓真里奈 (Marina) | 仅云端 | 40000 | 14111 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/IkekuraMarina.zip) | LordDavis778 | openrail | `54f3473feea58770d77c951d22c6aa2cc0991685c3d32d78238f6a59f83467c2` | `dccccf05205d49594a44c668169b59cdbf7dd8f219099dc10f6b5969af3452ed` | 0.183/0.205/0.888 |
| `megu` | 下仓惠 (Megu) | 仅云端 | 40000 | 36800 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/ShimokuraMegu.zip) | LordDavis778 | openrail | `024553cbe0cc799b014cd9cadb9cdff5af09347eb120858e9649fb39f088ea96` | `23e251dd3655ca08c935ecb302ea3c9331b73faa24bef786c618c56d23293c51` | 0.121/0.142/0.884 |
| `meru` | 姬木芽瑠 (Meru) | 仅云端 | 40000 | 22907 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/HimekiMeru.zip) | LordDavis778 | openrail | `7b44037ecf9e468c715250f5ffa4b3c7bc12182557f5013b116735dec1b88f11` | `8410ee6fe2976f95ec67face8111389369342c4cc6817facf8db48e3b406c4de` | 0.107/0.131/0.789 |
| `michiru` | 千鸟满 (Michiru) | 仅云端 | 48000 | 68202 | 300epoch | [ryzusaku/rvc_v2_models](https://huggingface.co/ryzusaku/rvc_v2_models/blob/78ebb8fe3e14088eedcdfe67b4a235a742f2bf17/ChidoriMichiru.zip) | ryzusaku | openrail | `9297a1775f9b39e6269672577a5bdddf043b7bb4bbd4220cb8022cdf6570be8b` | `a6fe5ffe470ad2704a2408d1d3d3ab954bd85dda4e5516accf0529254d65d9ea` | 0.114/0.140/0.825 |
| `minori` | 安守实梨 (Minori) | 仅云端 | 40000 | 31935 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/YasumoriMinori.zip) | LordDavis778 | openrail | `d1f28ca492bc0a36b26a9fe7c6a2267402620a2dc51f514163dde1c80bc72721` | `59f2a088e94e58fa1ac6ee90a9bd0961753eb0ca84f626ea10fd16f13d52623d` | 0.192/0.225/0.888 |
| `misaki` | 戒野美咲 (Misaki) | 仅云端 | 40000 | 12813 | 400epoch | [snowarakin/Imashino_Misaki](https://huggingface.co/snowarakin/Imashino_Misaki/blob/c4497a5d6d7fc3da03365f7883114c85b96b7858/ImashinoMisakimodel.zip) | snowarakin | openrail | `9f4ed5d5e44fbd2dfb8ac5e8f5315d8a73d7e34a4302db429d08a95c08e6c136` | `539df61b802e93ae5bb7ae1a9e358f19918638539567d46df824ea76be4535e5` | 0.088/0.107/0.675 |
| `miyako` | 月雪宫子 (Miyako) | 浏览器+云端 | 48000 | 10605 | 300epoch | [pipatmaeng25/NoaFromBluearchive](https://huggingface.co/pipatmaeng25/NoaFromBluearchive/blob/5c63487fd7ae0bf1ec89d90cd3ee9476851d1c54/Miyako.zip) | pipatmaeng25 | openrail | `aad505a9709f6f1aa8b240c73556cdc4e3da66ede00f8bba71789e2868ebf937` | `20fdfd198023456b648f8580415d0c18ac23c2913d3fd0e43eca18f7a7ee32b0` | 0.162/0.179/0.854 |
| `miyu` | 霞泽美游 (Miyu) | 仅云端 | 48000 | 18890 | 550epoch | [TokiBotan/KasumizawaMiyuRVCV2](https://huggingface.co/TokiBotan/KasumizawaMiyuRVCV2/blob/50ab3f44ad72e19f6d2dbb2f4cf369455bd863f7/KasumizawaMiyu.zip) | TokiBotan | openrail | `2a2d172a75b06e4f0c7c460c2c4625d5fd2a71f338ba708c428d821adc55566b` | `ef8bcdaa78a8bbce366aaa7385f24072ea39cc5fff6c5df0734b304a0fcc81e4` | 0.176/0.199/0.811 |
| `momiji` | 秋泉红叶 (Momiji) | 仅云端 | 40000 | 27422 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/AkiizumiMomiji.zip) | LordDavis778 | openrail | `496b879e488ca22b73e2c82dc2316eabf9793c81cfb621f5cde4903d7d22cc91` | `4b76cede86126417ae9b19e283ad40f9124c8362e360d735e67d28f9511ef723` | 0.186/0.211/0.876 |
| `momoka` | 由良木桃香 (Momoka) | 仅云端 | 40000 | 46332 | 260epoch | [ryzusaku/rvc_v2_models](https://huggingface.co/ryzusaku/rvc_v2_models/blob/78ebb8fe3e14088eedcdfe67b4a235a742f2bf17/YuragiMomoka_v2.zip) | ryzusaku | openrail | `3edba1412c09294648f6f37a39d4a693f3e725ccb2654f4c8b9301a5e51545e1` | `33d1adc946d855c19331a95631c432a3eb2ddbecba9c8a76a438ef647e583334` | 0.138/0.160/0.885 |
| `mutsuki` | 浅黄睦月 (Mutsuki) | 浏览器+云端 | 40000 | 11292 | 320epoch | [Timur04129/Asagi-Mutsuki](https://huggingface.co/Timur04129/Asagi-Mutsuki/blob/13fca36dcf8e10679b2dadb50fb02b7a8c516380/Asagi-Mutsuki.zip) | Timur04129 | openrail | `a8a39d07590631f2b8dd39c93bd5538e37faa1db61b3e7c1742c3e24e406eddb` | `14e24cefcf5d4d3a88c5296f982ff167a41d72c58769fb47c4d23e3eaaf7aa00` | 0.108/0.131/0.754 |
| `nodoka` | 天见和香 (Nodoka) | 仅云端 | 40000 | 34013 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/AmamiNodoka.zip) | LordDavis778 | openrail | `747694ffc28d0fa6a79a6bb119960099d5e14ae35629a9ed3635ea76bed2ed98` | `7641f0b9654393bbf860d85767826c74c2aeddac30fcaa4a2c365f7d9eaaf049` | 0.124/0.150/0.836 |
| `pina` | 朝比奈菲娜 (Pina) | 仅云端 | 40000 | 16678 | 500epoch | [TokiBotan/AsahinaPinaRVCV2](https://huggingface.co/TokiBotan/AsahinaPinaRVCV2/blob/ffcbe283b41934ba46b2f7b6f991f9921033a549/AsahinaPina.zip) | TokiBotan | openrail | `317ae72bd0babb92b18ddce9cc3d75e21c415046e8f5155259ec2e4c3bf4229c` | `541f6de7921c21516c43956049cbe730ee3b4fd8965683e1631b53957b2e7bbb` | 0.118/0.140/0.823 |
| `renge` | 不破莲华 (Renge) | 仅云端 | 40000 | 25673 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/FuwaRenge.zip) | LordDavis778 | openrail | `be24c2cab8974c1b2b2ae7bb48951906f441f6f4f3a6f2e86198bca46b02fe00` | `476360de868671869fdd4863099e17fed7084a5a49f407c79cab9aec754eade6` | 0.175/0.205/0.887 |
| `rin` | 七神凛 (Rin) | 仅云端 | 40000 | 53177 | 250epoch | [ryzusaku/rvc_v2_models](https://huggingface.co/ryzusaku/rvc_v2_models/blob/78ebb8fe3e14088eedcdfe67b4a235a742f2bf17/NanagamiRin_v2.zip) | ryzusaku | openrail | `e6e3c58e9c65a60084138fe98b77977492cee222f2959371d9bc8480ebcfff7d` | `c071531d5af9b444b8f00f3dd4f3180a05a83a6e718ff442e19dd06440828a59` | 0.197/0.224/0.889 |
| `rio` | 调月莉音 (Rio) | 浏览器+云端 | 40000 | 23981 | 300epoch | [TokiBotan/TsukatsukiRio_RVCV2](https://huggingface.co/TokiBotan/TsukatsukiRio_RVCV2/blob/208cf000794d2a55b9a2ccadc50a52adfe310819/TsukatsukiRio.zip) | TokiBotan | openrail | `b04232abb4696a2dde088e1279ae57dd67add26b67508984b36461c5a3d43e50` | `41a9b8ddf074d1c0944eac98b5f9efdccc8fc1904ffb17d2f9327d9d80e9b540` | 0.171/0.198/0.810 |
| `rumi` | 朱城瑠海 (Rumi) | 仅云端 | 48000 | 26491 | 400epoch | [Cinnamomo/rvc_models](https://huggingface.co/Cinnamomo/rvc_models/blob/751fa73d636b7026a94702470f7722d57d0bee8b/blue_archive/rumi_e400_s12000.pth) | Cinnamomo | cc-by-nc-sa-4.0 | `befc89c34da206f663a17d95baf2266729a5701229009b69a1698bfa52fd9a23` | `ce946fd3369a633ad0468c2fefbd5ccfcbaca3642f2222201d475d42b81a09c6` | 0.132/0.163/0.886 |
| `saki` | 空井咲 (Saki) | 仅云端 | 48000 | 11309 | 500epoch | [TokiBotan/SoraiSakiRVCV2](https://huggingface.co/TokiBotan/SoraiSakiRVCV2/blob/96162e6df39ee96e7e5e4879f9d0e8a22f72e75a/SoraiSakiRVCV2.zip) | TokiBotan | openrail | `e70eded6fcbd89c6ec6896343a01cb2e2608e02dd9997b75861c6d73355c9bb2` | `a69a3ee6efa76155f821a4d14f7523b9da88c6782517a2e0cd5e4360ba054974` | 0.127/0.150/0.876 |
| `saori` | 锭前纱织 (Saori) | 仅云端 | 40000 | 9405 | 95epoch | [idontgoddamn/SaoriJoumae](https://huggingface.co/idontgoddamn/SaoriJoumae/blob/c9e0e1984b5f9ec1871a5796a909078b9f37ffda/Saori%20Joumae%20-%20Weights.gg%20Model.zip) | idontgoddamn (weights.gg mirror) | Not specified by publisher; character/performer authorization not independently verified | `8bc44d60b0c3fc1a57cf595a8682db8ec1e3bcca95c23fcfafcb25af35ae5b8a` | `c516c4b6fec28bedf48b61219c2aac7e970f29c26571be81118626083c8453e0` | 0.104/0.126/0.642 |
| `satsuki` | 京极皋月 (Satsuki) | 仅云端 | 40000 | 18557 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/Ky%C5%8DgokuSatsuki.zip) | LordDavis778 | openrail | `394f27b1c88ca11a783f28a657387644db2998b844a31ba375876e6f10574646` | `f90ae2aa46fdc4f806ad8cee8e27f152f9861789e8b4495cd0d0853464479994` | 0.121/0.144/0.818 |
| `saya` | 药子纱绫 (Saya) | 仅云端 | 40000 | 31945 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/YakushiSaya.zip) | LordDavis778 | openrail | `bafed1aaf9276ab1ba1de57f8b4644bd38e2cf8d77de61b9edc7a75d18200f09` | `71543c72124f18f91264469916c728daf936895557e50b5111dd6999ef24a893` | 0.121/0.135/0.871 |
| `shigure` | 间宵时雨 (Shigure) | 仅云端 | 40000 | 27177 | 500epoch | [idontgoddamn/Shigure](https://huggingface.co/idontgoddamn/Shigure/blob/be83e69a872c33f58fc9dd2c7ea8ca82c21d40a9/Mayoi%20Shigure%20%28BlueArchive%29%20-%20Weights.gg%20Model.zip) | idontgoddamn (weights.gg mirror) | Not specified by publisher; character/performer authorization not independently verified | `20c0cec082792fc2e404c3553aafcb246f69068ad975d8f6e9af599f72a92b8c` | `50f39c69735b6a9d35bbe47c65fccce63bfabf3f0e8600d1f66bd88cd252bff0` | 0.159/0.189/0.882 |
| `shizuko` | 河和静子 (Shizuko) | 仅云端 | 40000 | 40518 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KawawaShizuko.zip) | LordDavis778 | openrail | `21636b169fd6798b8611de3077a327b0ebaad8edb06416398fe1c4a3df7791ce` | `476bf8f221b5436b6ba4f431f64dc06fce0a5bc5c91890f96584aa23a9f24e72` | 0.082/0.104/0.726 |
| `sora` | 空 (Sora) | 仅云端 | 48000 | 2630 | 175epoch | [TokiBotan/Sora_Angel24_RVCV2](https://huggingface.co/TokiBotan/Sora_Angel24_RVCV2/blob/e6f2149a778d3159a775a9090cab42e2dd110e55/Sora_Angel24.zip) | TokiBotan | openrail | `5a745f63a4b12b518787ebecfbbbb35639c35d41ce5a461902fe353b2c5a3955` | `9e20ff84983fe0511e1e40b8b24564c3d33a36b897116cb261eb1149e856d8a6` | 0.122/0.141/0.819 |
| `sumire` | 乙花堇 (Sumire) | 仅云端 | 40000 | 13914 | 350epoch | [TokiBotan/OtohanaSumireRVCV2](https://huggingface.co/TokiBotan/OtohanaSumireRVCV2/blob/b11cd7e81a45199e2114b6a5efe242fc1bb41743/OtohanaSumire.zip) | TokiBotan | openrail | `f2610d751fc3759901b86ba375fc07ee6615ed39caa9d7429be6aa667fe60982` | `1d2a3fc7674d0852bd84de065b82b30aa1b40758e246cf750e538935c6bb2bd6` | 0.201/0.223/0.848 |
| `tsubaki` | 春日椿 (Tsubaki) | 仅云端 | 40000 | 48508 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KasugaTsubaki.zip) | LordDavis778 | openrail | `b9bad1239f4a21da7936d871ae485938f97d5cd63b35c6ab569962ec81497d30` | `c122fffade4cf82bd15ef16e0f2684621d78e4cff58e8667f7fdaded980d0da5` | 0.133/0.157/0.827 |
| `tsukuyo` | 大野月咏 (Tsukuyo) | 仅云端 | 48000 | 37248 | 500epoch | [ryzusaku/rvc_v2_models](https://huggingface.co/ryzusaku/rvc_v2_models/blob/78ebb8fe3e14088eedcdfe67b4a235a742f2bf17/OonoTsukuyo.zip) | ryzusaku | openrail | `089b139054d90fa99c6157035ce13920b5d352469b082582ee5ca5696cea8c66` | `babb3833366c19c173ef1437476acbd8613deeb15e4dfe81f6c2b9119d19a861` | 0.125/0.148/0.789 |
| `umika` | 里浜海香 (Umika) | 仅云端 | 40000 | 28921 | 500epoch | [LordDavis778/BlueArchivevoicemodels](https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/SatohamaUmika.zip) | LordDavis778 | openrail | `0397937f7ee26683a85c6a38e13c2c4ffaf53767554906896ac1766a4cebdfe1` | `976789a9c41244045f96be532b9a2fe5bc570dafb6e8d3c1d46065be10297953` | 0.143/0.164/0.842 |

## 未采用候选

| 候选 | 仓库 | 版本/采样率 | 结论 |
|---|---|---|---|
| akari@0 | TokiBotan/WanibuchiAkariRVCV2 | v2/48k | 同角色有更高优先级版本（akari@1） |
| aoi@0 | ryzusaku/rvc_v2_models | v2/40k | 同角色有更高优先级版本（aoi@1） |
| atsuko@1 | dcrazy/Hakari_Atsuko | / | download/inspect error: ValueError("no zip/pth in repo: ['.gitattributes', 'README.md']") |
| cherino@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| chise@1 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| eimi@0 | RegalHyperus/MiscellaneousRVCModels | v2/40k | 同角色有更高优先级版本（eimi@1） |
| fubuki@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| fubuki@1 | KriLsO/Nemugaki_Fubuki_354_Epoh | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| fuuka@1 | snowarakin/Aikiyo_Fuuka | v2/40k | 同角色有更高优先级版本（fuuka@0） |
| hare@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| haruka@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| haruka@1 | idontgoddamn/IgusaHaruka | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| haruna@1 | kinashijun/Bluearchive | v2/40k | 同角色有更高优先级版本（haruna@0） |
| haruna@2 | idontgoddamn/KurodateHaruna | v2/48k | 同角色有更高优先级版本（haruna@0） |
| himari@1 | snowarakin/Akeboshi_Himari | v2/40k | 同角色有更高优先级版本（himari@0） |
| himari@2 | idontgoddamn/AkeboshiHimari | v2/40k | 同角色有更高优先级版本（himari@0） |
| himari@3 | kaiRose69/Akeboshi-Himari | v2/40k | 同角色有更高优先级版本（himari@0） |
| hiyori@0 | MaestroBox/TsuchinagaHiyori | v2/40k | 端到端信号门槛未过：discontinuity |
| iori@1 | LordDavis778/BlueArchivevoicemodels | v2/40k | 同角色有更高优先级版本（iori@0） |
| iori@2 | idontgoddamn/Shiromilori | v2/40k | 同角色有更高优先级版本（iori@0） |
| iroha@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| iroha@1 | nguyennb876/Natsume_Iroha | / | download/inspect error: UnpicklingError('Weights only load failed. This file can still be loaded, to do so you have two options \n\t(1) Re-running `torch.load` with `weights_only` set  |
| izuna@1 | idontgoddamn/KudaIzuna | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| junko@0 | YourLocalWorm/commissionshit | v2/40k | 同角色有更高优先级版本（junko@1） |
| kanna@1 | chocht/kanna_bluearchive_rvc_e270-300 | v2/40k | 同角色有更高优先级版本（kanna@0） |
| karin@1 | Meido2/KakudateKarin | v2/40k | 同角色有更高优先级版本（karin@0） |
| karin@2 | GilbertClaus/Kakudate-Karin | / | download/inspect error: ValueError('no inference pth in archive') |
| kasumi@0 | ryzusaku/rvc_v2_models | v2/40k | 同角色有更高优先级版本（kasumi@1） |
| kikyou@0 | RegalHyperus/MiscellaneousRVCModels | v2/40k | 同角色有更高优先级版本（kikyou@1） |
| kirino@0 | RegalHyperus/MiscellaneousRVCModels | v2/40k | 同角色有更高优先级版本（kirino@2） |
| kirino@1 | RegalHyperus/MiscellaneousRVCModels | v2/40k | 同角色有更高优先级版本（kirino@2） |
| kirino@3 | Psykel/Nakatsukasa_Kirino_BA | / | download/inspect error: ValueError("no zip/pth in repo: ['.gitattributes', 'kirino-swim_blue archive_PONY_last.safetensors']") |
| kokona@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| kokona@1 | idontgoddamn/SunoharaKokona | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| kotori@0 | brookieisthatyou/MY-RVC-V2-MODELS | v2/40k | 同角色有更高优先级版本（kotori@1） |
| michiru@0 | ryzusaku/rvc_v2_models | v2/40k | 同角色有更高优先级版本（michiru@1） |
| michiru@2 | idontgoddamn/ChidoriMichiru | v2/48k | 同角色有更高优先级版本（michiru@1） |
| michiru@3 | cappuch/models | / | download/inspect error: ValueError('repo not found / gated') |
| mimori@0 | LordDavis778/BlueArchivevoicemodels | v2/40k | 端到端信号门槛未过：discontinuity |
| mimori@1 | Cinnamomo/rvc_models | v2/48k | 未验收（时间内未轮到） |
| misaki@1 | mellulili/imashino_misaki | / | download/inspect error: ValueError("no zip/pth in repo: ['.gitattributes', 'misaki_v2.pth']") |
| miyako@0 | idontgoddamn/TsukiyukiMiyako | v2/48k | 同角色有更高优先级版本（miyako@1） |
| momoka@1 | ryzusaku/rvc_v2_models | v2/48k | 同角色有更高优先级版本（momoka@0） |
| mutsuki@1 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| mutsuki@2 | FanFierik/Mutsuki | v2/40k | 同角色有更高优先级版本（mutsuki@0） |
| mutsuki@3 | idontgoddamn/AsagiMutsuki | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| mutsuki@4 | Hielo993/asagimutsuki | / | download/inspect error: ValueError("no zip/pth in repo: ['.gitattributes', 'asagiMutsukiV1 (1).safetensors']") |
| neru@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| nodoka@0 | brookieisthatyou/MY-RVC-V2-MODELS | v2/40k | 同角色有更高优先级版本（nodoka@1） |
| rin@1 | ryzusaku/rvc_v2_models | v2/48k | 同角色有更高优先级版本（rin@0） |
| saori@1 | ClashNSlashGamer/SaoriJoumae | / | download/inspect error: ValueError("no zip/pth in repo: ['.gitattributes', 'SaoriJoumae.pth', 'config.json', 'cover.png']") |
| saya@1 | sxndypz/rvc-v2-models | v2/32k | 同角色有更高优先级版本（saya@0） |
| shigure@0 | LordDavis778/BlueArchivevoicemodels | v2/40k | 同角色有更高优先级版本（shigure@1） |
| shizuko@1 | idontgoddamn/KawawaShizuko | v2/40k | 同角色有更高优先级版本（shizuko@0） |
| shun@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| shun@1 | idontgoddamn/SunoharaShun | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| tsukuyo@1 | idontgoddamn/OonoTsukuyo | v2/48k | 同角色有更高优先级版本（tsukuyo@0） |
| utaha@0 | LordDavis778/BlueArchivevoicemodels | v2/40k | 未验收（时间内未轮到） |
| wakamo@0 | LordDavis778/BlueArchivevoicemodels | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| wakamo@1 | idontgoddamn/KosakaWakamo | v1/40k | not RVC v2/768 (v1/256)；index dim 256 |
| yukari@0 | LordDavis778/BlueArchivevoicemodels | v2/40k | 未验收（时间内未轮到） |

