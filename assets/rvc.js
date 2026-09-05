(() => {
  "use strict";

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MIN_AUDIO_SECONDS = 0.5;
  const WARN_AUDIO_SECONDS = 2;
  const MAX_AUDIO_SECONDS = 600;
  const LONG_AUDIO_THRESHOLD_SECONDS = 45;
  const DURABLE_CLOUD_JOB_SECONDS = 40;
  // The browser compatibility path keeps several large ONNX sessions in RAM.
  // It is intentionally limited to a short clip so mobile WebViews cannot sit
  // for minutes and then fail inside a dynamic-shape ONNX node.
  const LOCAL_MAX_AUDIO_SECONDS = 20;
  const DEVICE_FALLBACK_MAX_AUDIO_SECONDS = 1200;
  const CLOUD_STATUS_TIMEOUT_MS = 15000;
  const CLOUD_MODELS_TIMEOUT_MS = 20000;
  const CLOUD_STATUS_ATTEMPTS = 2;
  const CLOUD_CONVERT_TIMEOUT_MS = 220000;
  const CLOUD_MAX_CONVERT_TIMEOUT_MS = 600000;
  const CLOUD_MAX_LONG_JOB_TIMEOUT_MS = 45 * 60 * 1000;
  const CLOUD_MIN_EXPECTED_UPLOAD_BYTES_PER_SECOND = 64 * 1024;
  const RVC_SUBMISSION_COOLDOWN_MS = 20 * 1000;
  const RVC_SUBMISSION_STORAGE_KEY = "postprep_rvc_last_cloud_submission_v1";
  // Android WebViews and several in-app Chinese browsers are inconsistent at
  // reading duration metadata from a Blob-backed 40 kHz WAV. The inference
  // itself is fine, but their native audio controls can display 0:00 / 0:00.
  // Keep lossless WAV for desktop and request a high-bitrate MP3 only where
  // the browser needs the broadly supported container.
  const MOBILE_AUDIO_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|QQBrowser|UCBrowser|Quark|ByteDance|Douyin/iu;
  const OFFICIAL_RVC_ENDPOINT = String(globalThis.POSTPREP_RVC_API_ENDPOINT || "/rvc").trim();
  const OFFICIAL_RVC_STATUS_ENDPOINT = String(globalThis.POSTPREP_RVC_STATUS_ENDPOINT || "/rvc/status").trim();
  const OFFICIAL_RVC_MODELS_ENDPOINT = String(globalThis.POSTPREP_RVC_MODELS_ENDPOINT || "/rvc/models").trim();
  const OFFICIAL_RVC_MEDIA_ENDPOINT = String(globalThis.POSTPREP_RVC_MEDIA_ENDPOINT || "").trim();
  const OFFICIAL_RVC_TTS_BASE = OFFICIAL_RVC_ENDPOINT.replace(/\/+$/u, "");
  const COLLECTION_STORAGE_KEY = "postprep_rvc_custom_collections_v1";
  // 本机 edge-tts 服务（rvc-service）地址。
  // 优先级：locaStorage 里"一键适配"保存的地址 > 全局注入 __RVC_TTS_BASE__（postprep-config.js）> 同源。
  // 这样"一键适配"写入本地后立即生效，且支持"全机适配"局域网 IP。
  const TTS_LOCAL_STORAGE_KEY = "rvcTtsBase";
  const TTS_INJECTED_BASE = (typeof window !== "undefined" && window.__RVC_TTS_BASE__) || "";
  const TTS_SAME_ORIGIN = (typeof window !== "undefined" && window.location.origin) || "";
  const getTtsBase = () => {
    try {
      const saved = window.localStorage && window.localStorage.getItem(TTS_LOCAL_STORAGE_KEY);
      if (saved && typeof saved === "string" && saved.trim()) return saved.trim();
    } catch (e) {}
    if (TTS_INJECTED_BASE) return TTS_INJECTED_BASE;
    if (OFFICIAL_RVC_TTS_BASE) return OFFICIAL_RVC_TTS_BASE;
    return TTS_SAME_ORIGIN;
  };
  const ttsEndpoint = (base, kind) => {
    const normalized = String(base || "").replace(/\/+$/u, "");
    if (/\/(?:rvc|rvc-api)$/u.test(normalized)) {
      return kind === "health" ? `${normalized}/tts/health` : `${normalized}/tts`;
    }
    return kind === "health" ? `${normalized}/v1/tts-health` : `${normalized}/v1/tts`;
  };
  // 候选探测地址（"一键适配"自动尝试）。
  // 核心思想：如果这个"文本朗读"页面本身就是那台电脑部署的（serve.js 绑 0.0.0.0），
  // 那么局域网里其他设备访问到的地址主机名(hostname)就是电脑的局域网 IP，
  // 自动推导 http://<hostname>:8080 即可连上 rvc-service —— 从而全机共享，不只服务机自己能用。
  // 再叠加：同源、常见本机回环、以及管理员在 config 里注入的 __RVC_TTS_BASE__。
  const TTS_CANDIDATES = (() => {
    const collect = () => {
      const arr = [];
      const host = (typeof window !== "undefined" && window.location && window.location.hostname) || "";
      // 0) 同源最优先：serve.js 已把 /v1/tts 反向代理到本机 rvc-service，
      //    所以任何设备连到部署本页面的电脑(8124)后，走同源即可自动成功，无需知道 IP/端口/跨域。
      if (OFFICIAL_RVC_TTS_BASE) arr.push(OFFICIAL_RVC_TTS_BASE);
      if (TTS_SAME_ORIGIN) arr.push(TTS_SAME_ORIGIN);
      if (TTS_INJECTED_BASE) arr.push(TTS_INJECTED_BASE);
      // 1) 由当前访问主机名推导 8080（兜底：若未走代理，直连电脑 8080）
      if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
        arr.push(`http://${host}:8080`);
        if (window.location && window.location.protocol === "https:") {
          arr.push(`https://${host}:8080`);
        }
      }
      // 2) 本机回环（服务机自己访问自己时直连）
      arr.push("http://127.0.0.1:8080");
      arr.push("http://localhost:8080");
      arr.push("http://localhost:8124");
      return [...new Set(arr.filter(Boolean))];
    };
    return collect();
  })();
  const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg", "webm", "flac", "aac"]);

  const translations = {
    zh: {
      eyebrow: "RVC VOICE CHANGER · WEB EDITION",
      title: "AI 变声器",
      intro: "选一个你有权使用的声音模型，上传或录制一段你自己的声音，使用 RVC 变声引擎完成转换。默认走本网站托管的受保护 GPU 服务；输入和结果仅在处理期间发送，并会自动删除。",
      noteTitle: "使用提示",
      noteBody: "默认使用固定版本的 RVC-Project HuBERT、RMVPE、FAISS 索引与生成器推理。RVC 是开源变声引擎名称，不是要上传的文件。请仅处理你有权使用的声音，并清晰标注为 AI 变声；公开可下载不等于拥有再分发或冒充许可。",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "三步完成变声",
      privacyBadge: "受保护 GPU 推理 · 用完即删",
      ownModelHint: "上传你本地训练或转换好的 .onnx 角色模型。仅供当前设备使用，不发布，也不会上传。",
      checkingServiceAction: "正在检查服务…",
      rmsLabel: "音量跟随",
      versionLabel: "版本 V1（分区导航 + 伴奏翻唱）",
      modeTitle: "选择变声模式",
      modeOfficialTitle: "智能混合模式",
      modeRecommended: "推荐",
      modeOfficialHint: "电脑在线时优先使用高质量 PyTorch RVC；电脑离线或隧道中断时，纯人声自动改由当前设备分段处理。带伴奏翻唱仍使用云端 GPU。",
      modeLocalTitle: "仅设备端模式",
      modeNoUpload: "免上传",
      modeLocalHint: "纯浏览器 WebAssembly 推理，音频不上传。云端不可达时，纯人声会自动切换到当前设备分段处理；请保持页面在前台。带伴奏翻唱仍需要云端 GPU。",
      cacheDefault: "设备端使用浏览器缓存；智能混合模式优先使用受保护的 GPU 服务",
      preload: "一键预热闪存",
      clearCache: "清理缓存",
      createCollection: "创建分区",
      collectionPlaceholder: "例如：我的动漫角色",
      saveCollection: "保存分区",
      cancel: "取消",
      trainedTitle: "🎓 训练完成的模型",
      trainedHint: "这些模型由下方训练功能生成，可在训练前填写自己的区域名称；点击后继续使用原有云端 RVC 变声流程。",
      ownModelTitle: "🎓 导入我自己的模型",
      chooseOnnx: "选择 .onnx 文件",
      sourceTts: "文本朗读",
      sourceTtsHint: "输入一段文字，使用可用的 TTS 服务生成朗读，再转换为当前角色。",
      audioContent: "音频内容",
      voiceOnly: "纯人声（默认）",
      voiceOnlyHint: "沿用原有稳定链路，上传更省流量。",
      songMode: "带伴奏翻唱",
      songModeHint: "云端先分离人声，只变人声，再与原伴奏回混。",
      ttsTextPlaceholder: "在这里输入你想让角色朗读的文字…（最多 800 字）",
      ttsSynth: "合成朗读（中性）",
      ttsConvert: "用当前角色朗读",
      ttsIdle: "选角色 → 输文字 → 角色朗读。",
      stepModel: "1. 选择角色声音",
      stepModelHint: "先切换角色分区，再点角色卡片。搜索只查当前分区。",
      searchPlaceholder: "搜索角色…",
      modelEmpty: "没有找到匹配的角色。换个关键词试试。",
      modelCatalogTitle: "角色声音库",
      modelInstalled: "已就绪",
      modelPick: "已选择",
      stepAudio: "2. 上传或录制你的声音",
      stepAudioHint: "本地公开角色支持最长 20 分钟纯人声；云端模式最长 10 分钟。文件需在 25 MB 内；长音频优先使用 MP3/M4A，本地请保持页面前台并预留内存。",
      sourceUpload: "上传音频",
      sourceUploadHint: "选择电脑或手机里已有的录音文件。",
      sourceRecord: "录制声音",
      sourceRecordHint: "直接用麦克风录一段，录完自动可用。",
      fileEmpty: "尚未选择音频文件。",
      recordStart: "开始录音",
      recordStop: "停止录音",
      recordHint: "录音先保留在浏览器；只有点击“开始变声”后才发送到受保护的 GPU 服务。",
      recordUnsupported: "当前浏览器不支持录音，请改用上传音频。",
      recordDenied: "麦克风权限被拒绝。请在浏览器设置中允许麦克风后重试，或改用上传音频。",
      recordInsecure: "录音需要 HTTPS 环境。当前页面不是安全上下文，请改用上传音频。",
      recordError: "录音启动失败，请改用上传音频。",
      stepSettings: "3. 调节声音（可选）",
      stepSettingsHint: "默认保持原调（0）。只有输入与角色音域明显不同时再逐步调节；过大的升调会放大金属感和电音。",
      pitchLabel: "音高调整 (变调)",
      pitchLow: "男声化 (-12)",
      pitchDefault: "原调 (0)",
      pitchHigh: "女声化 (+12)",
      advancedToggle: "高级设置（进阶选项）",
      indexRateLabel: "音色相似度",
      indexRateHint: "越高音色越贴近角色，但会增加颗粒风险。建议 0.20–0.40。",
      protectLabel: "辅音与呼吸保护",
      protectHint: "数值越低，清辅音与呼吸保护越强；0.5 会关闭保护。高动态输入建议 0.20–0.30。",
      f0Label: "音高算法",
      f0Rmvpe: "RMVPE（超高精度 · 推荐）",
      f0Harvest: "Harvest（传统稳健）",
      formatLabel: "输出格式",
      formatWav: "智能格式（手机 MP3 · 电脑 WAV）",
      resampleLabel: "输出采样率",
      resampleKeep: "40 kHz / 48 kHz (标准)",
      checkingService: "正在连接云端 RVC 引擎；此检查不会上传音频…",
      serviceReady: "🟢 云端 RVC 引擎已就绪",
      serviceOffline: "云端 RVC 引擎连接暂缓；纯人声会在云端不可达时自动切换到设备端推理。",
      serviceLoading: "正在从本地缓存或 CDN 加载模型权重...",
      convert: "开始变声",
      converting: "正在变声中...",
      howtoTitle: "三步上手",
      howtoOne: "在左侧选一个角色声音（点击卡片即可）。",
      howtoTwo: "上传一段你自己的录音，或直接用麦克风录制。",
      howtoThree: "点“开始变声”，等待云端推理完成即可试听与下载。",
      tipsTitle: "让效果更好",
      resultTitle: "变声结果",
      download: "下载变声结果",
      resultDisclosure: "云端输入会在任务结束后删除，输出链接从处理完成起最多保留约 2 小时；本地兼容模式不上传音频。",
      resultMeta: "角色：{model} · 音高变调：{pitch} · 耗时：{elapsed}s · 云端 RVC 引擎",
      analyzing: "正在分析音频…",
      analysisReady: "音频已就绪：{name} · 时长 {duration} · 可以变声。",
      invalidFile: "请选择有效格式的音频文件 (WAV/MP3/M4A/OGG/WebM)。",
      fileTooLarge: "文件超过大小限制 (25 MB)。",
      audioTooShort: "音频太短（不足 0.5 秒），请换一段更长的录音。",
      audioShortWarn: "音频不足 2 秒，建议使用稍长的句子获得更自然效果。",
      audioTooLong: "超过当前模式上限：本地公开角色 20 分钟，云端 10 分钟，导入模型 20 秒。请切换模式或裁剪。",
      decodeFailed: "无法解码此音频文件。请换成标准 WAV 或 MP3 重试。",
      missingModel: "请先选择一个角色声音。",
      missingAudio: "请先上传或录制一段你的声音。",
      generationFailed: "变声处理出错，请查看控制台日志或换一段简短音频重试。",
      selectedModel: "已选择角色：{name}。",
      noModels: "未找到可用角色模型。",
      tips: [
        "使用安静环境、单人清晰的人声录音效果最佳。",
        "纯录音选“纯人声”；歌曲、伴奏或复杂混音选“带伴奏翻唱”。",
        "点击变声才会上传音频；服务端输入用完即删，输出短时保留后自动删除。",
      ],
    },
    en: {
      eyebrow: "RVC VOICE CHANGER · WEB EDITION",
      title: "AI Voice Changer",
      intro: "Pick a voice model you are authorized to use, upload or record audio you are allowed to use, and convert it with the hosted RVC inference engine.",
      noteTitle: "Notice",
      noteBody: "The default path uses the pinned RVC-Project HuBERT, RMVPE, real FAISS index, and generator pipeline on a protected GPU service. Public availability is not a redistribution or impersonation license.",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "Three steps to a new voice",
      privacyBadge: "Protected GPU · Ephemeral files",
      ownModelHint: "Import a locally trained or converted .onnx voice model. It stays on this device and is never uploaded or published.",
      checkingServiceAction: "Checking service…",
      rmsLabel: "Volume envelope",
      versionLabel: "Version V1 (collections + song conversion)",
      modeTitle: "Choose an inference mode",
      modeOfficialTitle: "Smart hybrid",
      modeRecommended: "Recommended",
      modeOfficialHint: "Uses high-quality PyTorch RVC while the host computer is online. If it is offline or the tunnel drops, dry vocals fall back to chunked on-device processing. Song conversion still requires the cloud GPU.",
      modeLocalTitle: "On-device only",
      modeNoUpload: "No upload",
      modeLocalHint: "Runs WebAssembly in your browser without uploading audio. Keep the page in the foreground. Song conversion still requires the cloud GPU.",
      cacheDefault: "On-device models use browser cache; Smart hybrid prefers the protected GPU service",
      preload: "Preload models",
      clearCache: "Clear cache",
      createCollection: "Create collection",
      collectionPlaceholder: "For example: My anime voices",
      saveCollection: "Save collection",
      cancel: "Cancel",
      trainedTitle: "🎓 Trained models",
      trainedHint: "Models created by the training tool appear here. You can name their collection before training, then select them for the existing cloud RVC workflow.",
      ownModelTitle: "🎓 Import my own model",
      chooseOnnx: "Choose .onnx file",
      sourceTts: "Text to speech",
      sourceTtsHint: "Generate speech with an available TTS service, then convert it to the selected character.",
      audioContent: "Audio content",
      voiceOnly: "Dry vocal (default)",
      voiceOnlyHint: "Uses the established conversion path and uploads less data.",
      songMode: "Song with backing track",
      songModeHint: "The cloud separates vocals, converts only the voice, then remixes the original backing track.",
      ttsTextPlaceholder: "Enter text for the character to read… (up to 800 characters)",
      ttsSynth: "Generate neutral speech",
      ttsConvert: "Read as selected character",
      ttsIdle: "Pick a voice → enter text → generate speech.",
      stepModel: "1. Pick a character voice",
      stepModelHint: "Choose a collection first, then select a voice. Search stays inside the active collection.",
      searchPlaceholder: "Search voices…",
      modelEmpty: "No matching voice. Try another keyword.",
      modelCatalogTitle: "Voice library",
      modelInstalled: "Ready",
      modelPick: "Selected",
      stepAudio: "2. Upload or record your voice",
      stepAudioHint: "Published on-device voices accept 20 minutes of dry vocals; cloud mode accepts 10 minutes. Files must be under 25 MB. Prefer MP3/M4A; keep the local page in the foreground with enough memory.",
      sourceUpload: "Upload audio",
      sourceUploadHint: "Choose an existing audio file from your device.",
      sourceRecord: "Record voice",
      sourceRecordHint: "Record directly with your microphone.",
      fileEmpty: "No audio file selected.",
      recordStart: "Start recording",
      recordStop: "Stop recording",
      recordHint: "Recording stays in the browser until you explicitly click Convert.",
      recordUnsupported: "Recording is not supported in this browser. Please upload audio instead.",
      recordDenied: "Microphone permission was denied. Allow it in settings or upload a file.",
      recordInsecure: "Recording requires HTTPS. Please upload audio instead.",
      recordError: "Recording could not start. Please upload audio instead.",
      stepSettings: "3. Tune the sound (optional)",
      stepSettingsHint: "Keep the original pitch (0) by default. Shift gradually only when the input and target ranges differ; large upward shifts can sound metallic.",
      pitchLabel: "Pitch Shift",
      pitchLow: "Male (-12)",
      pitchDefault: "Original (0)",
      pitchHigh: "Female (+12)",
      advancedToggle: "Advanced settings",
      indexRateLabel: "Similarity",
      indexRateHint: "Higher can match the character more closely but may add grain. 0.20–0.40 recommended.",
      protectLabel: "Consonant protection",
      protectHint: "Lower values protect unvoiced consonants and breaths more strongly; 0.5 disables protection. Use 0.20–0.30 for high-dynamic input.",
      f0Label: "Pitch extraction",
      f0Rmvpe: "RMVPE (High Precision)",
      f0Harvest: "Harvest (Classic)",
      formatLabel: "Output format",
      formatWav: "Smart format (MP3 mobile · WAV desktop)",
      resampleLabel: "Output sample rate",
      resampleKeep: "40 kHz / 48 kHz (Standard)",
      checkingService: "Connecting to the cloud RVC engine; no audio is uploaded…",
      serviceReady: "🟢 Cloud RVC engine is ready",
      serviceOffline: "The cloud RVC engine is reconnecting. Voice clips automatically fall back to on-device processing when the cloud is unavailable.",
      serviceLoading: "Loading model weights...",
      convert: "Convert now",
      converting: "Converting...",
      howtoTitle: "How it works",
      howtoOne: "Pick a character voice on the left.",
      howtoTwo: "Upload your recording or record with microphone.",
      howtoThree: "Click “Convert now”, wait for local inference, then listen and download.",
      tipsTitle: "Tips",
      resultTitle: "Result",
      download: "Download result",
      resultDisclosure: "Cloud input is deleted after the task. Output remains available for up to about two hours after completion.",
      resultMeta: "Voice: {model} · Pitch: {pitch} · Time: {elapsed}s · Cloud RVC engine",
      analyzing: "Analyzing audio…",
      analysisReady: "Audio ready: {name} · Duration {duration} · Ready to convert.",
      invalidFile: "Choose a valid WAV, MP3, M4A, OGG, or WebM file.",
      fileTooLarge: "File exceeds 25 MB limit.",
      audioTooShort: "Audio is too short (under 0.5s).",
      audioShortWarn: "Audio under 2s may sound robotic. Longer speech is recommended.",
      audioTooLong: "Current limits: 20 minutes for published on-device voices, 10 minutes for cloud, 20 seconds for imported models. Switch modes or trim the audio.",
      decodeFailed: "Could not decode audio. Try converting to standard MP3 or WAV.",
      missingModel: "Pick a character voice first.",
      missingAudio: "Upload or record your voice first.",
      generationFailed: "Conversion failed. Please try a shorter audio clip.",
      selectedModel: "Voice selected: {name}.",
      noModels: "No character models available.",
      tips: [
        "Use a clear, quiet single-person vocal recording.",
        "Use voice mode for dry vocals and song mode for a track with accompaniment.",
        "Audio is uploaded only after Convert; source files are deleted after processing and outputs expire shortly.",
      ],
    },
  };

  const EMBEDDED_BASE_MODELS = {
    hubert: {
      name: "hubert.onnx",
      manifestKey: "hubert.onnx",
      chunks: Array.from({ length: 19 }, (_, i) => `models/base/hubert/chunk_${i}.bin`)
    },
    rmvpe: {
      name: "rmvpe.onnx",
      manifestKey: "rmvpe.onnx",
      chunks: Array.from({ length: 18 }, (_, i) => `models/base/rmvpe/chunk_${i}.bin`)
    }
  };

  const EMBEDDED_RVC_CATALOG = [
  {
    "id": "arona",
    "name": "阿罗娜 (Arona)",
    "avatarText": "阿罗娜",
    "description": "联邦学生会什亭之匣 · 明亮轻快导航员声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "什亭之匣"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1nRIkq1AHzR",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/Arona_President.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "152ce87951192224b08efdedf2b487fb57509420626437df7d21ef2c74307118",
    "indexSha256": "735227b51d2928509a15aeb3ccb3415188a979138b93bc0b597013986dda7377",
    "retrieval": "models/characters/arona/retrieval.bin",
    "chunks": [
      "models/characters/arona/chunk_0.bin",
      "models/characters/arona/chunk_1.bin",
      "models/characters/arona/chunk_2.bin",
      "models/characters/arona/chunk_3.bin",
      "models/characters/arona/chunk_4.bin",
      "models/characters/arona/chunk_5.bin"
    ]
  },
  {
    "id": "arisu",
    "name": "天童爱丽丝 (Arisu)",
    "avatarText": "爱丽丝",
    "description": "千年游戏开发部 · 清亮机械勇者少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/8IG",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/TendouAlice.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "2ec7e8c4050c06b1ad2964695ed40d2deab9d8f8c43065f3ffbdf70e02c016cf",
    "indexSha256": "1dcef1f47371b506051ad30c476b0fa6fcd291ac38dd5e5924baeb203d848240",
    "retrieval": "models/characters/arisu/retrieval.bin",
    "chunks": [
      "models/characters/arisu/chunk_0.bin",
      "models/characters/arisu/chunk_1.bin",
      "models/characters/arisu/chunk_2.bin",
      "models/characters/arisu/chunk_3.bin",
      "models/characters/arisu/chunk_4.bin",
      "models/characters/arisu/chunk_5.bin"
    ]
  },
  {
    "id": "shiroko",
    "name": "砂狼白子 (Shiroko)",
    "avatarText": "白子",
    "description": "阿拜多斯对策委员会 · 沉稳清冷少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "阿拜多斯"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1nJAISi8n53",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/SunaookamiShiroko.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "f0f672b2251fff17fe801531e18c38fa9902d387cb45c7c0c687cf9184a4360c",
    "indexSha256": "fc78b75cf68bbba4130867b8082c2b3a1ab27faaf21d271d824c835d853a62a1",
    "retrieval": "models/characters/shiroko/retrieval.bin",
    "chunks": [
      "models/characters/shiroko/chunk_0.bin",
      "models/characters/shiroko/chunk_1.bin",
      "models/characters/shiroko/chunk_2.bin",
      "models/characters/shiroko/chunk_3.bin",
      "models/characters/shiroko/chunk_4.bin",
      "models/characters/shiroko/chunk_5.bin"
    ]
  },
  {
    "id": "hoshino",
    "name": "小鸟游星野 (Hoshino)",
    "avatarText": "星野",
    "description": "阿拜多斯对策委员会 · 慵懒柔和少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "阿拜多斯"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1nHTeq4owIB",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/TakanashiHoshino.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "56cc39ce5a4042ec0954fe1a47f8d30b1900f6fb185ba28a161397762aa52230",
    "indexSha256": "d287b69451c5d2725ccf4e51942d032a6aff252ddcb4b46ad68f96dc515be544",
    "retrieval": "models/characters/hoshino/retrieval.bin",
    "chunks": [
      "models/characters/hoshino/chunk_0.bin",
      "models/characters/hoshino/chunk_1.bin",
      "models/characters/hoshino/chunk_2.bin",
      "models/characters/hoshino/chunk_3.bin",
      "models/characters/hoshino/chunk_4.bin",
      "models/characters/hoshino/chunk_5.bin"
    ]
  },
  {
    "id": "yuuka",
    "name": "早濑优香 (Yuuka)",
    "avatarText": "优香",
    "description": "千年研讨会 · 清晰理智少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1nHTIILWUmw",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/HayaseYuuka.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "bdd7b78638e95ad2f6ca5995408721bc7f058374ace8ba3fe51da2982d5f1986",
    "indexSha256": "154e86b7e0ffbf570048860fb10f7ba8a7bd3e14d9fe4cd211560e9c784950c9",
    "retrieval": "models/characters/yuuka/retrieval.bin",
    "chunks": [
      "models/characters/yuuka/chunk_0.bin",
      "models/characters/yuuka/chunk_1.bin",
      "models/characters/yuuka/chunk_2.bin",
      "models/characters/yuuka/chunk_3.bin",
      "models/characters/yuuka/chunk_4.bin",
      "models/characters/yuuka/chunk_5.bin"
    ]
  },
  {
    "id": "hina",
    "name": "空崎日奈 (Hina)",
    "avatarText": "日奈",
    "description": "格黑娜风纪委员会 · 沉稳有力少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "格黑娜"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1uY0qGj0jOZ",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/SorasakiHina.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "ebc6edcb2b657f57937156eff878e51bf392d7c9c65c3d23a7aef7eb2f3eaf16",
    "indexSha256": "189e199f6e33ddfca5e1c6351bcc331dc3a71a0680ad7565ef6d05c3b07c593a",
    "retrieval": "models/characters/hina/retrieval.bin",
    "chunks": [
      "models/characters/hina/chunk_0.bin",
      "models/characters/hina/chunk_1.bin",
      "models/characters/hina/chunk_2.bin",
      "models/characters/hina/chunk_3.bin",
      "models/characters/hina/chunk_4.bin",
      "models/characters/hina/chunk_5.bin"
    ]
  },
  {
    "id": "noa",
    "name": "生盐诺亚 (Noa)",
    "avatarText": "诺亚",
    "description": "千年研讨会 · 温和从容少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/?q=Ushio+Noa",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/UshioNoa.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "4f0d38867fafc07487026981175d2eefb2d28a9c731dcdbab808b41bc069016d",
    "indexSha256": "a2baefac31b22c26474b57f9e15ffd09b0e5248ffee8a48a7a69234302b4ee94",
    "retrieval": "models/characters/noa/retrieval.bin",
    "chunks": [
      "models/characters/noa/chunk_0.bin",
      "models/characters/noa/chunk_1.bin",
      "models/characters/noa/chunk_2.bin",
      "models/characters/noa/chunk_3.bin",
      "models/characters/noa/chunk_4.bin",
      "models/characters/noa/chunk_5.bin"
    ]
  },
  {
    "id": "koharu",
    "name": "下江小春 (Koharu)",
    "avatarText": "小春",
    "description": "三一补课部 · 明亮紧张少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1l8t96WteuX",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/ShimoeKoharu.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "ec375a8ccae860747f2e9e06f80f92127502550c8e89fa44b9e70af5ac3db57d",
    "indexSha256": "507b54bb32721696ea3850a53eff9965a601bfa37f85fa4cefb29998740d9cef",
    "retrieval": "models/characters/koharu/retrieval.bin",
    "chunks": [
      "models/characters/koharu/chunk_0.bin",
      "models/characters/koharu/chunk_1.bin",
      "models/characters/koharu/chunk_2.bin",
      "models/characters/koharu/chunk_3.bin",
      "models/characters/koharu/chunk_4.bin",
      "models/characters/koharu/chunk_5.bin"
    ]
  },
  {
    "id": "momoi",
    "name": "才羽桃井 (Momoi)",
    "avatarText": "桃井",
    "description": "千年游戏开发部 · 活泼高能少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1m9xfSNza5Q",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/SaibaMomoi.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "a500a4987abb793783ac2a54ff96908c31eb61fa1d0ca25b33a149c46ac81aeb",
    "indexSha256": "367e1103527003a48ba5b1e5dd0f8b6b5a22b1b78fe352b1b88aeb8ea0e33258",
    "retrieval": "models/characters/momoi/retrieval.bin",
    "chunks": [
      "models/characters/momoi/chunk_0.bin",
      "models/characters/momoi/chunk_1.bin",
      "models/characters/momoi/chunk_2.bin",
      "models/characters/momoi/chunk_3.bin",
      "models/characters/momoi/chunk_4.bin",
      "models/characters/momoi/chunk_5.bin"
    ]
  },
  {
    "id": "midori",
    "name": "才羽绿 (Midori)",
    "avatarText": "绿",
    "description": "千年游戏开发部 · 轻柔克制少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/8IF",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/SaibaMidori.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "5d7c9728c94abb58dd3c5b0fc111550f4acb1ccb0fb3c713bf1ae04a7af86de1",
    "indexSha256": "3aabf9bd4633c705186f7b5d94d7317ee4e0adb7ae9f610eb1fb530a4d8ef7cb",
    "retrieval": "models/characters/midori/retrieval.bin",
    "chunks": [
      "models/characters/midori/chunk_0.bin",
      "models/characters/midori/chunk_1.bin",
      "models/characters/midori/chunk_2.bin",
      "models/characters/midori/chunk_3.bin",
      "models/characters/midori/chunk_4.bin",
      "models/characters/midori/chunk_5.bin"
    ]
  },
  {
    "id": "reisa",
    "name": "宇泽玲纱 (Reisa)",
    "avatarText": "玲纱",
    "description": "三一正义实现委员会 · 元气直率少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1leyy90dKiC",
    "source": "https://huggingface.co/spaces/andhikagg/rvc-blue-archive/tree/main/weights/blue-archive/uzawa-reisa",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "e0d4a0f14bf334cfb5009b6d9ee59ea540a8471934d8b9064d5990b10b81a18a",
    "indexSha256": "deb1cfff28cbd7e645decd2a7a3e79d4b8e05bbc8b32cefb7aec66c94b624b9d",
    "retrieval": "models/characters/reisa/retrieval.bin",
    "chunks": [
      "models/characters/reisa/chunk_0.bin",
      "models/characters/reisa/chunk_1.bin",
      "models/characters/reisa/chunk_2.bin",
      "models/characters/reisa/chunk_3.bin",
      "models/characters/reisa/chunk_4.bin",
      "models/characters/reisa/chunk_5.bin"
    ]
  },
  {
    "id": "yuzu",
    "name": "花冈柚子 (Yuzu)",
    "avatarText": "柚子",
    "description": "千年游戏开发部 · 纤细内向少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/8II",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/HanaokaYuzu.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "c8aa31f36a5ee5fae466217d3a6ed931e6512ed58f78f1ee535e52a7d22f1aec",
    "indexSha256": "0764aeed793827e30e8c4b7687a733acf27ed9afacbb3dbc0ac4353e45d634be",
    "retrieval": "models/characters/yuzu/retrieval.bin",
    "chunks": [
      "models/characters/yuzu/chunk_0.bin",
      "models/characters/yuzu/chunk_1.bin",
      "models/characters/yuzu/chunk_2.bin",
      "models/characters/yuzu/chunk_3.bin",
      "models/characters/yuzu/chunk_4.bin",
      "models/characters/yuzu/chunk_5.bin"
    ]
  },
  {
    "id": "toki",
    "name": "飞鸟马时 (Toki)",
    "avatarText": "时",
    "description": "千年 C&C · 冷静利落少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/?q=Asuma+Toki",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/AsumaToki.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "9e9b8deaa840620047a78c71f8aeb22fa46b4c12b43906ed0b9f20880928c939",
    "indexSha256": "2db922d0d1bfb4b911ecd5c81d9404560d6207e1efac060742c7491181a6da75",
    "retrieval": "models/characters/toki/retrieval.bin",
    "chunks": [
      "models/characters/toki/chunk_0.bin",
      "models/characters/toki/chunk_1.bin",
      "models/characters/toki/chunk_2.bin",
      "models/characters/toki/chunk_3.bin",
      "models/characters/toki/chunk_4.bin",
      "models/characters/toki/chunk_5.bin"
    ]
  },
  {
    "id": "asuna",
    "name": "一之濑明日奈 (Asuna)",
    "avatarText": "明日奈",
    "description": "千年 C&C · 开朗明亮少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/?q=Ichinose+Asuna",
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/resolve/main/IchinoseAsuna.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "3aba85f50b6817d58c26e5653b3d22c71a3cead759c0d1d709399cd80fd791b4",
    "indexSha256": "ba4c6becfc53c0d6c6d8b14c72913c5341d5bce4b678459ff983808d455b3ede",
    "retrieval": "models/characters/asuna/retrieval.bin",
    "chunks": [
      "models/characters/asuna/chunk_0.bin",
      "models/characters/asuna/chunk_1.bin",
      "models/characters/asuna/chunk_2.bin",
      "models/characters/asuna/chunk_3.bin",
      "models/characters/asuna/chunk_4.bin",
      "models/characters/asuna/chunk_5.bin"
    ]
  },
  {
    "id": "aru",
    "name": "陆八魔爱露 (Aru)",
    "avatarText": "爱露",
    "description": "格黑娜便利屋68 · 自信张扬少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "格黑娜"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/?q=Rikuhachima+Aru",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/RikuhachimaAru.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "a543c781358021d2436df894fda1605fed005209b8a28746b1d4d88c8ec01781",
    "indexSha256": "206816de6751786dc09a9bf5d76ba17c719ae40155bf5e2faae824133f632395",
    "retrieval": "models/characters/aru/retrieval.bin",
    "chunks": [
      "models/characters/aru/chunk_0.bin",
      "models/characters/aru/chunk_1.bin",
      "models/characters/aru/chunk_2.bin",
      "models/characters/aru/chunk_3.bin",
      "models/characters/aru/chunk_4.bin",
      "models/characters/aru/chunk_5.bin"
    ]
  },
  {
    "id": "kirara",
    "name": "夜樱绮罗罗 (Kirara)",
    "avatarText": "绮罗罗",
    "description": "格黑娜 · 明快外向少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "格黑娜"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1uYkgvbkX03",
    "source": "https://huggingface.co/RegalHyperus/MiscellaneousRVCModels/resolve/main/KiraraYozakuraJP.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "16af2edf48f9996112eb1888fe31d308ea9b63eb343068e26f5d5b6639d32142",
    "indexSha256": "2047677dc16cf48ae713b438e40c7bb039b0e64c6af6567cac93d6588bbd8cec",
    "retrieval": "models/characters/kirara/retrieval.bin",
    "chunks": [
      "models/characters/kirara/chunk_0.bin",
      "models/characters/kirara/chunk_1.bin",
      "models/characters/kirara/chunk_2.bin",
      "models/characters/kirara/chunk_3.bin",
      "models/characters/kirara/chunk_4.bin",
      "models/characters/kirara/chunk_5.bin"
    ]
  },
  {
    "id": "koyuki",
    "name": "黑崎小雪 (Koyuki)",
    "avatarText": "小雪",
    "description": "千年研讨会 · 俏皮高能少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 48000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1mwT3t4VMAr",
    "source": "https://huggingface.co/TokiBotan/KurosakiKoyukiRVCV2/resolve/main/KurosakiKoyuki.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "d73d3ce1403178bb064300a9cf3daa69c77dec4af686d42713754ef76eea032a",
    "indexSha256": "0f66eb4acd0e3b88ef4a4b36f7b64f5473df48b3cd75a1bc094daa739bd80f0a",
    "retrieval": "models/characters/koyuki/retrieval.bin",
    "chunks": [
      "models/characters/koyuki/chunk_0.bin",
      "models/characters/koyuki/chunk_1.bin",
      "models/characters/koyuki/chunk_2.bin",
      "models/characters/koyuki/chunk_3.bin",
      "models/characters/koyuki/chunk_4.bin",
      "models/characters/koyuki/chunk_5.bin"
    ]
  },
  {
    "id": "kayoko",
    "name": "鬼方佳世子 (Kayoko)",
    "avatarText": "佳世子",
    "description": "格黑娜便利屋68 · 低沉冷静少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "格黑娜"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1quuIua5L3T",
    "source": "https://huggingface.co/RegalHyperus/new-rvc-models/resolve/main/KayokoOnikataJP.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "bfe47515acd3372b29b4224e0c7d626def0806cec5b1d263969e8267860e8c42",
    "indexSha256": "12d47f208e26adc23db83855f7902ed9f98dc89f9ccb11f36bb1df3871438b69",
    "retrieval": "models/characters/kayoko/retrieval.bin",
    "chunks": [
      "models/characters/kayoko/chunk_0.bin",
      "models/characters/kayoko/chunk_1.bin",
      "models/characters/kayoko/chunk_2.bin",
      "models/characters/kayoko/chunk_3.bin",
      "models/characters/kayoko/chunk_4.bin",
      "models/characters/kayoko/chunk_5.bin"
    ]
  },
  {
    "id": "seia",
    "name": "百合园圣娅 (Seia)",
    "avatarText": "圣娅",
    "description": "三一茶话会 · 清柔平静少女声线 · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://voice-models.com/model/1ER9jCeaNm0",
    "source": "https://huggingface.co/sxndypz/rvc-v2-models/resolve/main/seia.zip",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "a3d27a43a7c58b369d868363c4557e65fc82fa2db7c86678f9058af189ab849b",
    "indexSha256": "1806c1f43a78f0b86360d794d743b6593df6082fc60f1b9e0516a53f7f3c4ce8",
    "retrieval": "models/characters/seia/retrieval.bin",
    "chunks": [
      "models/characters/seia/chunk_0.bin",
      "models/characters/seia/chunk_1.bin",
      "models/characters/seia/chunk_2.bin",
      "models/characters/seia/chunk_3.bin",
      "models/characters/seia/chunk_4.bin",
      "models/characters/seia/chunk_5.bin"
    ]
  },
  {
    "id": "mika",
    "name": "圣园未花 (Mika)",
    "avatarText": "未花",
    "description": "三一茶话会 · 甜亮而有力度的少女声线 · 32k · 公开社区 RVC v2",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一",
      "32k"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 32000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "marketplace": "https://huggingface.co/spaces/andhikagg/rvc-blue-archive/tree/main/weights/blue-archive/misono-mika",
    "source": "https://huggingface.co/spaces/andhikagg/rvc-blue-archive/tree/main/weights/blue-archive/misono-mika",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "0d8b3aa3ec3e768743d8b7ed4df1e66c9de89d985c873e45b15f2a588b3c8fd4",
    "indexSha256": "f0f95e71508bcc0d227e0d2eccff229939ace4f79e0b5e0e72ead7d2a12f30f1",
    "retrieval": "models/characters/mika/retrieval.bin",
    "chunks": [
      "models/characters/mika/chunk_0.bin",
      "models/characters/mika/chunk_1.bin",
      "models/characters/mika/chunk_2.bin",
      "models/characters/mika/chunk_3.bin",
      "models/characters/mika/chunk_4.bin",
      "models/characters/mika/chunk_5.bin"
    ]
  },
  {
    "id": "gojo",
    "name": "五条悟 (Satoru Gojo)",
    "avatarText": "五条悟",
    "description": "《咒术回战》· 清亮从容的成年男声 · 日语公开社区 RVC v2 · 48k / 600 epochs",
    "tags": [
      "男声",
      "咒术回战",
      "日语",
      "48k"
    ],
    "collectionId": "jujutsu-kaisen",
    "collectionName": "咒术回战",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域时小步调节，避免一次性大幅移调",
    "sampleRate": 48000,
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "marketplace": "https://voice-models.com/model/1ntfr5panFt",
    "source": "https://huggingface.co/Kuma6/Satoru-Gojo/resolve/main/Gojo.zip",
    "license": "Community model; creator requests credit; character/performer authorization unverified",
    "checkpointSha256": "8a473aaae82a9e7be0bbde859fc3b654c877b340fb002e462bbf5c68b38ab6fa",
    "indexSha256": "8e643bf9f1ee96e7eb954d9b1dd56cf7fa7bb1c6ec3d02580e394eab2368543",
    "retrieval": "models/characters/gojo/retrieval.bin",
    "chunks": [
      "models/characters/gojo/chunk_0.bin",
      "models/characters/gojo/chunk_1.bin",
      "models/characters/gojo/chunk_2.bin",
      "models/characters/gojo/chunk_3.bin",
      "models/characters/gojo/chunk_4.bin",
      "models/characters/gojo/chunk_5.bin"
    ]
  },
  {
    "id": "sukuna",
    "name": "两面宿傩 (Ryomen Sukuna)",
    "avatarText": "宿傩",
    "description": "《咒术回战》· 低沉强势的成年男声 · 日语公开社区 RVC v2 · 48k / 600 epochs",
    "tags": [
      "男声",
      "咒术回战",
      "日语",
      "48k"
    ],
    "collectionId": "jujutsu-kaisen",
    "collectionName": "咒术回战",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；低沉角色建议保留原调并控制输入峰值",
    "sampleRate": 48000,
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "marketplace": "https://voice-models.com/model/1nui7agzFO0",
    "source": "https://huggingface.co/Kuma6/Sukuna/resolve/main/Sukuna.zip",
    "license": "Community model; creator requests credit; character/performer authorization unverified",
    "checkpointSha256": "e66c9c880131788736b086badd8835fa1177b1a387ea9f1a530313496342516d",
    "indexSha256": "b10493894265c1692c9dde370a95e13703dac3a50d229b651c29215ddd80fd82",
    "retrieval": "models/characters/sukuna/retrieval.bin",
    "chunks": [
      "models/characters/sukuna/chunk_0.bin",
      "models/characters/sukuna/chunk_1.bin",
      "models/characters/sukuna/chunk_2.bin",
      "models/characters/sukuna/chunk_3.bin",
      "models/characters/sukuna/chunk_4.bin",
      "models/characters/sukuna/chunk_5.bin"
    ]
  },
  {
    "id": "geto",
    "name": "夏油杰 (Suguru Geto)",
    "avatarText": "夏油杰",
    "description": "《咒术回战》· 沉稳柔和的成年男声 · 日语公开社区 RVC v2 · 48k / 600 epochs",
    "tags": [
      "男声",
      "咒术回战",
      "日语",
      "48k"
    ],
    "collectionId": "jujutsu-kaisen",
    "collectionName": "咒术回战",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；平稳人声更利于保留角色质感",
    "sampleRate": 48000,
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "marketplace": "https://voice-models.com/model/1nsS1R5evxB",
    "source": "https://huggingface.co/Kuma6/Suguru-Geto/resolve/main/Geto.zip",
    "license": "Community model; creator requests credit; character/performer authorization unverified",
    "checkpointSha256": "29377d351b87e9873e71a6ea4fee2130a2b0222751494ff6c408ea21ac95094b",
    "indexSha256": "509f8327fb3b588ade669a253eddc0ffe3aa2b7a6aeb9205d1878676f916808e",
    "retrieval": "models/characters/geto/retrieval.bin",
    "chunks": [
      "models/characters/geto/chunk_0.bin",
      "models/characters/geto/chunk_1.bin",
      "models/characters/geto/chunk_2.bin",
      "models/characters/geto/chunk_3.bin",
      "models/characters/geto/chunk_4.bin",
      "models/characters/geto/chunk_5.bin"
    ]
  },
  {
    "id": "toji",
    "name": "伏黑甚尔 (Toji Fushiguro)",
    "avatarText": "甚尔",
    "description": "《咒术回战》· 粗粝有力的成年男声 · 日语公开社区 RVC v2 · 48k / 400 epochs",
    "tags": [
      "男声",
      "咒术回战",
      "日语",
      "48k"
    ],
    "collectionId": "jujutsu-kaisen",
    "collectionName": "咒术回战",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；高能输入会沿用既有峰值保护链",
    "sampleRate": 48000,
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "marketplace": "https://voice-models.com/model/1nqAeDDuwe6",
    "source": "https://huggingface.co/Kuma6/Toji-Fushiguro/resolve/main/Toji.zip",
    "license": "Community model; creator requests credit; character/performer authorization unverified",
    "checkpointSha256": "7f9da37feac47f5b6fd06962c01292253866528ecae5284a5693f1a07b887122",
    "indexSha256": "3ca686e1b45e2d76910cc0ec4e99be225837be7e984dc81062459e5f33545672",
    "retrieval": "models/characters/toji/retrieval.bin",
    "chunks": [
      "models/characters/toji/chunk_0.bin",
      "models/characters/toji/chunk_1.bin",
      "models/characters/toji/chunk_2.bin",
      "models/characters/toji/chunk_3.bin",
      "models/characters/toji/chunk_4.bin",
      "models/characters/toji/chunk_5.bin"
    ]
  },
  {
    "id": "megumi",
    "name": "伏黑惠 (Megumi Fushiguro)",
    "avatarText": "伏黑惠",
    "description": "《咒术回战》· 冷静克制的青年男声 · 日语公开社区 RVC v2 · 48k / 400 epochs",
    "tags": [
      "男声",
      "咒术回战",
      "日语",
      "48k"
    ],
    "collectionId": "jujutsu-kaisen",
    "collectionName": "咒术回战",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；使用清晰近讲人声效果更稳定",
    "sampleRate": 48000,
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "marketplace": "https://voice-models.com/model/1nqEz5uruf5",
    "source": "https://huggingface.co/Kuma6/Megumi-Fushiguro/resolve/main/Megumi.zip",
    "license": "Community model; creator requests credit; character/performer authorization unverified",
    "checkpointSha256": "5607805eca963f7cffd25962ecdd47366ba38377cccdca254bd1a4c7c871424f",
    "indexSha256": "3cb0baec983878498ba311bc861a0677d35125c400bf89a3c5ef8c1a037aa7e5",
    "retrieval": "models/characters/megumi/retrieval.bin",
    "chunks": [
      "models/characters/megumi/chunk_0.bin",
      "models/characters/megumi/chunk_1.bin",
      "models/characters/megumi/chunk_2.bin",
      "models/characters/megumi/chunk_3.bin",
      "models/characters/megumi/chunk_4.bin",
      "models/characters/megumi/chunk_5.bin"
    ]
  },
  {
    "id": "key",
    "name": "天童凯伊 (Kei)",
    "avatarText": "凯伊",
    "description": "千年科学学园 · 特异现象调查部 · 冷静锐利少女声线 · 本站训练 RVC v2 · 40k / 80 epochs",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年",
      "RVC v2"
    ],
    "collectionId": "blue-archive",
    "collectionName": "蔚蓝档案",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；高音或快速变调会自动使用更稳的音高提取分支",
    "sampleRate": 40000,
    "noiseScale": 0.3,
    "defaultIndexRate": 0.26,
    "source": "https://bluearchive.fandom.com/wiki/Tendou_Kei/Audio",
    "license": "Character voice copyright and model-training authorization unverified",
    "checkpointSha256": "be27f3fdc4baf71fd6ce305ea4c08667641cc87318ea42239cfbd43dbc608251",
    "indexSha256": "9bd81dd0531a64b835c9b56df909b5939d3cd258e10b69b0a05826001fb88741",
    "datasetProvenanceSha256": "0e1fd6bf67c90732e20a64facf5c7866ff5a3883882c682868190b29cebdbd1c",
    "modelVersion": "8f2fdbf48395:80e:key-wiki-0e1fd6bf67c9",
    "retrieval": "models/characters/key/retrieval.bin",
    "chunks": [
      "models/characters/key/chunk_0.bin",
      "models/characters/key/chunk_1.bin",
      "models/characters/key/chunk_2.bin",
      "models/characters/key/chunk_3.bin",
      "models/characters/key/chunk_4.bin",
      "models/characters/key/chunk_5.bin"
    ]
  },
  {
    "id": "nonomi",
    "name": "十六夜野乃美 (Nonomi)",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/IzayoiNonomi.zip",
    "sampleRate": 40000,
    "checkpointSha256": "0c5acc244323d4f455b6a7f6b74e6e7d60504c3e0eb3e21065af01c5deae6b18",
    "indexSha256": "2c9a63fe0d2e06b6c48f9dc0e4cc545cb871c7ba99f687ea7945ccf2a4a77033",
    "avatarText": "野乃美",
    "description": "阿拜多斯对策委员会 · 日语社区 RVC v2 声线",
    "tags": [
      "女声",
      "蔚蓝档案",
      "阿拜多斯"
    ],
    "collectionId": "blue-archive",
    "collectionName": "蔚蓝档案",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请先试听小幅调整",
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "license": "Community model; character/performer authorization unverified",
    "retrieval": "models/characters/nonomi/retrieval.bin",
    "chunks": [
      "models/characters/nonomi/chunk_0.bin",
      "models/characters/nonomi/chunk_1.bin",
      "models/characters/nonomi/chunk_2.bin",
      "models/characters/nonomi/chunk_3.bin",
      "models/characters/nonomi/chunk_4.bin",
      "models/characters/nonomi/chunk_5.bin"
    ]
  },
  {
    "id": "serika",
    "name": "黑见芹香 (Serika)",
    "source": "https://huggingface.co/spaces/Ilzhabimantara/rvc-Blue-archives-hoyogames/resolve/main/weights/blue-archive/kuromi-serika/",
    "sampleRate": 40000,
    "checkpointSha256": "725d93fac82e864fb9b01042698832c55b574a8b8cbdc5cf14cc30821c08bc71",
    "indexSha256": "bcd3754e79195175628d54d614768d9c6458c25b325ae75782b7edf4417af834",
    "avatarText": "芹香",
    "description": "阿拜多斯对策委员会 · 日语社区 RVC v2 声线",
    "tags": [
      "女声",
      "蔚蓝档案",
      "阿拜多斯"
    ],
    "collectionId": "blue-archive",
    "collectionName": "蔚蓝档案",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请先试听小幅调整",
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "license": "Community model; character/performer authorization unverified",
    "retrieval": "models/characters/serika/retrieval.bin",
    "chunks": [
      "models/characters/serika/chunk_0.bin",
      "models/characters/serika/chunk_1.bin",
      "models/characters/serika/chunk_2.bin",
      "models/characters/serika/chunk_3.bin",
      "models/characters/serika/chunk_4.bin",
      "models/characters/serika/chunk_5.bin"
    ]
  },
  {
    "id": "ayane",
    "name": "奥空绫音 (Ayane)",
    "source": "https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/OkusoraAyane.zip",
    "sampleRate": 40000,
    "checkpointSha256": "9953556bf704f41478c0ca902097dc17005c1a655232a06e91c375d47fb0ddc5",
    "indexSha256": "37d5dd684d15ff99b7760cf8bca895ceff52978aa3322818cf5052a0dbe1eff1",
    "avatarText": "绫音",
    "description": "阿拜多斯对策委员会 · 日语社区 RVC v2 声线",
    "tags": [
      "女声",
      "蔚蓝档案",
      "阿拜多斯"
    ],
    "collectionId": "blue-archive",
    "collectionName": "蔚蓝档案",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请先试听小幅调整",
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "license": "Community model; character/performer authorization unverified",
    "retrieval": "models/characters/ayane/retrieval.bin",
    "chunks": [
      "models/characters/ayane/chunk_0.bin",
      "models/characters/ayane/chunk_1.bin",
      "models/characters/ayane/chunk_2.bin",
      "models/characters/ayane/chunk_3.bin",
      "models/characters/ayane/chunk_4.bin",
      "models/characters/ayane/chunk_5.bin"
    ]
  },
  {
    "id": "maki",
    "name": "小涂真纪 (Maki)",
    "source": "https://www.101soundboards.com/tts/1034740-konuri-maki-blue-archive-sq-tts-text-to-speech/download_model",
    "sampleRate": 40000,
    "rvcVersion": "v1",
    "supportsDevice": false,
    "checkpointSha256": "170a9e6e3f7c79c0eb82f3aa0d8dfad5325e593582386bcac07a46cbc4e51f70",
    "indexSha256": "9576619fa1375174ad1d239769c2ea4049c46ecd295b046a28a21ac2e2a939ed",
    "avatarText": "真纪",
    "description": "千年科学学园 · 仅服务端转换 · 日语社区 RVC 声线",
    "tags": [
      "女声",
      "蔚蓝档案",
      "千年"
    ],
    "collectionId": "blue-archive",
    "collectionName": "蔚蓝档案",
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请先试听小幅调整",
    "noiseScale": 0.3,
    "defaultIndexRate": 0.3,
    "license": "Community model; character/performer authorization unverified",
    "retrieval": "models/characters/maki/retrieval.bin",
    "chunks": [
      "models/characters/maki/chunk_0.bin",
      "models/characters/maki/chunk_1.bin",
      "models/characters/maki/chunk_2.bin",
      "models/characters/maki/chunk_3.bin",
      "models/characters/maki/chunk_4.bin",
      "models/characters/maki/chunk_5.bin"
    ]
  }
];

  function readCloudSubmissionTimestamp(storage, now = Date.now()) {
    try {
      const target = storage || globalThis.localStorage;
      const timestamp = Number(target?.getItem(RVC_SUBMISSION_STORAGE_KEY));
      return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now + RVC_SUBMISSION_COOLDOWN_MS
        ? timestamp
        : 0;
    } catch {
      return 0;
    }
  }

  function persistCloudSubmissionTimestamp(timestamp, storage) {
    try {
      const target = storage || globalThis.localStorage;
      target?.setItem(RVC_SUBMISSION_STORAGE_KEY, String(timestamp));
    } catch {
      // Private browsing and embedded WebViews may disable persistent storage.
    }
  }

  const CHARACTER_SAMPLE_RATES = Object.freeze({
    koyuki: 48000,
    mika: 32000,
  });

  function normalizeCharacterRuntimeConfig(model) {
    if (!model || String(model.id || "").startsWith("own:")) return model;
    const tags = Array.isArray(model.tags) ? model.tags : [];
    const inferredCollectionName = model.trained === true
      ? "我的训练模型"
      : tags.includes("咒术回战")
        ? "咒术回战"
        : tags.includes("蔚蓝档案")
          ? "蔚蓝档案"
          : "其他角色";
    const collectionName = String(model.collectionName || inferredCollectionName).trim() || inferredCollectionName;
    const inferredCollectionId = tags.includes("咒术回战")
      ? "jujutsu-kaisen"
      : tags.includes("蔚蓝档案")
        ? "blue-archive"
        : model.trained === true
          ? `trained:${collectionName}`
          : "other";
    const configuredCollectionId = String(model.collectionId || "").trim();
    return {
      ...model,
      collectionId: model.trained === true && (!configuredCollectionId || configuredCollectionId === "trained")
        ? `trained:${collectionName}`
        : (configuredCollectionId || inferredCollectionId),
      collectionName,
      sampleRate: Number(model.sampleRate) || CHARACTER_SAMPLE_RATES[model.id] || 40000,
      retrieval: model.retrieval || `models/characters/${model.id}/retrieval.bin`,
      noiseScale: Number.isFinite(Number(model.noiseScale)) ? Number(model.noiseScale) : 0.5,
      defaultIndexRate: Number.isFinite(Number(model.defaultIndexRate)) ? Number(model.defaultIndexRate) : 0.3,
    };
  }

  const state = {
    lang: "zh",
    inferenceMode: "official", // "official" = 云端 RVC 引擎 | "local" = 浏览器本地兼容模式
    officialEndpoint: "",
    officialReady: false,
    // null means the network probe was inconclusive.  It must not lock users
    // out of a direct cloud conversion, especially on slower cross-border
    // mobile routes.
    engineReady: null,
    engineInfo: null,
    cloudProbe: null,
    busy: false,
    selectedModelId: "hoshino",
    audio: null, // { file, buffer, float32, sampleRate, name, duration }
    sourceMode: "upload",
    ttsEnabled: false,
    ttsLoading: false,
    ttsAdapting: false,
    recording: false,
    mediaRecorder: null,
    pcmRecorder: null,
    recordChunks: [],
    recordStream: null,
    recordPreviewUrl: "",
    recordStartAt: 0,
    recordTimerId: 0,
    catalog: EMBEDDED_RVC_CATALOG.map(normalizeCharacterRuntimeConfig),
    baseModels: EMBEDDED_BASE_MODELS,
    rvcContext: null,
    resultUrl: "",
    trainingFiles: [],
    trainingJob: null,
    activeCollectionId: "blue-archive",
    customCollections: [],
    audioMode: "voice",
    lastCloudSubmissionAt: readCloudSubmissionTimestamp(),
  };

  function modelDownloadConcurrency(nav = globalThis.navigator) {
    const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    const effectiveType = String(connection?.effectiveType || "").toLowerCase();
    if (connection?.saveData === true || effectiveType === "slow-2g" || effectiveType === "2g") return 3;
    const cores = Math.max(1, Number(nav?.hardwareConcurrency) || 4);
    const mobile = MOBILE_AUDIO_USER_AGENT.test(String(nav?.userAgent || ""));
    if (!mobile && cores >= 8) return 8;
    if (cores >= 4) return 6;
    return 4;
  }

  // A fast desktop can keep more independent model fragments in flight while
  // constrained phones avoid opening enough streams to starve the UI thread.
  class ConcurrencyPool {
    constructor(limit = 5) {
      this.limit = limit;
      this.running = 0;
      this.queue = [];
    }
    async run(fn) {
      if (this.running >= this.limit) {
        await new Promise((resolve) => this.queue.push(resolve));
      }
      this.running++;
      try {
        return await fn();
      } finally {
        this.running--;
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          next();
        }
      }
    }
  }

  const activeModelDownloadConcurrency = modelDownloadConcurrency();
  const globalDownloadPool = new ConcurrencyPool(activeModelDownloadConcurrency);

  // IndexedDB Persistent Storage for Instant 0-second reloads & Resumable Downloads
  const DB_NAME = "rvc_web_models_v5_db";
  const STORE_NAME = "model_blobs";
  const CHARACTER_MODEL_ASSET_VERSION = "20260830-v35";

  function characterModelCacheKey(model) {
    const id = String(model?.id || "character");
    return id.startsWith("own:")
      ? `${id}.onnx`
      : `${id}.${CHARACTER_MODEL_ASSET_VERSION}.onnx`;
  }

  function versionCharacterChunkPath(path) {
    const separator = String(path).includes("?") ? "&" : "?";
    return `${path}${separator}model=${CHARACTER_MODEL_ASSET_VERSION}`;
  }

  function retrievalCacheKey(model) {
    return `${model.id}.${CHARACTER_MODEL_ASSET_VERSION}.retrieval.bin`;
  }

  function deriveStableNoiseSeed(audio, modelId) {
    let hash = 2166136261;
    const id = String(modelId || "character");
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const samples = audio instanceof Float32Array ? audio : new Float32Array(0);
    const step = Math.max(1, Math.floor(samples.length / 4096));
    for (let i = 0; i < samples.length; i += step) {
      const quantized = Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767);
      hash ^= quantized & 255;
      hash = Math.imul(hash, 16777619);
      hash ^= quantized >>> 8 & 255;
      hash = Math.imul(hash, 16777619);
    }
    hash ^= samples.length;
    return hash >>> 0 || 20260821;
  }

  function openModelDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
  }

  async function getCachedItem(key) {
    try {
      const db = await openModelDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function setCachedItem(key, val) {
    try {
      const db = await openModelDB();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(val, key);
    } catch (e) {}
  }

  async function removeCachedItem(key) {
    try {
      const db = await openModelDB();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
    } catch (e) {}
  }

  // Multi-CDN Candidate URLs for any relative chunk path (CORS-Enabled Live-Tested Fast Mirror Order in China)
  function getChunkMirrorUrls(relPath) {
    const cleanPath = relPath.startsWith("/") ? relPath.slice(1) : relPath;
    const sameOriginUrl = new URL(cleanPath, window.location.href).href;
    const rawGhUrl = `https://raw.githubusercontent.com/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/${cleanPath}`;
    return [
      sameOriginUrl,
      `https://fastly.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://cdn.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://gcore.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://testingcf.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://cdn.jsdmirror.com/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://gh-proxy.com/${rawGhUrl}`,
      rawGhUrl,
    ];
  }

  // Fetch single chunk with Multi-Node Concurrent Racing, Chunk-Level Resumption, Live Streaming & Inactivity Timeout
  async function fetchSingleChunkWithFallback(chunkPath, chunkIndex, totalChunks, onChunkProgress) {
    const chunkCacheKey = `chunk:${chunkPath}`;
    const cachedBuf = await getCachedItem(chunkCacheKey);
    if (cachedBuf instanceof ArrayBuffer && cachedBuf.byteLength > 0) {
      if (typeof onChunkProgress === "function") {
        onChunkProgress(cachedBuf.byteLength);
      }
      return { buffer: cachedBuf, fromCache: true };
    }

    const mirrors = getChunkMirrorUrls(chunkPath);

    const fetchWithProgress = async (url, raceSignal) => {
      const controller = new AbortController();
      let activityTimer = setTimeout(() => controller.abort(), 18000); // 18s inactivity watchdog
      const abortFromRace = () => controller.abort();
      if (raceSignal?.aborted) controller.abort();
      else raceSignal?.addEventListener("abort", abortFromRace, { once: true });

      const resetActivity = () => {
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => controller.abort(), 18000);
      };

      try {
        const resp = await fetch(url, { signal: controller.signal, cache: "force-cache" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const reader = resp.body ? resp.body.getReader() : null;
        if (!reader) {
          const buf = await resp.arrayBuffer();
          clearTimeout(activityTimer);
          if (buf && buf.byteLength > 0) {
            if (typeof onChunkProgress === "function") onChunkProgress(buf.byteLength);
            return buf;
          }
          throw new Error("Empty buffer");
        }

        const chunks = [];
        let receivedBytes = 0;
        while (true) {
          resetActivity();
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedBytes += value.length;
          if (typeof onChunkProgress === "function") {
            onChunkProgress(receivedBytes);
          }
        }
        clearTimeout(activityTimer);

        const combined = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const c of chunks) {
          combined.set(c, offset);
          offset += c.length;
        }
        return combined.buffer;
      } catch (err) {
        clearTimeout(activityTimer);
        throw err;
      } finally {
        raceSignal?.removeEventListener("abort", abortFromRace);
      }
    };

    const delayedFetch = (url, delayMs, signal) => new Promise((resolve, reject) => {
      let timer = 0;
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Mirror race cancelled", "AbortError"));
      };
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) return abort();
        fetchWithProgress(url, signal).then(resolve, reject);
      }, delayMs);
    });

    const raceMirrorGroup = async (indices) => {
      const controller = new AbortController();
      const delays = [0, 450, 1200];
      try {
        const buffer = await Promise.any(indices.map((index, order) => (
          delayedFetch(mirrors[index], delays[order] || 0, controller.signal)
        )));
        controller.abort();
        return buffer;
      } finally {
        controller.abort();
      }
    };

    let winningBuffer = null;
    let lastError = null;

    // Race distinct mirror groups, but abort every losing transfer as soon as a
    // complete fragment arrives. The previous Promise.any implementation left
    // two duplicate 20 MiB downloads running for every winning fragment.
    const mirrorGroups = [[0, 1, 5], [2, 3, 4], [6, 7, 0]];
    for (let attempt = 0; attempt < mirrorGroups.length; attempt++) {
      try {
        winningBuffer = await raceMirrorGroup(mirrorGroups[attempt]);
        if (winningBuffer && winningBuffer.byteLength > 0) break;
      } catch (raceErr) {
        lastError = raceErr;
        if (attempt < mirrorGroups.length - 1) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    if (!winningBuffer || winningBuffer.byteLength === 0) {
      throw new Error(`无法从所有镜像节点下载分片 ${chunkIndex + 1}/${totalChunks} (${lastError?.message || "网络波动"})`);
    }

    // Persist chunk immediately for resumable downloads
    await setCachedItem(chunkCacheKey, winningBuffer);

    if (typeof onChunkProgress === "function") {
      onChunkProgress(winningBuffer.byteLength);
    }
    return { buffer: winningBuffer, fromCache: false };
  }

  // Fetch Chunked Model with Concurrency Pool & Real-Time Granular Progress
  async function fetchChunkedModel(chunkUrls, name, displayName, mimeType, onProgress) {
    const cached = await getCachedItem(name);
    if (cached instanceof Blob && cached.size > 1024 * 1024) {
      if (typeof onProgress === "function") {
        onProgress(cached.size, cached.size, chunkUrls.length, chunkUrls.length, true, `⚡ ${displayName} 已从本地闪存极速就绪`);
      }
      return new File([cached], name, { type: mimeType });
    }

    const urls = Array.isArray(chunkUrls) ? chunkUrls : [chunkUrls];
    const totalCount = urls.length;
    const blobParts = new Array(totalCount);
    const chunkBytesLoaded = new Float32Array(totalCount);
    let completedCount = 0;
    const estimatedTotalBytes = totalCount * 20 * 1024 * 1024;

    const reportProgress = () => {
      let totalLoaded = 0;
      for (let i = 0; i < totalCount; i++) totalLoaded += chunkBytesLoaded[i];
      if (typeof onProgress === "function") {
        const msg = `⏳ [1/4] 正在下载 ${displayName}: 分片 ${completedCount}/${totalCount} (${(totalLoaded/1024/1024).toFixed(1)}MB / ${(estimatedTotalBytes/1024/1024).toFixed(1)}MB) · ${activeModelDownloadConcurrency} 线程断点极速加速中`;
        onProgress(totalLoaded, estimatedTotalBytes, completedCount, totalCount, false, msg);
      }
    };

    reportProgress();

    const tasks = urls.map((u, idx) => {
      return globalDownloadPool.run(async () => {
        const { buffer } = await fetchSingleChunkWithFallback(
          u,
          idx,
          totalCount,
          (bytesLoaded) => {
            chunkBytesLoaded[idx] = Math.max(chunkBytesLoaded[idx], bytesLoaded);
            reportProgress();
          }
        );
        blobParts[idx] = buffer;
        chunkBytesLoaded[idx] = buffer.byteLength;
        completedCount++;
        reportProgress();
      });
    });

    await Promise.all(tasks);

    const fullBlob = new Blob(blobParts, { type: mimeType });
    try {
      await setCachedItem(name, fullBlob);
      // Clean up individual chunk entries to keep storage compact
      for (const u of urls) {
        removeCachedItem(`chunk:${u}`).catch(() => {});
      }
    } catch (e) {
      console.warn("Could not save to IndexedDB cache:", e);
    }
    return new File([fullBlob], name, { type: mimeType });
  }

  async function loadModelAuto(modelConfig, name, displayName, mimeType, onProgress) {
    const cached = await getCachedItem(name);
    if (cached instanceof Blob && cached.size > 1024 * 1024) {
      if (typeof onProgress === "function") {
        onProgress(cached.size, cached.size, 1, 1, true, `⚡ ${displayName} 已从本地闪存秒级就绪`);
      }
      return new File([cached], name, { type: mimeType });
    }

    let chunks = modelConfig?.chunks;
    if (!Array.isArray(chunks) || chunks.length === 0) {
      if (name.includes("hubert")) chunks = EMBEDDED_BASE_MODELS.hubert.chunks;
      else if (name.includes("rmvpe")) chunks = EMBEDDED_BASE_MODELS.rmvpe.chunks;
      else {
        const found = EMBEDDED_RVC_CATALOG.find((m) => name.includes(m.id));
        if (found) chunks = found.chunks;
      }
    }

    if (Array.isArray(chunks) && chunks.length > 0) {
      const isPublishedCharacter = Boolean(modelConfig?.id) && !String(modelConfig.id).startsWith("own:");
      const fetchChunks = isPublishedCharacter
        ? chunks.map(versionCharacterChunkPath)
        : chunks;
      return await fetchChunkedModel(fetchChunks, name, displayName || name, mimeType, onProgress);
    }

    const urls = modelConfig?.urls || (typeof modelConfig === "string" ? [modelConfig] : [name]);
    return await fetchWithCache(urls, name, mimeType, onProgress);
  }

  async function fetchWithCache(urlOrUrls, name, mimeType, onProgress) {
    const urls = Array.isArray(urlOrUrls) ? urlOrUrls.filter(Boolean) : [urlOrUrls];
    for (const u of urls) {
      const cached = await getCachedItem(u);
      if (cached instanceof Blob) {
        return new File([cached], name, { type: mimeType });
      }
    }

    let lastErr = null;
    for (const u of urls) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(u, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentLength = res.headers.get("content-length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        if (!res.body || !total) {
          const blob = await res.blob();
          await setCachedItem(u, blob);
          return new File([blob], name, { type: mimeType });
        }

        const reader = res.body.getReader();
        let loaded = 0;
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          if (typeof onProgress === "function") {
            onProgress(loaded, total);
          }
        }
        const blob = new Blob(chunks, { type: mimeType });
        await setCachedItem(u, blob);
        return new File([blob], name, { type: mimeType });
      } catch (err) {
        clearTimeout(timeoutId);
        lastErr = err;
        console.warn(`Fetch ${name} from ${u} failed:`, err);
      }
    }
    throw new Error(`Failed to fetch ${name} from available sources (${lastErr?.message || "network error"})`);
  }

  function t(key, vars = {}) {
    const dict = translations[state.lang] || translations.zh;
    let text = dict[key] || translations.zh[key] || key;
    if (typeof text === "string") {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  }

  function resolveRvcLanguage() {
    const documentLanguage = String(document.documentElement?.lang || "").toLowerCase();
    if (documentLanguage.startsWith("en")) return "en";
    if (documentLanguage.startsWith("zh")) return "zh";
    try {
      return window.localStorage.getItem("postprep-language") === "en" ? "en" : "zh";
    } catch {
      return "zh";
    }
  }

  function applyRvcLanguage() {
    state.lang = resolveRvcLanguage();
    document.querySelectorAll("[data-rvc-i18n]").forEach((element) => {
      const key = element.dataset.rvcI18n;
      if (key && Object.prototype.hasOwnProperty.call(translations[state.lang] || {}, key)) {
        element.textContent = t(key);
      }
    });
    document.querySelectorAll("[data-rvc-i18n-placeholder]").forEach((element) => {
      const key = element.dataset.rvcI18nPlaceholder;
      if (key && Object.prototype.hasOwnProperty.call(translations[state.lang] || {}, key)) {
        element.setAttribute("placeholder", t(key));
      }
    });
    const tips = document.querySelector('[data-rvc-list="tips"]');
    const localizedTips = translations[state.lang]?.tips;
    if (tips && Array.isArray(localizedTips)) {
      tips.innerHTML = localizedTips
        .map((tip) => `<li class="flex gap-3"><i class="fa-solid fa-check mt-1 text-brand" aria-hidden="true"></i><span>${escapeHtml(tip)}</span></li>`)
        .join("");
    }
    document.title = state.lang === "en" ? "AI Voice Changer | PostPrep" : "AI 变声器 | PostPrep";
    renderAudioMode();
    renderModelGallery();
    updateStatusDisplay();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("opacity-0", "translate-y-3", "pointer-events-none");
    el.classList.add("opacity-100", "translate-y-0");
    setTimeout(() => {
      el.classList.add("opacity-0", "translate-y-3", "pointer-events-none");
      el.classList.remove("opacity-100", "translate-y-0");
    }, 3000);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function decodeAudioFileTo16kMono(file) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const numChannels = audioBuffer.numberOfChannels;
      const length = audioBuffer.length;
      const sampleRate = audioBuffer.sampleRate;

      // Mixdown to mono float32
      const mono = new Float32Array(length);
      for (let c = 0; c < numChannels; c++) {
        const channelData = audioBuffer.getChannelData(c);
        for (let i = 0; i < length; i++) {
          mono[i] += channelData[i] / numChannels;
        }
      }

      // Resample to 16,000 Hz if needed
      let out16k = mono;
      if (sampleRate !== 16000) {
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
          1,
          Math.ceil((length * 16000) / sampleRate),
          16000
        );
        const bufferSource = offlineCtx.createBuffer(1, length, sampleRate);
        bufferSource.copyToChannel(mono, 0);
        const sourceNode = offlineCtx.createBufferSource();
        sourceNode.buffer = bufferSource;
        sourceNode.connect(offlineCtx.destination);
        sourceNode.start(0);
        const resampledBuffer = await offlineCtx.startRendering();
        out16k = resampledBuffer.getChannelData(0);
      }

      // Input Peak Normalization & DC Offset Removal to prevent distortion in neural model
      let mean = 0;
      for (let i = 0; i < out16k.length; i++) mean += out16k[i];
      mean /= (out16k.length || 1);

      let inPeak = 0;
      const clean16k = new Float32Array(out16k.length);
      for (let i = 0; i < out16k.length; i++) {
        const sample = out16k[i] - mean;
        clean16k[i] = sample;
        const abs = Math.abs(sample);
        if (abs > inPeak) inPeak = abs;
      }

      if (inPeak > 0.8) {
        const inScale = 0.8 / inPeak;
        for (let i = 0; i < clean16k.length; i++) clean16k[i] *= inScale;
      }

      return {
        float32: clean16k,
        duration: audioBuffer.duration,
        sampleRate: 16000,
      };
    } finally {
      audioCtx.close().catch(() => {});
    }
  }

  function getSelectedModel() {
    return state.catalog.find((m) => m.id === state.selectedModelId);
  }

  // Character models retain a suggested cross-range pitch, but selecting a
  // character must never change the user's current pitch. Official RVC starts
  // at 0 semitones; forcing +8..+12 on every model is a shared source of
  // metallic/chipmunk artefacts, especially for already-high input voices.
  function applyCharacterPitch(model) {
    if (!model || typeof model.defaultPitch !== "number") return;
    const fmt = (v) => (v > 0 ? "+" : "") + v;
    const pitchInput = document.getElementById("rvc-pitch");
    const pitchTip = document.getElementById("rvc-pitch-tip");
    if (pitchTip && pitchInput && Number(pitchInput.value) === 0) {
      pitchTip.textContent = `当前保持 0 半音，不会因切换角色自动变调。若是低音男声输入，可手动试听「${model.name}」建议值 ${fmt(model.defaultPitch)}。`;
    }
    const presetBtn = document.getElementById("rvc-preset-male-female");
    const presetLabel = presetBtn?.querySelector("span");
    if (presetLabel) {
      presetLabel.textContent = `男声变女角色 (${fmt(model.defaultPitch)})`;
    }
  }

  function cleanCollectionName(value) {
    return String(value || "")
      .replace(/[<>]/gu, "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 30);
  }

  function trainedCollectionId(name) {
    return `trained:${cleanCollectionName(name) || "我的训练模型"}`;
  }

  function isRemovedCollection(name) {
    return /喜羊羊.*灰太狼|pleasant\s*goat.*(?:big\s*big\s*)?wolf/iu.test(String(name || ""));
  }

  function loadCustomCollections() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(COLLECTION_STORAGE_KEY) || "[]");
      state.customCollections = Array.isArray(parsed)
        ? [...new Set(parsed.map(cleanCollectionName).filter(name => name && !isRemovedCollection(name)))].slice(0, 24)
        : [];
      persistCustomCollections();
    } catch {
      state.customCollections = [];
    }
  }

  function persistCustomCollections() {
    try {
      window.localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(state.customCollections));
    } catch {}
  }

  function collectionDefinitions() {
    const definitions = new Map();
    state.catalog.forEach((model) => {
      const name = cleanCollectionName(model.collectionName) || (model.trained === true ? "我的训练模型" : "其他角色");
      if (isRemovedCollection(name)) return;
      const id = String(model.collectionId || (model.trained === true ? trainedCollectionId(name) : "other"));
      if (!definitions.has(id)) {
        definitions.set(id, {
          id,
          name,
          custom: model.trained === true || id.startsWith("trained:") || id === "local-imports",
          count: 0,
        });
      }
      definitions.get(id).count += 1;
    });
    state.customCollections.forEach((name) => {
      if (isRemovedCollection(name)) return;
      const id = trainedCollectionId(name);
      if (!definitions.has(id)) definitions.set(id, { id, name, custom: true, count: 0 });
    });
    const priority = new Map([
      ["blue-archive", 0],
      ["jujutsu-kaisen", 1],
      ["other", 2],
      ["local-imports", 90],
    ]);
    return [...definitions.values()].sort((left, right) => {
      const leftRank = priority.has(left.id) ? priority.get(left.id) : left.custom ? 80 : 20;
      const rightRank = priority.has(right.id) ? priority.get(right.id) : right.custom ? 80 : 20;
      return leftRank - rightRank || left.name.localeCompare(right.name, "zh-CN");
    });
  }

  function selectedCollectionDefinition() {
    return collectionDefinitions().find((collection) => collection.id === state.activeCollectionId) || null;
  }

  function localizedCollectionName(collection) {
    if (!collection || state.lang !== "en") return collection?.name || "";
    if (collection.id === "blue-archive") return "Blue Archive";
    if (collection.id === "jujutsu-kaisen") return "Jujutsu Kaisen";
    if (collection.id === "other") return "Other voices";
    if (collection.id === "local-imports") return "Local imports";
    return collection.name;
  }

  function renderCollectionNav() {
    const nav = document.getElementById("rvc-collection-nav");
    if (!nav) return;
    const definitions = collectionDefinitions();
    if (!definitions.some((collection) => collection.id === state.activeCollectionId)) {
      const selectedModel = getSelectedModel();
      state.activeCollectionId = selectedModel?.collectionId || definitions[0]?.id || "other";
    }
    nav.innerHTML = "";
    definitions.forEach((collection) => {
      const active = collection.id === state.activeCollectionId;
      const button = document.createElement("button");
      button.type = "button";
      button.role = "tab";
      button.dataset.collectionId = collection.id;
      button.setAttribute("aria-selected", String(active));
      button.className = active
        ? "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-xs font-black text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1"
        : "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-xs font-black text-ink shadow-xs hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1";
      button.innerHTML = `<span>${escapeHtml(localizedCollectionName(collection))}</span><span class="${active ? "bg-white/20 text-white" : "bg-zinc-100 text-muted"} rounded-full px-1.5 py-0.5 text-[10px]">${collection.count}</span>`;
      button.addEventListener("click", () => {
        state.activeCollectionId = collection.id;
        const search = document.getElementById("rvc-model-search");
        if (search) search.value = "";
        if (collection.custom) {
          const trainingCollection = document.getElementById("rvc-training-collection");
          if (trainingCollection) trainingCollection.value = collection.name;
        }
        renderModelGallery();
      });
      nav.appendChild(button);
    });
  }

  function renderModelCards(target, models, trained = false) {
    if (!target) return;
    target.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "grid gap-3 sm:grid-cols-2";
    grid.setAttribute("role", "group");
    models.forEach((m) => {
      const isSelected = m.id === state.selectedModelId;
      const card = document.createElement("button");
      card.type = "button";
      card.className = `flex flex-col items-start p-4 rounded-xl border text-left transition-all relative ${
        isSelected
          ? "border-brand bg-teal-50/80 shadow-md ring-2 ring-brand"
          : trained
            ? "border-violet-200 bg-white hover:border-violet-500 hover:shadow-sm"
            : "border-line bg-white hover:border-brand/60 hover:shadow-sm"
      }`;
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", isSelected ? "true" : "false");
      card.dataset.modelId = m.id;
      const avatarText = escapeHtml(m.avatarText || m.name.slice(0, 2));
      card.innerHTML = `
        <div class="flex items-center justify-between w-full gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${trained ? "bg-violet-100 border-violet-200 text-violet-700" : "bg-teal-50/80 border-teal-200/60 text-brand"} border font-black text-xs shadow-xs">
              ${avatarText}
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-black text-ink">${escapeHtml(m.name)}</p>
              <div class="mt-1 flex flex-wrap gap-1">
                ${(m.tags || []).map((tag) => `<span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
          </div>
          <span class="shrink-0 text-xs font-bold ${isSelected ? "text-brand" : "text-zinc-400"}">
            ${isSelected ? `<i class="fa-solid fa-circle-check"></i> ${t("modelPick")}` : t("modelInstalled")}
          </span>
        </div>
        <p class="mt-2 line-clamp-2 text-xs leading-5 text-muted">${escapeHtml(m.description || "")}</p>
      `;
      card.addEventListener("click", () => {
        state.selectedModelId = m.id;
        applyCharacterPitch(m);
        renderModelGallery();
        updateStatusDisplay();
      });
      grid.appendChild(card);
    });
    target.appendChild(grid);
  }

  function renderSchoolBrowser(searchVal) {
    const wrapper = document.getElementById("rvc-school-browser");
    const select = document.getElementById("rvc-school-filter");
    const roster = document.getElementById("rvc-school-roster");
    const directory = window.PostPrepSchools;
    if (!wrapper || !select || !roster || !directory) return "";
    directory.syncCatalog(state.catalog);
    const visible = state.activeCollectionId === "blue-archive";
    wrapper.hidden = !visible;
    if (!visible) return "";
    const previous = select.value;
    select.innerHTML = "";
    const option = (value, label) => {
      const node = document.createElement("option");
      node.value = value;
      node.textContent = label;
      select.appendChild(node);
    };
    option("", state.lang === "en" ? "All schools · available voices" : "全部学院 · 可用声线");
    directory.schools.forEach(school => {
      const count = state.catalog.filter(model => directory.schoolFor(model) === school.id).length;
      option(school.id, (state.lang === "en" ? school.en : school.name) + " · " + count);
    });
    select.value = previous;
    select.onchange = () => renderModelGallery();
    const school = directory.schools.find(item => item.id === select.value);
    roster.innerHTML = "";
    if (school) {
      const note = document.createElement("p");
      note.textContent = state.lang === "en"
        ? "Character directory. Only installed voices appear as selectable cards below."
        : "角色目录：下方仅显示已接入的可选声线。“待接入”表示本站尚无可用模型；日服角色保留日文名便于检索。";
      roster.appendChild(note);
      school.students.filter(student => !searchVal || student.join(" ").toLowerCase().includes(searchVal)).forEach(student => {
        const row = document.createElement("p");
        const available = state.catalog.some(model => model.id === student[0]);
        row.textContent = student[1] + " / " + student[3] + " · " + (state.lang === "en"
          ? available ? "Voice available" : "Voice not installed"
          : available ? "声线已接入" : "声线待接入");
        roster.appendChild(row);
      });
      const source = document.createElement("a");
      source.href = school.source;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.className = "text-brand underline";
      source.textContent = state.lang === "en" ? "Character reference" : "查看角色资料来源";
      roster.appendChild(source);
    }
    return select.value;
  }

  function renderModelGallery() {
    const container = document.getElementById("rvc-model-gallery");
    const trainedContainer = document.getElementById("rvc-trained-model-gallery");
    const trainedSection = document.getElementById("rvc-trained-models-section");
    const trainedCount = document.getElementById("rvc-trained-models-count");
    const trainedTitle = document.getElementById("rvc-trained-models-title");
    const emptyEl = document.getElementById("rvc-model-empty");
    const searchVal = (document.getElementById("rvc-model-search")?.value || "").trim().toLowerCase();
    if (!container) return;

    renderCollectionNav();
    const selectedSchool = renderSchoolBrowser(searchVal);
    const activeCollection = selectedCollectionDefinition();
    const filtered = state.catalog.filter((m) => {
      if (String(m.collectionId || "other") !== state.activeCollectionId) return false;
      if (selectedSchool && window.PostPrepSchools?.schoolFor(m) !== selectedSchool) return false;
      if (!searchVal) return true;
      return (
        m.name.toLowerCase().includes(searchVal) ||
        (m.description || "").toLowerCase().includes(searchVal) ||
        (m.tags || []).some((tag) => tag.toLowerCase().includes(searchVal))
      );
    });
    const regularModels = filtered.filter((model) => model.trained !== true);
    const trainedModels = filtered.filter((model) => model.trained === true);

    if (regularModels.length === 0 && trainedModels.length === 0) {
      container.innerHTML = "";
      if (trainedContainer) trainedContainer.innerHTML = "";
      if (emptyEl) {
        emptyEl.textContent = state.lang === "en"
          ? searchVal
            ? `No matching voice for “${searchVal}” in this collection.`
            : activeCollection?.custom
              ? `“${localizedCollectionName(activeCollection)}” is ready. Select it when training a model and the voice will appear here when training finishes.`
              : "This collection has no voices yet."
          : searchVal
            ? `“${searchVal}”在当前分区没有匹配角色。`
            : activeCollection?.custom
              ? `“${activeCollection.name}”分区已创建。训练新模型时选择这个分区，完成后角色会自动出现在这里。`
              : "当前分区还没有角色。";
        emptyEl.classList.remove("hidden");
      }
      if (trainedSection) trainedSection.classList.add("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");
    renderModelCards(container, regularModels);
    renderModelCards(trainedContainer, trainedModels, true);
    container.classList.toggle("hidden", regularModels.length === 0);
    if (trainedSection) trainedSection.classList.toggle("hidden", trainedModels.length === 0);
    if (trainedTitle) trainedTitle.textContent = `🎓 ${localizedCollectionName(activeCollection) || t("trainedTitle").replace(/^🎓\s*/u, "")}`;
    if (trainedCount) trainedCount.textContent = state.lang === "en" ? `${trainedModels.length} model(s)` : `${trainedModels.length} 个模型`;
  }

  function showProgressBar(show) {
    const barWrap = document.getElementById("rvc-progress-bar-wrap");
    if (barWrap) {
      if (show) barWrap.classList.remove("hidden");
      else barWrap.classList.add("hidden");
    }
  }

  function updateProgressBar(percent) {
    const bar = document.getElementById("rvc-progress-bar");
    if (bar) {
      bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
  }

  function formatTransferredBytes(bytes) {
    const safeBytes = Math.max(0, Number(bytes) || 0);
    if (safeBytes < 1024) return `${Math.round(safeBytes)}B`;
    if (safeBytes < 1024 * 1024) return `${(safeBytes / 1024).toFixed(1)}KB`;
    return `${(safeBytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function cloudUploadProgress(evt, startedAt = Date.now()) {
    const loaded = Math.max(0, Number(evt?.loaded) || 0);
    const total = Math.max(0, Number(evt?.total) || 0);
    const elapsedSeconds = Math.max(0.25, (Date.now() - startedAt) / 1000);
    const bytesPerSecond = loaded / elapsedSeconds;
    const speed = bytesPerSecond >= 1024
      ? `${formatTransferredBytes(bytesPerSecond)}/s`
      : "正在建立上传通道";
    const lengthComputable = Boolean(evt?.lengthComputable && total > 0);
    if (!lengthComputable) {
      return {
        barPercent: 8,
        status: `⏳ [1/3] 正在发送音频… 已发送 ${formatTransferredBytes(loaded)} · ${speed}`,
      };
    }

    const rawPercent = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
    const transferred = `${formatTransferredBytes(loaded)} / ${formatTransferredBytes(total)}`;
    if (rawPercent >= 100) {
      return {
        barPercent: 44,
        status: `⏳ [1/3] 音频已从浏览器发出（${transferred} · ${speed}），正在等待云端接收确认…`,
      };
    }
    return {
      barPercent: Math.min(43, Math.max(6, Math.round(rawPercent * 0.43))),
      status: `⏳ [1/3] 正在发送音频… ${rawPercent}%（${transferred} · ${speed}）`,
    };
  }

  function encodeMono16kWav(samples, originalName = "audio") {
    const sampleCount = Math.max(0, samples?.length || 0);
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 16000 * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    const stem = String(originalName || "audio").replace(/\.[^.]+$/u, "").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 48) || "audio";
    return new File([buffer], `${stem}.postprep-16k.wav`, { type: "audio/wav" });
  }

  // 与本地 worker 的 conditionInputAudio 相同的透明输入条件化: 去直流 +
  // 48Hz 高通 + 只在高包络处启用的缓释安全增益 + 峰值 0.90 归一。普通与
  // 安静的人声原样通过, 只有热峰值/嘶吼包络会被压住, 避免云端官方 RVC 在
  // 过热输入上激发刺耳谐波 (破音/电音)。
  function conditionCloudUploadAudio(samples) {
    const count = samples?.length || 0;
    if (!count) return samples;
    let mean = 0;
    for (let i = 0; i < count; i += 1) mean += samples[i];
    mean /= count;
    const w0 = (2.0 * Math.PI * 48) / 16000;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2.0 * 0.7071067811865476);
    const a0 = 1.0 + alpha;
    const b0 = (1.0 + cosw0) / 2.0 / a0;
    const b1 = -(1.0 + cosw0) / a0;
    const b2 = (1.0 + cosw0) / 2.0 / a0;
    const a1 = (-2.0 * cosw0) / a0;
    const a2 = (1.0 - alpha) / a0;
    const out = new Float32Array(count);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < count; i += 1) {
      const x0 = samples[i] - mean;
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      out[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
    const threshold = 0.58;
    const compressionRatio = 4;
    const envelopeAttack = Math.exp(-1 / Math.max(1, 16000 * 0.0015));
    const envelopeRelease = Math.exp(-1 / Math.max(1, 16000 * 0.12));
    const gainRelease = Math.exp(-1 / Math.max(1, 16000 * 0.15));
    let envelope = 0;
    let gain = 1;
    for (let i = 0; i < count; i += 1) {
      const magnitude = Math.abs(out[i]);
      const envelopeCoefficient = magnitude > envelope ? envelopeAttack : envelopeRelease;
      envelope = envelopeCoefficient * envelope + (1 - envelopeCoefficient) * magnitude;
      const desiredGain = envelope > threshold
        ? (threshold + (envelope - threshold) / compressionRatio) / envelope
        : 1;
      const gainCoefficient = desiredGain < gain ? envelopeAttack : gainRelease;
      gain = gainCoefficient * gain + (1 - gainCoefficient) * desiredGain;
      out[i] *= gain;
    }
    let peak = 0;
    for (let i = 0; i < count; i += 1) {
      const magnitude = Math.abs(out[i]);
      if (magnitude > peak) peak = magnitude;
    }
    if (peak > 0.9 && Number.isFinite(peak)) {
      const scale = 0.9 / peak;
      for (let i = 0; i < count; i += 1) out[i] *= scale;
    }
    return out;
  }

  // 只修"客观检测到的毫秒级毛刺": 判定签名与本地 worker 的
  // suppressDetectedHarshBursts 一致 (5ms 块内重复 >0.45 的相邻样本跳变,
  // 或单次 >0.75 的极端跳变), 未检出时原样返回, 不引入任何染色。
  function suppressDetectedHarshBurstsCloud(audio, sampleRate = 44100) {
    if (!audio || audio.length === 0) return audio;
    const blockSamples = Math.max(1, Math.round(sampleRate * 0.005));
    const blocks = Math.floor(audio.length / blockSamples);
    if (blocks < 2) return audio;
    const flagged = new Uint8Array(blocks);
    let detected = false;
    for (let block = 0; block < blocks; block += 1) {
      const start = block * blockSamples;
      const end = start + blockSamples;
      let largeJumps = 0;
      let maximumJump = 0;
      for (let index = start + 1; index < end; index += 1) {
        const jump = Math.abs(audio[index] - audio[index - 1]);
        if (jump > 0.45) largeJumps += 1;
        if (jump > maximumJump) maximumJump = jump;
      }
      if (largeJumps >= 2 || maximumJump > 0.75) {
        flagged[block] = 1;
        detected = true;
      }
    }
    if (!detected) return audio;
    const expanded = new Uint8Array(flagged);
    for (let block = 0; block < blocks; block += 1) {
      if (!flagged[block]) continue;
      if (block > 0) expanded[block - 1] = 1;
      if (block + 1 < blocks) expanded[block + 1] = 1;
    }
    const filtered = new Float32Array(audio);
    const w0 = (2.0 * Math.PI * Math.min(10000, sampleRate * 0.24)) / sampleRate;
    const alphaLp = Math.sin(w0) / (2.0 * 0.7071067811865476);
    const cosw0Lp = Math.cos(w0);
    const aa0 = 1.0 + alphaLp;
    const coeffs = [
      ((1.0 - cosw0Lp) / 2.0) / aa0,
      (1.0 - cosw0Lp) / aa0,
      ((1.0 - cosw0Lp) / 2.0) / aa0,
      (-2.0 * cosw0Lp) / aa0,
      (1.0 - alphaLp) / aa0,
    ];
    {
      let lx1 = 0;
      let lx2 = 0;
      let ly1 = 0;
      let ly2 = 0;
      for (let i = 0; i < filtered.length; i += 1) {
        const x0 = filtered[i];
        const y0 = coeffs[0] * x0 + coeffs[1] * lx1 + coeffs[2] * lx2 - coeffs[3] * ly1 - coeffs[4] * ly2;
        filtered[i] = y0;
        lx2 = lx1;
        lx1 = x0;
        ly2 = ly1;
        ly1 = y0;
      }
    }
    const output = new Float32Array(audio);
    const attack = Math.exp(-1 / Math.max(1, sampleRate * 0.002));
    const release = Math.exp(-1 / Math.max(1, sampleRate * 0.012));
    let blend = 0;
    for (let index = 0; index < output.length; index += 1) {
      const target = expanded[Math.floor(index / blockSamples)] ? 0.78 : 0;
      const coefficient = target > blend ? attack : release;
      blend = coefficient * blend + (1 - coefficient) * target;
      output[index] = audio[index] * (1 - blend) + filtered[index] * blend;
    }
    return output;
  }

  function encodeWav16AtRate(samples, sampleRate = 44100) {
    const sampleCount = Math.max(0, samples?.length || 0);
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const writeAscii = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    for (let index = 0; index < sampleCount; index += 1) {
      const value = Number(samples[index]);
      const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return buffer;
  }

  // 云端纯人声结果的透明抛光: 解码 → 仅对检测到的毫秒级毛刺做局部低通 →
  // 峰值超 0.90 时整体等比回落。正常结果解码后听感不变; 任何解码失败都返
  // 回 null, 由调用方回退到云端原始文件, 不影响成片返回。
  // 容器嗅探: 抖音/微信导出的音频常是 MP4/AAC 容器却带着 .mp3 扩展名。
  // 中继按扩展名放行, GPU 服务按真实容器打开, 于是报
  // DENIED_ERROR_NO_SUPPORTED_STREAMS (不支持的音频流)。嗅探魔数后把上传
  // 文件重标成正确的扩展名与 MIME, 字节完全不动, 不影响音质。
  function sniffAudioContainer(header) {
    if (!header || header.length < 12) return null;
    if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) return "mp3";
    if (header[0] === 0x66 && header[1] === 0x4c && header[2] === 0x61 && header[3] === 0x43) return "flac";
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
      && header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45) return "wav";
    if (header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) return "ogg";
    if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) return "mp4";
    if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return "webm";
    if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
      return (header[1] & 0x06) === 0 ? "aac" : "mp3";
    }
    return null;
  }

  const UPLOAD_MIME_BY_KIND = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    webm: "audio/webm",
    aac: "audio/aac",
  };

  async function fixUploadContainer(file) {
    try {
      if (!file || typeof file.slice !== "function") return file;
      const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const kind = sniffAudioContainer(header);
      if (!kind) return file;
      const extension = String(file.name || "").toLowerCase().split(".").pop();
      const targetExtension = kind === "mp4" ? "m4a" : kind;
      if (extension === targetExtension) return file;
      const stem = String(file.name || "audio").replace(/\.[^.]+$/u, "").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 48) || "audio";
      return new File([file], `${stem}.postprep-${targetExtension}.${targetExtension}`, {
        type: UPLOAD_MIME_BY_KIND[targetExtension],
      });
    } catch (error) {
      console.warn("Upload container fix skipped:", error);
      return file;
    }
  }

  async function polishCloudVoiceAudio(blob) {
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContextCtor();
      let decoded;
      try {
        decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      } finally {
        audioContext.close?.();
      }
      const channels = decoded.numberOfChannels;
      const length = decoded.length;
      let mono;
      if (channels > 1) {
        mono = new Float32Array(length);
        for (let channel = 0; channel < channels; channel += 1) {
          const data = decoded.getChannelData(channel);
          for (let i = 0; i < length; i += 1) mono[i] += data[i] / channels;
        }
      } else {
        mono = new Float32Array(decoded.getChannelData(0));
      }
      const polished = suppressDetectedHarshBurstsCloud(mono, decoded.sampleRate);
      let peak = 0;
      for (let i = 0; i < polished.length; i += 1) {
        const magnitude = Math.abs(polished[i]);
        if (magnitude > peak) peak = magnitude;
      }
      if (peak > 0.9 && Number.isFinite(peak)) {
        const scale = 0.9 / peak;
        for (let i = 0; i < polished.length; i += 1) polished[i] *= scale;
      }
      return new Blob([encodeWav16AtRate(polished, decoded.sampleRate)], { type: "audio/wav" });
    } catch (error) {
      console.warn("Cloud voice polish skipped:", error);
      return null;
    }
  }

  function prepareCloudUploadAudio(audio, audioMode = "voice") {
    const original = audio?.file;
    if (!original || !(audio?.float32 instanceof Float32Array)) {
      return { file: original, optimized: false, originalBytes: Number(original?.size) || 0 };
    }
    // Song mode must retain the original stereo/full-band mix so the GPU
    // service can separate vocals and later restore the untouched backing.
    if (audioMode === "song") {
      return { file: original, optimized: false, originalBytes: original.size, preservesMix: true };
    }
    const conditioned = conditionCloudUploadAudio(audio.float32);
    const normalizedWav = encodeMono16kWav(conditioned, original.name);
    const extension = String(original.name || "").toLowerCase().split(".").pop();
    const isBrowserRecording = /^mic_recording_\d+/iu.test(String(original.name || ""));
    const originalBytesPerSecond = original.size / Math.max(0.5, Number(audio.duration) || 0.5);
    // 纯人声模式统一上传条件化后的 16k 单声道 WAV: 官方 RVC 引擎内部本来就会把
    // 输入重采样到 16k 提取特征, 带外内容不参与转换; 统一路径让每个云端任务都
    // 获得峰值安全的热输入保护 (与本地管线的 conditionInputAudio 一致)。
    const shouldUseNormalized = true
      || isBrowserRecording
      || extension === "wav"
      || original.size > 5 * 1024 * 1024
      || (originalBytesPerSecond > 64 * 1024 && normalizedWav.size < original.size);
    return {
      file: shouldUseNormalized ? normalizedWav : original,
      optimized: shouldUseNormalized,
      originalBytes: original.size,
    };
  }

  function cloudRequestTimeoutMs(fileSize, durationSeconds, audioMode = "voice") {
    const uploadBudgetMs = Math.ceil(
      Math.max(0, Number(fileSize) || 0) / CLOUD_MIN_EXPECTED_UPLOAD_BYTES_PER_SECOND * 1000,
    ) + 30000;
    const duration = Math.max(0, Number(durationSeconds) || 0);
    const inferenceBudgetMs = audioMode === "song"
      ? 300000 + Math.min(300000, duration * 2000)
      : 150000 + Math.min(180000, duration * 1200);
    return Math.min(
      CLOUD_MAX_CONVERT_TIMEOUT_MS,
      Math.max(CLOUD_CONVERT_TIMEOUT_MS, uploadBudgetMs + inferenceBudgetMs),
    );
  }

  function cloudJobTimeoutMs(durationSeconds, audioMode = "voice") {
    const duration = Math.max(0, Number(durationSeconds) || 0);
    const shortBudget = cloudRequestTimeoutMs(0, duration, audioMode);
    if (duration < DURABLE_CLOUD_JOB_SECONDS) return shortBudget;
    const longBudget = 8 * 60 * 1000
      + duration * (audioMode === "song" ? 3200 : 1800);
    return Math.min(CLOUD_MAX_LONG_JOB_TIMEOUT_MS, Math.max(12 * 60 * 1000, Math.ceil(longBudget)));
  }

  async function checkCacheStatus() {
    try {
      const hubertCached = await getCachedItem("hubert.onnx");
      const rmvpeCached = await getCachedItem("rmvpe.onnx");
      const isHubertReady = hubertCached instanceof Blob && hubertCached.size > 1024 * 1024;
      const isRmvpeReady = rmvpeCached instanceof Blob && rmvpeCached.size > 1024 * 1024;

      // Also check selected character model cache
      const selectedModel = state.catalog.find((m) => m.id === state.selectedModelId);
      let isCharReady = false;
      let charName = "";
      if (selectedModel) {
        const charCached = await getCachedItem(characterModelCacheKey(selectedModel));
        isCharReady = charCached instanceof Blob && charCached.size > 1024 * 1024;
        charName = selectedModel.name;
      }

      const cacheStatusEl = document.getElementById("rvc-cache-status");
      const preloadBtn = document.getElementById("rvc-preload-btn");
      const clearBtn = document.getElementById("rvc-clear-cache-btn");

      const baseReady = isHubertReady && isRmvpeReady;
      const allReady = baseReady && (!selectedModel || isCharReady);

      if (allReady) {
        if (cacheStatusEl) {
          const totalMb = (
            ((hubertCached?.size || 0) + (rmvpeCached?.size || 0)) / (1024 * 1024)
          ).toFixed(0);
          const charInfo = selectedModel && isCharReady ? `、${charName}` : "";
          cacheStatusEl.innerHTML = `<span class="inline-flex items-center gap-1.5 font-bold text-emerald-700"><i class="fa-solid fa-circle-check text-emerald-500"></i>⚡ 基础模型${charInfo}已在本地闪存就绪 (${totalMb}MB+) · 变声免下载</span>`;
        }
        if (preloadBtn) preloadBtn.classList.add("hidden");
        if (clearBtn) clearBtn.classList.remove("hidden");
      } else {
        if (cacheStatusEl) {
          const missingParts = [];
          if (!isHubertReady) missingParts.push("HuBERT");
          if (!isRmvpeReady) missingParts.push("RMVPE");
          if (selectedModel && !isCharReady) missingParts.push(charName || "角色模型");
          const missingStr = missingParts.length ? `（未缓存：${missingParts.join("、")}）` : "";
          cacheStatusEl.innerHTML = `<span class="text-muted"><i class="fa-solid fa-circle-info text-sky-500 mr-1"></i>部分模型尚未预热${missingStr}，点击右侧按钮可提前下载到本地，变声时免去等待。</span>`;
        }
        if (preloadBtn) {
          preloadBtn.classList.remove("hidden");
          preloadBtn.disabled = false;
          preloadBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-down mr-1"></i><span>一键预热全部模型</span>`;
        }
        if (clearBtn) clearBtn.classList.add("hidden");
      }
    } catch (e) {
      console.warn("checkCacheStatus error:", e);
    }
  }

  async function startManualPrewarm() {
    const preloadBtn = document.getElementById("rvc-preload-btn");
    const progressWrap = document.getElementById("rvc-preload-progress-wrap");
    const progressBar = document.getElementById("rvc-preload-progress-bar");
    const statusText = document.getElementById("rvc-preload-status-text");
    const percentText = document.getElementById("rvc-preload-percent-text");

    if (preloadBtn) {
      preloadBtn.disabled = true;
      preloadBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-1"></i><span>正在预热中…</span>`;
    }
    if (progressWrap) progressWrap.classList.remove("hidden");

    try {
      const hubertCfg = state.baseModels?.hubert || EMBEDDED_BASE_MODELS.hubert;
      const rmvpeCfg = state.baseModels?.rmvpe || EMBEDDED_BASE_MODELS.rmvpe;
      const selectedModel = state.catalog.find((m) => m.id === state.selectedModelId);

      let hubertLoaded = 0;
      let hubertTotal = (hubertCfg.chunks?.length || 19) * 20 * 1024 * 1024;
      let rmvpeLoaded = 0;
      let rmvpeTotal = (rmvpeCfg.chunks?.length || 18) * 20 * 1024 * 1024;
      let charLoaded = 0;
      let charTotal = selectedModel ? (selectedModel.chunks?.length || 6) * 20 * 1024 * 1024 : 0;

      const updatePreloadUI = (msg) => {
        const total = hubertTotal + rmvpeTotal + charTotal;
        const loaded = hubertLoaded + rmvpeLoaded + charLoaded;
        const pct = Math.min(100, Math.round(total > 0 ? (loaded / total) * 100 : 0));
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (percentText) percentText.textContent = `${pct}%`;
        if (statusText && msg) statusText.textContent = msg;
      };

      const tasks = [
        loadModelAuto(hubertCfg, "hubert.onnx", "HuBERT 语义特征模型", "application/onnx", (loaded, total, c, t, cached, msg) => {
          hubertLoaded = loaded;
          if (total) hubertTotal = total;
          updatePreloadUI(msg || `⏳ 正在缓存 HuBERT 模型 (${(loaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`);
        }),
        loadModelAuto(rmvpeCfg, "rmvpe.onnx", "RMVPE 音高模型", "application/onnx", (loaded, total, c, t, cached, msg) => {
          rmvpeLoaded = loaded;
          if (total) rmvpeTotal = total;
          updatePreloadUI(msg || `⏳ 正在缓存 RMVPE 模型 (${(loaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`);
        }),
      ];

      if (selectedModel) {
        tasks.push(
          loadModelAuto(selectedModel, characterModelCacheKey(selectedModel), selectedModel.name, "application/onnx", (loaded, total, c, t, cached, msg) => {
            charLoaded = loaded;
            if (total) charTotal = total;
            updatePreloadUI(msg || `⏳ 正在缓存 ${selectedModel.name} 角色模型 (${(loaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`);
          })
        );
      }

      await Promise.all(tasks);

      if (progressBar) progressBar.style.width = `100%`;
      if (percentText) percentText.textContent = `100%`;
      const charMsg = selectedModel ? `、${selectedModel.name}` : "";
      if (statusText) statusText.textContent = `🎉 基础模型${charMsg}预热完成！已存入浏览器闪存。`;

      showToast(`🎉 预热完成！下次变声将直接从闪存秒级启动。`);
      await checkCacheStatus();
      setTimeout(() => {
        if (progressWrap) progressWrap.classList.add("hidden");
      }, 3000);
    } catch (err) {
      console.error("Prewarm failed:", err);
      showToast("❌ 预热失败，请重试");
      if (statusText) statusText.textContent = `❌ 预热失败: ${err.message || err}`;
      if (preloadBtn) {
        preloadBtn.disabled = false;
        preloadBtn.innerHTML = `<i class="fa-solid fa-rotate-right mr-1"></i><span>重新预热</span>`;
      }
    }
  }

  async function clearModelCache() {
    try {
      await removeCachedItem("hubert.onnx");
      await removeCachedItem("rmvpe.onnx");
      for (const m of state.catalog) {
        await removeCachedItem(`${m.id}.onnx`);
        await removeCachedItem(characterModelCacheKey(m));
        await removeCachedItem(retrievalCacheKey(m));
        if (m.retrieval) {
          const retrievalPath = versionCharacterChunkPath(m.retrieval);
          for (const url of getChunkMirrorUrls(retrievalPath)) await removeCachedItem(url);
        }
        for (const chunkPath of m.chunks || []) {
          await removeCachedItem(`chunk:${chunkPath}`);
          await removeCachedItem(`chunk:${versionCharacterChunkPath(chunkPath)}`);
        }
      }
      showToast("🗑️ 本地模型缓存已清理");
      await checkCacheStatus();
    } catch (e) {
      console.warn("Failed to clear cache:", e);
      showToast("清理缓存失败");
    }
  }

  async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function waitFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchJsonWithRetry(url, timeoutMs, attempts = CLOUD_STATUS_ATTEMPTS) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fetchJsonWithTimeout(url, timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await waitFor(550 * attempt);
      }
    }
    throw lastError || new Error("Cloud service probe failed");
  }

  async function fetchResponseWithRetry(url, timeoutMs = 45000, attempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) return response;
        lastError = new Error(`下载音频失败 HTTP ${response.status}`);
        lastError.retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
        if (!lastError.retryable || attempt === attempts) throw lastError;
      } catch (error) {
        lastError = error;
        if (error?.retryable === false || attempt === attempts) throw error;
      } finally {
        clearTimeout(timer);
      }
      await waitFor(700 * attempt);
    }
    throw lastError || new Error("下载音频失败");
  }

  function createCloudRequestId() {
    try {
      if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    } catch {
      return `${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
    }
  }

  const TRANSIENT_CLOUD_OUTPUT_CODES = new Set([
    "RATE_LIMITER_UNAVAILABLE",
    "RVC_BACKEND_TIMEOUT",
    "RVC_BACKEND_UNAVAILABLE",
    "RVC_NETWORK_INTERRUPTED",
    "RVC_OUTPUT_UNAVAILABLE",
    "RVC_RELAY_UNAVAILABLE",
    "UPSTREAM_UNAVAILABLE",
  ]);
  const TRANSIENT_CLOUD_OUTPUT_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);

  function isTransientCloudOutputError(error) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code) return TRANSIENT_CLOUD_OUTPUT_CODES.has(code);
    const status = Number(error?.httpStatus) || 0;
    return !status || TRANSIENT_CLOUD_OUTPUT_STATUSES.has(status);
  }

  async function pollCloudOutput(url, timeoutMs, longJob = false) {
    const deadline = Date.now() + timeoutMs;
    let transientFailures = 0;
    let lastRequestId = "";
    const maxTransientFailures = longJob ? 30 : 4;
    while (Date.now() < deadline) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), longJob ? 60000 : 45000);
      try {
        const response = await fetch(url, {
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 200) return response;
        if (response.status === 202) {
          transientFailures = 0;
          const retryAfterSeconds = Math.max(longJob ? 8 : 4, Math.min(15, parseInt(response.headers.get("Retry-After") || "6", 10) || 6));
          let processing = {};
          try {
            processing = await response.json();
          } catch {}
          updateProgressBar(55);
          const longStage = String(processing?.stage || "");
          const longStageLabel = {
            separating: "正在分离人声与伴奏",
            converting: "正在分段进行角色变声",
            remixing: "正在回混原伴奏",
            encoding: "正在编码最终音频",
          }[longStage] || "正在后台处理长音频";
          updateStatusDisplay(longJob
            ? `🧠 [2/3] ${longStageLabel}；任务已保存在服务端，网络波动后会继续查询…`
            : state.audioMode === "song"
              ? "🧠 [2/3] 云端正在分离人声、角色变声并回混原伴奏；网络短暂切换不会丢失任务…"
              : "🧠 [2/3] 云端 GPU 正在后台处理；页面会自动查询结果，网络短暂切换不会丢失任务…");
          await waitFor(retryAfterSeconds * 1000);
          continue;
        }

        let payload = {};
        try {
          payload = await response.json();
        } catch (e) {}
        const error = new Error(payload?.message || payload?.code || `HTTP ${response.status}`);
        error.code = typeof payload?.code === "string" ? payload.code : "";
        error.httpStatus = response.status;
        const requestId = String(response.headers.get("X-PostPrep-Request-Id") || "").slice(0, 96);
        if (requestId) lastRequestId = requestId;
        error.requestId = requestId || lastRequestId;
        if (response.status === 429) {
          const retryAfterSeconds = Math.max(1, parseInt(response.headers.get("Retry-After") || "6", 10) || 6);
          await waitFor(retryAfterSeconds * 1000);
          continue;
        }
        throw error;
      } catch (error) {
        transientFailures += 1;
        if (error?.requestId) lastRequestId = error.requestId;
        const structuredCode = typeof error?.code === "string" ? error.code : "";
        const retryableError = structuredCode
          ? longJob && TRANSIENT_CLOUD_OUTPUT_CODES.has(structuredCode)
          : longJob ? isTransientCloudOutputError(error) : true;
        if (!retryableError || transientFailures >= maxTransientFailures || Date.now() >= deadline) throw error;
        updateStatusDisplay(`🔄 [2/3] 查询结果时网络波动，正在恢复（${transientFailures}/${maxTransientFailures - 1}）…`);
        await waitFor(Math.min(longJob ? 15000 : 8000, 1800 * transientFailures));
      } finally {
        clearTimeout(timer);
      }
    }
    const timeout = new Error("云端后台处理超过等待时限，请重新提交");
    timeout.code = "RVC_BACKEND_TIMEOUT";
    timeout.requestId = lastRequestId;
    throw timeout;
  }

  async function downloadLongCloudOutput(url, firstResponse, format, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let response = firstResponse;
    let lastError = null;
    const maxAttempts = 12;
    for (let attempt = 1; attempt <= maxAttempts && Date.now() < deadline; attempt += 1) {
      try {
        if (!response || response.status !== 200) {
          response = await pollCloudOutput(url, Math.max(60000, deadline - Date.now()), true);
        }
        return await normalizeCloudAudioBlob(await response.blob(), format);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || Date.now() >= deadline) break;
        updateStatusDisplay(`🔄 [3/3] 结果下载中断，正在从已完成任务重新拉取（${attempt}/${maxAttempts - 1}）…`);
        await waitFor(Math.min(12000, attempt * 2000));
        response = null;
      }
    }
    throw lastError || new Error("长音频结果下载未完成");
  }

  const CLOUD_RVC_ERROR_MESSAGES = Object.freeze({
    RATE_LIMITED: Object.freeze({
      zh: "当前网络每分钟可提交 3 条正常任务（约每 20 秒一条）；已达上限时请等待窗口刷新",
      en: "This network can submit three normal jobs per minute (about one every 20 seconds). Wait for the window to refresh after reaching the limit",
    }),
    RVC_INFERENCE_FAILED: Object.freeze({
      zh: "这段音频未通过本次推理；纯录音请选择纯人声，歌曲请选择带伴奏翻唱后重试",
      en: "Inference failed. Use voice mode for dry recordings or song mode for a mixed track",
    }),
    RVC_MODEL_NOT_FOUND: Object.freeze({
      zh: "所选角色模型暂未挂载，请刷新页面后重新选择角色",
      en: "The selected voice model is not mounted. Refresh and choose the voice again",
    }),
    RVC_BACKEND_TIMEOUT: Object.freeze({
      zh: "云端推理排队超时，请裁短音频后重试",
      en: "Cloud inference timed out. Shorten the clip and retry",
    }),
    RVC_BACKEND_UNAVAILABLE: Object.freeze({
      zh: "云端 RVC 连接刚刚中断，请稍后重新提交",
      en: "The cloud RVC connection dropped. Please submit the job again",
    }),
    RVC_TRAINING_ACTIVE: Object.freeze({
      zh: "本机 GPU 正在训练新模型。训练结束后旧角色变声会自动恢复，请稍后再提交",
      en: "The GPU is training a new model. Existing voice conversion resumes when training finishes",
    }),
    RVC_SEPARATOR_UNAVAILABLE: Object.freeze({
      zh: "伴奏分离模型尚未就绪，请稍后重新提交",
      en: "The vocal separation model is not ready yet",
    }),
    RVC_SEPARATION_TIMEOUT: Object.freeze({
      zh: "歌曲人声分离超过等待时限，请裁短音频后重试",
      en: "Vocal separation timed out. Trim the song and retry",
    }),
    RVC_SEPARATION_FAILED: Object.freeze({
      zh: "这段混音的人声与伴奏分离失败，请换清晰度更高的音频重试",
      en: "The vocal/instrumental split failed. Try a clearer source",
    }),
    RVC_REMIX_FAILED: Object.freeze({
      zh: "角色人声已生成，但与原伴奏回混失败，请重新提交",
      en: "The converted vocal was generated, but remixing the backing track failed",
    }),
    UPSTREAM_UNAVAILABLE: Object.freeze({
      zh: "云端 RVC 连接刚刚中断，请稍后重新提交",
      en: "The cloud RVC connection dropped. Please submit the job again",
    }),
    RVC_AUDIO_TOO_LARGE: Object.freeze({
      zh: "音频文件超过 25 MB，请压缩或裁短后重试",
      en: "The audio exceeds 25 MB. Compress or shorten it before retrying",
    }),
    RVC_INVALID_AUDIO: Object.freeze({
      zh: "音频格式或内容未被云端识别，请转换为 WAV 或 MP3 后重试",
      en: "The cloud service could not read this audio. Convert it to WAV or MP3 and retry",
    }),
    RVC_NETWORK_INTERRUPTED: Object.freeze({
      zh: "当前网络连续中断了云端请求，请保持页面在前台，切换 Wi‑Fi 或移动数据后重新提交",
      en: "The network repeatedly interrupted the cloud request. Keep the page in the foreground, switch networks, and submit again",
    }),
    RVC_ROUTE_UNAVAILABLE: Object.freeze({
      zh: "云端变声入口版本不一致，页面将不会继续使用这个错误地址；请刷新后重试",
      en: "The cloud voice route is out of date. Refresh the page and retry",
    }),
    RVC_REQUEST_REJECTED: Object.freeze({
      zh: "云端没有接受本次音频请求，请重新选择音频后提交",
      en: "The cloud service rejected this audio request. Select the audio again and submit",
    }),
  });

  function cloudRvcFailureMessage(error) {
    const code = String(error?.code || "");
    const localized = CLOUD_RVC_ERROR_MESSAGES[code];
    if (localized) return localized[state.lang === "en" ? "en" : "zh"];
    const message = String(error?.message || "").trim();
    if (message && !/^HTTP \d+$/u.test(message)) return message;
    return state.lang === "en"
      ? "The cloud RVC request did not finish. Check the audio and retry"
      : "云端 RVC 本次请求未完成，请检查音频后重试";
  }

  function preferredCloudOutputFormat(durationSeconds = 0) {
    if (Number(durationSeconds) >= DURABLE_CLOUD_JOB_SECONDS) return "mp3";
    try {
      const ua = String(globalThis.navigator?.userAgent || "");
      const uaMobile = globalThis.navigator?.userAgentData?.mobile === true;
      return uaMobile || MOBILE_AUDIO_USER_AGENT.test(ua) ? "mp3" : "wav";
    } catch {
      return "wav";
    }
  }

  function cloudAudioMimeType(format) {
    return format === "mp3" ? "audio/mpeg" : "audio/wav";
  }

  async function normalizeCloudAudioBlob(blob, format) {
    if (!blob || !Number.isFinite(blob.size) || blob.size < 44 || blob.size > 100 * 1024 * 1024) {
      throw new Error("返回音频数据异常");
    }
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = (from, to) => String.fromCharCode(...bytes.slice(from, to));
    if (format === "wav") {
      if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WAVE") {
        throw new Error("返回结果不是有效 WAV 音频");
      }
    } else {
      const hasId3 = ascii(0, 3) === "ID3";
      const hasMpegFrame = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      if (!hasId3 && !hasMpegFrame) throw new Error("返回结果不是有效 MP3 音频");
    }
    // Explicitly attach a browser-recognised MIME type. Some mobile WebViews
    // discard the upstream Content-Type when Response.blob() creates the URL.
    return new Blob([blob], { type: cloudAudioMimeType(format) });
  }

  function displayMetadataForRemote(remote) {
    const local = state.catalog.find((item) => item.id === remote.id) || EMBEDDED_RVC_CATALOG.find((item) => item.id === remote.id);
    const remoteLicense = typeof remote.license === "string" ? remote.license : "unverified";
    const license = remoteLicense !== "unverified" ? remoteLicense : (local?.license || "unverified");
    const remoteTags = Array.isArray(remote.tags) && remote.tags.length ? remote.tags : (local?.tags || []);
    return normalizeCharacterRuntimeConfig({
      ...(local || {}),
      ...remote,
      id: remote.id,
      name: remote.name && remote.name !== remote.id ? remote.name : (local?.name || remote.id),
      avatarText: remote.emoji || local?.avatarText || "RVC",
      description: remote.description || local?.description || "管理员挂载的云端 RVC 推理模型",
      tags: license === "unverified" ? [...remoteTags, "许可未核验"] : remoteTags,
      remote: true,
      hasIndex: remote.hasIndex === true,
      license,
      source: typeof remote.source === "string" && remote.source ? remote.source : (local?.source || ""),
      modelVersion: typeof remote.modelVersion === "string" && remote.modelVersion ? remote.modelVersion : (local?.modelVersion || ""),
      collectionId: typeof remote.collectionId === "string" && remote.collectionId ? remote.collectionId : (local?.collectionId || ""),
      collectionName: typeof remote.collectionName === "string" && remote.collectionName ? remote.collectionName : (local?.collectionName || ""),
      trained: remote.trained === true,
      createdAt: typeof remote.createdAt === "string" ? remote.createdAt : "",
    });
  }

  async function refreshOfficialService() {
    if (state.cloudProbe) return state.cloudProbe;
    state.cloudProbe = (async () => {
      try {
        const status = await fetchJsonWithRetry(OFFICIAL_RVC_STATUS_ENDPOINT, CLOUD_STATUS_TIMEOUT_MS);
        state.engineReady = status?.ready === true;
        state.engineInfo = state.engineReady ? status : null;
        if (!state.engineReady) return false;
        const payload = await fetchJsonWithRetry(OFFICIAL_RVC_MODELS_ENDPOINT, CLOUD_MODELS_TIMEOUT_MS);
        const models = Array.isArray(payload?.models)
          ? payload.models.filter((model) => model && /^[A-Za-z0-9_-]{1,64}$/u.test(String(model.id || "")))
          : [];
        if (!models.length) {
          // A healthy service with a delayed optional model-list response can
          // still convert any bundled model. Keep the cached catalog usable.
          return true;
        }
        state.catalog = models.map(displayMetadataForRemote);
        if (!state.catalog.some((model) => model.id === state.selectedModelId)) {
          state.selectedModelId = state.catalog[0].id;
        }
        return true;
      } catch (error) {
        console.warn("Cloud RVC service probe was inconclusive", error);
        state.engineReady = null;
        state.engineInfo = null;
        return null;
      }
    })();
    try {
      return await state.cloudProbe;
    } finally {
      state.cloudProbe = null;
    }
  }

  function updateStatusDisplay(msg) {
    const statusEl = document.getElementById("rvc-service-status");
    const convertBtn = document.getElementById("rvc-convert");
    const convertLabel = document.getElementById("rvc-convert-label");

    if (msg) {
      if (statusEl) statusEl.textContent = msg;
      return;
    }

    const selectedModel = state.catalog.find((m) => m.id === state.selectedModelId);
    if (!selectedModel) {
      if (statusEl) statusEl.textContent = t("missingModel");
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = t("convert");
      return;
    }

    const isOwnModel = String(selectedModel.id || "").startsWith(OWN_MODEL_PREFIX);
    if (!state.audio) {
      if (statusEl) statusEl.textContent = t("missingAudio");
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = t("convert");
      return;
    }

    const usesBrowserInference = isOwnModel || state.inferenceMode === "local";
    if (!usesBrowserInference && state.audio.duration > MAX_AUDIO_SECONDS) {
      if (statusEl) statusEl.textContent = t("audioTooLong");
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = t("convert");
      return;
    }
    const deviceAudioLimit = isOwnModel ? LOCAL_MAX_AUDIO_SECONDS : DEVICE_FALLBACK_MAX_AUDIO_SECONDS;
    if (usesBrowserInference && state.audio.duration > deviceAudioLimit) {
      if (statusEl) statusEl.textContent = state.lang === "en"
        ? isOwnModel
          ? `Imported models currently support clips up to ${LOCAL_MAX_AUDIO_SECONDS} seconds.`
          : `On-device mode supports dry vocals up to ${DEVICE_FALLBACK_MAX_AUDIO_SECONDS / 60} minutes. Keep the page in the foreground and ensure enough battery and memory.`
        : isOwnModel
          ? `导入模型仍只支持 ${LOCAL_MAX_AUDIO_SECONDS} 秒以内的短音频。`
          : `设备端最多处理 ${DEVICE_FALLBACK_MAX_AUDIO_SECONDS / 60} 分钟纯人声；请保持页面前台并确保设备有足够电量与内存。`;
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = state.lang === "en"
        ? "Use a shorter clip"
        : "请裁剪音频";
      return;
    }

    if (statusEl) {
      let engineLabel = state.lang === "en" ? "🟢 Voice engine is ready" : "🟢 变声引擎已就绪";
      if (isOwnModel) {
        engineLabel = state.lang === "en" ? "🎓 Imported model is ready" : "🎓 专属导入模型已就绪";
      } else if (state.inferenceMode === "official" && state.engineReady === true) {
        engineLabel = state.lang === "en" ? "🟢 Cloud RVC engine is ready" : "🟢 云端 RVC 高保真引擎已就绪";
      } else if (state.inferenceMode === "official") {
        engineLabel = state.lang === "en" ? "🟡 Cloud RVC is connecting; this request will retry" : "🟡 云端 RVC 引擎正在连接；本次会直接重试";
      } else {
        engineLabel = state.lang === "en" ? "⚡ On-device engine is ready" : "⚡ 极速免上传引擎已就绪";
      }
      statusEl.textContent = state.lang === "en"
        ? `${engineLabel} · Voice: ${selectedModel.name} · Audio: ${state.audio.name} (${formatTime(state.audio.duration)})`
        : `${engineLabel} · 已选角色: ${selectedModel.name} · 音频: ${state.audio.name} (${formatTime(state.audio.duration)})`;
    }
    if (convertBtn) convertBtn.disabled = state.busy;
    if (convertLabel) convertLabel.textContent = state.busy ? t("converting") : t("convert");
  }

  // 用户自己训练/转换的 .onnx 模型（仅本机使用，不回传）：
  // 以 IndexedDB Blob 存储，key = `own:<id>.onnx`，catalog 项记录 id 便于检索。

  // v32 deliberately ignores the legacy mode value. Older releases could
  // remember the browser-only path and send every later visit into a long
  // local ONNX task on mobile.
  const RVC_MODE_STORAGE_KEY = "postprep_rvc_inference_mode_v32";
  const RVC_ENDPOINT_STORAGE_KEY = "postprep_rvc_api_endpoint";

  function getOfficialEndpoint() {
    if (globalThis.POSTPREP_RVC_API_ENDPOINT) {
      // Public releases previously allowed an old workers.dev/local address
      // saved in localStorage to override the deployed Pages relay forever.
      // Clear that stale value so China-side and proxied clients use the same
      // currently deployed endpoint. Keep the override only for localhost
      // development where an operator intentionally configured it.
      try {
        const hostname = String(globalThis.location?.hostname || "").toLowerCase();
        const isLocalDevelopment = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
        const stored = window.localStorage.getItem(RVC_ENDPOINT_STORAGE_KEY);
        if (isLocalDevelopment && stored && stored.trim()) return stored.trim().replace(/\/+$/u, "");
        if (stored) window.localStorage.removeItem(RVC_ENDPOINT_STORAGE_KEY);
      } catch (e) {}
      return String(globalThis.POSTPREP_RVC_API_ENDPOINT).trim().replace(/\/+$/u, "");
    }
    try {
      const stored = window.localStorage.getItem(RVC_ENDPOINT_STORAGE_KEY);
      if (stored && stored.trim()) return stored.trim().replace(/\/+$/u, "");
    } catch (e) {}
    return String(OFFICIAL_RVC_ENDPOINT || "/rvc").trim().replace(/\/+$/u, "");
  }

  function officialRoutes(endpoint) {
    const base = String(endpoint || "").trim().replace(/\/+$/u, "");
    if (/\/(?:rvc|rvc-api)$/u.test(base)) {
      return {
        convertUrl: base,
        outputUrl: (jobId, token) => `${base}/output/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
      };
    }
    if (/\/v1\/convert$/u.test(base)) {
      const serviceBase = base.replace(/\/v1\/convert$/u, "");
      return {
        convertUrl: base,
        outputUrl: (jobId, token) => `${serviceBase}/v1/output/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
      };
    }
    return {
      convertUrl: `${base}/v1/convert`,
      outputUrl: (jobId, token) => `${base}/v1/output/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
    };
  }

  function trainingRoutes(endpoint = getOfficialEndpoint()) {
    const base = String(endpoint || "").trim().replace(/\/+$/u, "");
    if (/\/(?:rvc|rvc-api)$/u.test(base)) {
      return {
        init: `${base}/train/init`,
        upload: (jobId, token, slot) => `${base}/train/upload/${encodeURIComponent(jobId)}/${slot}?token=${encodeURIComponent(token)}`,
        start: (jobId, token) => `${base}/train/start/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
        status: (jobId, token) => `${base}/train/status/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
        cancel: (jobId, token) => `${base}/train/cancel/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
      };
    }
    if (/\/v1\/convert$/u.test(base)) {
      const service = base.replace(/\/v1\/convert$/u, "");
      return {
        init: `${service}/v1/training/init`,
        upload: (jobId, token, slot) => `${service}/v1/training/${encodeURIComponent(jobId)}/audio/${slot}?token=${encodeURIComponent(token)}`,
        start: (jobId, token) => `${service}/v1/training/${encodeURIComponent(jobId)}/start?token=${encodeURIComponent(token)}`,
        status: (jobId, token) => `${service}/v1/training/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
        cancel: (jobId, token) => `${service}/v1/training/${encodeURIComponent(jobId)}/cancel?token=${encodeURIComponent(token)}`,
      };
    }
    return trainingRoutes(`${base}/rvc`);
  }

  function officialMediaUrl(jobId, token) {
    const current = globalThis.location;
    const hostname = String(current?.hostname || "").toLowerCase();
    let base = OFFICIAL_RVC_MEDIA_ENDPOINT;
    if (!base && current?.protocol === "https:" && !hostname.endsWith(".github.io")) {
      base = new URL("/rvc-api/output", current.origin).toString();
    }
    if (!base) return "";
    return `${base.replace(/\/+$/u, "")}/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`;
  }

  function attachResultAudio(audio, sourceUrl, crossOrigin) {
    if (!audio || !sourceUrl) return Promise.reject(new Error("播放器地址未就绪"));
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        audio.removeEventListener("loadedmetadata", onMetadata);
        audio.removeEventListener("error", onError);
        if (error) reject(error);
        else resolve();
      };
      const onMetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) finish();
        else finish(new Error("播放器没有读到有效时长"));
      };
      const onError = () => finish(new Error(audio.error?.message || "播放器拒绝加载音频"));
      const timer = setTimeout(() => finish(new Error("播放器读取音频元数据超时")), 30000);
      audio.pause();
      audio.removeAttribute("src");
      if (crossOrigin) audio.crossOrigin = "anonymous";
      else audio.removeAttribute("crossorigin");
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", onMetadata, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.src = sourceUrl;
      audio.load();
    });
  }

  function setInferenceMode(mode) {
    if (mode === "local" && state.audioMode === "song") {
      state.audioMode = "voice";
      renderAudioMode();
      showToast("本地兼容模式已切回纯人声；带伴奏翻唱使用云端 GPU 分离与回混。");
    }
    state.inferenceMode = mode === "local" ? "local" : "official";
    try {
      window.localStorage.setItem(RVC_MODE_STORAGE_KEY, state.inferenceMode);
    } catch (e) {}

    const btnOfficial = document.getElementById("rvc-mode-official");
    const btnLocal = document.getElementById("rvc-mode-local");
    const iconOfficial = document.getElementById("rvc-mode-official-check");
    const iconLocal = document.getElementById("rvc-mode-local-check");
    const badgeText = document.getElementById("rvc-mode-badge-text");
    const badge = document.getElementById("rvc-mode-badge");

    const isOfficial = state.inferenceMode === "official";

    if (btnOfficial) {
      btnOfficial.setAttribute("aria-checked", isOfficial ? "true" : "false");
      btnOfficial.className = isOfficial
        ? "flex flex-col items-start rounded-xl border-2 border-brand bg-teal-50/80 p-4 text-left shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
        : "flex flex-col items-start rounded-xl border-2 border-transparent bg-white p-4 text-left shadow-xs transition hover:border-brand/40 hover:shadow focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2";
    }
    if (btnLocal) {
      btnLocal.setAttribute("aria-checked", !isOfficial ? "true" : "false");
      btnLocal.className = !isOfficial
        ? "flex flex-col items-start rounded-xl border-2 border-brand bg-teal-50/80 p-4 text-left shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
        : "flex flex-col items-start rounded-xl border-2 border-transparent bg-white p-4 text-left shadow-xs transition hover:border-brand/40 hover:shadow focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2";
    }
    if (iconOfficial) {
      iconOfficial.className = isOfficial ? "fa-solid fa-circle-check text-brand text-base" : "fa-regular fa-circle text-zinc-300 text-base";
    }
    if (iconLocal) {
      iconLocal.className = !isOfficial ? "fa-solid fa-circle-check text-brand text-base" : "fa-regular fa-circle text-zinc-300 text-base";
    }

    if (badgeText) {
      badgeText.textContent = state.lang === "en"
        ? isOfficial ? "Smart hybrid (cloud first)" : "On-device only"
        : isOfficial ? "智能混合（云端优先）" : "仅设备端模式";
    }
    if (badge) {
      badge.className = isOfficial
        ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"
        : "inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800";
    }

    if (isOfficial) {
      refreshOfficialService().then(() => updateStatusDisplay());
    } else {
      checkCacheStatus();
    }
    updateStatusDisplay();
  }

  function renderAudioMode() {
    const voiceButton = document.getElementById("rvc-audio-mode-voice");
    const songButton = document.getElementById("rvc-audio-mode-song");
    const hint = document.getElementById("rvc-audio-mode-hint");
    const song = state.audioMode === "song";
    if (voiceButton) {
      voiceButton.setAttribute("aria-checked", String(!song));
      voiceButton.className = !song
        ? "min-h-11 rounded-lg border-2 border-brand bg-teal-50 px-3 py-2 text-left text-xs font-bold text-ink shadow-xs"
        : "min-h-11 rounded-lg border-2 border-transparent bg-white px-3 py-2 text-left text-xs font-bold text-ink shadow-xs hover:border-brand/40";
    }
    if (songButton) {
      songButton.setAttribute("aria-checked", String(song));
      songButton.className = song
        ? "min-h-11 rounded-lg border-2 border-brand bg-teal-50 px-3 py-2 text-left text-xs font-bold text-ink shadow-xs"
        : "min-h-11 rounded-lg border-2 border-transparent bg-white px-3 py-2 text-left text-xs font-bold text-ink shadow-xs hover:border-brand/40";
    }
    if (hint) {
      hint.textContent = state.lang === "en"
        ? song
          ? "Song mode keeps the original stereo track: cloud PyMSS separates vocals and accompaniment, RVC converts only the vocal, then remixes to the original duration."
          : "Dry-vocal mode skips source separation and keeps the established quality path unchanged."
        : song
          ? "带伴奏翻唱会保留原始立体声文件：云端 PyMSS 分离人声与伴奏，RVC 只转换人声，随后按原时长回混。"
          : "纯人声模式不会启动伴奏分离，原功能与音质参数保持不变。";
    }
  }

  function setAudioMode(mode) {
    state.audioMode = mode === "song" ? "song" : "voice";
    if (state.audioMode === "song" && state.inferenceMode !== "official") {
      setInferenceMode("official");
    }
    renderAudioMode();
    updateStatusDisplay();
  }

  async function probeOfficialService(customUrl) {
    const targetBase = customUrl ? customUrl.trim().replace(/\/+$/u, "") : getOfficialEndpoint();
    const indicator = document.getElementById("rvc-official-status-indicator");
    const statusText = document.getElementById("rvc-official-status-text");

    if (indicator) indicator.className = "flex h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400";
    if (statusText) statusText.textContent = "正在检测云端 RVC 引擎…";

    // Try health/status probes with 3500ms timeout
    const candidates = [
      targetBase.endsWith("/v1/convert") ? targetBase.replace(/\/v1\/convert$/u, "/healthz") : `${targetBase}/healthz`,
      `${targetBase}/v1/models`,
      `${targetBase}/api/rvc-status`,
      targetBase,
    ];

    let ok = false;
    for (const url of candidates) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" }).catch(() => null);
        clearTimeout(timer);
        if (res && (res.ok || res.status === 401 || res.status === 405)) {
          ok = true;
          break;
        }
      } catch (e) {}
    }

    state.officialReady = ok;
    if (indicator) {
      indicator.className = ok
        ? "flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
        : "flex h-2.5 w-2.5 shrink-0 rounded-full bg-red-400";
    }
    if (statusText) {
      const displayUrl = targetBase.replace(/^https?:\/\//u, "");
      statusText.textContent = ok
        ? `🟢 云端 RVC 引擎已就绪 (${displayUrl}) · PyTorch RVC`
        : `⚠️ 云端 RVC 引擎暂未响应 (${displayUrl}) · 可稍后重试，页面不会自动改用本地模式`;
    }
    updateStatusDisplay();
    return ok;
  }

  const OWN_MODEL_PREFIX = "own:";

  async function listOwnModels() {
    try {
      const db = await openModelDB();
      if (!db) return [];
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        const models = [];
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const key = String(cursor.key);
            if (key.startsWith(OWN_MODEL_PREFIX) && cursor.value instanceof Blob) {
              const id = key.replace(/^own:/, "").replace(/\.onnx$/, "");
              models.push({ id });
            }
            cursor.continue();
          }
          resolve(models);
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  }

  async function loadOwnModelsFromDB() {
    const own = await listOwnModels();
    if (!own.length) return;
    const base = state.catalog.filter((m) => !m.id.startsWith(OWN_MODEL_PREFIX));
    const ownItems = own.map((o) => ({
      id: `${OWN_MODEL_PREFIX}${o.id}`,
      name: `${o.id}（我的模型）`,
      avatarText: "自训",
      description: "你本地上传训练/转换的 RVC .onnx 模型，仅本机可用",
      tags: ["女声", "我的模型"],
      collectionId: "local-imports",
      collectionName: "本机导入模型",
      trained: true,
      defaultPitch: 12,
      chunks: [],
    }));
    state.catalog = [...base, ...ownItems];
  }

  async function importOwnModel(file) {
    try {
      if (!file || !/\.onnx$/i.test(file.name)) {
        throw new Error("请选择有效的 .onnx 模型文件");
      }
      if (file.size > 200 * 1024 * 1024) {
        throw new Error("模型文件过大（>200MB），请使用 tools/ 转换脚本分片后再部署");
      }
      const id = file.name.replace(/\.onnx$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
      const cacheKey = `${OWN_MODEL_PREFIX}${id}.onnx`;
      await setCachedItem(cacheKey, file);

      await loadOwnModelsFromDB();
      const imported = state.catalog.find((m) => m.id === `${OWN_MODEL_PREFIX}${id}`);
      if (imported) {
        state.selectedModelId = imported.id;
        state.activeCollectionId = imported.collectionId;
      }
      renderModelGallery();
      checkCacheStatus();

      const statusEl = document.getElementById("rvc-own-model-status");
      if (statusEl) {
        statusEl.textContent = `✅ 已导入「${id}」并设为当前角色（仅本机，可立即变声）。`;
        statusEl.classList.remove("hidden");
      }
      showToast(`🎓 导入成功：${id}`);
    } catch (err) {
      showToast(`❌ 导入失败：${err.message}`);
    }
  }

  async function initCatalog() {
    renderModelGallery();
    try {
      const res = await fetch("assets/rvc-models.json?v=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          state.catalog = data.models.map(normalizeCharacterRuntimeConfig);
        }
        if (data.baseModels) {
          state.baseModels = data.baseModels;
        }
      }
    } catch (e) {
      console.warn("Failed to load rvc-models.json", e);
    }
    await refreshOfficialService();
    // 合并用户本地上传的 .onnx 模型（仅本机，不回传）
    await loadOwnModelsFromDB();
    renderModelGallery();
    // Only update the recommendation label; preserve the official 0-semitone
    // default and any value the user selected.
    applyCharacterPitch(getSelectedModel());
  }

  function probeAudioDuration(file) {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      const url = URL.createObjectURL(file);
      const finish = (duration = 0) => {
        clearTimeout(timer);
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(duration) ? duration : 0);
      };
      const timer = setTimeout(() => finish(0), 20000);
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => finish(audio.duration), { once: true });
      audio.addEventListener("error", () => finish(0), { once: true });
      audio.src = url;
    });
  }

  function audioDurationLimit(mode, modelId = "") {
    if (String(modelId).startsWith("own:")) return LOCAL_MAX_AUDIO_SECONDS;
    return mode === "local" ? DEVICE_FALLBACK_MAX_AUDIO_SECONDS : MAX_AUDIO_SECONDS;
  }

  function localInferenceTimeoutMs(duration, allowLong) {
    if (!allowLong) return 120000;
    const seconds = Math.max(0, Number(duration) || 0);
    // Keep short-job deadlines unchanged; long jobs must not hit the old cap.
    if (seconds <= 300) return Math.min(30 * 60 * 1000, Math.max(180000, Math.ceil(seconds * 6000) + 180000));
    return Math.min(4 * 60 * 60 * 1000, Math.max(30 * 60 * 1000, Math.ceil(seconds * 10000) + 180000));
  }

  async function handleAudioSelected(file, fallbackDuration = 0) {
    if (!file) return;
    const statusEl = document.getElementById("rvc-audio-status");
    if (statusEl) statusEl.textContent = t("analyzing");

    try {
      const decoded = await decodeAudioFileTo16kMono(file);
      if (decoded.duration > audioDurationLimit(state.inferenceMode, state.selectedModelId)) {
        state.audio = null;
        if (statusEl) statusEl.textContent = t("audioTooLong");
        showToast(t("audioTooLong"));
        updateStatusDisplay();
        return;
      }
      state.audio = {
        file,
        float32: decoded.float32,
        duration: decoded.duration,
        name: file.name,
      };
      if (statusEl) {
        statusEl.textContent = t("analysisReady", {
          name: file.name,
          duration: `${decoded.duration.toFixed(1)}s`,
        });
      }
      updateStatusDisplay();
    } catch (err) {
      console.error("Audio decode error:", err);
      const safeFallbackDuration = Number(fallbackDuration) || await probeAudioDuration(file);
      if (safeFallbackDuration > audioDurationLimit(state.inferenceMode, state.selectedModelId)) {
        state.audio = null;
        if (statusEl) statusEl.textContent = t("audioTooLong");
        showToast(t("audioTooLong"));
        updateStatusDisplay();
        return;
      }
      if (safeFallbackDuration >= MIN_AUDIO_SECONDS && file?.size > 0) {
        // A few Safari/in-app browser builds can record a valid MP4/WebM file
        // that their own WebAudio decoder refuses to reopen.  Cloud ffmpeg can
        // still read it, so preserve the original recording instead of
        // discarding it.  Local WASM remains gated by its decoder.
        state.audio = {
          file,
          float32: null,
          duration: safeFallbackDuration,
          name: file.name,
        };
        if (statusEl) {
          statusEl.textContent = t("analysisReady", {
            name: file.name,
            duration: `${safeFallbackDuration.toFixed(1)}s`,
          });
        }
      } else {
        state.audio = null;
        if (statusEl) statusEl.textContent = t("decodeFailed");
        showToast(t("decodeFailed"));
      }
      updateStatusDisplay();
    }
  }

  function recorderFormat() {
    const candidates = [
      { mimeType: "audio/webm;codecs=opus", extension: "webm" },
      { mimeType: "audio/mp4;codecs=mp4a.40.2", extension: "m4a" },
      { mimeType: "audio/mp4", extension: "m4a" },
      { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
      { mimeType: "audio/webm", extension: "webm" },
    ];
    if (typeof MediaRecorder === "undefined") return null;
    if (typeof MediaRecorder.isTypeSupported !== "function") {
      return { mimeType: "", extension: "webm" };
    }
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType))
      || { mimeType: "", extension: "webm" };
  }

  function concatenateFloat32(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Float32Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  function encodePcmWav(samples, sampleRate, name = "mic_recording") {
    const count = samples.length;
    const buffer = new ArrayBuffer(44 + count * 2);
    const view = new DataView(buffer);
    const ascii = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    ascii(0, "RIFF");
    view.setUint32(4, 36 + count * 2, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, count * 2, true);
    for (let index = 0; index < count; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index] || 0));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    return new File([buffer], `${name}.wav`, { type: "audio/wav" });
  }

  async function microphoneStream() {
    const preferred = {
      audio: {
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        echoCancellation: { ideal: false },
        noiseSuppression: { ideal: false },
        autoGainControl: { ideal: false },
      },
    };
    try {
      return await navigator.mediaDevices.getUserMedia(preferred);
    } catch (error) {
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") throw error;
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
  }

  function startPcmRecorder(stream) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("PCM_RECORDER_UNAVAILABLE");
    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silent = context.createGain();
    silent.gain.value = 0;
    const chunks = [];
    processor.onaudioprocess = (event) => {
      if (state.recording) chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    return {
      stop: async () => {
        processor.disconnect();
        source.disconnect();
        silent.disconnect();
        processor.onaudioprocess = null;
        await context.close().catch(() => {});
        const samples = concatenateFloat32(chunks);
        if (!samples.length) throw new Error("EMPTY_RECORDING");
        return encodePcmWav(samples, context.sampleRate || 48000, `mic_recording_${Date.now()}`);
      },
    };
  }

  function stopRecordStream() {
    if (state.recordStream) state.recordStream.getTracks().forEach((track) => track.stop());
    state.recordStream = null;
  }

  function setupRecording() {
    const recordBtn = document.getElementById("rvc-record-toggle");
    const recordLabel = document.getElementById("rvc-record-label");
    const recordTimer = document.getElementById("rvc-record-timer");
    const recordPreview = document.getElementById("rvc-record-preview");

    if (!recordBtn) return;

    const recordHint = document.getElementById("rvc-record-hint");
    const resetButton = () => {
      state.recording = false;
      clearInterval(state.recordTimerId);
      if (recordLabel) recordLabel.textContent = t("recordStart");
      recordBtn.disabled = false;
      recordBtn.classList.remove("bg-red-600", "hover:bg-red-700");
      recordBtn.classList.add("bg-brand", "hover:bg-brandDark");
    };
    const finishRecordedFile = async (file) => {
      if (!file || file.size < 44) throw new Error("EMPTY_RECORDING");
      if (state.recordPreviewUrl) URL.revokeObjectURL(state.recordPreviewUrl);
      if (recordPreview) {
        recordPreview.pause();
        recordPreview.removeAttribute("src");
        recordPreview.hidden = true;
      }
      await handleAudioSelected(file, Math.max(0, (Date.now() - state.recordStartAt) / 1000));
      if (recordHint) recordHint.textContent = `录音已就绪：${file.name} · 点击“开始变声”即可处理。`;
    };

    recordBtn.addEventListener("click", async () => {
      if (state.recording) {
        state.recording = false;
        recordBtn.disabled = true;
        if (recordLabel) recordLabel.textContent = "正在整理录音…";
        if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
          try { state.mediaRecorder.requestData(); } catch {}
          state.mediaRecorder.stop();
          return;
        }
        if (state.pcmRecorder) {
          try {
            const file = await state.pcmRecorder.stop();
            await finishRecordedFile(file);
          } catch (error) {
            console.error("PCM recording finalize failed:", error);
            showToast(t("recordError"));
          } finally {
            state.pcmRecorder = null;
            stopRecordStream();
            resetButton();
          }
          return;
        }
        if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
          state.mediaRecorder.stop();
        }
        stopRecordStream();
        resetButton();
        return;
      }

      // Start recording
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast(t("recordUnsupported"));
        return;
      }

      try {
        state.recordStream = await microphoneStream();
        state.recordChunks = [];
        const format = recorderFormat();
        if (format) {
          let recorder;
          try {
            recorder = format.mimeType
              ? new MediaRecorder(state.recordStream, { mimeType: format.mimeType, audioBitsPerSecond: 128000 })
              : new MediaRecorder(state.recordStream);
          } catch {
            recorder = new MediaRecorder(state.recordStream);
          }
          state.mediaRecorder = recorder;
          recorder.ondataavailable = (event) => {
            if (event.data?.size > 0) state.recordChunks.push(event.data);
          };
          recorder.onerror = (event) => {
            console.error("MediaRecorder error:", event.error || event);
            showToast(t("recordError"));
          };
          recorder.onstop = async () => {
            const actualType = recorder.mimeType || format.mimeType || state.recordChunks[0]?.type || "audio/webm";
            const extension = actualType.includes("mp4") ? "m4a" : actualType.includes("ogg") ? "ogg" : "webm";
            const blob = new Blob(state.recordChunks, { type: actualType });
            const file = new File([blob], `mic_recording_${Date.now()}.${extension}`, { type: actualType });
            try {
              await finishRecordedFile(file);
            } catch (error) {
              console.error("Recorded audio decode failed:", error);
              showToast(t("decodeFailed"));
            } finally {
              state.mediaRecorder = null;
              stopRecordStream();
              resetButton();
            }
          };
          recorder.start(250);
        } else {
          state.mediaRecorder = null;
          state.pcmRecorder = startPcmRecorder(state.recordStream);
        }
        state.recording = true;
        state.recordStartAt = Date.now();
        if (recordHint) recordHint.textContent = "正在录音；再次点击后会自动整理为可变声的标准音频。";
        if (recordLabel) recordLabel.textContent = t("recordStop");
        recordBtn.classList.remove("bg-brand", "hover:bg-brandDark");
        recordBtn.classList.add("bg-red-600", "hover:bg-red-700");

        state.recordTimerId = setInterval(() => {
          const sec = (Date.now() - state.recordStartAt) / 1000;
          if (recordTimer) recordTimer.textContent = formatTime(sec);
        }, 500);
      } catch (err) {
        console.error("Mic access denied or error:", err);
        stopRecordStream();
        resetButton();
        showToast(err?.name === "NotAllowedError" || err?.name === "SecurityError" ? t("recordDenied") : t("recordError"));
      }
    });

    window.addEventListener("pagehide", () => {
      try {
        if (state.mediaRecorder?.state !== "inactive") state.mediaRecorder.stop();
      } catch {}
      stopRecordStream();
    });
  }

  async function runWebRvcInference({ allowLong = false, fallback = false } = {}) {
    if (state.busy || !state.audio || !state.selectedModelId) return false;
    const deviceModel = state.catalog.find((model) => model.id === state.selectedModelId);
    if (deviceModel?.supportsDevice === false) {
      showToast("该声线仅支持服务端转换，请切换到云端模式。");
      return false;
    }
    if (fallback) {
      showProgressBar(true);
      updateProgressBar(2);
    }

    if (state.audioMode !== "voice") {
      const message = "设备端兜底只处理纯人声；带伴奏翻唱仍需要云端 GPU 分离与回混。";
      updateStatusDisplay(message);
      showToast(message);
      return false;
    }
    if (state.audio.duration > DEVICE_FALLBACK_MAX_AUDIO_SECONDS) {
      const message = `设备端兜底最多处理 ${DEVICE_FALLBACK_MAX_AUDIO_SECONDS / 60} 分钟纯人声，请裁剪音频后重试。`;
      updateStatusDisplay(message);
      showToast(message);
      return false;
    }
    if (!allowLong && state.audio.duration > LOCAL_MAX_AUDIO_SECONDS) {
      const message = `本地兼容模式只支持 ${LOCAL_MAX_AUDIO_SECONDS} 秒以内的短音频。为避免移动设备长时间卡住或触发 ONNX 形状错误，已停止本地推理；请切换到“云端 RVC 引擎”。`;
      updateStatusDisplay(message);
      showToast(message);
      return false;
    }

    const selectedModel = state.catalog.find((m) => m.id === state.selectedModelId);
    if (!selectedModel) {
      showToast(t("missingModel"));
      return;
    }

    const convertBtn = document.getElementById("rvc-convert");
    const convertLabel = document.getElementById("rvc-convert-label");
    const resultSection = document.getElementById("rvc-result");
    const resultAudio = document.getElementById("rvc-result-audio");
    const resultDownload = document.getElementById("rvc-result-download");
    const resultMeta = document.getElementById("rvc-result-meta");
    const pitchVal = parseInt(document.getElementById("rvc-pitch")?.value || "0", 10);
    const filterRadiusVal = parseInt(document.getElementById("rvc-filter-radius")?.value || "0", 10);
    const rmsMixVal = parseFloat(document.getElementById("rvc-rms-mix")?.value || "1.0");
    const indexRateVal = parseFloat(document.getElementById("rvc-index-rate")?.value || String(selectedModel.defaultIndexRate ?? 0.3));
    const protectVal = parseFloat(document.getElementById("rvc-protect")?.value || "0.25");

    state.busy = true;
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.setAttribute("aria-busy", "true");
    }

    const startTime = Date.now();
    try {
      // 1. Dynamic import of rvc-web-runtime
      updateStatusDisplay("⏳ 正在初始化本地推理引擎...");
      const runtimeModule = await import(new URL("assets/rvc-engine/rvc-web-runtime.js?v=20260830-v43", window.location.href).href);
      const { createRVC, runPipelineInWorker } = runtimeModule;

      const wasmAssetBase = new URL("assets/rvc-engine/ort126/", window.location.href);
      const rvc = createRVC({
        assetBaseUrl: new URL("assets/rvc-engine/", window.location.href).href,
        // Use the sub-25 MiB asyncify build explicitly. It is compatible with
        // mobile WASM and can be served by both GitHub Pages and Cloudflare Pages.
        wasmBaseUrl: {
          mjs: new URL("ort-wasm-simd-threaded.asyncify.mjs", wasmAssetBase).href,
          wasm: new URL("ort-wasm-simd-threaded.asyncify.wasm", wasmAssetBase).href,
        },
      });

      const hubertCfg = state.baseModels?.hubert || { chunks: [] };
      const rmvpeCfg = state.baseModels?.rmvpe || { chunks: [] };

      // Multi-Model Sequential Loading with Live Milestone Progress Tracking
      updateProgressBar(5);
      showProgressBar(true);

      updateStatusDisplay("⏳ [1/4] 正在加载基础语义模型 (HuBERT)...");
      const hubertFile = await loadModelAuto(
        hubertCfg,
        "hubert.onnx",
        "HuBERT 语义特征模型",
        "application/onnx",
        (l, t, cur, tot, fromCache, msg) => {
          updateProgressBar(Math.min(33, Math.round((cur / tot) * 33)));
          updateStatusDisplay(msg || `⏳ [1/4] 正在加载 HuBERT 语义模型: 分片 ${cur}/${tot}`);
        }
      );
      updateProgressBar(33);

      updateStatusDisplay("⏳ [1/4] 正在加载基础音高模型 (RMVPE)...");
      const rmvpeFile = await loadModelAuto(
        rmvpeCfg,
        "rmvpe.onnx",
        "RMVPE 音高模型",
        "application/onnx",
        (l, t, cur, tot, fromCache, msg) => {
          updateProgressBar(33 + Math.min(33, Math.round((cur / tot) * 33)));
          updateStatusDisplay(msg || `⏳ [1/4] 正在加载 RMVPE 音高模型: 分片 ${cur}/${tot}`);
        }
      );
      updateProgressBar(66);

      updateStatusDisplay(`⏳ [1/4] 正在加载角色声音模型 (${selectedModel.name})...`);
      const modelFile = await loadModelAuto(
        selectedModel,
        characterModelCacheKey(selectedModel),
        selectedModel.name,
        "application/onnx",
        (l, t, cur, tot, fromCache, msg) => {
          updateProgressBar(66 + Math.min(34, Math.round((cur / tot) * 34)));
          updateStatusDisplay(msg || `⏳ [1/4] 正在加载 ${selectedModel.name} 角色模型: 分片 ${cur}/${tot}`);
        }
      );

      let retrievalFile;
      if (selectedModel.retrieval && indexRateVal > 0) {
        try {
          updateStatusDisplay(`⏳ [1/4] 正在加载 ${selectedModel.name} 轻量音色检索码本...`);
          const retrievalPath = versionCharacterChunkPath(selectedModel.retrieval);
          retrievalFile = await fetchWithCache(
            getChunkMirrorUrls(retrievalPath),
            retrievalCacheKey(selectedModel),
            "application/octet-stream",
            () => {}
          );
        } catch (error) {
          console.warn(`音色检索码本不可用，已回退到无检索变声: ${error instanceof Error ? error.message : error}`);
          retrievalFile = undefined;
        }
      }

      updateProgressBar(100);
      setTimeout(() => showProgressBar(false), 800);
      checkCacheStatus();

      // Ensure audio float32 buffer is valid (and not detached from any previous operations)
      if (!state.audio.float32 || state.audio.float32.byteLength === 0) {
        if (state.audio.file) {
          const decoded = await decodeAudioFileTo16kMono(state.audio.file);
          state.audio.float32 = decoded.float32;
        } else {
          throw new Error("音频数据已失效，请重新选择或录制音频");
        }
      }
      const freshAudioInput = new Float32Array(state.audio.float32);

      // 3. Run Pipeline in Web Worker. Long fallback jobs use the existing
      // fixed-frame worker windows, but receive a duration-aware deadline so
      // a three-minute phone conversion is not killed by the old 120s cap.
      const localTimeoutMs = localInferenceTimeoutMs(state.audio.duration, allowLong);
      updateStatusDisplay(fallback
        ? "📱 云端暂时不可达，正在切换到用户设备端分段推理；请保持页面在前台…"
        : "🚀 [2/4] 本地 WebAssembly SIMD 推理开始 (完全在您的设备上运行)...");
      const result = await runPipelineInWorker(
        rvc,
        {
          model: modelFile,
          contentVec: hubertFile,
          rmvpe: rmvpeFile,
          index: retrievalFile,
        },
        freshAudioInput,
        16000,
        {
          onEvent: (e) => {
            if (e.type === "stage") {
              const stageMap = {
                input_preparation: "正在预处理输入音频...",
                model_parsing: "正在解析神经生成器模型...",
                feature_extraction: "正在提取人声语义特征 (HuBERT)...",
                pitch_estimation: "正在分析音高音调与共鸣 (RMVPE)...",
                voice_synthesis: "正在合成目标角色音色...",
                post_processing: "正在进行透明峰值与音量包络校准...",
                success: "变声完成，准备输出...",
              };
              updateStatusDisplay(`✨ [3/4] ${stageMap[e.stage] || e.stage}`);
            } else if (e.type === "chunk_step") {
              const stepMap = {
                feature: `[4/4] 提取人声语义 (${e.current}/${e.total})`,
                pitch: `[4/4] 音高神经追踪 (${e.current}/${e.total})`,
                synth: `[4/4] 神经网络声线变换中 (${e.current}/${e.total})...`,
                done: `[4/4] 分段已完成 (${e.current}/${e.total})`,
              };
              updateStatusDisplay(`✨ ${stepMap[e.step] || e.step}`);
            } else if (e.type === "chunk") {
              updateStatusDisplay(`✨ [4/4] 正在合成音频分段: ${e.current} / ${e.total}`);
            }
          },
        },
        {
          pitchShift: pitchVal,
          medianFilter: filterRadiusVal >= 3,
          medianFilterWindow: filterRadiusVal >= 3 ? filterRadiusVal : 3,
          rmsMixRate: rmsMixVal,
          indexRate: indexRateVal,
          protect: protectVal,
          noiseSeed: Number.isInteger(selectedModel.noiseSeed)
            ? selectedModel.noiseSeed >>> 0
            : deriveStableNoiseSeed(freshAudioInput, selectedModel.id),
          noiseScale: selectedModel.noiseScale ?? 0.5,
          outputSampleRate: selectedModel.sampleRate || 40000,
          timeout: localTimeoutMs,
        }
      );

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      if (!result.outputWav) {
        throw new Error("No output wav generated by pipeline");
      }

      // 4. Attach generated audio to UI
      const outputUrl = URL.createObjectURL(result.outputWav);
      if (resultAudio) {
        resultAudio.src = outputUrl;
        resultAudio.load();
      }
      if (resultDownload) {
        resultDownload.href = outputUrl;
        resultDownload.download = `postprep-rvc-${selectedModel.id}-${Date.now()}.wav`;
      }
      if (resultMeta) {
        const localBackendLabel = result.backend === "webgpu" ? "ONNX/WebGPU" : "ONNX/WebAssembly";
        resultMeta.textContent = state.lang === "en"
          ? `Voice: ${selectedModel.name} · Pitch: ${pitchVal > 0 ? "+" : ""}${pitchVal} · Time: ${elapsedSec}s · On-device ${localBackendLabel}`
          : `角色：${selectedModel.name} · 音高变调：${pitchVal > 0 ? "+" : ""}${pitchVal} · 耗时：${elapsedSec}s · 用户设备端 ${localBackendLabel}`;
      }
      if (resultSection) {
        resultSection.hidden = false;
        resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      updateStatusDisplay(`🎉 设备端变声成功！用时 ${elapsedSec} 秒，结果已生成在下方。`);
      showToast("🎉 设备端变声完成！可在下方试听或下载");
      return true;
    } catch (err) {
      console.error("RVC Inference Error:", err);
      const rawMessage = String(err?.message || err || "");
      const message = /ReshapeHelper|requested_shape_size|cannot be reshaped/iu.test(rawMessage)
        ? "设备端推理组件仍在使用旧缓存，请刷新页面后重新变声。"
        : allowLong
          ? "设备端长音频分段推理失败，请保持页面前台并换一段纯人声重试。"
          : "本机变声处理失败，请重新选择一段较短的纯人声音频后重试。";
      showToast(message);
      updateStatusDisplay(`❌ ${message}`);
      return false;
    } finally {
      state.busy = false;
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.setAttribute("aria-busy", "false");
      }
      if (convertLabel) convertLabel.textContent = t("convert");
    }
  }

  const DEVICE_FALLBACK_CODES = new Set([
    "RVC_BACKEND_TIMEOUT",
    "RVC_BACKEND_UNAVAILABLE",
    "RVC_NETWORK_INTERRUPTED",
    "RVC_OUTPUT_UNAVAILABLE",
    "RVC_RELAY_UNAVAILABLE",
    "UPSTREAM_UNAVAILABLE",
  ]);

  function hasDeviceFallbackModel(model) {
    return Boolean(model && model.supportsDevice !== false && Array.isArray(model.chunks) && model.chunks.length > 0);
  }

  function isDeviceFallbackEligible(error) {
    const code = typeof error?.code === "string" ? error.code : "";
    if (code) return DEVICE_FALLBACK_CODES.has(code);
    const status = Number(error?.httpStatus) || 0;
    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 415 || status === 422) return false;
    if (status >= 500 || status === 408 || status === 425 || status === 429) return true;
    return !status && /网络|连接|超时|查询|下载|请求/i.test(String(error?.message || ""));
  }

  async function runOfficialRvcInference({ allowDeviceFallback = false } = {}) {
    if (state.busy || !state.audio?.file || !state.selectedModelId) return;
    if (state.audio.duration > MAX_AUDIO_SECONDS) {
      updateStatusDisplay(t("audioTooLong"));
      showToast(t("audioTooLong"));
      return;
    }
    const selectedModel = state.catalog.find((model) => model.id === state.selectedModelId);
    if (!selectedModel) {
      showToast(t("missingModel"));
      return;
    }

    const convertBtn = document.getElementById("rvc-convert");
    const convertLabel = document.getElementById("rvc-convert-label");
    const resultSection = document.getElementById("rvc-result");
    const resultAudio = document.getElementById("rvc-result-audio");
    const resultDownload = document.getElementById("rvc-result-download");
    const resultMeta = document.getElementById("rvc-result-meta");
    const pitch = parseInt(document.getElementById("rvc-pitch")?.value || "0", 10);
    const indexRate = parseFloat(document.getElementById("rvc-index-rate")?.value || "0.3");
    const protect = parseFloat(document.getElementById("rvc-protect")?.value || "0.25");
    const rmsMixRate = parseFloat(document.getElementById("rvc-rms-mix")?.value || "1");
    const filterRadius = parseInt(document.getElementById("rvc-filter-radius")?.value || "0", 10);
    // 纠正错误标称的音频容器 (mp4-in-mp3 等), 避免中继放行后 GPU 服务拒收。
    state.audio.file = await fixUploadContainer(state.audio.file);
    const preparedUpload = prepareCloudUploadAudio(state.audio, state.audioMode);
    const uploadFile = preparedUpload.file;
    if (!uploadFile || uploadFile.size < 1 || uploadFile.size > MAX_AUDIO_BYTES) {
      showToast(state.audioMode === "song"
        ? "带伴奏翻唱请使用 25 MB 以内的 MP3、M4A、AAC、OGG 或 FLAC；超长无损文件请先压缩。"
        : t("fileTooLarge"));
      return;
    }
    const extension = String(uploadFile?.name || "").toLowerCase().split(".").pop();
    if (!["wav", "mp3", "m4a", "ogg", "webm", "flac", "aac"].includes(extension)) {
      showToast("云端 RVC 引擎接受 WAV、MP3、M4A、OGG、WebM、FLAC 或 AAC，请先转换格式。");
      return;
    }

    const cooldownRemainingMs = RVC_SUBMISSION_COOLDOWN_MS - (Date.now() - state.lastCloudSubmissionAt);
    if (cooldownRemainingMs > 0) {
      const seconds = Math.ceil(cooldownRemainingMs / 1000);
      showToast(state.lang === "en" ? `Wait ${seconds}s before the next cloud audio` : `请等待 ${seconds} 秒后再提交下一条云端音频`);
      return;
    }
    state.lastCloudSubmissionAt = Date.now();
    persistCloudSubmissionTimestamp(state.lastCloudSubmissionAt);

    state.busy = true;
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.setAttribute("aria-busy", "true");
    }
    if (convertLabel) convertLabel.textContent = t("converting");
    showProgressBar(true);
    updateProgressBar(5);
    const startedAt = Date.now();

    try {
      const routes = officialRoutes(getOfficialEndpoint());
      const convertUrl = routes.convertUrl;
      const requestTimeoutMs = cloudRequestTimeoutMs(uploadFile.size, state.audio.duration, state.audioMode);
      const jobTimeoutMs = cloudJobTimeoutMs(state.audio.duration, state.audioMode);
      const longJob = state.audio.duration >= DURABLE_CLOUD_JOB_SECONDS;
      if (preparedUpload.optimized) {
        updateStatusDisplay(
          `⚡ [1/3] 已把上传体积从 ${formatTransferredBytes(preparedUpload.originalBytes)} 压到 ${formatTransferredBytes(uploadFile.size)}（16kHz 单声道），正在连接云端…`,
        );
      } else {
        updateStatusDisplay(state.audioMode === "song"
          ? "⏳ [1/3] 正在上传原始混音；云端将分离人声、转换音色并回混原伴奏…"
          : "⏳ [1/3] 正在准备上传音频到云端 RVC 引擎…");
      }

      const body = new FormData();
      const cloudRequestId = createCloudRequestId();
      body.set("modelId", selectedModel.id);
      body.set("model_id", selectedModel.id);
      body.set("pitch", String(pitch));
      body.set("indexRate", String(selectedModel.hasIndex !== false ? indexRate : 0));
      body.set("index_rate", String(selectedModel.hasIndex !== false ? indexRate : 0));
      body.set("protect", String(protect));
      body.set("f0Method", "auto");
      body.set("f0_method", "auto");
      const outputFormat = preferredCloudOutputFormat(state.audio.duration);
      body.set("format", outputFormat);
      body.set("resample", "0");
      body.set("rmsMixRate", String(rmsMixRate));
      body.set("rms_mix_rate", String(rmsMixRate));
      body.set("filterRadius", String(filterRadius));
      body.set("filter_radius", String(filterRadius));
      body.set("language", state.lang === "en" ? "en" : "zh");
      body.set("audioMode", state.audioMode);
      body.set("audio_mode", state.audioMode);
      body.set("requestId", cloudRequestId);
      body.set("request_id", cloudRequestId);
      body.set("audio", uploadFile, uploadFile.name || `input.${extension}`);

      // XMLHttpRequest gives upload progress on mobile browsers. Retry once
      // only for a connection-level drop or a transient gateway response;
      // do not silently route the request to the local ONNX compatibility path.
      let ticker = null;
      const uploadAndInfer = (attempt) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const uploadStartedAt = Date.now();
        xhr.open("POST", convertUrl, true);
        xhr.timeout = requestTimeoutMs;

        xhr.upload.onprogress = (evt) => {
          const progress = cloudUploadProgress(evt, uploadStartedAt);
          updateProgressBar(progress.barPercent);
          updateStatusDisplay(progress.status);
        };

        xhr.upload.onload = () => {
          updateProgressBar(46);
          updateStatusDisplay("⏳ [1/3] 音频传输已结束，正在等待云端确认并启动推理…");
          if (ticker) clearInterval(ticker);
          ticker = setInterval(() => {
            const sec = Math.round((Date.now() - startedAt) / 1000);
            updateStatusDisplay(state.audioMode === "song"
              ? `🧠 [2/3] 云端正在分离人声 → RVC 变声 → 原伴奏回混… 已用时 ${sec}s（等待真实结果）`
              : `🧠 [2/3] 云端已接收请求，RVC 神经声线重构中… 已用时 ${sec}s（等待服务端完成响应，不虚报百分比）`);
          }, 1000);
        };

        xhr.onload = () => {
          if (ticker) clearInterval(ticker);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resJson = JSON.parse(xhr.responseText);
              resolve(resJson);
            } catch (err) {
            reject(new Error("云端服务返回格式解析失败"));
            }
          } else {
            let errMsg = `HTTP ${xhr.status}`;
            let errCode = "";
            try {
              const resJson = JSON.parse(xhr.responseText);
              errCode = typeof resJson.code === "string" ? resJson.code : "";
              if (resJson.message || errCode) errMsg = resJson.message || errCode;
            } catch (e) {}
            if (xhr.status === 0) {
              errCode = "RVC_NETWORK_INTERRUPTED";
              errMsg = "网络连接在收到云端响应前中断";
            } else if (!errCode && [404, 405].includes(xhr.status)) {
              errCode = "RVC_ROUTE_UNAVAILABLE";
            } else if (!errCode && [400, 415, 422].includes(xhr.status)) {
              errCode = "RVC_REQUEST_REJECTED";
            } else if (!errCode && xhr.status >= 500) {
              errCode = "UPSTREAM_UNAVAILABLE";
            }
            const error = new Error(errMsg);
            error.code = errCode;
            error.requestId = String(xhr.getResponseHeader("X-PostPrep-Request-Id") || "").slice(0, 96);
            error.retryAfterSeconds = Math.max(0, parseInt(xhr.getResponseHeader("Retry-After") || "0", 10) || 0);
            error.retryable = attempt < 2 && (
              ["UPSTREAM_UNAVAILABLE", "RVC_BACKEND_UNAVAILABLE", "RATE_LIMITER_UNAVAILABLE", "RVC_NETWORK_INTERRUPTED"].includes(errCode)
              || (!errCode && [502, 503, 520, 521, 522, 523, 524].includes(xhr.status))
            );
            error.httpStatus = xhr.status;
            reject(error);
          }
        };

        const rejectNetworkFailure = () => {
          if (ticker) clearInterval(ticker);
          const error = new Error(attempt < 2
            ? "网络连接暂时中断，准备自动重试"
            : "网络连接连续两次中断");
          error.code = "RVC_NETWORK_INTERRUPTED";
          error.retryable = attempt < 2;
          reject(error);
        };
        xhr.onerror = rejectNetworkFailure;
        xhr.onabort = rejectNetworkFailure;

        xhr.ontimeout = () => {
          if (ticker) clearInterval(ticker);
          const error = new Error(`上传或推理超时 (${Math.round(requestTimeoutMs / 1000)}s)，建议裁短音频后重试`);
          error.retryable = false;
          reject(error);
        };

        xhr.send(body);
      });

      let payload;
      try {
        payload = await uploadAndInfer(1);
      } catch (firstError) {
        if (!firstError?.retryable) throw firstError;
        updateProgressBar(8);
        updateStatusDisplay("🔄 云端连接短暂中断，正在重新连接同一入口并自动重试一次…");
        await waitFor(1200);
        payload = await uploadAndInfer(2);
      }
      if (!payload || !payload.jobId || !payload.downloadToken) {
        throw new Error(payload?.message || payload?.code || "未获取到任务标识");
      }

      const outputUrl = routes.outputUrl(payload.jobId, payload.downloadToken);
      updateProgressBar(52);
      updateStatusDisplay(state.audioMode === "song"
        ? "🧠 [2/3] 混音已接收，云端正在分离人声、变声并回混伴奏…"
        : "🧠 [2/3] 音频已接收，云端 GPU 已转入后台推理…");
      const outputResponse = await pollCloudOutput(outputUrl, jobTimeoutMs, longJob);
      updateProgressBar(82);
      updateStatusDisplay("📥 [3/3] 云端 RVC 推理完成，正在下载高保真变声结果…");
      const rawOutputBlob = longJob
        ? await downloadLongCloudOutput(outputUrl, outputResponse, outputFormat, jobTimeoutMs)
        : await normalizeCloudAudioBlob(await outputResponse.blob(), outputFormat);
      // 纯人声模式: 客户端透明抛光 (仅检测到的毫秒级毛刺做局部低通 + 热峰
      // 值回落), 与本地管线的输出守卫一致; 歌曲模式保留云端原混音不动。
      // 抛光失败时回退云端原始文件, 不影响成片返回。
      const outputBlob = state.audioMode === "song" || outputFormat === "mp3"
        ? rawOutputBlob
        : ((await polishCloudVoiceAudio(rawOutputBlob)) || rawOutputBlob);
      const polishedVoiceOutput = outputBlob !== rawOutputBlob;

      if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
      state.resultUrl = URL.createObjectURL(outputBlob);
      if (resultDownload) {
        resultDownload.href = state.resultUrl;
        resultDownload.download = `postprep-rvc-${selectedModel.id}-${Date.now()}.${polishedVoiceOutput ? "wav" : outputFormat}`;
      }
      if (resultAudio) {
        if (polishedVoiceOutput) {
          // 抛光后的结果与下载文件一致, 直接用它试听。
          try {
            await attachResultAudio(resultAudio, state.resultUrl, false);
          } catch (mediaError) {
            // WebAudio and the native media demuxer do not support identical formats.
            // Keep the already downloaded original when native playback rejects polish.
            URL.revokeObjectURL(state.resultUrl);
            state.resultUrl = URL.createObjectURL(rawOutputBlob);
            if (resultDownload) {
              resultDownload.href = state.resultUrl;
              resultDownload.download = `postprep-rvc-${selectedModel.id}-${Date.now()}.${outputFormat}`;
            }
            await attachResultAudio(resultAudio, state.resultUrl, false);
          }
        } else {
          const mediaUrl = officialMediaUrl(payload.jobId, payload.downloadToken);
          try {
            await attachResultAudio(resultAudio, mediaUrl || state.resultUrl, Boolean(mediaUrl));
          } catch (mediaError) {
            if (!mediaUrl) throw mediaError;
            console.warn("Protected media route failed; using the already downloaded result blob", mediaError);
            await attachResultAudio(resultAudio, state.resultUrl, false);
          }
        }
        resultAudio.hidden = false;
      }
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (resultMeta) {
        resultMeta.textContent = t("resultMeta", {
          model: selectedModel.name,
          pitch: `${pitch > 0 ? "+" : ""}${pitch}`,
          elapsed,
        }) + ` · 云端 PyTorch RVC${state.audioMode === "song" ? " · PyMSS 人声分离/原伴奏回混" : ""} · ${outputFormat.toUpperCase()}`;
      }
      if (resultSection) {
        resultSection.hidden = false;
        resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      updateProgressBar(100);
      updateStatusDisplay(`🎉 云端 RVC 变声完成！用时 ${elapsed} 秒。${longJob ? "长音频稳定链路已完成可恢复处理与下载。" : ""}可在下方试听或下载。`);
      showToast("🎉 云端 RVC 变声完成！可在下方试听或下载");
      return true;
    } catch (error) {
      console.warn("Cloud RVC inference failed", error);
      if (allowDeviceFallback && state.audioMode === "voice" && hasDeviceFallbackModel(selectedModel) && isDeviceFallbackEligible(error)) {
        updateStatusDisplay("⚠️ 云端 RVC 当前不可达，准备切换到用户设备端推理…");
        return { fallback: true, error };
      }
      const failureMessage = cloudRvcFailureMessage(error);
      const diagnostic = error?.requestId ? ` · 诊断号 ${error.requestId}` : "";
      updateStatusDisplay(`❌ ${failureMessage}${error?.code ? `（${error.code}）` : ""}${diagnostic}`);
      showToast(`❌ ${failureMessage}`);
      return false;
    } finally {
      state.busy = false;
      setTimeout(() => showProgressBar(false), 800);
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.setAttribute("aria-busy", "false");
      }
      if (convertLabel) convertLabel.textContent = t("convert");
    }
  }

  async function runRvcInference() {
    const selectedModel = state.catalog.find((model) => model.id === state.selectedModelId);
    if (selectedModel && String(selectedModel.id).startsWith(OWN_MODEL_PREFIX)) {
      return runWebRvcInference();
    }
    if (state.inferenceMode === "local") {
      return runWebRvcInference({ allowLong: true });
    }
    if (state.audioMode === "voice" && hasDeviceFallbackModel(selectedModel) && state.engineReady === false) {
      const cloudReady = await refreshOfficialService();
      if (cloudReady === false) {
        updateStatusDisplay("📱 检测到电脑端云引擎离线，正在使用当前用户设备处理纯人声…");
        return runWebRvcInference({ allowLong: true, fallback: true });
      }
    }
    const cloudResult = await runOfficialRvcInference({ allowDeviceFallback: true });
    if (cloudResult?.fallback) {
      return runWebRvcInference({ allowLong: true, fallback: true });
    }
    return cloudResult;
  }

  function setupModelTraining() {
    const filesInput = document.getElementById("rvc-training-files");
    const filesStatus = document.getElementById("rvc-training-files-status");
    const nameInput = document.getElementById("rvc-training-name");
    const collectionInput = document.getElementById("rvc-training-collection");
    const consentInput = document.getElementById("rvc-training-consent");
    const startButton = document.getElementById("rvc-training-start");
    const cancelButton = document.getElementById("rvc-training-cancel");
    const progressWrap = document.getElementById("rvc-training-progress-wrap");
    const progressBar = document.getElementById("rvc-training-progress");
    const statusText = document.getElementById("rvc-training-status");
    if (!filesInput || !startButton) return;

    const storageKey = "postprep_rvc_training_job_v1";
    const setTrainingUi = (progress, message, active = true) => {
      if (progressWrap) progressWrap.classList.remove("hidden");
      if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, Number(progress) || 0))}%`;
      if (statusText) statusText.textContent = message || "";
      startButton.disabled = active;
      if (cancelButton) cancelButton.classList.toggle("hidden", !active);
    };
    const clearStoredJob = () => {
      state.trainingJob = null;
      try { window.localStorage.removeItem(storageKey); } catch {}
    };
    const saveJob = (job) => {
      state.trainingJob = job;
      try { window.localStorage.setItem(storageKey, JSON.stringify(job)); } catch {}
    };
    const formatTrainingFiles = (files) => {
      const total = files.reduce((sum, file) => sum + file.size, 0);
      return `${files.length} 段 · ${formatTransferredBytes(total)} · 将逐段上传，单段失败会自动重试`;
    };
    const readJson = async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok && response.status !== 202) {
        const error = new Error(payload?.message || payload?.code || `HTTP ${response.status}`);
        error.code = payload?.code || "";
        throw error;
      }
      return payload;
    };
    const uploadOne = (url, file, slot, totalFiles) => new Promise((resolve, reject) => {
      const body = new FormData();
      body.set("audio", file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.timeout = 240000;
      xhr.upload.onprogress = (event) => {
        const fraction = event.lengthComputable && event.total > 0 ? event.loaded / event.total : 0;
        const uploadProgress = 2 + ((slot + fraction) / totalFiles) * 18;
        setTrainingUi(uploadProgress, `正在上传第 ${slot + 1}/${totalFiles} 段：${file.name} · ${Math.round(fraction * 100)}%`);
      };
      xhr.onload = () => {
        let payload = null;
        try { payload = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
        else {
          const error = new Error(payload?.message || payload?.code || `HTTP ${xhr.status}`);
          error.code = payload?.code || "";
          error.httpStatus = xhr.status;
          reject(error);
        }
      };
      xhr.onerror = () => reject(Object.assign(new Error("训练音频上传连接中断"), { code: "RVC_NETWORK_INTERRUPTED" }));
      xhr.ontimeout = () => reject(Object.assign(new Error("训练音频上传超时"), { code: "RVC_NETWORK_INTERRUPTED" }));
      xhr.send(body);
    });
    const uploadWithRetry = async (url, file, slot, totalFiles) => {
      let error;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await uploadOne(url, file, slot, totalFiles);
        } catch (caught) {
          error = caught;
          if (attempt >= 3 || caught?.httpStatus && caught.httpStatus < 500 && caught.httpStatus !== 429) throw caught;
          setTrainingUi(2 + (slot / totalFiles) * 18, `第 ${slot + 1} 段连接波动，正在重试 ${attempt}/2…`);
          await waitFor(attempt * 1500);
        }
      }
      throw error;
    };
    const refreshTrainedModel = async (modelId) => {
      state.engineReady = null;
      await refreshOfficialService();
      const trainedModel = modelId ? state.catalog.find((model) => model.id === modelId) : null;
      if (trainedModel) {
        state.selectedModelId = modelId;
        state.activeCollectionId = trainedModel.collectionId;
      }
      renderModelGallery();
      updateStatusDisplay();
    };
    const pollTraining = async (job) => {
      const routes = trainingRoutes(job.endpoint);
      while (state.trainingJob?.jobId === job.jobId) {
        let payload;
        try {
          payload = await readJson(await fetch(routes.status(job.jobId, job.token), {
            headers: { Accept: "application/json" },
            cache: "no-store",
          }));
        } catch (error) {
          setTrainingUi(state.trainingJob.progress || 20, `训练状态连接波动：${error.message}，8 秒后自动续查…`);
          await waitFor(8000);
          continue;
        }
        job.progress = Number(payload?.progress) || job.progress || 0;
        saveJob(job);
        const label = payload?.message || payload?.stage || "训练任务运行中";
        if (payload?.state === "completed") {
          setTrainingUi(100, `✅ ${label}`, false);
          clearStoredJob();
          if (cancelButton) cancelButton.classList.add("hidden");
          await refreshTrainedModel(payload.modelId);
          showToast("🎓 新模型训练完成，已加入独立训练模型区");
          return;
        }
        if (payload?.state === "failed" || payload?.state === "cancelled") {
          setTrainingUi(job.progress, `❌ ${label}${payload.errorCode ? `（${payload.errorCode}）` : ""}`, false);
          clearStoredJob();
          if (cancelButton) cancelButton.classList.add("hidden");
          return;
        }
        setTrainingUi(job.progress, `⏳ ${label}`);
        await waitFor(8000);
      }
    };

    filesInput.addEventListener("change", () => {
      const files = Array.from(filesInput.files || []);
      const allowed = /\.(wav|mp3|m4a|ogg|webm|flac|aac)$/iu;
      const valid = files.filter((file) => allowed.test(file.name) && file.size > 0 && file.size <= 25 * 1024 * 1024).slice(0, 12);
      const total = valid.reduce((sum, file) => sum + file.size, 0);
      state.trainingFiles = total <= 96 * 1024 * 1024 ? valid : [];
      if (filesStatus) {
        filesStatus.textContent = state.trainingFiles.length >= 2
          ? formatTrainingFiles(state.trainingFiles)
          : "请选择 2–12 段音频；每段不超过 25 MB，总计不超过 96 MB。";
      }
    });

    startButton.addEventListener("click", async () => {
      const displayName = String(nameInput?.value || "").trim();
      const collectionName = cleanCollectionName(collectionInput?.value) || "我的训练模型";
      const files = state.trainingFiles;
      if (!displayName) {
        showToast("请填写训练模型名称");
        nameInput?.focus();
        return;
      }
      if (!Array.isArray(files) || files.length < 2) {
        showToast("请至少选择两段纯人声音频");
        return;
      }
      if (!consentInput?.checked) {
        showToast("请先确认音频与声音授权");
        return;
      }
      const endpoint = getOfficialEndpoint();
      const routes = trainingRoutes(endpoint);
      startButton.disabled = true;
      setTrainingUi(1, "正在创建隔离训练任务…");
      try {
        if (!state.customCollections.includes(collectionName)) {
          state.customCollections.push(collectionName);
          persistCustomCollections();
          state.activeCollectionId = trainedCollectionId(collectionName);
          renderModelGallery();
        }
        const initBody = new FormData();
        initBody.set("display_name", displayName);
        initBody.set("collection_name", collectionName);
        initBody.set("consent", "true");
        initBody.set("epochs", "80");
        const initPayload = await readJson(await fetch(routes.init, { method: "POST", body: initBody }));
        const job = {
          jobId: initPayload.jobId,
          token: initPayload.uploadToken,
          endpoint,
          progress: 1,
          displayName,
          collectionName,
        };
        saveJob(job);
        for (let slot = 0; slot < files.length; slot += 1) {
          await uploadWithRetry(routes.upload(job.jobId, job.token, slot), files[slot], slot, files.length);
        }
        setTrainingUi(20, "音频上传完成，正在校验总时长并进入 GPU 队列…");
        const startBody = new FormData();
        startBody.set("confirm", "true");
        await readJson(await fetch(routes.start(job.jobId, job.token), { method: "POST", body: startBody }));
        pollTraining(job);
      } catch (error) {
        console.error("RVC training start failed:", error);
        setTrainingUi(0, `❌ 训练任务启动失败：${error.message}`, false);
        clearStoredJob();
        if (cancelButton) cancelButton.classList.add("hidden");
      }
    });

    cancelButton?.addEventListener("click", async () => {
      const job = state.trainingJob;
      if (!job) return;
      cancelButton.disabled = true;
      try {
        const body = new FormData();
        body.set("confirm", "true");
        await fetch(trainingRoutes(job.endpoint).cancel(job.jobId, job.token), { method: "POST", body });
        setTrainingUi(job.progress || 20, "正在安全停止训练任务…");
      } finally {
        cancelButton.disabled = false;
      }
    });

    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (stored?.jobId && stored?.token && stored?.endpoint) {
        state.trainingJob = stored;
        setTrainingUi(stored.progress || 20, "正在恢复上一次训练任务状态…");
        pollTraining(stored);
      }
    } catch {
      clearStoredJob();
    }
  }

  function setupEventListeners() {
    // Mode Switcher (Official PyTorch vs Local WebAssembly)
    const btnOfficial = document.getElementById("rvc-mode-official");
    const btnLocal = document.getElementById("rvc-mode-local");
    if (btnOfficial) {
      btnOfficial.addEventListener("click", () => setInferenceMode("official"));
    }
    if (btnLocal) {
      btnLocal.addEventListener("click", () => setInferenceMode("local"));
    }
    const audioModeVoice = document.getElementById("rvc-audio-mode-voice");
    const audioModeSong = document.getElementById("rvc-audio-mode-song");
    audioModeVoice?.addEventListener("click", () => setAudioMode("voice"));
    audioModeSong?.addEventListener("click", () => setAudioMode("song"));
    renderAudioMode();

    const createCollectionButton = document.getElementById("rvc-create-collection");
    const createCollectionForm = document.getElementById("rvc-create-collection-form");
    const createCollectionName = document.getElementById("rvc-create-collection-name");
    const createCollectionSave = document.getElementById("rvc-create-collection-save");
    const createCollectionCancel = document.getElementById("rvc-create-collection-cancel");
    const closeCollectionForm = () => {
      createCollectionForm?.classList.add("hidden");
      if (createCollectionName) createCollectionName.value = "";
    };
    const saveCollection = () => {
      const name = cleanCollectionName(createCollectionName?.value);
      if (!name) {
        showToast("请填写分区名称");
        createCollectionName?.focus();
        return;
      }
      if (!state.customCollections.includes(name)) {
        state.customCollections.push(name);
        persistCustomCollections();
      }
      state.activeCollectionId = trainedCollectionId(name);
      const trainingCollection = document.getElementById("rvc-training-collection");
      const trainingPanel = document.getElementById("rvc-training-panel");
      if (trainingCollection) trainingCollection.value = name;
      if (trainingPanel) trainingPanel.open = true;
      closeCollectionForm();
      renderModelGallery();
      showToast(`已创建分区“${name}”，训练模型时会自动放入该分区。`);
    };
    createCollectionButton?.addEventListener("click", () => {
      createCollectionForm?.classList.toggle("hidden");
      if (!createCollectionForm?.classList.contains("hidden")) createCollectionName?.focus();
    });
    createCollectionSave?.addEventListener("click", saveCollection);
    createCollectionCancel?.addEventListener("click", closeCollectionForm);
    createCollectionName?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveCollection();
      if (event.key === "Escape") closeCollectionForm();
    });

    // Official Endpoint Configuration UI
    const toggleConfigBtn = document.getElementById("rvc-official-toggle-config");
    const endpointWrap = document.getElementById("rvc-official-endpoint-wrap");
    const endpointInput = document.getElementById("rvc-official-endpoint-input");
    const saveEndpointBtn = document.getElementById("rvc-official-save-btn");
    const testOfficialBtn = document.getElementById("rvc-official-test-btn");

    if (endpointInput) {
      endpointInput.value = getOfficialEndpoint();
    }

    if (toggleConfigBtn && endpointWrap) {
      toggleConfigBtn.addEventListener("click", () => {
        endpointWrap.classList.toggle("hidden");
      });
    }

    if (saveEndpointBtn && endpointInput) {
      saveEndpointBtn.addEventListener("click", async () => {
        const val = (endpointInput.value || "").trim().replace(/\/+$/u, "");
        if (val) {
          try {
            window.localStorage.setItem(RVC_ENDPOINT_STORAGE_KEY, val);
          } catch (e) {}
          showToast(`💾 已保存云端 RVC 服务地址：${val}`);
          await probeOfficialService(val);
        }
      });
      endpointInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") saveEndpointBtn.click();
      });
    }

    if (testOfficialBtn) {
      testOfficialBtn.addEventListener("click", async () => {
        testOfficialBtn.disabled = true;
        testOfficialBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>测试中…</span>`;
        await probeOfficialService(endpointInput?.value);
        testOfficialBtn.disabled = false;
        testOfficialBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i><span>测试连接</span>`;
      });
    }

    // Restore saved mode
    try {
      const savedMode = window.localStorage.getItem(RVC_MODE_STORAGE_KEY);
      if (savedMode === "local" || savedMode === "official") {
        setInferenceMode(savedMode);
      } else {
        setInferenceMode("official");
      }
    } catch (e) {
      setInferenceMode("official");
    }

    // Search input
    const searchInput = document.getElementById("rvc-model-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => renderModelGallery());
    }

    // Source switch (Upload / Record / Text-to-Speech)
    const sourceButtons = [
      { elId: "rvc-source-upload", mode: "upload" },
      { elId: "rvc-source-record", mode: "record" },
      { elId: "rvc-source-tts", mode: "tts" },
    ];
    const SOURCE_WRAPS = { upload: "rvc-upload-wrap", record: "rvc-record-wrap", tts: "rvc-tts-wrap" };

    const setSource = (mode) => {
      state.sourceMode = mode;
      sourceButtons.forEach(({ elId, mode: m }) => {
        const btn = document.getElementById(elId);
        if (!btn) return;
        const active = m === mode;
        btn.setAttribute("aria-pressed", String(active));
        btn.classList.toggle("border-brand", active);
        btn.classList.toggle("bg-teal-50", active);
        btn.classList.toggle("border-line", !active);
        btn.classList.toggle("bg-white", !active);
      });
      Object.entries(SOURCE_WRAPS).forEach(([m, id]) => {
        const wrap = document.getElementById(id);
        if (wrap) wrap.classList.toggle("hidden", m !== mode);
      });
      const statusEl = document.getElementById("rvc-audio-status");
      if (mode !== "upload" && statusEl) statusEl.textContent = t("fileEmpty");
    };

    sourceButtons.forEach(({ elId, mode }) => {
      const btn = document.getElementById(elId);
      if (btn) btn.addEventListener("click", () => setSource(mode));
    });

    // File Input
    const fileInput = document.getElementById("rvc-audio-file");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) handleAudioSelected(file);
      });
    }

    // Voice presets are explicit opt-ins. The page itself starts at 0 semitones.
    const btnPresetMaleFemale = document.getElementById("rvc-preset-male-female");
    const btnPresetSame = document.getElementById("rvc-preset-same");
    const btnPresetFemaleMale = document.getElementById("rvc-preset-female-male");
    const pitchInput = document.getElementById("rvc-pitch");
    const pitchVal = document.getElementById("rvc-pitch-value");
    const pitchTip = document.getElementById("rvc-pitch-tip");

    const setPitchMode = (pitch, tip, activeBtn) => {
      if (pitchInput) pitchInput.value = String(pitch);
      if (pitchVal) pitchVal.textContent = (pitch > 0 ? "+" : "") + pitch;
      if (pitchTip) pitchTip.textContent = tip;
      [btnPresetMaleFemale, btnPresetSame, btnPresetFemaleMale].forEach((b) => {
        if (!b) return;
        const isActive = b === activeBtn;
        b.setAttribute("aria-pressed", isActive ? "true" : "false");
        if (isActive) {
          b.className = "inline-flex items-center gap-1.5 rounded-lg border border-brand bg-teal-50 px-3 py-1.5 text-xs font-bold text-brand shadow-xs transition hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1";
        } else {
          b.className = "inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-xs transition hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1";
        }
      });
    };

    if (btnPresetMaleFemale) {
      btnPresetMaleFemale.addEventListener("click", () => {
        const model = getSelectedModel();
        const pitch = model && typeof model.defaultPitch === "number" ? model.defaultPitch : 12;
        const fmt = (v) => (v > 0 ? "+" : "") + v;
        setPitchMode(
          pitch,
          model
            ? `已为「${model.name}」设置跨音域建议值 ${fmt(pitch)} 半音。若出现电音或过尖，请向 0 逐步回调。`
            : `✨ 当前已设为 ${fmt(pitch)} 半音：男声变女角色推荐音高。`,
          btnPresetMaleFemale
        );
      });
    }

    if (btnPresetSame) {
      btnPresetSame.addEventListener("click", () => {
        setPitchMode(0, "当前已设为 0 半音：保留输入的自然音高，也是 RVC 的安全默认值。", btnPresetSame);
      });
    }

    if (btnPresetFemaleMale) {
      btnPresetFemaleMale.addEventListener("click", () => {
        setPitchMode(-12, "✨ 当前已设为 -12 半音：女声变男角色降低 1 个八度，沉稳低厚自然。", btnPresetFemaleMale);
      });
    }

    // Slider pitch feedback
    if (pitchInput && pitchVal) {
      pitchInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        pitchVal.textContent = (val > 0 ? "+" : "") + val;
        [btnPresetMaleFemale, btnPresetSame, btnPresetFemaleMale].forEach((b) => {
          if (b) {
            b.setAttribute("aria-pressed", "false");
            b.className = "inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-xs transition hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1";
          }
        });
        if (pitchTip) {
          if (val === 12) pitchTip.textContent = "当前为 +12 半音：仅适合明显跨音域输入；若有金属感，请向 0 回调。";
          else if (val === 0) pitchTip.textContent = "当前为 0 半音：保留自然原调。";
          else if (val === -12) pitchTip.textContent = "当前为 -12 半音：仅适合明显跨音域输入；若低沉失真，请向 0 回调。";
          else pitchTip.textContent = `🎛️ 自定义音高偏移: ${(val > 0 ? "+" : "")}${val} 半音。`;
        }
      });
    }

    // Slider index rate feedback
    const indexRateInput = document.getElementById("rvc-index-rate");
    const indexRateVal = document.getElementById("rvc-index-rate-value");
    if (indexRateInput && indexRateVal) {
      indexRateInput.addEventListener("input", (e) => {
        indexRateVal.textContent = parseFloat(e.target.value).toFixed(2);
      });
    }

    // Slider protect feedback
    const protectInput = document.getElementById("rvc-protect");
    const protectVal = document.getElementById("rvc-protect-value");
    if (protectInput && protectVal) {
      protectInput.addEventListener("input", (e) => {
        protectVal.textContent = parseFloat(e.target.value).toFixed(2);
      });
    }

    // Convert Button
    const convertBtn = document.getElementById("rvc-convert");
    if (convertBtn) {
      convertBtn.addEventListener("click", () => runRvcInference());
    }

    // Preload & Cache Management Buttons
    const preloadBtn = document.getElementById("rvc-preload-btn");
    if (preloadBtn) {
      preloadBtn.addEventListener("click", () => startManualPrewarm());
    }
    const clearCacheBtn = document.getElementById("rvc-clear-cache-btn");
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener("click", () => clearModelCache());
    }

    // 导入自己训练/转换的 .onnx 模型
    const ownModelFile = document.getElementById("rvc-own-model-file");
    if (ownModelFile) {
      ownModelFile.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) importOwnModel(file);
        e.target.value = "";
      });
    }

    // 文本朗读（TTS，第三输入源）：探测受保护或本机 edge-tts 服务 → 合成中性人声 → 自动用当前角色变声
    const ttsSynth = document.getElementById("rvc-tts-synth");
    const ttsConvert = document.getElementById("rvc-tts-convert");
    const ttsReady = document.getElementById("rvc-tts-ready");
    const ttsStatus = document.getElementById("rvc-tts-status");
    const ttsText = document.getElementById("rvc-tts-text");

    const setTtsStatus = (msg, tone) => {
      if (!ttsStatus) return;
      ttsStatus.textContent = msg;
      if (tone === "ok") ttsStatus.className = "text-xs leading-5 text-emerald-600 font-semibold";
      else if (tone === "err") ttsStatus.className = "text-xs leading-5 text-red-600 font-semibold";
      else ttsStatus.className = "text-xs leading-5 text-muted";
    };

    const setTtsReady = (ok) => {
      state.ttsEnabled = ok;
      if (!ttsReady) return;
      if (ok) {
        ttsReady.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-500"></i>TTS 服务正常 · 可角色朗读';
        ttsReady.className = "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700";
      } else {
        ttsReady.innerHTML = '<i class="fa-solid fa-plug-circle-xmark text-red-500"></i>未检测到 TTS 服务 (edge-tts)';
        ttsReady.className = "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700";
      }
    };

    // 探测端点是否可达（GET /health 或 OPTIONS），仅用于 UI 状态
    const probeSingleBase = async (base) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const res = await fetch(ttsEndpoint(base, "health"), { method: "GET", signal: controller.signal }).catch(() => null);
        if (res && res.ok) {
          try { return (await res.json())?.ready === true; } catch { return true; }
        }
      } catch (e) {} finally {
        clearTimeout(timer);
      }
      return false;
    };

    const probeTts = async () => {
      if (state.ttsLoading) return;
      state.ttsLoading = true;
      try {
        const base = getTtsBase();
        const ok = await probeSingleBase(base);
        setTtsReady(ok);
      } catch {
        setTtsReady(false);
      } finally {
        state.ttsLoading = false;
      }
    };

    // 取当前文字，调用本机 /rvc/tts 合成中性人声 WAV，返回 File
    const synthTts = async () => {
      const text = (ttsText?.value || "").trim();
      if (!text) {
        setTtsStatus("请输入要朗读的文字。", "err");
        return null;
      }
      if (!state.ttsEnabled) {
        setTtsStatus("TTS 服务未就绪，请稍后重试或使用一键适配连接本机服务。", "err");
        return null;
      }
      setTtsStatus("正在合成中性人声…", null);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        const res = await fetch(ttsEndpoint(getTtsBase(), "synthesize"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.size) throw new Error("空响应");
        const file = new File([blob], `tts_${Date.now()}.mp3`, { type: res.headers.get("Content-Type") || "audio/mpeg" });
        return file;
      } catch (err) {
        setTtsStatus(`合成失败：${err.name === "AbortError" ? "等待超时" : err.message}。可稍后重试或用「一键适配」连接本机服务。`, "err");
        return null;
      } finally {
        clearTimeout(timer);
      }
    };

    // 用 handleAudioSelected 把合成 wav 变成当前输入音频，随后可走下方变声
    const applyTtsAsInput = async (file) => {
      if (!file) return;
      await handleAudioSelected(file);
      const preview = document.getElementById("rvc-tts-preview");
      if (preview) {
        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
      }
      const result = document.getElementById("rvc-tts-result");
      if (result) result.classList.remove("hidden");
      setTtsStatus(`已合成 ${(file.size / 1024).toFixed(0)} KB，可点击下方「开始变声」用当前角色朗读。`, "ok");
    };

    if (ttsSynth) {
      ttsSynth.addEventListener("click", async () => {
        const file = await synthTts();
        if (file) await applyTtsAsInput(file);
      });
    }
    if (ttsConvert) {
      ttsConvert.addEventListener("click", async () => {
        const file = await synthTts();
        if (!file) return;
        await applyTtsAsInput(file);
        runRvcInference();
      });
    }
    if (ttsText) {
      ttsText.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          ttsConvert?.click();
        }
      });
    }

    // Only probe after the user opens the TTS source. Public GitHub Pages has
    // no same-origin /v1/tts-health route, so eager probing created a harmless
    // but noisy 404 on every visit and made browser diagnostics differ.
    const ttsBtn = document.getElementById("rvc-source-tts");
    if (ttsBtn) ttsBtn.addEventListener("click", probeTts);

    // 一键适配：并行快速探测本机/常见地址 → 写入 localStorage（立即生效）→ 下载配置文件
    const adaptBtn = document.getElementById("rvc-tts-adapt");
    const manualBaseInput = document.getElementById("rvc-tts-manual-base");
    const applyFoundBase = (base, from = "auto") => {
      try { window.localStorage.setItem(TTS_LOCAL_STORAGE_KEY, base); } catch (e) {}
      // 生成可下载的配置文件内容（用户可覆盖官方 postprep-config.js，或直接参考）
      const configContent = [
        "// 由「一键适配」自动生成/手动填写的文本朗读(TTS)配置",
        "// 用法：把下面这一行覆盖到 assets/postprep-config.js 的对应位置，或直接参考。",
        `globalThis.__RVC_TTS_BASE__ = ${JSON.stringify(base)};`,
        "",
      ].join("\n");
      const blob = new Blob([configContent], { type: "application/javascript;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "postprep-config.rvc-tts.js";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setTtsReady(true);
      setTtsStatus(`✅ 已连接 TTS 服务：${base}（已保存到本浏览器，立即生效）。也已下载配置文件备用。`, "ok");
    };
    if (adaptBtn) {
      adaptBtn.addEventListener("click", async () => {
        if (state.ttsAdapting) return;
        state.ttsAdapting = true;
        adaptBtn.disabled = true;
        adaptBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>正在自动适配…</span>';
        const priorDisabled = ttsConvert?.disabled;
        setTtsStatus("正在自动检测 TTS 服务…", null);
        try {
          // 若已手动填了地址，优先直接用它
          const manual = (manualBaseInput?.value || "").trim().replace(/\/+$/, "");
          if (manual) {
            const ok = await probeSingleBase(manual);
            if (ok) { applyFoundBase(manual, "manual"); return; }
            setTtsStatus(`手动填入的地址不可达：${manual}。请检查服务是否已启动，或清空改用自动检测。`, "err");
            return;
          }
          // 优先串行探测同源 + 注入地址（serve.js 反向代理后走同源必成功，最快最稳）
          const priority = [...new Set([TTS_SAME_ORIGIN, TTS_INJECTED_BASE].filter(Boolean))];
          let found = null;
          for (const base of priority) {
            if (await probeSingleBase(base)) { found = base; break; }
          }
          // 其余候选（hostname 推导 / 回环）并行兜底
          if (!found) {
            const rest = TTS_CANDIDATES.filter((b) => !priority.includes(b));
            const results = await Promise.allSettled(rest.map(async (base) => ({ base, ok: await probeSingleBase(base) })));
            found = results.find((r) => r.status === "fulfilled" && r.value.ok)?.value?.base || null;
          }
          if (found) { applyFoundBase(found); return; }
          setTtsStatus(
            "⚠️ 未检测到可用的 TTS 服务。请在下方“手动填写服务地址”输入你部署的 TTS 地址（如 http://192.168.1.3:8080），再点一次「一键适配」。", "err"
          );
          setTtsReady(false);
        } catch (err) {
          setTtsStatus(`一键适配失败：${err.message}`, "err");
        } finally {
          state.ttsAdapting = false;
          adaptBtn.disabled = false;
          adaptBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>一键适配（自动配置）</span>';
          if (ttsConvert) ttsConvert.disabled = !!priorDisabled;
        }
      });
    }
    // 手动地址回车即触发适配
    if (manualBaseInput) {
      manualBaseInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") adaptBtn?.click();
      });
    }

    setupRecording();
    setupModelTraining();
  }

  document.addEventListener("postprep:languagechange", applyRvcLanguage);

  document.addEventListener("DOMContentLoaded", async () => {
    state.lang = resolveRvcLanguage();
    loadCustomCollections();
    setupEventListeners();
    await initCatalog();
    applyRvcLanguage();
  });
})();
