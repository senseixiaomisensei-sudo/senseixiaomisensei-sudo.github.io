(() => {
  "use strict";
  let chorusController = null;

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MIN_AUDIO_SECONDS = 0.5;
  const WARN_AUDIO_SECONDS = 2;
  const MAX_AUDIO_SECONDS = 900;
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
  function isAppleMobile() {
    const nav=globalThis.navigator;
    return /iPhone|iPad|iPod/iu.test(String(nav?.userAgent || ''))
      || (String(nav?.platform || '')==='MacIntel' && Number(nav?.maxTouchPoints)>1);
  }
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
      eyebrow: "POSTPREP / VOICE STUDIO",
      title: "AI 变声器",
      intro: "选择声线，载入音频，调整音高并转换。",
      noteTitle: "使用提示",
      noteBody: "请仅处理有权使用的声音，并清晰标注生成内容；公开可下载不代表拥有再分发或冒充许可。",
      workflowEyebrow: "WORKSPACE / 01",
      workflowTitle: "声音工作台",
      privacyBadge: "输入用后删除",
      ownModelHint: "上传你本地训练或转换好的 .onnx 角色模型。仅供当前设备使用，不发布，也不会上传。",
      checkingServiceAction: "正在检查服务…",
      rmsLabel: "音量跟随",
      rmsHint: "0 更贴近原唱音量，1 保留模型原始动态；云端与设备端含义一致。",
      mixTitle: "人声与伴奏独立混音",
      mixHint: "先设置比例再变声；结果生成后可点“更新混音”，无需重新分离或变声。",
      mixReset: "恢复默认",
      vocalLevel: "角色人声",
      accompanimentLevel: "原伴奏",
      vocalMute: "静音人声",
      accompanimentMute: "静音伴奏",
      mixUpdate: "更新混音并试听",
      mixInitial: "调整后点击更新混音，预听与下载会同步更新。短期分轨最多保留约 2 小时。",
      modeTitle: "处理模式",
      modeOfficialTitle: "云端优先",
      modeOfficialHint: "使用 PyTorch GPU；不可达时，纯人声转到设备端。翻唱需要云端。",
      modeLocalTitle: "设备端",
      modeLocalHint: "在当前浏览器处理纯人声；音频不上传。翻唱仍需要云端。",
      cacheDefault: "设备端模型保存在浏览器缓存中",
      preload: "预载模型",
      clearCache: "清理缓存",
      createCollection: "创建分区",
      collectionPlaceholder: "例如：我的动漫角色",
      saveCollection: "保存分区",
      cancel: "取消",
      trainedTitle: " 训练完成的模型",
      trainedHint: "选择已训练声线进行云端转换。",
      ownModelTitle: " 导入我自己的模型",
      chooseOnnx: "选择 .onnx 文件",
      sourceTts: "文本朗读",
      sourceTtsHint: "生成朗读后转换声线。",
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
      stepModelHint: "选择分区与声线。",
      searchPlaceholder: "搜索角色…",
      modelEmpty: "没有找到匹配的角色。换个关键词试试。",
      modelCatalogTitle: "角色声音库",
      modelInstalled: "已就绪",
      modelPick: "已选择",
      stepAudio: "2. 上传或录制你的声音",
      localDirectConvert: "转为本地直接变声（不分离伴奏）",
      stepAudioHint: "纯人声最长 20 分钟，云端翻唱最长 15 分钟；文件限 25 MB。",
      sourceUpload: "上传音频",
      sourceUploadHint: "从设备选择文件。",
      sourceRecord: "录制声音",
      sourceRecordHint: "使用麦克风采集。",
      fileEmpty: "尚未选择音频文件。",
      recordStart: "开始录音",
      recordStop: "停止录音",
      recordHint: "录音先保留在浏览器；只有点击“开始变声”后才发送到受保护的 GPU 服务。",
      recordUnsupported: "当前浏览器不支持录音，请改用上传音频。",
      recordDenied: "麦克风权限被拒绝。请在浏览器设置中允许麦克风后重试，或改用上传音频。",
      recordInsecure: "录音需要 HTTPS 环境。当前页面不是安全上下文，请改用上传音频。",
      recordError: "录音启动失败，请改用上传音频。",
      stepSettings: "3. 调节声音（可选）",
      stepSettingsHint: "默认保持原调；跨音域时逐步调节。",
      pitchLabel: "音高调整 (变调)",
      pitchLow: "男声化 (-12)",
      pitchDefault: "原调 (0)",
      pitchHigh: "女声化 (+12)",
      advancedToggle: "高级参数",
      safeModeHint: "稳定模式已启用：固定检索和辅音保护参数，不使用逐帧自适应音色处理；没有索引的角色自动关闭检索。",
      indexRateLabel: "音色相似度",
      indexRateHint: "越高音色越贴近角色，但会增加颗粒风险。建议 0.20–0.40。",
      protectLabel: "辅音与呼吸保护",
      protectHint: "数值越低，清辅音与呼吸保护越强；0.5 会关闭保护。高动态输入建议 0.20–0.30。",
      f0Label: "音高算法",
      f0Rmvpe: "RMVPE（默认）",
      f0Fcpe: "FCPE（长音可试）",
      f0Auto: "自动（显示实际算法）",
      f0Hint: "云端可选；设备端固定使用 RMVPE。自动模式会在结果中显示实际算法。",
      f0Harvest: "Harvest（传统稳健）",
      formatLabel: "输出格式",
      formatWav: "智能格式（手机 MP3 · 电脑 WAV）",
      resampleLabel: "输出采样率",
      resampleKeep: "40 kHz / 48 kHz (标准)",
      checkingService: "正在连接云端 RVC 引擎；此检查不会上传音频…",
      serviceReady: "云端可用",
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
      audioTooLong: "超过当前模式上限：本地公开角色 20 分钟，云端 15 分钟，导入模型 20 秒。请切换模式或裁剪。",
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
      eyebrow: "POSTPREP / VOICE STUDIO",
      title: "AI Voice Changer",
      intro: "Choose a voice, load audio, set pitch, and convert.",
      noteTitle: "Notice",
      noteBody: "The default path uses the pinned RVC-Project HuBERT, RMVPE, real FAISS index, and generator pipeline on a protected GPU service. Public availability is not a redistribution or impersonation license.",
      workflowEyebrow: "WORKSPACE / 01",
      workflowTitle: "Voice workspace",
      privacyBadge: "Input deleted after use",
      ownModelHint: "Import a locally trained or converted .onnx voice model. It stays on this device and is never uploaded or published.",
      checkingServiceAction: "Checking service…",
      rmsLabel: "Volume envelope",
      rmsHint: "0 follows the source level; 1 keeps the model dynamics. Cloud and device use the same meaning.",
      mixTitle: "Independent vocal and backing mix",
      mixHint: "Set the balance before converting. Update a completed mix without repeating separation or voice conversion.",
      mixReset: "Restore defaults",
      vocalLevel: "Character vocal",
      accompanimentLevel: "Original backing",
      vocalMute: "Mute vocal",
      accompanimentMute: "Mute backing",
      mixUpdate: "Update mix and preview",
      mixInitial: "Update the mix to refresh both preview and download. Temporary stems are kept for up to about 2 hours.",
      modeTitle: "Processing mode",
      modeOfficialTitle: "Cloud first",
      modeOfficialHint: "PyTorch GPU inference. Dry vocals fall back to your device if the service is unavailable; covers require cloud.",
      modeLocalTitle: "On device",
      modeLocalHint: "Process dry vocals in this browser without uploading audio. Covers still require cloud.",
      cacheDefault: "On-device models are stored in browser cache",
      preload: "Preload models",
      clearCache: "Clear cache",
      createCollection: "Create collection",
      collectionPlaceholder: "For example: My anime voices",
      saveCollection: "Save collection",
      cancel: "Cancel",
      trainedTitle: " Trained models",
      trainedHint: "Models created by the training tool appear here. You can name their collection before training, then select them for the existing cloud RVC workflow.",
      ownModelTitle: " Import my own model",
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
      localDirectConvert: "Convert on-device (no backing-track separation)",
      stepAudioHint: "Published on-device voices accept 20 minutes of dry vocals; cloud covers accept 15 minutes. Files must be under 25 MB. Prefer MP3/M4A; keep the local page in the foreground with enough memory.",
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
      safeModeHint: "Stable mode is on: retrieval and consonant protection use fixed values. Per-frame adaptive timbre processing is off; voices without an index skip retrieval.",
      indexRateLabel: "Similarity",
      indexRateHint: "Higher can match the character more closely but may add grain. 0.20–0.40 recommended.",
      protectLabel: "Consonant protection",
      protectHint: "Lower values protect unvoiced consonants and breaths more strongly; 0.5 disables protection. Use 0.20–0.30 for high-dynamic input.",
      f0Label: "Pitch extraction",
      f0Rmvpe: "RMVPE (default)",
      f0Fcpe: "FCPE (try for sustained notes)",
      f0Auto: "Auto (show actual method)",
      f0Hint: "Cloud offers a choice; device always uses RMVPE. Auto reports the method used in the result.",
      f0Harvest: "Harvest (Classic)",
      formatLabel: "Output format",
      formatWav: "Smart format (MP3 mobile · WAV desktop)",
      resampleLabel: "Output sample rate",
      resampleKeep: "40 kHz / 48 kHz (Standard)",
      checkingService: "Connecting to the cloud RVC engine; no audio is uploaded…",
      serviceReady: "Cloud available",
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
      audioTooLong: "Current limits: 20 minutes for published on-device voices, 15 minutes for cloud, 20 seconds for imported models. Switch modes or trim the audio.",
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
    hubertV1: {
      name: "hubert-v1.onnx",
      manifestKey: "hubert-v1.onnx",
      chunks: Array.from({ length: 14 }, (_, i) => `models/characters/hubert-v1/chunk_${i}.bin`)
    },
    hubert: {
      name: "hubert.onnx",
      manifestKey: "hubert.onnx",
      chunks: Array.from({ length: 19 }, (_, i) => `models/base/hubert/chunk_${i}.bin`)
    },
    hubertJapanese: {
      "name": "hubert-base-japanese.onnx",
      "manifestKey": "hubert-base-japanese.onnx",
      "sha256": "57af1e85d0252e74f897a29b6d7433f4d162f193d3edced0fec6e6ed80b6f318",
      "totalSize": 377747791,
      "chunks": [
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_0.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_1.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_2.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_3.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_4.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_5.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_6.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_7.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_8.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_9.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_10.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_11.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_12.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_13.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_14.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_15.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_16.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_17.bin",
        "models/base/hubert-japanese/57af1e85d0252e74/chunk_18.bin"
      ],
      "chunkSha256": [
        "25a3244c0ad77bab0dd8c84983be7cacb6a5492cb9985f448d262a72497d7d2c",
        "9787c5d83c9ff3da10eddae222804fb09a4861bae6a1f028e234933578076870",
        "a724215deb10639f9afad397eb1824b480c97f12aeb3001bc9425addb08305ea",
        "6133f0d504f290ef515673aa2992f13f950b8042e714c64809607a4e46f8a840",
        "d7633e5211a0f042e84852313aa90c810444478e6a47c712b68d286c33a66380",
        "c77810f016f2a91734a4e9c414412600c5072723da0f4c329d01d2d30b6b4e98",
        "b708fe759d08d4b1e1f925da518625a41cbc45d2d1eb9a4f5cc9a52c03549412",
        "d396957bbd74a822d32faa7576a0eb294a80023bf106c4c76cf7bbdf366b1147",
        "eb226ba0d7945bf7a80cf61689284325ab436130d9c93395d466b1f801afa329",
        "33baaca99bcb87596a37729e3a482014f9900b824246d1d4046a61e1db272e3e",
        "6e55826718081768efacc01befa017d7ff43eeb3ca9d389d9572e0121a42eafc",
        "3e40ec7487991d2a4e19dc1f8bbf2927e1942d7a2ac3a841c5a3e52062c616b4",
        "a6f9d2f26737a97ffea0c7a8c2528efb6b2f1d4c3876736d59bad8000048ec4c",
        "10ce18e2b207bf0e10314b81cf541f944e17a3d20b69e2482548bdc5f35048dc",
        "78e67d01e0a163874bcf3cc5cc306915abbfa5c76e7f384a3ba89f6cb9a00001",
        "4fe5820d448e65bb34ccaec5a19a956193cb17724740c3aa66299777034674f1",
        "036c45f450b3f4d76f22ac871a9a72a2c4619360a8f652417fc932773f971234",
        "8227ab056acf0e133f20326e1a17f25e11254010e769f78934a458990f9548ea",
        "d7d8c40219c08593c00fa7b218973baf895d5c5e5a331c01c955a472cfe67fc7"
      ],
      "revision": "9c86c1a3424e8cddca3e59d01c2ed5477e628fcc",
      "contentEncoder": "hubert-base-japanese",
      "outputLayer": 12,
      "featureDimension": 768,
      "inputSampleRate": 16000,
      "waveformNormalization": false
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
      "models/characters/arona/revisions/bf9a5293f3178734/chunk_0.bin",
      "models/characters/arona/revisions/bf9a5293f3178734/chunk_1.bin",
      "models/characters/arona/revisions/bf9a5293f3178734/chunk_2.bin",
      "models/characters/arona/revisions/bf9a5293f3178734/chunk_3.bin",
      "models/characters/arona/revisions/bf9a5293f3178734/chunk_4.bin",
      "models/characters/arona/revisions/bf9a5293f3178734/chunk_5.bin"
    ],
    "chunkSha256": [
      "106e507cc44233ad32d0c2b838f34551e0ae52441192efb44ff55a2f44977d67",
      "03460e5ec0e1230108e1085adff489b6b412c6471d38f56e01472319c77d87d2",
      "3db96903625755f3e240b52329e16d69c1c5c97dd4c7ef9cd83c6b3d3949c901",
      "2432b57e3a45d5b124a7ff371f0776a50a13c5a9b2f48b7db8ec7ad70bf30594",
      "58705024de01e076fd32a93f1cd98ab373d7630c398925a2915b12132f24b39d",
      "7fb98aba374cd67392c2ed54879c28e2dfee16c437c991893fa565ea2bc1c7ac"
    ],
    "totalSize": 110813665,
    "sha256": "bf9a5293f3178734e40c5f9a5d9c1933434f7f9aff353c63bb277288fdc56e0e",
    "resourceRevision": "bf9a5293f3178734e40c5f9a5d9c1933434f7f9aff353c63bb277288fdc56e0e",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "0be9ef2dfc003d3c563acac9c5b8d43089d31bf00583d4985c9b98a63756371d",
      "source": "https://bluearchive.wiki/wiki/File:Arona_Work_Talk_3.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/arisu/revisions/772f9aa3a8396fca/chunk_0.bin",
      "models/characters/arisu/revisions/772f9aa3a8396fca/chunk_1.bin",
      "models/characters/arisu/revisions/772f9aa3a8396fca/chunk_2.bin",
      "models/characters/arisu/revisions/772f9aa3a8396fca/chunk_3.bin",
      "models/characters/arisu/revisions/772f9aa3a8396fca/chunk_4.bin",
      "models/characters/arisu/revisions/772f9aa3a8396fca/chunk_5.bin"
    ],
    "chunkSha256": [
      "f7066afc2b831b68890c166b287dad40fd4e69a9589acbed5145f4ca8e2aa65b",
      "3962b4cfa39c49ef006c1c081199fe934fb5ede4891c0df48b7123884dfcdd4d",
      "10a724e28eb0f8db9b10a750639f14955301f30ae7abc027adfb2c1aeefc0648",
      "b46da95bb33fd005d90708443194c452bc489c7f0f3618c9c033fc6e0310986c",
      "39bd84dc4b559a701a9facbed0f8485b736eb0bb0047fda3eaf9c4b6fb83052e",
      "e90bdbfa47e458a10b272944a9e79dc2e51cc95683cefd219c8fb14c43ff8c75"
    ],
    "totalSize": 110813665,
    "sha256": "772f9aa3a8396fca9ee092c11f93a6623b788e425a43a3c31fe06af7f0635e95",
    "resourceRevision": "772f9aa3a8396fca9ee092c11f93a6623b788e425a43a3c31fe06af7f0635e95",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "021d454ca1a0b16b7eb4140c36df9b2d8d9ce2be19adefd8ad9b753ed3386a92",
      "source": "https://bluearchive.wiki/wiki/File:Arisu_Lobby_4.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/shiroko/revisions/e98fcfb3f8441439/chunk_0.bin",
      "models/characters/shiroko/revisions/e98fcfb3f8441439/chunk_1.bin",
      "models/characters/shiroko/revisions/e98fcfb3f8441439/chunk_2.bin",
      "models/characters/shiroko/revisions/e98fcfb3f8441439/chunk_3.bin",
      "models/characters/shiroko/revisions/e98fcfb3f8441439/chunk_4.bin",
      "models/characters/shiroko/revisions/e98fcfb3f8441439/chunk_5.bin"
    ],
    "chunkSha256": [
      "ced700bd51dd5599152c2964c3616e6fbacf43796bc44e9afa10a9f6ca1df868",
      "21d36dd10efb351eded53db1a9202fa590067a65cfcb5307b4d93817070a7b97",
      "7c6e195ca41c35aa2035ea3ead9ff52393e847b49d65c31e3e00210902f66566",
      "d91c99c5ac18ab8ec97f521feaf4fa88215d4dc23778825400a40d13b2038b80",
      "5168d871b7b5a32c1df5f527e71bf18d3cb8514cf24d33aac5112578a895cfe2",
      "fc094ef9daa56c35bf5e36dde75b5b6a5fc9a5b26de50e5da2f712d8efdfa0ca"
    ],
    "totalSize": 110813665,
    "sha256": "e98fcfb3f84414398c4f7c867b5b847999639ad8f791d05e2f696e3000743061",
    "resourceRevision": "e98fcfb3f84414398c4f7c867b5b847999639ad8f791d05e2f696e3000743061",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "26ab61d6f9626832f97e43dd3950349010208e3cfd81623aa5f85860c168752b",
      "source": "https://bluearchive.wiki/wiki/File:Shiroko_Lobby_4.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "hoshino",
    "name": "小鸟游星野 (Hoshino)",
    "avatarText": "星野",
    "description": "阿拜多斯对策委员会 · 星野同角色候选 · RVC v1",
    "tags": [
      "女声",
      "蔚蓝档案",
      "阿拜多斯"
    ],
    "defaultPitch": 0,
    "pitchNote": "同音域输入建议 0；跨音域请使用页面预设后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.45,
    "marketplace": "",
    "source": "https://huggingface.co/spaces/andhikagg/rvc-blue-archive/tree/df977abe54df1db5f5b6ad289a94d645d8656039/weights/blue-archive/TakanashiHoshino",
    "license": "Community model; repository terms vary; character/performer authorization unverified",
    "checkpointSha256": "6f5232f646fd2a8a234118976363d69d3814731bcc6a3692284bae30e5df9d8a",
    "indexSha256": "6bf0be4288532a6db52b827620987e8fe3b169fae162c45a44eb983a4ab74d88",
    "retrieval": "models/characters/hoshino/revisions/43feadde41b72c90/retrieval.bin",
    "chunks": [
      "models/characters/hoshino/revisions/c72753b89ad18035/chunk_0.bin",
      "models/characters/hoshino/revisions/c72753b89ad18035/chunk_1.bin",
      "models/characters/hoshino/revisions/c72753b89ad18035/chunk_2.bin",
      "models/characters/hoshino/revisions/c72753b89ad18035/chunk_3.bin",
      "models/characters/hoshino/revisions/c72753b89ad18035/chunk_4.bin",
      "models/characters/hoshino/revisions/c72753b89ad18035/chunk_5.bin"
    ],
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 9,
      "featureDimension": 256
    },
    "rvcVersion": "v1",
    "sha256": "c72753b89ad18035827f8fc236c82722d6a4578bb8ec80ac353dfaa941c8635c",
    "chunkSha256": [
      "67f8e52d034fe19ee129d9ae5f8f8e047fa347122859e3de4b074448664c0991",
      "e3872a22a3bf0eaf8a765e7a08d4de8c88e0c466018a53ce182b7e9611219f12",
      "36df0887ceb2b5dbe1f5c0869326025f28c01273cd939cb12777f1de75964eb2",
      "9257545fe753a1a98d36e4f3d461a8130f862f40668871eeccb9d170a92dc5f2",
      "467d9fe13c798296525adbc71b2314ca46d168d8aa38577a9d8125303958f63f",
      "d49628f8607f992db8ef260c89a0847e21221e2590d95a368878729d12214d0c"
    ],
    "totalSize": 110420449,
    "retrievalSha256": "4d8257cb75ee800a4cfcb2c15fda1b00c0d3d225cee57ec90476270ba9f93dfa",
    "resourceRevision": "c72753b89ad18035827f8fc236c82722d6a4578bb8ec80ac353dfaa941c8635c",
    "qualityValidation": "full A/C generated; listening pending",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "be4d6aeeac5c7e2945550f98035a31fd2bd2f16009878260ba91eddb4a7313e0",
      "source": "https://bluearchive.wiki/wiki/File:Hoshino_Lobby_3.ogg",
      "hearing": "用户确认参考音色正常"
    }
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
      "models/characters/yuuka/revisions/3e924d45ffcbd7af/chunk_0.bin",
      "models/characters/yuuka/revisions/3e924d45ffcbd7af/chunk_1.bin",
      "models/characters/yuuka/revisions/3e924d45ffcbd7af/chunk_2.bin",
      "models/characters/yuuka/revisions/3e924d45ffcbd7af/chunk_3.bin",
      "models/characters/yuuka/revisions/3e924d45ffcbd7af/chunk_4.bin",
      "models/characters/yuuka/revisions/3e924d45ffcbd7af/chunk_5.bin"
    ],
    "chunkSha256": [
      "f22b4785b7c48026e283d4eb7a34dfa2a6464fa9cbafb3a2113ff2530407a488",
      "e0955c5711bf4c8d4eb5acf7d855f50ac93293011d5e1b3bb930b1eedc33caaf",
      "b778cdce00814604df5444ebaa8ed63359b42c9b2337e5ca40060aaba16a1502",
      "a60819bfe802894f5ec71fbb3720e8259977d62f9205112e664e0cee519a5b89",
      "792b5dbac93aadcd2bd0d1a31d8ba925411ec43f8878c7225570f683cd588d11",
      "f745ca151f9325b3a92fc565d070f3c8c4163fad6843081719e14c2d01dbff7e"
    ],
    "totalSize": 110813665,
    "sha256": "3e924d45ffcbd7af357a354c273f5a4574dddf883c8602b99b72bdedc56cf911",
    "resourceRevision": "3e924d45ffcbd7af357a354c273f5a4574dddf883c8602b99b72bdedc56cf911",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "0a00a256f751ca4e7f34524760fe980621edfa09e5f997b55e478d1501f50872",
      "source": "https://bluearchive.wiki/wiki/File:Yuuka_Lobby_4.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/hina/revisions/7962512364d15808/chunk_0.bin",
      "models/characters/hina/revisions/7962512364d15808/chunk_1.bin",
      "models/characters/hina/revisions/7962512364d15808/chunk_2.bin",
      "models/characters/hina/revisions/7962512364d15808/chunk_3.bin",
      "models/characters/hina/revisions/7962512364d15808/chunk_4.bin",
      "models/characters/hina/revisions/7962512364d15808/chunk_5.bin"
    ],
    "chunkSha256": [
      "213d41cdee1d4d8d238926acd77d92503ea41de03226401c6133b22f679e804a",
      "9c0a98ec8cdf7ee637e92bd9cd1aaa1609658732b5ddbe4ad4bf6e53ebd18353",
      "ca96a43237a933ad10fd5af8e79fb6c8a914456a497f51dbcf4dc34763e58272",
      "8d353c70066e660ab6732eb3c5989fe4c44f6701c1bfbbe3634171f28248129f",
      "45cecca2632402da8f6c50df3c33daf793a6a066e04b9bf30add3f0d198d2168",
      "4d1c88809a180168b0e21fc35903feb9ba5fc18d63b8cbf8652a19d2cfca3f17"
    ],
    "totalSize": 110813665,
    "sha256": "7962512364d15808b48e8d4d59adc64cdb509c04e5e6dd6c0ce78fefee341846",
    "resourceRevision": "7962512364d15808b48e8d4d59adc64cdb509c04e5e6dd6c0ce78fefee341846",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "d123878f7063e7205f257ff8dbaa0ca9cf43657e72873695bdfc5ecef7a11743",
      "source": "https://bluearchive.wiki/wiki/File:Hina_Lobby_4.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/noa/revisions/41f93d94f6e98776/chunk_0.bin",
      "models/characters/noa/revisions/41f93d94f6e98776/chunk_1.bin",
      "models/characters/noa/revisions/41f93d94f6e98776/chunk_2.bin",
      "models/characters/noa/revisions/41f93d94f6e98776/chunk_3.bin",
      "models/characters/noa/revisions/41f93d94f6e98776/chunk_4.bin",
      "models/characters/noa/revisions/41f93d94f6e98776/chunk_5.bin"
    ],
    "chunkSha256": [
      "416b10f5a92bfad33458280c58e0a7a6389db0f5cfcebe39817777adf4ec7a04",
      "f3798e87c1ea76b5bea92ca78fc81dfbdee2b7b01b3942e6e03e61f5a2d06f02",
      "fcd56d55ba4080f196e9e908afc8b7142015eda0f2c04268af1464f3d56d746d",
      "52368d420e2dab33fb88ec4d4fc69da1ac28a27d5e48cab5adafaf72b97ea5a4",
      "b372b4c2f0855f7f8d8cc3765a5fe63047ef03ca20f34ecf6ea94c7edabc6a0c",
      "6c186a4e6cdf983ae82c5f1bbd9a31726ad41fe4a9887d9391e5a620d7158ab3"
    ],
    "totalSize": 110813665,
    "sha256": "41f93d94f6e987764c6653b0731a837986b49edcc7a6390bcfb8ddace4bafabf",
    "resourceRevision": "41f93d94f6e987764c6653b0731a837986b49edcc7a6390bcfb8ddace4bafabf",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "3d8591d9b61e72a547b64873ffc1fa12e632aa8d53cb1e0544d2bea8e269d823",
      "source": "https://bluearchive.wiki/wiki/File:Noa_Lobby_5.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/koharu/revisions/be7aafff166c3c20/chunk_0.bin",
      "models/characters/koharu/revisions/be7aafff166c3c20/chunk_1.bin",
      "models/characters/koharu/revisions/be7aafff166c3c20/chunk_2.bin",
      "models/characters/koharu/revisions/be7aafff166c3c20/chunk_3.bin",
      "models/characters/koharu/revisions/be7aafff166c3c20/chunk_4.bin",
      "models/characters/koharu/revisions/be7aafff166c3c20/chunk_5.bin"
    ],
    "chunkSha256": [
      "aaa15c85313ef7398efe4ffc93b5dda73cebd6fbddec7daac035c686cf9ac104",
      "94608e6477406ec0ba3227a55fa25606f7e31dfaf773bda835af5442b23ea04a",
      "4a1a2e9bd343cb93c7cbd11cae892a5286c59138d81cff4ca26d3060dec85cc2",
      "3336a89e126221cb98ee98a3888116c5208a247eb190c6b364e8418d059620b2",
      "7d36d9253871803785671d4f7f657aca31fe9f548783c25738e36b0fe4bd8a20",
      "05c10ccfedec28a9d0b1b6edcda1efb2ae4c9fbaffd72cc26299a6c4335754f8"
    ],
    "totalSize": 110813665,
    "sha256": "be7aafff166c3c20baaf9908140d2bb0568c8321576deda0102beb325f2e6a2d",
    "resourceRevision": "be7aafff166c3c20baaf9908140d2bb0568c8321576deda0102beb325f2e6a2d",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "1f0e1d9e87ca466b20554fddd774f593c01ef827badb9a04c6c24d4bece25d4e",
      "source": "https://bluearchive.wiki/wiki/File:Koharu_Lobby_4.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/momoi/revisions/00c4d1f74f03d7ca/chunk_0.bin",
      "models/characters/momoi/revisions/00c4d1f74f03d7ca/chunk_1.bin",
      "models/characters/momoi/revisions/00c4d1f74f03d7ca/chunk_2.bin",
      "models/characters/momoi/revisions/00c4d1f74f03d7ca/chunk_3.bin",
      "models/characters/momoi/revisions/00c4d1f74f03d7ca/chunk_4.bin",
      "models/characters/momoi/revisions/00c4d1f74f03d7ca/chunk_5.bin"
    ],
    "chunkSha256": [
      "5bb5b16aa4de48561f1ede72810ae5187c58a02f6837f49fb83def2763dde4e1",
      "87f847c7f38656a083f1e31fecd7b74f09d6431655fcfc4143b2fef6066dda17",
      "1fb2bdf231ab2a4a3d971cb777be618ce2bc250429ef5d529c3ba15f9cde7cd7",
      "86d9bab4f949e9919d9c46be018a5c08376f498b7040d0d536b239806fd4987c",
      "ed3166ef362e9129bb8e96804134465ff6ff2874bbdf5f2cc6d7d79e196910e4",
      "ee228916564b90d3d9dcbff28e6efeec656f0692e707c0dd572ba2522d35a5c4"
    ],
    "totalSize": 110813665,
    "sha256": "00c4d1f74f03d7caa468321d29d81df3c22981f105fd3aa7998c6cbb25e1c7ef",
    "resourceRevision": "00c4d1f74f03d7caa468321d29d81df3c22981f105fd3aa7998c6cbb25e1c7ef",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "f5985cb2b80d5fef14b60cba62ed3c53b57776efa79bcd78206030313daaa844",
      "source": "https://bluearchive.wiki/wiki/File:Momoi_Lobby_3.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/midori/revisions/ab5bd6c767e76193/chunk_0.bin",
      "models/characters/midori/revisions/ab5bd6c767e76193/chunk_1.bin",
      "models/characters/midori/revisions/ab5bd6c767e76193/chunk_2.bin",
      "models/characters/midori/revisions/ab5bd6c767e76193/chunk_3.bin",
      "models/characters/midori/revisions/ab5bd6c767e76193/chunk_4.bin",
      "models/characters/midori/revisions/ab5bd6c767e76193/chunk_5.bin"
    ],
    "chunkSha256": [
      "ee5745b6ec67275d2a25520251f4b6679bb778b61a430e29dbc70b2a87261686",
      "fa6a6f86edc80e9d062c47c91a36e1a18d200aa108a10158207396ffe64c8515",
      "0bf8dfb1c28967dbc64720a614a85cd61706e66a2d699daa8c77b900d7fe0e99",
      "928df160ba0942ca7aa1ca2501d513a8c88ebabfe0f889c23d3a80d38de0a73c",
      "5cbdfd232b756a791d61694271edd0b674e93b5f94ab01ffabaaa2a1f395543e",
      "b4607634096734c729176b9f9c15bd1b54d389c67c35f46ae697aa4c42a1b54f"
    ],
    "totalSize": 110813665,
    "sha256": "ab5bd6c767e761936268fd924813902c1999dcc484bdac8f364809d5258362fc",
    "resourceRevision": "ab5bd6c767e761936268fd924813902c1999dcc484bdac8f364809d5258362fc",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "f68a32efc50fa90ea42dc3406319c6430151033307567e3d3a792d48ae4bad07",
      "source": "https://bluearchive.wiki/wiki/File:Midori_Lobby_5.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/reisa/revisions/e17d27c99477811f/chunk_0.bin",
      "models/characters/reisa/revisions/e17d27c99477811f/chunk_1.bin",
      "models/characters/reisa/revisions/e17d27c99477811f/chunk_2.bin",
      "models/characters/reisa/revisions/e17d27c99477811f/chunk_3.bin",
      "models/characters/reisa/revisions/e17d27c99477811f/chunk_4.bin",
      "models/characters/reisa/revisions/e17d27c99477811f/chunk_5.bin"
    ],
    "chunkSha256": [
      "7b89f191b1427a66138d263c4fdad21bb27aac6bbe88d73e7cbd6296e61734fc",
      "4759e915e05c650aab01b02ab963339c145fd6a5a171a3c6112c08458cf91d41",
      "c060fe826cf655b8a49e04fbddd435a786db6306dbb5d700247b8f254a511261",
      "5c5181d83cd8e6921b5e9a089b898cbfaa453fde5c0f4067f7861e3d262a0593",
      "99ac33861364633d4357df1f1385056bbe0ecf8babcacfd4cd70a8b733b5772b",
      "0dd1f97b899088bc8c5f99cc80ea4829b59859136438347f8f295a2be334a9a9"
    ],
    "totalSize": 110813665,
    "sha256": "e17d27c99477811fe14475fba18952d1903430c5f4fa1ed823eb957b4914c4bb",
    "resourceRevision": "e17d27c99477811fe14475fba18952d1903430c5f4fa1ed823eb957b4914c4bb",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "976cfe5dae959437f20f46a4549cb97f720f7ff3238dc9380dab9515f589c656",
      "source": "https://bluearchive.wiki/wiki/File:Reisa_Lobby_3.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/yuzu/revisions/827b147a83c1b7d5/chunk_0.bin",
      "models/characters/yuzu/revisions/827b147a83c1b7d5/chunk_1.bin",
      "models/characters/yuzu/revisions/827b147a83c1b7d5/chunk_2.bin",
      "models/characters/yuzu/revisions/827b147a83c1b7d5/chunk_3.bin",
      "models/characters/yuzu/revisions/827b147a83c1b7d5/chunk_4.bin",
      "models/characters/yuzu/revisions/827b147a83c1b7d5/chunk_5.bin"
    ],
    "chunkSha256": [
      "16a6c97a8516245dc978ebef5b851044f1e040117c53dfe59c6e1774e9df08aa",
      "3ac9046a770515c09e76a21c165e445c70e8462731edeac5ef179dde94748cc0",
      "728f77e94cde67b59d54b7d5c179ee902b1c5510b6f7940148fbdd793a9a524a",
      "be90830fbaa21a27221b5d62df46ad067dd0ccab6d878450ab4385e2ec41efcd",
      "108476cdc3ffe3c6258cc651697ea6ca319ec4e85f916a804eaec49ea242a274",
      "df75593fca2e4ffd8a2e830272458e396edd648c7b4070c65ba8d6d49427a3d2"
    ],
    "totalSize": 110813665,
    "sha256": "827b147a83c1b7d59e373f4e8deb4f8e65b812441e169c329dd3e918ea059b18",
    "resourceRevision": "827b147a83c1b7d59e373f4e8deb4f8e65b812441e169c329dd3e918ea059b18",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "87f493f89224d33c1b35d60a95a8c20de4f5d4ff3c07ad499d934a9294058f39",
      "source": "https://bluearchive.wiki/wiki/File:Yuzu_Lobby_3.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/toki/revisions/183995e73947ebd5/chunk_0.bin",
      "models/characters/toki/revisions/183995e73947ebd5/chunk_1.bin",
      "models/characters/toki/revisions/183995e73947ebd5/chunk_2.bin",
      "models/characters/toki/revisions/183995e73947ebd5/chunk_3.bin",
      "models/characters/toki/revisions/183995e73947ebd5/chunk_4.bin",
      "models/characters/toki/revisions/183995e73947ebd5/chunk_5.bin"
    ],
    "chunkSha256": [
      "433d045f98280d10f3e76c6e5d85879a388e06770116b1a8496471cffc3d9182",
      "4daedaaa5136f083d6937a279815df3984b386f6fc812387f6a7300ef2a8e04f",
      "701bf4b305a1eba3db1e343e3358a94e7e278b2d6945accb4aa2dab7ca576cc3",
      "4e3d0d6d4fdd47277613d930af955fd257e0c8cabced9a3f214649ef7a825be6",
      "8fcc6eed330245401bd5cc51bfc4b57fba5e412c9762c859bdcea29e497294c2",
      "24fc17f27a42c8f243e59f20803eab12f567f3e1fba2dae36333fa5e99908541"
    ],
    "totalSize": 110813665,
    "sha256": "183995e73947ebd56f30f2cf8a367ef8d7f9564d7034104e1932ba7f6275a373",
    "resourceRevision": "183995e73947ebd56f30f2cf8a367ef8d7f9564d7034104e1932ba7f6275a373",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "ae8273ef86980c9828e7112e40425eca424bf807cb54cb8c51ef40edeb014eaa",
      "source": "https://bluearchive.wiki/wiki/File:Toki_Lobby_1.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/asuna/revisions/1feab8f91332dc0a/chunk_0.bin",
      "models/characters/asuna/revisions/1feab8f91332dc0a/chunk_1.bin",
      "models/characters/asuna/revisions/1feab8f91332dc0a/chunk_2.bin",
      "models/characters/asuna/revisions/1feab8f91332dc0a/chunk_3.bin",
      "models/characters/asuna/revisions/1feab8f91332dc0a/chunk_4.bin",
      "models/characters/asuna/revisions/1feab8f91332dc0a/chunk_5.bin"
    ],
    "chunkSha256": [
      "7be8db521a6a808dab07273511e5e5655a5ed3c3d71857b5e565a029a8554799",
      "aaada7ed85911de57092f3a1ac08460f67537ab1ed4dcc8acd6dddb313482905",
      "bd182be5e3a2641f56a2ba7a0b5d2fa16dfed5d500512a89a61ebd0bbe5dbcc5",
      "04fa44fe44bcea394d4db4be21dc903ee543d875c1b67df2597645c35750107c",
      "ee4c31b6dc07c3c38ea99b3a7f2f42927d6bfc2e57e209e548737b35ae7266cd",
      "575b3ce48048dfc65f0f379f5ffc49feb40b15b44ac7e0dac54abd0da828f8f6"
    ],
    "totalSize": 110813665,
    "sha256": "1feab8f91332dc0a178b997baab0f0965b4b613df069c4b99185f0516b5129dc",
    "resourceRevision": "1feab8f91332dc0a178b997baab0f0965b4b613df069c4b99185f0516b5129dc",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "c2937f0577986bc7e39bc2c333f89a9d577a64bd1fa9cd9ac58b395ba5aaeee2",
      "source": "https://bluearchive.wiki/wiki/File:Asuna_Lobby_2.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/aru/revisions/d69cbf6b7c91aeaa/chunk_0.bin",
      "models/characters/aru/revisions/d69cbf6b7c91aeaa/chunk_1.bin",
      "models/characters/aru/revisions/d69cbf6b7c91aeaa/chunk_2.bin",
      "models/characters/aru/revisions/d69cbf6b7c91aeaa/chunk_3.bin",
      "models/characters/aru/revisions/d69cbf6b7c91aeaa/chunk_4.bin",
      "models/characters/aru/revisions/d69cbf6b7c91aeaa/chunk_5.bin"
    ],
    "chunkSha256": [
      "311e592c848cdd02f47f3acb20bf1dd8da49eeb528fd8f9bc5d4fa2ccc03829f",
      "8b13b098f7545ae570117475795814294890fa9ff2d29f8165d4669838bbcbd2",
      "571ca230a1ac14d1c9a2480fbcd36f2e4f34f338478766a1cb2951b797276f40",
      "e05f5e6f24b91a2864c374927932a76376899dcdfb399a31c0f5ac99641750f3",
      "445389e2c0aceda0b07c27d8dc73ead110c813487209a6ef704e054a6ecca947",
      "8d8f3bf8626c434e5cbe6102a75632a77cc5f3fb085305a538a818819c5a4def"
    ],
    "totalSize": 110813665,
    "sha256": "d69cbf6b7c91aeaaa742c4b313489198663084562788d90e7ccd25787adbba63",
    "resourceRevision": "d69cbf6b7c91aeaaa742c4b313489198663084562788d90e7ccd25787adbba63",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "6dd040992fa72365cecc4a68fa2d9e672d1f04d0bb9c73e8e14ca6e59aefbde0",
      "source": "https://bluearchive.wiki/wiki/File:Aru_Lobby_5.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/kirara/revisions/f6e1cd66f26242da/chunk_0.bin",
      "models/characters/kirara/revisions/f6e1cd66f26242da/chunk_1.bin",
      "models/characters/kirara/revisions/f6e1cd66f26242da/chunk_2.bin",
      "models/characters/kirara/revisions/f6e1cd66f26242da/chunk_3.bin",
      "models/characters/kirara/revisions/f6e1cd66f26242da/chunk_4.bin",
      "models/characters/kirara/revisions/f6e1cd66f26242da/chunk_5.bin"
    ],
    "chunkSha256": [
      "590e7d05ed69c01e703d143ef25e58f3975aafb7e5d1ecb38bb8f75a4b3514f1",
      "757c16dad5b778c73aa0e15a1758211d362a8654e55daf8a7ec202ddb8016e41",
      "a4c1fc44b6d71542dff63ca20d00de40fa3c7d620cfbd4873697a401be0bba66",
      "cb2fb2a1d18aca54c4afb59f61891e6a320d5733b3a127af9110e1cd2c2213da",
      "87349880a6776cfc0c6f59b0c523e206dec18c5dac354fc586c796e8da177e4d",
      "a8c3fb648cf8bedfd3d857026a8fd22b03d227d991df8c1f7537d2d5e996f5e2"
    ],
    "totalSize": 110813665,
    "sha256": "f6e1cd66f26242da263e93bbc0e280151dd9b1ed2c451e5d9bbc652270e80601",
    "resourceRevision": "f6e1cd66f26242da263e93bbc0e280151dd9b1ed2c451e5d9bbc652270e80601",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "47f57c19874209403e98917cc346d4be5cc58d04e3b1459e25f1cd536eb484f8",
      "source": "https://bluearchive.wiki/wiki/File:Kirara_Lobby_3.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/koyuki/revisions/dad207130d7acd34/chunk_0.bin",
      "models/characters/koyuki/revisions/dad207130d7acd34/chunk_1.bin",
      "models/characters/koyuki/revisions/dad207130d7acd34/chunk_2.bin",
      "models/characters/koyuki/revisions/dad207130d7acd34/chunk_3.bin",
      "models/characters/koyuki/revisions/dad207130d7acd34/chunk_4.bin",
      "models/characters/koyuki/revisions/dad207130d7acd34/chunk_5.bin"
    ],
    "chunkSha256": [
      "ebcee76224b46555ad0d8d78818c756a6e755a9c96f4f5f6bc55f2e3ea3dd749",
      "099309f0add6d5af5768d5aa652b9443e6d6a679f6a95b0990b9bf0f6afd519f",
      "25d7d4ab29033c58ab6c10160d3a06f6362476f7f70de02502c48955a7b95324",
      "231f51a895bbbb154701f517d8df42f82dfe24a2f0071b8e0944cec4cadd8070",
      "e99aa25f97f0d93e5b092d3c984963cac1111832316129520dacacd477c182f0",
      "a86a08f4eeac9f9b386a42fcf5a3ce6d7f6ed886ba41b34b4e0a266295885df8"
    ],
    "totalSize": 115532257,
    "sha256": "dad207130d7acd347eff3a5002190358cd3c6553d36f8178e1d4f2e4ebb1cda7",
    "resourceRevision": "dad207130d7acd347eff3a5002190358cd3c6553d36f8178e1d4f2e4ebb1cda7",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "3daa64e743d94184bb80d731805dd304a79c9a39a031a8f2a0efdfb4a8623a8c",
      "source": "https://bluearchive.wiki/wiki/File:Koyuki_Lobby_4.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/kayoko/revisions/70eeb1e76926e1c1/chunk_0.bin",
      "models/characters/kayoko/revisions/70eeb1e76926e1c1/chunk_1.bin",
      "models/characters/kayoko/revisions/70eeb1e76926e1c1/chunk_2.bin",
      "models/characters/kayoko/revisions/70eeb1e76926e1c1/chunk_3.bin",
      "models/characters/kayoko/revisions/70eeb1e76926e1c1/chunk_4.bin",
      "models/characters/kayoko/revisions/70eeb1e76926e1c1/chunk_5.bin"
    ],
    "chunkSha256": [
      "bc8c615057f6243a8aa811dbdde8d43603f1bba3fd7875ab2575e2fc8d176a25",
      "bbc2114efd8ba099fa86ace138a34b82fcea04523156b27e6b3bc4d1cc3e110c",
      "b120d0d57576015f8e226270c4926ff253b0647ff5b0f308a3f540520525a1f0",
      "d3f7fd520ed2e902ead941402065caa38d4a0e9c419dc700af360b1056d857a6",
      "42417f43ec7d6ee22ef59a37ffef15ea8f3f3c767d8cb665a5f47cbaa20ea5ae",
      "cbe0766d8783ac2f5fe72fe57218dfad0ba3cd8d21124b6db1c63e7bf6face9f"
    ],
    "totalSize": 110813665,
    "sha256": "70eeb1e76926e1c193fde0da3cf3dfcd7c28a1ee6a951fc834f9239ea593a72f",
    "resourceRevision": "70eeb1e76926e1c193fde0da3cf3dfcd7c28a1ee6a951fc834f9239ea593a72f",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "8bbceb736fd74764911855e85426fb8b879b45f423bbb0c339a54003a5cad160",
      "source": "https://bluearchive.wiki/wiki/File:Kayoko_Lobby_2.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/seia/revisions/e754de7890a5d9d6/chunk_0.bin",
      "models/characters/seia/revisions/e754de7890a5d9d6/chunk_1.bin",
      "models/characters/seia/revisions/e754de7890a5d9d6/chunk_2.bin",
      "models/characters/seia/revisions/e754de7890a5d9d6/chunk_3.bin",
      "models/characters/seia/revisions/e754de7890a5d9d6/chunk_4.bin",
      "models/characters/seia/revisions/e754de7890a5d9d6/chunk_5.bin"
    ],
    "chunkSha256": [
      "b6d3a3affa46ef8562444aff9402fcc9532188b4c366ba749b0dbdcb031b5a99",
      "f80584f798209415120ce164042480bde0f387b905ce2360315ca670912b230c",
      "a8328b6f815ffd7e4b3cdea9f20b5862f44466e8f187b105649aefa798c22bf0",
      "af914a008b87f157d71ee5be39158e6d4736b677e8b7d18b8304f115993ea5d3",
      "6ac933e85c392e5387c08ca4ec5b1c19a96649ccd89c1d11e95ebfb9eb2eb415",
      "5723bf61afcf2e7b229d74178e702f007830c55b9f20131e8d1b1711cf52ae66"
    ],
    "totalSize": 110813665,
    "sha256": "e754de7890a5d9d66cca061caaf3c5c330b3435819d7c6fd6dc1c4778eb52b28",
    "resourceRevision": "e754de7890a5d9d66cca061caaf3c5c330b3435819d7c6fd6dc1c4778eb52b28",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "dd0d4d4a437e8f039099ede97c676c161fd12ce43e53c08a9a1c8abf73862dc9",
      "source": "https://bluearchive.wiki/wiki/File:Seia_Lobby_2.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/mika/revisions/ed88a9717474c866/chunk_0.bin",
      "models/characters/mika/revisions/ed88a9717474c866/chunk_1.bin",
      "models/characters/mika/revisions/ed88a9717474c866/chunk_2.bin",
      "models/characters/mika/revisions/ed88a9717474c866/chunk_3.bin",
      "models/characters/mika/revisions/ed88a9717474c866/chunk_4.bin",
      "models/characters/mika/revisions/ed88a9717474c866/chunk_5.bin"
    ],
    "chunkSha256": [
      "3fff4d9be769a5bb6734493c56b72fef69e01c7d37c5348547041630e8026fd5",
      "3f816fe355100ed9cf717dc4034f8be0d8db8269be01007481a90346e8e54fc8",
      "1713b637a2e28974848181a9a19a507c2d1fb8701d8628f49c1051083cee644c",
      "44728ad36083cf7351195ba67652454879b8d706f6029b2e14adb59e19eebbae",
      "e74d06c045fbf376948ea7796e58c5015463a6718599ab099789e42f3e3ef5e2",
      "255bd883ffdef395631151fcfcfabc38e3a43462d7abcc30e682712a1fa15e3f"
    ],
    "totalSize": 112894433,
    "sha256": "ed88a9717474c866b5f30edae491f33a913ad3443640d079cf55ceb8b41063e4",
    "resourceRevision": "ed88a9717474c866b5f30edae491f33a913ad3443640d079cf55ceb8b41063e4",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "11867d189828c3ead75aaa6bb133dc013e48f567e521a8bd404f5415ae9b6659",
      "source": "https://bluearchive.wiki/wiki/File:Mika_Lobby_2.ogg",
      "hearing": "未听评"
    }
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
    "indexSha256": "8e643bf9f1ee96e7eb954d9b1dd56cf7fa7bb1c6ec3d02580e394eab2368543e",
    "retrieval": "models/characters/gojo/retrieval.bin",
    "chunks": [
      "models/characters/gojo/revisions/d1896506134d2691/chunk_0.bin",
      "models/characters/gojo/revisions/d1896506134d2691/chunk_1.bin",
      "models/characters/gojo/revisions/d1896506134d2691/chunk_2.bin",
      "models/characters/gojo/revisions/d1896506134d2691/chunk_3.bin",
      "models/characters/gojo/revisions/d1896506134d2691/chunk_4.bin",
      "models/characters/gojo/revisions/d1896506134d2691/chunk_5.bin"
    ],
    "chunkSha256": [
      "c290f500875cf200e9757fa6fee2a845eda3039aac07a63ab7aa9a1e0c17e5b3",
      "1e5782732cd0df4b281c8483a3d1533b9b2b4918171c637f27c55063df17cd94",
      "c3956a5afaf8172334beb3a5cd6c08343950f65741038ed2c5fbe496be45efde",
      "eec572db243b8be0bc6bdbbc79214b745c51a7f358308fb9c89214e115870ba4",
      "c6dbb7617e9b10a3e9d827dc639addfa0221671a22d6f59e02245df56ff39c53",
      "c4587095a20aaec6f57033a6b20b3b765e8493bb816cc79f639c30e93ffdf03c"
    ],
    "totalSize": 115532257,
    "sha256": "d1896506134d26911266c5f23c99697a17d093a062b5caaabd5dbf13eabe8acb",
    "resourceRevision": "d1896506134d26911266c5f23c99697a17d093a062b5caaabd5dbf13eabe8acb",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "62d1ce2bbf36003b98aadc3ab192208dde05eeb61bc8be7d7759418f902dd21e",
      "source": "https://jujutsuphanpara.jp/",
      "hearing": "未听评"
    }
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
      "models/characters/sukuna/revisions/ae5ba5078720c93c/chunk_0.bin",
      "models/characters/sukuna/revisions/ae5ba5078720c93c/chunk_1.bin",
      "models/characters/sukuna/revisions/ae5ba5078720c93c/chunk_2.bin",
      "models/characters/sukuna/revisions/ae5ba5078720c93c/chunk_3.bin",
      "models/characters/sukuna/revisions/ae5ba5078720c93c/chunk_4.bin",
      "models/characters/sukuna/revisions/ae5ba5078720c93c/chunk_5.bin"
    ],
    "chunkSha256": [
      "aff63fc2282b4130289bd1d0ff658a27d6ca0f37bde9b063c50774bd4e3312a7",
      "45d197f5fccc326547b24c3027fb34464540c81bba212f09744161bba1880755",
      "8a550e56c6dfaa36ea21fa915be0c6fc5fa3af470440280ab34c32d4ec61730d",
      "4f18841b796f57fd76b4e15fa5b1bf6913e433dade7a268e513b29e8fae4b64b",
      "4a282d2c9e374eba5d90620ca618854e20c0f41a1cfcf3da54a045f3ab7f45da",
      "e3d0bcdfc1ecb9b008b9334237dcdc5f15172658534c67caf260187488aa7251"
    ],
    "totalSize": 115532257,
    "sha256": "ae5ba5078720c93c37a17d0168fed24a00d612b2d0c7c66bda697d435a62c3bf",
    "resourceRevision": "ae5ba5078720c93c37a17d0168fed24a00d612b2d0c7c66bda697d435a62c3bf",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": false,
      "engine": "rvc",
      "resourceRevision": "",
      "referenceSha256": "",
      "source": "",
      "hearing": "未听评"
    }
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
      "models/characters/geto/revisions/60b389b299b2fd43/chunk_0.bin",
      "models/characters/geto/revisions/60b389b299b2fd43/chunk_1.bin",
      "models/characters/geto/revisions/60b389b299b2fd43/chunk_2.bin",
      "models/characters/geto/revisions/60b389b299b2fd43/chunk_3.bin",
      "models/characters/geto/revisions/60b389b299b2fd43/chunk_4.bin",
      "models/characters/geto/revisions/60b389b299b2fd43/chunk_5.bin"
    ],
    "chunkSha256": [
      "a113a2335401f8423a744da834afc5e21dc2edc10d9876d91a7dad2d60b99dac",
      "27f01d71e689651d41eccfb886bbcc788c784303bf9c3d66c0cdfc11a1449272",
      "c0e86b4b6074dca31318f8afc29e52cde680c70631c31ec28d729642121e5636",
      "150aee1ff6c47b227d6ff7e106d349a57ac3e865a743d3b85962447aa9f2ca7d",
      "2d89c80021e22576b5739d6db28e67ba4a0528a64b32a93d46672e99fda8dc03",
      "1afa7a5d38765f899d7f93ad4ff61b538bf23dc3b1411442b4dd01ac02d5d63a"
    ],
    "totalSize": 115532257,
    "sha256": "60b389b299b2fd43aa44710d58a0cb6abeb8fe7f297424141bffb3eb8ae968ca",
    "resourceRevision": "60b389b299b2fd43aa44710d58a0cb6abeb8fe7f297424141bffb3eb8ae968ca",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": false,
      "engine": "rvc",
      "resourceRevision": "",
      "referenceSha256": "",
      "source": "",
      "hearing": "未听评"
    }
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
      "models/characters/toji/revisions/b3a86a7cf8df0a49/chunk_0.bin",
      "models/characters/toji/revisions/b3a86a7cf8df0a49/chunk_1.bin",
      "models/characters/toji/revisions/b3a86a7cf8df0a49/chunk_2.bin",
      "models/characters/toji/revisions/b3a86a7cf8df0a49/chunk_3.bin",
      "models/characters/toji/revisions/b3a86a7cf8df0a49/chunk_4.bin",
      "models/characters/toji/revisions/b3a86a7cf8df0a49/chunk_5.bin"
    ],
    "chunkSha256": [
      "58e6fb9d37d0eb3e33ff4fda03e44c09fe240d3e227e65798be3ed47232f920b",
      "e813862109e0dc786b708063e24d92ee1437abc48100f6723258b3f366bf23fa",
      "c56bb799350fb47612be4060fd4026c4e7f7f47212cf9c745dce314add75641c",
      "c9da2796a3023b625c366994fb1d4018c120100404ab22f3a8608f70bce5737c",
      "9833072bfc5932d8bd456d2e9780d8c94d1656566972a2ce924b0c5fec322d8b",
      "fc85a0ccd04d894eed1d619d8a364fe6693cd2893209a0cecadf4adf0f1e6190"
    ],
    "totalSize": 115532257,
    "sha256": "b3a86a7cf8df0a496ea02a948beb5354a13eb10de999f0bdbfb3c805e5255a0b",
    "resourceRevision": "b3a86a7cf8df0a496ea02a948beb5354a13eb10de999f0bdbfb3c805e5255a0b",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": false,
      "engine": "rvc",
      "resourceRevision": "",
      "referenceSha256": "",
      "source": "",
      "hearing": "未听评"
    }
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
      "models/characters/megumi/revisions/33e691f9d79fce49/chunk_0.bin",
      "models/characters/megumi/revisions/33e691f9d79fce49/chunk_1.bin",
      "models/characters/megumi/revisions/33e691f9d79fce49/chunk_2.bin",
      "models/characters/megumi/revisions/33e691f9d79fce49/chunk_3.bin",
      "models/characters/megumi/revisions/33e691f9d79fce49/chunk_4.bin",
      "models/characters/megumi/revisions/33e691f9d79fce49/chunk_5.bin"
    ],
    "chunkSha256": [
      "7e40fbf144849f7db7bf627f1dd4a6f97c8b3606d67faa1320a46eeab9eb48a2",
      "8cc5637f2fb2856c805a2b9b71b324fbc5266c0c297ad65d36704ad9bab104c9",
      "837b6285bff4bbf80d2a387d4f2ac0a53fa122db660388fcc94c9ef9be7e08d9",
      "95f5465a40cf014900b419ee7a604094a9daa3e0ea3121c946807e3bfab239af",
      "5152e684446f45f9cb9dc182efc3bc9fcef80e28220deec7a32d4006532efd18",
      "e55519045a9322a037b72c74376299860c58a1aacfdc096a6ff5e80ca38cbf5e"
    ],
    "totalSize": 115532257,
    "sha256": "33e691f9d79fce4983c4694f8ef1f457a475c61d6e3a4c5af44bbdfabb5e32e9",
    "resourceRevision": "33e691f9d79fce4983c4694f8ef1f457a475c61d6e3a4c5af44bbdfabb5e32e9",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "87441d66b92ab17f64cc2db1c10edf8e2e5338c1b5267bb790181b5931c58d45",
      "source": "https://jujutsuphanpara.jp/",
      "hearing": "未听评"
    }
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
      "models/characters/key/revisions/a548c6d95a98a26b/chunk_0.bin",
      "models/characters/key/revisions/a548c6d95a98a26b/chunk_1.bin",
      "models/characters/key/revisions/a548c6d95a98a26b/chunk_2.bin",
      "models/characters/key/revisions/a548c6d95a98a26b/chunk_3.bin",
      "models/characters/key/revisions/a548c6d95a98a26b/chunk_4.bin",
      "models/characters/key/revisions/a548c6d95a98a26b/chunk_5.bin"
    ],
    "chunkSha256": [
      "26d255ed02f76ee1854b14f1b065027450dc10044eee75edcfcb486dc99de9b9",
      "1009ad0fde1c53b6282d9d8f5233abcde3edda3492bc0fd62206c8ef4866214b",
      "e81f3395203e1a0b297bc5bdee9bc3624dfffc21940f7f19b342690636eaf2f7",
      "72b7e850a85c62066233baf0876721ec7d1779ff172a160a9dc2d0d296daf5f3",
      "b4b7e4eed03bc62d23746708685aa1fcbb4aff794e67c6829f93cdd3d1b4bebd",
      "8cc2619af076a899faaf716c573cc95b7f066afd004bec91f2171f2a9d0f734b"
    ],
    "totalSize": 110813665,
    "sha256": "a548c6d95a98a26beac11b0fd2cb9d9e4a72505a4f3f7846a67d09d0c686ce4a",
    "resourceRevision": "a548c6d95a98a26beac11b0fd2cb9d9e4a72505a4f3f7846a67d09d0c686ce4a",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "5634f74b67412cb693ffb0211e0c52a2054b35f28f9abeb7b82ed317f3d1dec2",
      "source": "https://bluearchive.wiki/wiki/File:Kei_Lobby_1_4.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/nonomi/revisions/b47bd717b9e7e344/chunk_0.bin",
      "models/characters/nonomi/revisions/b47bd717b9e7e344/chunk_1.bin",
      "models/characters/nonomi/revisions/b47bd717b9e7e344/chunk_2.bin",
      "models/characters/nonomi/revisions/b47bd717b9e7e344/chunk_3.bin",
      "models/characters/nonomi/revisions/b47bd717b9e7e344/chunk_4.bin",
      "models/characters/nonomi/revisions/b47bd717b9e7e344/chunk_5.bin"
    ],
    "chunkSha256": [
      "340b0745117ac97996a4a847b1c446d5d20b7c77e82e10791b26e546438f5592",
      "e39c4037da80784b2f203ef4a15da7d36254069082a8db50d935b2efeb6a989c",
      "c3a4d26f83ac4899b35c2e9c623c29aa0a00711fc196c0686c0a3ae2c3e7999c",
      "7a0eca68055da92ec9a3880ae1169206c768d5ffd31f65ce99a203768afd7e5e",
      "213f97354737aafbad92eba1540fca6b90e52f435b3e0441994affa114952660",
      "0f8f15ea873f590fa918341616b0dac4342a8abc46bca67ec2d72c757215cc76"
    ],
    "totalSize": 110813665,
    "sha256": "b47bd717b9e7e34415a34f87d8c0a79295202f6c8d76bb279aa097b7275db6a4",
    "resourceRevision": "b47bd717b9e7e34415a34f87d8c0a79295202f6c8d76bb279aa097b7275db6a4",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "39db730105016088510f08cceeb86c93549291fa095182b4619945de7f1ae1c0",
      "source": "https://bluearchive.wiki/wiki/File:Nonomi_Lobby_4.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/serika/revisions/c2aff7b5eb7fc679/chunk_0.bin",
      "models/characters/serika/revisions/c2aff7b5eb7fc679/chunk_1.bin",
      "models/characters/serika/revisions/c2aff7b5eb7fc679/chunk_2.bin",
      "models/characters/serika/revisions/c2aff7b5eb7fc679/chunk_3.bin",
      "models/characters/serika/revisions/c2aff7b5eb7fc679/chunk_4.bin",
      "models/characters/serika/revisions/c2aff7b5eb7fc679/chunk_5.bin"
    ],
    "chunkSha256": [
      "06b7415dc9a9bff72c557f70413d841004ef5ec191bf52b0ba498cafbad69486",
      "cc6a2d92902843a2964d0a398a51639f49862cc25a03fe0358186cde259b2b84",
      "e8f916620f79c2e5f8c8c5a36fc15332dcd7c076804e43e3dd4badba23cb9cd5",
      "e76426a371bc513d47debee69f320b0ba239694bd6cb9e78b8e42a4a5967d9bf",
      "824c62b8de27533582f4aa016254fed5465c7f405424102e2b19f4d91917df94",
      "ecb977f668ad1b0118466f94f43b69d75f927a5dd0ca656ec91fdbaf6de53467"
    ],
    "totalSize": 110813665,
    "sha256": "c2aff7b5eb7fc6795e6a3b16c8b7104d0c95a279d039704559f447330737a6e8",
    "resourceRevision": "c2aff7b5eb7fc6795e6a3b16c8b7104d0c95a279d039704559f447330737a6e8",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "b79f8cafab7c7b5ad68c0d76eb6a95d854be72d447463be8a9fbb932b5a58400",
      "source": "https://bluearchive.wiki/wiki/File:Serika_Lobby_3.ogg",
      "hearing": "未听评"
    }
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
      "models/characters/ayane/revisions/162006ad3d8cdf15/chunk_0.bin",
      "models/characters/ayane/revisions/162006ad3d8cdf15/chunk_1.bin",
      "models/characters/ayane/revisions/162006ad3d8cdf15/chunk_2.bin",
      "models/characters/ayane/revisions/162006ad3d8cdf15/chunk_3.bin",
      "models/characters/ayane/revisions/162006ad3d8cdf15/chunk_4.bin",
      "models/characters/ayane/revisions/162006ad3d8cdf15/chunk_5.bin"
    ],
    "chunkSha256": [
      "0f2d3a06c45f95fd7b648e6943e475d0ab57d448b8d4746c48a5597342b0b2be",
      "e17ef83ffa936e7bcf109f561e0226067500971b908f4ab48cf867d2a5b7c44f",
      "58cb325e221f9f3da50c8a2449aada4298f37b942523e3ad5ecc8919b68f3bc1",
      "b3eb994c8964154060307e54a0eee477d1ea4b1298773f5851cc5d6285d54bbe",
      "6e7322dcc98e72a9a61d3ae7a4765b181806638a9695ddd383949bfe855ebb30",
      "06d51e6a53004dd054aa1f9b972e57f0eacf3ce5f9eb2509cf1cd7edbd4ce504"
    ],
    "totalSize": 110813665,
    "sha256": "162006ad3d8cdf159beca116db16ffb53be51e20d2990d840bf303b4bdebad5a",
    "resourceRevision": "162006ad3d8cdf159beca116db16ffb53be51e20d2990d840bf303b4bdebad5a",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "77ad9538fc5159e86b3b52a65743218b3c99b2644163c3edf8fcf5f82ba26c52",
      "source": "https://bluearchive.wiki/wiki/File:Ayane_Lobby_4.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "maki",
    "name": "小涂真纪 (Maki)",
    "source": "https://www.101soundboards.com/tts/1034740-konuri-maki-blue-archive-sq-tts-text-to-speech/download_model",
    "sampleRate": 40000,
    "rvcVersion": "v1",
    "supportsDevice": true,
    "checkpointSha256": "170a9e6e3f7c79c0eb82f3aa0d8dfad5325e593582386bcac07a46cbc4e51f70",
    "indexSha256": "9576619fa1375174ad1d239769c2ea4049c46ecd295b046a28a21ac2e2a939ed",
    "avatarText": "真纪",
    "description": "千年科学学园 · 本地与云端转换 · 日语社区 RVC V1 声线",
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
      "models/characters/maki/revisions/c33881471e8660ff/chunk_0.bin",
      "models/characters/maki/revisions/c33881471e8660ff/chunk_1.bin",
      "models/characters/maki/revisions/c33881471e8660ff/chunk_2.bin",
      "models/characters/maki/revisions/c33881471e8660ff/chunk_3.bin",
      "models/characters/maki/revisions/c33881471e8660ff/chunk_4.bin",
      "models/characters/maki/revisions/c33881471e8660ff/chunk_5.bin"
    ],
    "chunkSha256": [
      "ef078aba73e30296c63e2f109bab8527a9e07ab0fa4021c35559b8c425cf80fa",
      "139f2d61dbdb932a9ef8e3c4322e7687bcf202493b4edaab4d0f3306ea45a915",
      "1e01350e47b170b483aed582c01c949ba37348f78caf8f77161ee89dd0faaa29",
      "e971fe5135db324f8e22042689ffdf8e4df9ae1fef98fdae358dc62a5734a06c",
      "e6e4f13d4a4b4058cd6d38f4dc58ce6cad99a0b3b1dbfe6efa6e10b3eff3563e",
      "cfeebfb7239fa68d5d690e3349297b50e6b73a7bd72f1d9460979c2c6e0c1e95"
    ],
    "totalSize": 110420449,
    "sha256": "c33881471e8660ff4357bea9aa301bd75c0809f0b3b83735c6d1703a0dbfcf07",
    "resourceRevision": "c33881471e8660ff4357bea9aa301bd75c0809f0b3b83735c6d1703a0dbfcf07",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "aed6a7f29464136eb3ad19fbb490447854026fe546f3836ffb0b3b6c95c43bb5",
      "source": "https://bluearchive.wiki/wiki/File:Maki_Lobby_3.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "serina",
    "name": "鹫见芹娜 (Serina)",
    "avatarText": "芹娜",
    "description": "三一综合学园 · 救护骑士团 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请手动微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/SumiSerina.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata; character/performer authorization not independently verified)",
    "checkpointSha256": "f44e62abb49fa6a12992b4f4a9652fbea299f38618ce0ce03f9882b86181206e",
    "indexSha256": "237a52f40666e736fe9906330f752e0603c58fd3c1c89da6d15516642fe58475",
    "retrieval": "models/characters/serina/revisions/877539d8058aa439/retrieval.bin",
    "retrievalSha256": "8f0f336eb3e9fa2caf4ff444440104d9eba5a94e6186d0cc59d3a31f2e415f56",
    "chunks": [
      "models/characters/serina/revisions/877539d8058aa439/chunk_0.bin",
      "models/characters/serina/revisions/877539d8058aa439/chunk_1.bin",
      "models/characters/serina/revisions/877539d8058aa439/chunk_2.bin",
      "models/characters/serina/revisions/877539d8058aa439/chunk_3.bin",
      "models/characters/serina/revisions/877539d8058aa439/chunk_4.bin",
      "models/characters/serina/revisions/877539d8058aa439/chunk_5.bin"
    ],
    "chunkSha256": [
      "71bd82280f7afa76b4067219efef5b80bb088d07c82211465c44e8b700c3ae96",
      "b4918172f5e19358bba9dfa27b0ba76d8024be2ee0dabb0969a25fb5cd859c08",
      "1fa95c134ef77769bab4185a5b69b515685a15e499b8910b278b84657dce720e",
      "dba72547ced0ac3e0ffcdbca48486a1a5edbea7149ab22bb4fe35173c267db1c",
      "c7eae7660f58630019dc6b32d7e07c17ef17d402b6dfc47e458e44e2e3643668",
      "a2ded18ad9f01e303f4e5d5d255e4d4a4e0e38f2864a1cd65f60d3cfc578221e"
    ],
    "totalSize": 110813665,
    "sha256": "877539d8058aa4391fb6c3f7c810e969f72e5f6776f6fead5d25856fe17e6242",
    "resourceRevision": "877539d8058aa4391fb6c3f7c810e969f72e5f6776f6fead5d25856fe17e6242",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "rvcVersion": "v2",
    "qualityValidation": "Full A generated; objective and listening acceptance tracked separately",
    "excitationContract": "explicit-source-v1",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "39587eff57a93f1f24ba03adf49ddb19c5cdc453dbeea2845e2828baddd5ba52",
      "source": "https://bluearchive.wiki/wiki/File:Serina_Lobby_4.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "hifumi",
    "name": "阿慈谷日富美 (Hifumi)",
    "avatarText": "富美",
    "aliases": [
      "ヒフミ",
      "Hifumi"
    ],
    "description": "三一综合学园 · 社区 RVC v1 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/AjitaniHifumi.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "fecdc8a8a6613a820e616b72d992903ed5bc0c91a79e2346a366b121fae401a4",
    "indexSha256": "a9298a12b8e2e5f537225612e429d72a3bb4b4b631e720a6677bd5f060945481",
    "rvcVersion": "v1",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 9,
      "featureDimension": 256
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/hifumi/revisions/8550c35a71a69895/chunk_0.bin",
      "models/characters/hifumi/revisions/8550c35a71a69895/chunk_1.bin",
      "models/characters/hifumi/revisions/8550c35a71a69895/chunk_2.bin",
      "models/characters/hifumi/revisions/8550c35a71a69895/chunk_3.bin",
      "models/characters/hifumi/revisions/8550c35a71a69895/chunk_4.bin",
      "models/characters/hifumi/revisions/8550c35a71a69895/chunk_5.bin"
    ],
    "chunkSha256": [
      "d522ec370a7e245d8115a23101d3567fcf85846f782502ad2567cda5297def92",
      "938f28d3bb835bd77e08328bb15bfc6e0fefda7b70066aeb86a36054718ccbdb",
      "41b3539bffbbd5b5948626d4f1be31e129fd099a82f3fb29238099d0425384dc",
      "2c79c42dc1fbd65a2db47451ada246523076ba4531e5640b68264d7a29c86a83",
      "1a1dd364f81c244d56e57c36a3836813999a794310ffea78e3fca7a911ba01f3",
      "4a45022a90b86e22b7fa2ffafcf2a42d59443c6caf9b50b2c1473dbc8cb5bc37"
    ],
    "totalSize": 110034245,
    "sha256": "8550c35a71a69895b4fe0f3a4b38a3b1b98cce1c121d35e33921ab09b40d3119",
    "resourceRevision": "8550c35a71a69895b4fe0f3a4b38a3b1b98cce1c121d35e33921ab09b40d3119",
    "retrieval": "models/characters/hifumi/revisions/8550c35a71a69895/retrieval.bin",
    "retrievalSha256": "a712f003514d08b809d2f6208ecbaad5c118fea537d27ba61c6dcc0f96d99b36",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "98a33c826c7f915cfd53b6030c6d949ca9a1928d5cb11b18cd906fb6293a2125",
      "source": "https://bluearchive.wiki/wiki/File:Hifumi_Lobby_2.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "hasumi",
    "name": "羽川莲见 (Hasumi)",
    "avatarText": "莲见",
    "aliases": [
      "ハスミ",
      "Hasumi"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/HanekawaHasumi.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "3c929cc0d6b4fef00bd40f69c335bc2f6a170ee0e5aefbefd4ad9e477952775e",
    "indexSha256": "ac5a042b8642f240d9f79667b832f9a9006c809e250799d30c7bfeb582b25715",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/hasumi/revisions/e3fb3a26026c2030/chunk_0.bin",
      "models/characters/hasumi/revisions/e3fb3a26026c2030/chunk_1.bin",
      "models/characters/hasumi/revisions/e3fb3a26026c2030/chunk_2.bin",
      "models/characters/hasumi/revisions/e3fb3a26026c2030/chunk_3.bin",
      "models/characters/hasumi/revisions/e3fb3a26026c2030/chunk_4.bin",
      "models/characters/hasumi/revisions/e3fb3a26026c2030/chunk_5.bin"
    ],
    "chunkSha256": [
      "9646e5f0be3259be474d54db3852f9570e8cff9922d199926dc5a75f4ba81030",
      "b5a5f073e11a3f68d7c6501df0d7e9bef2c4b807eb4599c5c355a861f12e2259",
      "66f16597f4e578c6d587e9d4bc95c3792b9c9b2b280e52b33bd109a5c2930b57",
      "e5dfea2d8a10e522560ba457945d32ee791a65b74fc6ba7ccbd201ffb59f64b9",
      "23717e5ba67e048ec224df80898999028bd69dd52a1962ee3bc2f46f4ef58d87",
      "1e485c0102df7f6efea5f797102cb7c4487389e01de3c5ffa39c0836b0b1bdc5"
    ],
    "totalSize": 110427461,
    "sha256": "e3fb3a26026c203036769e72c18516f2e4e245bb7447f1d5c6f199c66772fa20",
    "resourceRevision": "e3fb3a26026c203036769e72c18516f2e4e245bb7447f1d5c6f199c66772fa20",
    "retrieval": "models/characters/hasumi/revisions/e3fb3a26026c2030/retrieval.bin",
    "retrievalSha256": "22e2ed758102935a6fd8aa5faf0605f419e852f75987fd267970ad4624b55b53",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "f1fd79f2d3321318eee7c7a38ad67127d84b59995763b12a343c78de717bb30b",
      "source": "https://bluearchive.wiki/wiki/File:Hasumi_Lobby_4.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "tsurugi",
    "name": "剑先鹤城 (Tsurugi)",
    "avatarText": "鹤城",
    "aliases": [
      "ツルギ",
      "Tsurugi"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KenzakiTsurugi.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "d461fbaf5830e55f5d56f9f5e9188740d65582c8c24e23b8ebd65e49d7e02159",
    "indexSha256": "6b9487b16eb3e15ab9adaec121775cc0815af68c1dfe99d762f9ba1421f3f45e",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/tsurugi/revisions/b1a64ad790d1bf9d/chunk_0.bin",
      "models/characters/tsurugi/revisions/b1a64ad790d1bf9d/chunk_1.bin",
      "models/characters/tsurugi/revisions/b1a64ad790d1bf9d/chunk_2.bin",
      "models/characters/tsurugi/revisions/b1a64ad790d1bf9d/chunk_3.bin",
      "models/characters/tsurugi/revisions/b1a64ad790d1bf9d/chunk_4.bin",
      "models/characters/tsurugi/revisions/b1a64ad790d1bf9d/chunk_5.bin"
    ],
    "chunkSha256": [
      "fc046985a16c75e78110adda9b875eda254037a380ccd5b7bb12e7fafe10ab01",
      "e115ce5d65288e07b9ba99dd66630db929e191abb46997a6ec060c745968957f",
      "5e3a33e4ac131a783c2f97b060668875edfbe8f6d7e6260d97f4707d33aa14f7",
      "459f1c243fe12a9196dc9e44030d339bfbf539d59b659be00fb286a486856df2",
      "d720883c3c9200d33d5d83ec1e6964f3480b90641c8ba8a8a48541bb39b64812",
      "2f9fb3c913dff43db00fc92c2d2a401f40f51225871bcd73c640326c2972509a"
    ],
    "totalSize": 110427461,
    "sha256": "b1a64ad790d1bf9d99ff96ecee903158181f99d97e9b38ea51d4a67b7ce9ef94",
    "resourceRevision": "b1a64ad790d1bf9d99ff96ecee903158181f99d97e9b38ea51d4a67b7ce9ef94",
    "retrieval": "models/characters/tsurugi/revisions/b1a64ad790d1bf9d/retrieval.bin",
    "retrievalSha256": "d0e58c326efbf49640e87404525a9dcc4a25b8ecc6825ab685d4625a099b2bcd",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "ba1d8790497d1dfbb576fb0040db294ae83d0641eb2e504f041955bdc6ca31b7",
      "source": "https://bluearchive.wiki/wiki/File:Tsurugi_Lobby_4.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "suzumi",
    "name": "守月铃美 (Suzumi)",
    "avatarText": "铃美",
    "aliases": [
      "スズミ",
      "Suzumi"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/MorizukiSuzumi.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "340fd406b73a970a089d205de593d85bf2227644f129f6166170658780245dfb",
    "indexSha256": "5e3f6520bd8e8cc29526780b970945b35e5b5dfafa2e111717790ead4e489e85",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/suzumi/revisions/ad6eeafe3d582ea0/chunk_0.bin",
      "models/characters/suzumi/revisions/ad6eeafe3d582ea0/chunk_1.bin",
      "models/characters/suzumi/revisions/ad6eeafe3d582ea0/chunk_2.bin",
      "models/characters/suzumi/revisions/ad6eeafe3d582ea0/chunk_3.bin",
      "models/characters/suzumi/revisions/ad6eeafe3d582ea0/chunk_4.bin",
      "models/characters/suzumi/revisions/ad6eeafe3d582ea0/chunk_5.bin"
    ],
    "chunkSha256": [
      "6f928d78aff5d5108d76972b44a50200e08e4b5aef8ea4e2e8ec0125e36774e1",
      "773a096eb8f22d1de42098c25969312369e748a6ffab6b645933a60e686e122b",
      "559d15b043ddff976cd84f9c4bc26daa90b57fcee1bff34ee5b36a3a7db38f5a",
      "8ab1f3a75f7ebbad867c766fa4a623f9a869415f13d468bf072c7fd02913ca0c",
      "98b017f471f5ed4ec9773124363d08f706668c400703cc85e98244c938abcb48",
      "8293f1b2f0ecd62b01d97aaffd4865dd42c5e94785e8129ed722fcd1240f37ee"
    ],
    "totalSize": 110427461,
    "sha256": "ad6eeafe3d582ea0ac3bd0e11b449a6eceb001362d7ebd3ca90cb83ae341384e",
    "resourceRevision": "ad6eeafe3d582ea0ac3bd0e11b449a6eceb001362d7ebd3ca90cb83ae341384e",
    "retrieval": "models/characters/suzumi/revisions/ad6eeafe3d582ea0/retrieval.bin",
    "retrievalSha256": "eda73e5e8fdc34a55325dc2a495b9c70a0f81f1be7dc600993a294b27bc01237",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "60c359c2a827e75d8bbb535bd853292e5045e87fa1b60a94e1ce6f66e3350d5a",
      "source": "https://bluearchive.wiki/wiki/File:Suzumi_Lobby_2.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "airi",
    "name": "栗村爱莉 (Airi)",
    "avatarText": "爱莉",
    "aliases": [
      "アイリ",
      "Airi"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KurimuraAiri.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "8e510fd3ae6ed6d6a93ba88456c2f207ce5eec43f2130ecb0063274438ba1d74",
    "indexSha256": "4b86825fc3dd5b64d2db2c19ee14604ade70ca859e6e1c3f22cc359109f6ffa4",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/airi/revisions/d1f6d090b74cb8f8/chunk_0.bin",
      "models/characters/airi/revisions/d1f6d090b74cb8f8/chunk_1.bin",
      "models/characters/airi/revisions/d1f6d090b74cb8f8/chunk_2.bin",
      "models/characters/airi/revisions/d1f6d090b74cb8f8/chunk_3.bin",
      "models/characters/airi/revisions/d1f6d090b74cb8f8/chunk_4.bin",
      "models/characters/airi/revisions/d1f6d090b74cb8f8/chunk_5.bin"
    ],
    "chunkSha256": [
      "e351b7eff1ed1858711d9cb6f7fa4f61f24d68901c625f27d2770e29512ef1a4",
      "336d087e2cc047a692bc11413a659158260f4f70c137b834045d0c09fef36b08",
      "af2d4f6bd46c91c7b0a361c29c93ec285c18f0386532a2e8d0bef2e1adee6dd3",
      "4d39a6f458548136ec7818524ad7326c54d358e43410cf12ca2183acd7acbc4d",
      "315cf5f2aa0143fd8a3b66254e9d0050478dc914f269894e81d9568faf12a89d",
      "ded92dab954b3f8f002cc90de0241e1ec26bb89f923cb6675a02584d172f8068"
    ],
    "totalSize": 110427461,
    "sha256": "d1f6d090b74cb8f88dea67d149cf6e8b67d3f582ede033d2d7c2eada4ffa0c79",
    "resourceRevision": "d1f6d090b74cb8f88dea67d149cf6e8b67d3f582ede033d2d7c2eada4ffa0c79",
    "retrieval": "models/characters/airi/revisions/d1f6d090b74cb8f8/retrieval.bin",
    "retrievalSha256": "856b9624f1a49d73b91145f05ac7be5e82f01c11984f6079c853fc7362d197a4",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "199f514103c75639f5b7622c36d0fa8b826ccdd68079867bfb2dcd989233a543",
      "source": "https://bluearchive.wiki/wiki/File:Airi_Lobby_5.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "yoshimi",
    "name": "伊原木好美 (Yoshimi)",
    "avatarText": "好美",
    "aliases": [
      "ヨシミ",
      "Yoshimi"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/IbaragiYoshimi.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "612addcc7b83ec7385ec04e9ac4061c936cd6374592cf13d35dbc7d7b1b3ef3b",
    "indexSha256": "729ffacf39c936b807656d1f0902301f42749a98f999b9f33e788184ab21e593",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/yoshimi/revisions/8d40a20265a3416e/chunk_0.bin",
      "models/characters/yoshimi/revisions/8d40a20265a3416e/chunk_1.bin",
      "models/characters/yoshimi/revisions/8d40a20265a3416e/chunk_2.bin",
      "models/characters/yoshimi/revisions/8d40a20265a3416e/chunk_3.bin",
      "models/characters/yoshimi/revisions/8d40a20265a3416e/chunk_4.bin",
      "models/characters/yoshimi/revisions/8d40a20265a3416e/chunk_5.bin"
    ],
    "chunkSha256": [
      "a41a485b426e2e8933fca98461969686154289c4a010db6634a3048024ef1b9d",
      "a4fabd2f079054aa1fe2637687c0dd18a0d04a65f0d1e0d07a8fcf0073c24bb3",
      "23c7a5793022d760d58f7e2b4ae6a65579abd21bbb2005c494805a323449913f",
      "df643c02bc241bdb0c03037aba624f66535f7b64d6d573d91d2f31b248aefa1e",
      "51415b0ac79c246a2cfd08fcddde6da21eea66ce43eef5931302f9a2fb4020be",
      "f95635081b335a10cdf5fef90438bfbf7d76e2eaada9fdd5d3d66d363947bd8c"
    ],
    "totalSize": 110427461,
    "sha256": "8d40a20265a3416e48b316290d4478c84d293b91e42114ce4822901a99eef073",
    "resourceRevision": "8d40a20265a3416e48b316290d4478c84d293b91e42114ce4822901a99eef073",
    "retrieval": "models/characters/yoshimi/revisions/8d40a20265a3416e/retrieval.bin",
    "retrievalSha256": "fc99a6d848002a1330a3b09d97a331a5e00623819136c5968dfa2be7255043ac",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "4b64aa4751c4d4412561c012ab96e8946798b7a9379a4006f22ab0f7756dd9a6",
      "source": "https://bluearchive.wiki/wiki/File:Yoshimi_Lobby_5.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "hanae",
    "name": "朝颜花江 (Hanae)",
    "avatarText": "花江",
    "aliases": [
      "ハナエ",
      "Hanae"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/AsagaoHanae.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "94181b0b72e79666de022b051dda23a8671cdae4072704bd56b588ba6d3181ab",
    "indexSha256": "de50ed0734d9518e897f630cd8c43cc7fd87df772a06e78d46fd62bed622af30",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/hanae/revisions/06564b08a6986f4e/chunk_0.bin",
      "models/characters/hanae/revisions/06564b08a6986f4e/chunk_1.bin",
      "models/characters/hanae/revisions/06564b08a6986f4e/chunk_2.bin",
      "models/characters/hanae/revisions/06564b08a6986f4e/chunk_3.bin",
      "models/characters/hanae/revisions/06564b08a6986f4e/chunk_4.bin",
      "models/characters/hanae/revisions/06564b08a6986f4e/chunk_5.bin"
    ],
    "chunkSha256": [
      "b4722a8a602ebc9332c5402103ce6ec85ed2046cb08d1210b3341dcafd233616",
      "a2a295b115536485524fbaa4bfc7f3733e3dd58177d5280a5d5f77ac54167588",
      "b2e2c6e10f0da632e4972088227480c0859d79f8b6e3d307a11da4856b23e04b",
      "d6e4edbcc5724abd88df452ab31f208918de629a2eb23063634a2014f32b1082",
      "38c30e3b0d170dbc139947857e6fa79a231c4e8b967ade69fc54a48fb8038d1a",
      "688dfd4b2024b8118234294e355dbdb15d7038f3b69d71e4f168eb62cd864a6a"
    ],
    "totalSize": 110427461,
    "sha256": "06564b08a6986f4eb934d534f5940db722890d4cb18bcfdb11483aa75f2e68dd",
    "resourceRevision": "06564b08a6986f4eb934d534f5940db722890d4cb18bcfdb11483aa75f2e68dd",
    "retrieval": "models/characters/hanae/revisions/06564b08a6986f4e/retrieval.bin",
    "retrievalSha256": "afd72c426d9945636bb1b3276416ecd16b9752db4ae5cd0e86a95c47c70a80a7",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "9cc4cf75f5147d39550933d33ae952b88f6fb2a8fa92f42f456999987070e09d",
      "source": "https://bluearchive.wiki/wiki/File:Hanae_Lobby_3.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "mashiro",
    "name": "静山真白 (Mashiro)",
    "avatarText": "真白",
    "aliases": [
      "マシロ",
      "Mashiro"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/ShiyuzamaMashiro.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "dfa5094936ea48ba1af65b8d09021951726ce3c423552a6727cb34077054b2e5",
    "indexSha256": "07e487a7c5c68decacd95310f717171f2af69a7d7f6b62a8d4fbe8669117968b",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/mashiro/revisions/f65bb6999ed34bd3/chunk_0.bin",
      "models/characters/mashiro/revisions/f65bb6999ed34bd3/chunk_1.bin",
      "models/characters/mashiro/revisions/f65bb6999ed34bd3/chunk_2.bin",
      "models/characters/mashiro/revisions/f65bb6999ed34bd3/chunk_3.bin",
      "models/characters/mashiro/revisions/f65bb6999ed34bd3/chunk_4.bin",
      "models/characters/mashiro/revisions/f65bb6999ed34bd3/chunk_5.bin"
    ],
    "chunkSha256": [
      "64bdc79f72c590b7d703c4a58ea874b4c7264cb6cab7685ee331c0f97980bcf7",
      "6a6690c2fb041e416933a7254f00b0868b6779c07726592a12374943a98f565d",
      "f9a73fa8fdcc442f2a7e9b1e49493777c013fa06509d050982ea18f26e92d9f8",
      "5efc42f8e611be14d083c58d357bc263e5e7e94383e309e47595f6b9cf9fbeff",
      "49caf3cf03f8b2cf89b534582b6799f31a4804a0e09745bb5433cce0dfc0db6c",
      "faa4ce3efdf44687e73e2e21fe4a721e980d2262682550b12302c727230b8819"
    ],
    "totalSize": 110427461,
    "sha256": "f65bb6999ed34bd3d116f2a351ae43a2ad5b146bde422235c1fb994c923a1b4e",
    "resourceRevision": "f65bb6999ed34bd3d116f2a351ae43a2ad5b146bde422235c1fb994c923a1b4e",
    "retrieval": "models/characters/mashiro/revisions/f65bb6999ed34bd3/retrieval.bin",
    "retrievalSha256": "a77b37700a095c713c6c96cc4a39488bec3d94e1811dda5c6ba8969784760a0d",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "7c2d425dfa10e496715d805e537fe00e4e66e5aae3cf77f905a444496c5055d0",
      "source": "https://bluearchive.wiki/wiki/File:Mashiro_Lobby_5.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "azusa",
    "name": "白洲梓 (Azusa)",
    "avatarText": "洲梓",
    "aliases": [
      "アズサ",
      "Azusa"
    ],
    "description": "三一综合学园 · 社区 RVC v1 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/ShirasuAzusa.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "2a0403b5dbda7e2d3d5eae70627cc0ffab7ffcfe0534ea378b08cb84926d8386",
    "indexSha256": "a3cd07c4617d8f2d255a32909ca7beb676411fe761be236dc2f43305a4681297",
    "rvcVersion": "v1",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 9,
      "featureDimension": 256
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/azusa/revisions/4121f460e157bc95/chunk_0.bin",
      "models/characters/azusa/revisions/4121f460e157bc95/chunk_1.bin",
      "models/characters/azusa/revisions/4121f460e157bc95/chunk_2.bin",
      "models/characters/azusa/revisions/4121f460e157bc95/chunk_3.bin",
      "models/characters/azusa/revisions/4121f460e157bc95/chunk_4.bin",
      "models/characters/azusa/revisions/4121f460e157bc95/chunk_5.bin"
    ],
    "chunkSha256": [
      "0a1a6fc135a1f267b7e057e58b52497f4b2b45186c059452aeac3555ae5d94ac",
      "9b559c075fd4c15882bf187307e542a3872c337747f472decd5dd2b1ae251f65",
      "94442fcb129582b9db4fb4b0be5493c0a464c26957a10a8aa759fc2701a598ab",
      "d05b9cbfba9ce326fbd3e2865dc245403a6bbb01ef73fa2cce0cb68063921667",
      "899082e1a91aabcc1db39076d098ea6220c7dda54637e7e1a2b0431d0ee29c41",
      "4d5c49215c0744149d3d8ce0bf82d0f2f83c6b470541055688f7ae5bf3979a56"
    ],
    "totalSize": 110034245,
    "sha256": "4121f460e157bc9589e9383ad366e143437f74c7c74a7e40f9c826ca896a7f49",
    "resourceRevision": "4121f460e157bc9589e9383ad366e143437f74c7c74a7e40f9c826ca896a7f49",
    "retrieval": "models/characters/azusa/revisions/4121f460e157bc95/retrieval.bin",
    "retrievalSha256": "fa5cf860dd8f6b157873d3f938988c97296e2b005126f2961192ee287cdfd471",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "6be4eb034feb26f50da86b8ce6ab0025908819df2fbda56aee8ecd4541b5d477",
      "source": "https://bluearchive.wiki/wiki/File:Azusa_Lobby_1.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "hanako",
    "name": "浦和花子 (Hanako)",
    "avatarText": "花子",
    "aliases": [
      "ハナコ",
      "Hanako"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/UrawaHanako.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "34361c68a7e0d1fdeef3140a9791b2eb6e82ea0273a4c9e8fef378f74783c6a9",
    "indexSha256": "87b05ea1128d4d4c4c205bc95241ad764c43186e5ef064fc737c857821245395",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/hanako/revisions/bf283c2ac261f9da/chunk_0.bin",
      "models/characters/hanako/revisions/bf283c2ac261f9da/chunk_1.bin",
      "models/characters/hanako/revisions/bf283c2ac261f9da/chunk_2.bin",
      "models/characters/hanako/revisions/bf283c2ac261f9da/chunk_3.bin",
      "models/characters/hanako/revisions/bf283c2ac261f9da/chunk_4.bin",
      "models/characters/hanako/revisions/bf283c2ac261f9da/chunk_5.bin"
    ],
    "chunkSha256": [
      "8b7243457b96850deb9a1bae7b5a8fad59f363e31f3c698bcdb0b92b23ece639",
      "944795bc7f8c7cc450bceb1706bf9ebca24ab057401930b53f82481b6bce363e",
      "a742ea39b4d6a82e49d8f2688de92477de687af8e4db6b3e0a8f529b944a3565",
      "bb2910b092a143ed3048c78216ee60200aab50766011e5dce3dfdf916006441b",
      "8aa44237fa87f297a29bb587c39e8aede32737058368a74f1d34014a63008b8c",
      "91342984326467c84c35bac0020daefaab6d2ff9680c5911f82f2361a4861565"
    ],
    "totalSize": 110427461,
    "sha256": "bf283c2ac261f9da71976305fa3e0eccf7e17974692691756eab0ac49f6c6e50",
    "resourceRevision": "bf283c2ac261f9da71976305fa3e0eccf7e17974692691756eab0ac49f6c6e50",
    "retrieval": "models/characters/hanako/revisions/bf283c2ac261f9da/retrieval.bin",
    "retrievalSha256": "3eade0c494e75bd6e67691b171c3d8ba20b3a9b9162034c295e24b6e972846ea",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "9522e382448445f4895ecd9810bdd18296201bd818da2087ca73898197672beb",
      "source": "https://bluearchive.wiki/wiki/File:Hanako_Lobby_2.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "natsu",
    "name": "柚鸟夏 (Natsu)",
    "avatarText": "鸟夏",
    "aliases": [
      "ナツ",
      "Natsu"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/YutoriNatsu.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "22d7b235a5615441208f17eefefa86abef5f19ce5a47d33372d2eec596dffdf3",
    "indexSha256": "0c43e5a9f80aee574a600c80678ac0943f06e3eb1ad9a3545dd3e6d34d25dad3",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/natsu/revisions/4520b6e37b196bad/chunk_0.bin",
      "models/characters/natsu/revisions/4520b6e37b196bad/chunk_1.bin",
      "models/characters/natsu/revisions/4520b6e37b196bad/chunk_2.bin",
      "models/characters/natsu/revisions/4520b6e37b196bad/chunk_3.bin",
      "models/characters/natsu/revisions/4520b6e37b196bad/chunk_4.bin",
      "models/characters/natsu/revisions/4520b6e37b196bad/chunk_5.bin"
    ],
    "chunkSha256": [
      "5d04ac30512e7df8c91f132a80d84a71cc0610353329a8eb06e4bf58898ae87a",
      "b155a6fdfe32dbad908fb934cba4b27aa5dfc5deeba1d24374a8f12523fff91a",
      "30068eea24f765b145ad6e1dca6ee172b0bcf7d74efd1bc9e59c9a94d72b456e",
      "700864a1b7b1310078164ac47fca797b7be1aa3540978397fe36848376ae604d",
      "7a5d8cf47174a4bca74f305e6784dd73a71cc2737ea5de87a096f4d2627111d6",
      "05190c8bbcdac5b1d344f4035f3c22767f66caf70970183125c7d3594ec90fca"
    ],
    "totalSize": 110427461,
    "sha256": "4520b6e37b196bad45c77abecbefda7d9577ea984317adf4b1a3e5e3d8b3c096",
    "resourceRevision": "4520b6e37b196bad45c77abecbefda7d9577ea984317adf4b1a3e5e3d8b3c096",
    "retrieval": "models/characters/natsu/revisions/4520b6e37b196bad/retrieval.bin",
    "retrievalSha256": "1c51823fd9d0b9b90e75b601b7d187794ab1339cb0992da8fa2172acf01c5c09",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "364574ab2582c7a82721e185a74d738d2ae51b2237a51c80df2e647271186652",
      "source": "https://bluearchive.wiki/wiki/File:Natsu_Lobby_5.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "mari",
    "name": "伊落玛丽 (Mari)",
    "avatarText": "玛丽",
    "aliases": [
      "マリー",
      "Mari"
    ],
    "description": "三一综合学园 · 社区 RVC v1 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/IochiMari.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "f745a4debc4ac2c677c4a5eb514351f4254114e25166c69cbed3cd5e3ca89ae5",
    "indexSha256": "36ebf259789f6b6b99298dee6867b6e85efc381a271a8b517c7d00d1c51a2291",
    "rvcVersion": "v1",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 9,
      "featureDimension": 256
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/mari/revisions/8e046676025edd4e/chunk_0.bin",
      "models/characters/mari/revisions/8e046676025edd4e/chunk_1.bin",
      "models/characters/mari/revisions/8e046676025edd4e/chunk_2.bin",
      "models/characters/mari/revisions/8e046676025edd4e/chunk_3.bin",
      "models/characters/mari/revisions/8e046676025edd4e/chunk_4.bin",
      "models/characters/mari/revisions/8e046676025edd4e/chunk_5.bin"
    ],
    "chunkSha256": [
      "3475e779fefbfa79e60c4ab49dfd1d65140da43dc2ae2558bc359e5bb4347348",
      "a2fd351199ee3782091f4e62201ea8ee61a89d552530b9f22eb1dd313c7453ac",
      "6f15250617d682c50a1d0ea8cc434d4853e71dc6c1eada6bd51f06b4327fbb39",
      "cb947094836f23e78348ff077b108847df188e832a60ccadcdf9fbb6b201a72b",
      "e4867ae2aa8a77c308609bf1c9288aa1d2d73078d5477223e386b15af1929e5e",
      "42e6733c66833d08d8ebfe15f0d5477cb610d1d2bc2523dc04a1dd7ab4310f97"
    ],
    "totalSize": 110034245,
    "sha256": "8e046676025edd4e613c5243e9477fbce0d569bd45cd5d7bb113b641138c298b",
    "resourceRevision": "8e046676025edd4e613c5243e9477fbce0d569bd45cd5d7bb113b641138c298b",
    "retrieval": "models/characters/mari/revisions/8e046676025edd4e/retrieval.bin",
    "retrievalSha256": "9ef404905ec10a0cae812cdd7f34021a8934cc5c28578d623af0f8321f109411",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "cdc9b9861aff83a8b1b4f01aa4f8d49f2c083987f3630aa393ccc6a800127c83",
      "source": "https://bluearchive.wiki/wiki/File:Mari_Lobby_5.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "kazusa",
    "name": "杏山和纱 (Kazusa)",
    "avatarText": "和纱",
    "aliases": [
      "カズサ",
      "Kazusa"
    ],
    "description": "三一综合学园 · 社区 RVC v1 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KyouyamaKazusa.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "eb3e6fbce755e4021de0fbce03d46938116352c3a22ca236fec0a9fe463db200",
    "indexSha256": "899bd84db01e18c639c093db0b00a73dbd913c766e7d7e04ac8c1bebc10ba8fe",
    "rvcVersion": "v1",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 9,
      "featureDimension": 256
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/kazusa/revisions/5153a66335fba7d1/chunk_0.bin",
      "models/characters/kazusa/revisions/5153a66335fba7d1/chunk_1.bin",
      "models/characters/kazusa/revisions/5153a66335fba7d1/chunk_2.bin",
      "models/characters/kazusa/revisions/5153a66335fba7d1/chunk_3.bin",
      "models/characters/kazusa/revisions/5153a66335fba7d1/chunk_4.bin",
      "models/characters/kazusa/revisions/5153a66335fba7d1/chunk_5.bin"
    ],
    "chunkSha256": [
      "45b7ae3ed2f609df98764588f0c80871c07b13ff831abe06242a3ec5f721640b",
      "da1ab1119c59740d5bcadd71740420999d160c61a02ca7158831bb2a3aa59a8b",
      "4d264f90203a64ce90a44210aee244c9602d7619c9d3623ed932d2f3b3e2038d",
      "033be54dbae3d15b2a6fab058ad2752d5824c0d65b8b93ce0dec08e642004608",
      "c80e5b872551d9668306be394131ce601f4b32036012b4957781221435f7acc6",
      "56013448569d0bb6a2b67a8d3f4c7f905ca4f206e07eb851384b2c68177ab0f9"
    ],
    "totalSize": 110034245,
    "sha256": "5153a66335fba7d14a53046ecf51564bda050a8e26e7de06c4bf941e42b41e40",
    "resourceRevision": "5153a66335fba7d14a53046ecf51564bda050a8e26e7de06c4bf941e42b41e40",
    "retrieval": "models/characters/kazusa/revisions/5153a66335fba7d1/retrieval.bin",
    "retrievalSha256": "506b8d6785af367b2d32982fe189a02b990ddaf4f9b6714a02643984de2c9f0f",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "452f5e69f169ea25b6ca941140838a105516a76b9f740fbe20a50482365392c5",
      "source": "https://bluearchive.wiki/wiki/File:Kazusa_Lobby_2.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "ui",
    "name": "古关忧 (Ui)",
    "avatarText": "关忧",
    "aliases": [
      "ウイ",
      "Ui"
    ],
    "description": "三一综合学园 · 社区 RVC v1 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KozekiUi.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "4166288175aac905aac331542822bb9a261ca5caa49665e0fa3d03db9a6f0a1a",
    "indexSha256": "156e61b042830f37fc188aba223592e07920725773749556e1aa3543edaa1840",
    "rvcVersion": "v1",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 9,
      "featureDimension": 256
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/ui/revisions/26f6f74ec4097003/chunk_0.bin",
      "models/characters/ui/revisions/26f6f74ec4097003/chunk_1.bin",
      "models/characters/ui/revisions/26f6f74ec4097003/chunk_2.bin",
      "models/characters/ui/revisions/26f6f74ec4097003/chunk_3.bin",
      "models/characters/ui/revisions/26f6f74ec4097003/chunk_4.bin",
      "models/characters/ui/revisions/26f6f74ec4097003/chunk_5.bin"
    ],
    "chunkSha256": [
      "e95c031fb5d1c4f579cff3585ffe16defa8c8e2602b9dc7a28f1b6244cb6d062",
      "d899fdd4f6e9379ff14b1a7e0f0fe8c39b2b927a66a68bdf2cd17c6953c98356",
      "848a14df663efc864ca122e71bea5e93cfabb34831c9bd0f4d0bb7a3bacb1225",
      "5fe7b7de79aa3013b8a2018f683a0b4bd62b0f85e199761937416747546b59ea",
      "1128c0d14f7ba8e612ea24a9bd25f4b54fca9c07affe027244a4abbded8ee736",
      "d0b5e30403da8a1277791eafacb730590e9ca931d6ff028f9852ed254f40b889"
    ],
    "totalSize": 110034245,
    "sha256": "26f6f74ec40970038c10444d9cb2c9a6492b109f0b91c6395efb0d85f2f10bb0",
    "resourceRevision": "26f6f74ec40970038c10444d9cb2c9a6492b109f0b91c6395efb0d85f2f10bb0",
    "retrieval": "models/characters/ui/revisions/26f6f74ec4097003/retrieval.bin",
    "retrievalSha256": "62385a39eb39c6ac6db6e261b2b20602d47ff9a07daaf1dad4deccd267e57e4e",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "82ae013f997ccd55d19b70c052fc2a35c61ade5de24bf8aafed011dcb597959e",
      "source": "https://bluearchive.wiki/wiki/File:Ui_Lobby_2.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "hinata",
    "name": "若叶日向 (Hinata)",
    "avatarText": "日向",
    "aliases": [
      "ヒナタ",
      "Hinata"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/WakabaHinata.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "8095846986775692597af84c3220a134d181d71cb6fa99dadb67c907003b682f",
    "indexSha256": "21b6d9254d448c114e40676b6a8c98c9178f5ecff7f70c1d7a2fb495aef968ee",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/hinata/revisions/3859e24b3241ceb5/chunk_0.bin",
      "models/characters/hinata/revisions/3859e24b3241ceb5/chunk_1.bin",
      "models/characters/hinata/revisions/3859e24b3241ceb5/chunk_2.bin",
      "models/characters/hinata/revisions/3859e24b3241ceb5/chunk_3.bin",
      "models/characters/hinata/revisions/3859e24b3241ceb5/chunk_4.bin",
      "models/characters/hinata/revisions/3859e24b3241ceb5/chunk_5.bin"
    ],
    "chunkSha256": [
      "f8e6b830d0f9b5d95e2528b7129fe05d59780cfee86cf33ca013ce10433e5022",
      "0bde4a2193b962c94355dbe88822267fd3575a54a3af27e2da52c3286e15ab64",
      "6326945209744e46bade265ef012165a2d19cea586ac08108db3e569120054d8",
      "5ac88f8d2b29fc6814ac5c3fddf16b8919ece43bcfc8ada334ad8e2fe184af4d",
      "7e31a8ba9e44b626337f1258bae2245d17b4e762f231e792562aeae8676c2613",
      "1a758a6d23da466fbb1b0d76ab619fa2b07fec4dd037f0fe107b54963dd40640"
    ],
    "totalSize": 110427461,
    "sha256": "3859e24b3241ceb5c8464d77f22017a8899cdd5db4fea52d61bf5c9b6b0d584f",
    "resourceRevision": "3859e24b3241ceb5c8464d77f22017a8899cdd5db4fea52d61bf5c9b6b0d584f",
    "retrieval": "models/characters/hinata/revisions/3859e24b3241ceb5/retrieval.bin",
    "retrievalSha256": "92a2ed5457285c59d774c3f9f04a62121c366cd4c15fe97cbd0167e69a7a753c",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "58a4553fd46487dc1c463580d03b4bdd136b403b9dca262fc01b54de2d3053c4",
      "source": "https://bluearchive.wiki/wiki/File:Hinata_Lobby_2.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "mine",
    "name": "苍森美祢 (Mine)",
    "avatarText": "美祢",
    "aliases": [
      "ミネ",
      "Mine"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/AomoriMine.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "f2fb786db100cd28b7ec654576c875842324986dd013bf890a2579e33075efe4",
    "indexSha256": "c93f2729387cd4d16a8c31bf45469a3cbf34d4abd079126b19417294ccb0e630",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/mine/revisions/e01fec428821e735/chunk_0.bin",
      "models/characters/mine/revisions/e01fec428821e735/chunk_1.bin",
      "models/characters/mine/revisions/e01fec428821e735/chunk_2.bin",
      "models/characters/mine/revisions/e01fec428821e735/chunk_3.bin",
      "models/characters/mine/revisions/e01fec428821e735/chunk_4.bin",
      "models/characters/mine/revisions/e01fec428821e735/chunk_5.bin"
    ],
    "chunkSha256": [
      "0e7b6e4c81963ee47736006821fb2366cf641c89444bde0ca0f950e06debace1",
      "5679918483fc9025375c79fab6a7c496c2a6f58090a760e8b205bfcaca025b21",
      "baf94c484202b8341376afacd618dffa70221fa405e38e62361b2b5bd16676da",
      "a5dd97788bfee02f7ca47e01c825de2d2b6bfad7c59a2f079233e557d664c3e8",
      "b63936770a48379758d81cee31f4c1dad14bff3d8ef590f4e4fe4fe852653442",
      "d853a9107c89718de7f6a1c87fea157bbb9655aa2ab64a87a027a9f6a84c6f29"
    ],
    "totalSize": 110427461,
    "sha256": "e01fec428821e735439365733bd3dbc70dbd7924000e2adf66ba8cb668235cf8",
    "resourceRevision": "e01fec428821e735439365733bd3dbc70dbd7924000e2adf66ba8cb668235cf8",
    "retrieval": "models/characters/mine/revisions/e01fec428821e735/retrieval.bin",
    "retrievalSha256": "801844dac2fd4cd00aa9b9d285ac482b13afdf1382a0dcbca1a47b7559798d88",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "09e013524f1ef3b847137fe26e33947a54bedb2631bba00e850daa1cd37cdf51",
      "source": "https://bluearchive.wiki/wiki/File:Mine_Lobby_3.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "sakurako",
    "name": "歌住樱子 (Sakurako)",
    "avatarText": "樱子",
    "aliases": [
      "サクラコ",
      "Sakurako"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/UtazumiSakurako.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "ed02c09c4ae397eb70e94a6a4c3fc813df3b0a442e7ddba1aeeedeea9bbcfdf6",
    "indexSha256": "f4c60400ad6d8d77f95881c428a5fd6e48865e550cfd9594c15cd3130b35fde5",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/sakurako/revisions/d3203f7733ccb6a5/chunk_0.bin",
      "models/characters/sakurako/revisions/d3203f7733ccb6a5/chunk_1.bin",
      "models/characters/sakurako/revisions/d3203f7733ccb6a5/chunk_2.bin",
      "models/characters/sakurako/revisions/d3203f7733ccb6a5/chunk_3.bin",
      "models/characters/sakurako/revisions/d3203f7733ccb6a5/chunk_4.bin",
      "models/characters/sakurako/revisions/d3203f7733ccb6a5/chunk_5.bin"
    ],
    "chunkSha256": [
      "ae2193db9afc7c16a43bf979c366971b8daba645ae9d073c1bcd210a66cc3e1e",
      "d3bea52810d473880a485b0c10f8d987cbedc142d8d0ef5370dd13b6cf001d54",
      "ffc7fe9bfc4a6ce47901cf91e6e107998d8b8f034931e8033963c3663fe817e8",
      "3f581483f9c820f082316c5b7e381442c7e57fe17b4ebf6a15f94d5328d9dc81",
      "8ba0503e21162c40f4a7ab06aca7d139bfd0cdb07a5a6f6de954aa7e4a36ec38",
      "09df1e701861e239bb6f6d4559baae0f9d570b228bbd6fc129694cb70e6c68f3"
    ],
    "totalSize": 110427461,
    "sha256": "d3203f7733ccb6a5496c5ecdf9137087416b21de20cf61eba7bbd7c1c0dbc49e",
    "resourceRevision": "d3203f7733ccb6a5496c5ecdf9137087416b21de20cf61eba7bbd7c1c0dbc49e",
    "retrieval": "models/characters/sakurako/revisions/d3203f7733ccb6a5/retrieval.bin",
    "retrievalSha256": "761218d85aab12f05c5a8755a8e5e1e7030e6f51aada6489e17a374a757f9cb1",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "a2090e6ccb2254906b3d3c269629e316c2afb574ae0514acbf9f5e3d49dafb37",
      "source": "https://bluearchive.wiki/wiki/File:Sakurako_Lobby_4.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "nagisa",
    "name": "桐藤渚 (Nagisa)",
    "avatarText": "藤渚",
    "aliases": [
      "ナギサ",
      "Nagisa"
    ],
    "description": "三一综合学园 · 社区 RVC v1 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/KirifujiNagisa.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "0be64937d1e9b5d3304257c6be50b626850adedba0ee05deb0502c0227377cb6",
    "indexSha256": "75a18e76d23494e2c3a051038dec19af359f9d72ad0ab3a7832e1ae539807d53",
    "rvcVersion": "v1",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 9,
      "featureDimension": 256
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/nagisa/revisions/e2a115fe323e6d05/chunk_0.bin",
      "models/characters/nagisa/revisions/e2a115fe323e6d05/chunk_1.bin",
      "models/characters/nagisa/revisions/e2a115fe323e6d05/chunk_2.bin",
      "models/characters/nagisa/revisions/e2a115fe323e6d05/chunk_3.bin",
      "models/characters/nagisa/revisions/e2a115fe323e6d05/chunk_4.bin",
      "models/characters/nagisa/revisions/e2a115fe323e6d05/chunk_5.bin"
    ],
    "chunkSha256": [
      "9f80b65ea13d63615ab5155ce9bfeb3aff391df3b040d5bffafc880325eed68c",
      "7f3da0cf50bb3547913f0afcb663f22ac36caef6cfe05f7db1b56497fa2d7a6a",
      "ddcdfd2d57f539ef03ecab3e379d6a0047ab9719d34a0846792f784302e0f340",
      "6143e97ce19d9d37a66342dd9dde2de693d4a6c4160c743ddb71ffbc7627b3ed",
      "a492991f9f114fcaa2f7dbea75e8c402e248d0b33b61df5b9b726378bef185ff",
      "b1c6b58f7d0c15978cb440919a06fd14731072c128a1f3ed966257fbd34084d1"
    ],
    "totalSize": 110034245,
    "sha256": "e2a115fe323e6d0506e8535e6ff6e89bf02b8faec05edb50ec5f1a03a7f470e4",
    "resourceRevision": "e2a115fe323e6d0506e8535e6ff6e89bf02b8faec05edb50ec5f1a03a7f470e4",
    "retrieval": "models/characters/nagisa/revisions/e2a115fe323e6d05/retrieval.bin",
    "retrievalSha256": "24a9f39e36175b8af00ab0d20918cfa9445c16e0c156ef8a31a9b143a96c853a",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "856720788cf6963aafbf976fa7471db96d445c02ec25fb739dd948cb59aa9d27",
      "source": "https://bluearchive.wiki/wiki/File:Nagisa_Lobby_1.ogg",
      "hearing": "未听评"
    }
  },
  {
    "id": "ichika",
    "name": "仲正一花 (Ichika)",
    "avatarText": "一花",
    "aliases": [
      "イチカ",
      "Ichika"
    ],
    "description": "三一综合学园 · 社区 RVC v2 音色",
    "tags": [
      "女声",
      "蔚蓝档案",
      "三一"
    ],
    "collectionId": "blue-archive",
    "defaultPitch": 0,
    "pitchNote": "默认保留原调；跨音域请试听后微调",
    "sampleRate": 40000,
    "noiseScale": 0.35,
    "defaultIndexRate": 0.35,
    "source": "https://huggingface.co/LordDavis778/BlueArchivevoicemodels/blob/263891b78604c12149b92678354c23a2590d39f0/NakamasaIchika.zip",
    "sourceRevision": "263891b78604c12149b92678354c23a2590d39f0",
    "publisher": "LordDavis778",
    "license": "openrail (repository metadata)",
    "checkpointSha256": "01e01097592bcd236e21916507bf51969fe7a740f3bc43aa1a944c3742e5cdf7",
    "indexSha256": "d84d763b652581408bced82ca43852bcc2577ba7bb7c2c2e93774cf44a66b3f0",
    "rvcVersion": "v2",
    "contentEncoder": {
      "name": "hubert_base",
      "outputLayer": 12,
      "featureDimension": 768
    },
    "excitationContract": "explicit-source-v1",
    "speakerCount": 109,
    "f0Enabled": true,
    "chunks": [
      "models/characters/ichika/revisions/09fb500cfc2cd3d2/chunk_0.bin",
      "models/characters/ichika/revisions/09fb500cfc2cd3d2/chunk_1.bin",
      "models/characters/ichika/revisions/09fb500cfc2cd3d2/chunk_2.bin",
      "models/characters/ichika/revisions/09fb500cfc2cd3d2/chunk_3.bin",
      "models/characters/ichika/revisions/09fb500cfc2cd3d2/chunk_4.bin",
      "models/characters/ichika/revisions/09fb500cfc2cd3d2/chunk_5.bin"
    ],
    "chunkSha256": [
      "c813148da2dd3e64cea6407fbf5ddb95761062b82c09c0d352db074b1af517ad",
      "423d3c0fa7f52e4941c38a5b9f2b66e1d14b453b37a24feab939488b719d61a7",
      "32887e7a83828d35d443f25077509f098d9e2ba1ffab0453f82e74678e92c112",
      "a3163f0a638c6775e332054fabb13f73c78cca36034aeb3f74e848a44bdc2423",
      "75f6d0ec4836e2cad8a64cd6eb8f681a719dc9df0b029312180bd6e920c5b7e4",
      "49440d335490b4cf951e849940d8c0b152967c900aca200704b9d984cf22ee3f"
    ],
    "totalSize": 110427461,
    "sha256": "09fb500cfc2cd3d2b787853d9f0bd83ac0cf6381c1f842b84a37854d668f659d",
    "resourceRevision": "09fb500cfc2cd3d2b787853d9f0bd83ac0cf6381c1f842b84a37854d668f659d",
    "retrieval": "models/characters/ichika/revisions/09fb500cfc2cd3d2/retrieval.bin",
    "retrievalSha256": "75d064b431b699ad6e3700705d23dd4d4b189b70f75683d7ed18d6f741953d4d",
    "qualityValidation": "New resource: safe structure/index and real-feature native/ONNX parity verified; perceptual quality unverified",
    "speechProfile": {
      "enabled": true,
      "engine": "seed-vc-v2-speech",
      "resourceRevision": "a36a69f675ba4d0d1f9175e30d0f031e57907625e09de887192020ce9f1eda61",
      "referenceSha256": "90bd83298eee0cc7da1fb5b6b768f32c294f4e599df7f39a9c03c89906b2f966",
      "source": "https://bluearchive.wiki/wiki/File:Ichika_Lobby_2.ogg",
      "hearing": "未听评"
    }
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
    latestSongJob: null,
    resultMetaBase: "",
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

  function resolveContentEncoder(model, baseModels) {
    const version = model?.rvcVersion || "v2";
    const contract = model?.contentEncoder;
    const name = contract?.name || "hubert_base";
    const outputLayer = version === "v1" ? 9 : 12;
    if (!["v1", "v2"].includes(version) ||
        (contract?.outputLayer !== undefined && contract.outputLayer !== outputLayer)) {
      throw new Error("角色的语义特征层尚未验证，无法使用其他模型替代");
    }
    let key;
    if (["hubert_base", "hubert-base", "contentvec"].includes(name)) {
      key = version === "v1" ? "hubertV1" : "hubert";
    } else if (name === "hubert-base-japanese" && version === "v2") {
      key = "hubertJapanese";
    } else {
      throw new Error(`角色需要尚未支持的语义模型：${name}`);
    }
    const config = baseModels?.[key] || EMBEDDED_BASE_MODELS[key];
    if (!config?.chunks?.length || (key === "hubertJapanese" && !/^[a-f0-9]{64}$/.test(config.sha256 || ""))) {
      throw new Error("角色所需的语义模型资源不完整，请刷新资源目录");
    }
    const cacheKey = config.sha256
      ? `${config.name.replace(/\.onnx$/, "")}.${config.sha256}.onnx`
      : config.name;
    return { config, cacheKey, name, outputLayer, featureDimension: version === "v1" ? 256 : 768 };
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
  const CHARACTER_MODEL_ASSET_VERSION = "20260919-v37";
  const HOSHINO_MODEL_ASSET_VERSION = "43feadde41b72c90c27d0f5b77d1c2d11ad8df6ba9a45c56e64b071cc722b9aa";

  function characterAssetVersion(id, model) {
    for (const value of [model?.resourceRevision, model?.sha256]) {
      if (typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
    }
    return id === "hoshino" ? HOSHINO_MODEL_ASSET_VERSION : CHARACTER_MODEL_ASSET_VERSION;
  }

  function characterModelCacheKey(model) {
    const id = String(model?.id || "character");
    return id.startsWith("own:")
      ? `${id}.onnx`
      : `${id}.${characterAssetVersion(id, model)}.onnx`;
  }

  function versionCharacterChunkPath(path, model) {
    const separator = String(path).includes("?") ? "&" : "?";
    const id = String(model?.id || (String(path).includes("/hoshino/") ? "hoshino" : ""));
    let revision = characterAssetVersion(id, model);
    if (model?.retrieval && String(path).split("?")[0] === String(model.retrieval).split("?")[0]) {
      revision += `.${model.retrievalSha256 || model.indexSha256 || "legacy-index"}`;
    }
    return `${path}${separator}model=${encodeURIComponent(revision)}`;
  }

  function retrievalCacheKey(model) {
    return `${model.id}.${characterAssetVersion(model.id, model)}.${model.retrievalSha256 || model.indexSha256 || "legacy-index"}.retrieval.bin`;
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
  async function verifyModelBytes(buffer, expectedHash) {
    if (!expectedHash) return;
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    if (actual !== expectedHash) throw new Error("模型资源校验失败，请重新下载");
  }

  async function fetchSingleChunkWithFallback(chunkPath, chunkIndex, totalChunks, onChunkProgress, expectedHash) {
    const chunkCacheKey = `chunk:${chunkPath}`;
    const cachedBuf = await getCachedItem(chunkCacheKey);
    if (cachedBuf instanceof ArrayBuffer && cachedBuf.byteLength > 0) {
      try {
        await verifyModelBytes(cachedBuf, expectedHash);
        if (typeof onChunkProgress === "function") {
          onChunkProgress(cachedBuf.byteLength);
        }
        return { buffer: cachedBuf, fromCache: true };
      } catch {
        await removeCachedItem(chunkCacheKey);
      }
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
            await verifyModelBytes(buf, expectedHash);
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
        await verifyModelBytes(combined.buffer, expectedHash);
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

  async function readableCachedModel(name, expectedHash) {
    const cached = await getCachedItem(name);
    if (!(cached instanceof Blob) || cached.size <= 1024 * 1024) return null;
    try {
      const bytes = await cached.arrayBuffer();
      await verifyModelBytes(bytes, expectedHash);
      return { name, size: bytes.byteLength, arrayBuffer: async () => bytes };
    } catch {
      await removeCachedItem(name);
      return null;
    }
  }

  // Fetch Chunked Model with Concurrency Pool & Real-Time Granular Progress
  async function fetchChunkedModel(chunkUrls, name, displayName, mimeType, onProgress, integrity) {
    const cached = await readableCachedModel(name, integrity?.sha256);
    if (cached) {
      if (typeof onProgress === "function") {
        onProgress(cached.size, cached.size, chunkUrls.length, chunkUrls.length, true, ` ${displayName} 已从本地闪存极速就绪`);
      }
      return cached;
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
        const msg = ` [1/4] 正在下载 ${displayName}: 分片 ${completedCount}/${totalCount} (${(totalLoaded/1024/1024).toFixed(1)}MB / ${(estimatedTotalBytes/1024/1024).toFixed(1)}MB) · ${activeModelDownloadConcurrency} 线程断点极速加速中`;
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
          },
          integrity?.chunkSha256?.[idx]
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
    // Keep downloaded bytes readable even when Chromium cannot spill a large
    // Blob to its temporary storage. The worker only requires arrayBuffer().
    return {
      name, size: fullBlob.size, type: mimeType,
      async arrayBuffer() {
        const bytes = new Uint8Array(blobParts.reduce((size, part) => size + part.byteLength, 0));
        let offset = 0;
        for (const part of blobParts) {
          bytes.set(new Uint8Array(part), offset);
          offset += part.byteLength;
        }
        return bytes.buffer;
      },
    };
  }

  async function loadModelAuto(modelConfig, name, displayName, mimeType, onProgress) {
    const cached = await readableCachedModel(name, modelConfig?.sha256);
    if (cached) {
      if (typeof onProgress === "function") {
        onProgress(cached.size, cached.size, 1, 1, true, ` ${displayName} 已从本地闪存秒级就绪`);
      }
      return cached;
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
        ? chunks.map((path) => versionCharacterChunkPath(path, modelConfig))
        : chunks;
      return await fetchChunkedModel(fetchChunks, name, displayName || name, mimeType, onProgress, modelConfig);
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

  function selectedRmsMixRate() {
    const value = Number(document.getElementById("rvc-rms-mix")?.value);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .5;
  }

  function selectedMixControls() {
    const db = (id) => {
      const value = Number(document.getElementById(id)?.value || 0);
      return Number.isFinite(value) ? Math.max(-24, Math.min(6, value)) : 0;
    };
    const cloud = state.inferenceMode === "official";
    const song = cloud && state.audioMode === "song";
    return {
      vocalGainDb: cloud ? db("rvc-vocal-gain") : 0,
      accompanimentGainDb: song ? db("rvc-accompaniment-gain") : 0,
      vocalMute: cloud && Boolean(document.getElementById("rvc-vocal-mute")?.checked),
      accompanimentMute: song && Boolean(document.getElementById("rvc-accompaniment-mute")?.checked),
    };
  }

  function useNewSpeechEngine(model = getSelectedModel()) {
    return state.inferenceMode === "official" && state.audioMode === "voice"
      && document.getElementById("rvc-voice-engine")?.value !== "rvc" && model?.speechProfile?.enabled === true;
  }

  function syncSpeechControls() {
    const modern = useNewSpeechEngine();
    if (modern && state.speechControlsActive !== true) {
      const tracking = document.getElementById("rvc-rms-mix");
      if (tracking) tracking.value = "1";
      const trackingLabel = document.getElementById("rvc-rms-mix-value");
      if (trackingLabel) trackingLabel.textContent = "1.00";
    }
    state.speechControlsActive = modern;
    const selector = document.getElementById("rvc-voice-engine");
    if (selector) selector.disabled = state.audioMode !== "voice" || state.inferenceMode !== "official";
    for (const id of ["rvc-pitch", "rvc-index-rate", "rvc-protect", "rvc-f0-method", "rvc-filter-radius", "rvc-preset-male-female", "rvc-preset-same", "rvc-preset-female-male"]) {
      const control = document.getElementById(id);
      if (control) control.disabled = modern;
    }
    const hint = document.getElementById("rvc-speech-engine-hint");
    if (hint) hint.textContent = modern
      ? "新版角色讲话：100 步生成，使用该角色独立参考，适用于日常语音。纯人声歌曲请选择 RVC 兼容模式；移调、检索和 F0 参数也在兼容模式中调整。"
      : state.audioMode === "song" ? "歌曲使用保留旋律的 RVC 翻唱链路。"
      : state.inferenceMode !== "official" ? "设备端使用 RVC 兼容引擎，新版讲话需云端 GPU。"
      : "当前使用 RVC 兼容模式；没有核实原始参考的角色保留原模型。";
  }

  function syncMixControls() {
    syncSpeechControls();
    const controls = selectedMixControls();
    const dbText = (value) => `${value > 0 ? "+" : ""}${value} dB`;
    const vocalValue = document.getElementById("rvc-vocal-gain-value");
    const backingValue = document.getElementById("rvc-accompaniment-gain-value");
    if (vocalValue) vocalValue.textContent = dbText(controls.vocalGainDb);
    if (backingValue) backingValue.textContent = dbText(controls.accompanimentGainDb);
    const backing = document.getElementById("rvc-accompaniment-track");
    if (backing) backing.disabled = state.audioMode !== "song" || state.inferenceMode !== "official";
    for (const id of ["rvc-vocal-gain", "rvc-vocal-mute"]) {
      const input = document.getElementById(id);
      if (input) input.disabled = state.inferenceMode !== "official";
    }
    const button = document.getElementById("rvc-mix-update");
    if (button) button.disabled = state.busy || state.audioMode !== "song"
      || state.inferenceMode !== "official" || !state.latestSongJob?.remixAvailable;
  }

  // Neutral selection and an explicit cross-range preset are different
  // actions. defaultPitch=0 preserves song melody on character selection;
  // it must not turn the user's "male -> female (+12)" action into a no-op.
  function maleToFemalePresetPitch() {
    return 12;
  }

  function applyCharacterPitch(model) {
    if (!model) return;
    const crossRangePitch = maleToFemalePresetPitch();
    const fmt = (v) => (v > 0 ? "+" : "") + v;
    const pitchInput = document.getElementById("rvc-pitch");
    const pitchTip = document.getElementById("rvc-pitch-tip");
    if (pitchTip && pitchInput && Number(pitchInput.value) === 0) {
      pitchTip.textContent = `当前保持 0 半音，切换角色不会自动变调。低音讲话转换高音角色时，原调可能产生沙哑或电音，可试听跨音域预设 ${fmt(crossRangePitch)}；歌曲先保留原调。`;
    }
    const presetBtn = document.getElementById("rvc-preset-male-female");
    const presetLabel = presetBtn?.querySelector("span");
    if (presetLabel) {
      presetLabel.textContent = `男声变女角色 (${fmt(crossRangePitch)})`;
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
        syncSpeechControls();
        updateStatusDisplay();
      });
      grid.appendChild(card);
    });
    target.appendChild(grid);
  }

  const INTERNAL_TRINITY_STUDENTS = [
    ['hifumi','阿慈谷日富美','ヒフミ','Hifumi'],['azusa','白洲梓','アズサ','Azusa'],
    ['hanako','浦和花子','ハナコ','Hanako'],['koharu','下江小春','コハル','Koharu'],
    ['nagisa','桐藤渚','ナギサ','Nagisa'],['mika','圣园未花','ミカ','Mika'],['seia','百合园圣娅','セイア','Seia'],
    ['tsurugi','剑先鹤城','ツルギ','Tsurugi'],['hasumi','羽川莲见','ハスミ','Hasumi'],
    ['mashiro','静山真白','マシロ','Mashiro'],['ichika','仲正一花','イチカ','Ichika'],
    ['mari','伊落玛丽','マリー','Mari'],['hinata','若叶日向','ヒナタ','Hinata'],['sakurako','歌住樱子','サクラコ','Sakurako'],
    ['mine','苍森美祢','ミネ','Mine'],['hanae','朝颜花江','ハナエ','Hanae'],['serina','鹫见芹娜','セリナ','Serina'],
    ['airi','栗村爱莉','アイリ','Airi'],['yoshimi','伊原木好美','ヨシミ','Yoshimi'],
    ['kazusa','杏山和纱','カズサ','Kazusa'],['natsu','柚鸟夏','ナツ','Natsu'],
    ['ui','古关忧','ウイ','Ui'],['shimiko','圆堂志美子','シミコ','Shimiko'],
    ['suzumi','守月铃美','スズミ','Suzumi'],['reisa','宇泽玲纱','レイサ','Reisa'],
    ['love','拉布','ラブ','Love'],
  ];

  const INTERNAL_SCHOOLS = [
    { id: "abydos", name: "阿拜多斯高等学校", en: "Abydos High School", tag: "阿拜多斯",
      source: "https://www.bluearchive.jp/kivotostest/abydos/1/result",
      students: [
        ["shiroko", "砂狼白子", "シロコ", "Shiroko"],
        ["hoshino", "小鸟游星野", "ホシノ", "Hoshino"],
        ["nonomi", "十六夜野乃美", "ノノミ", "Nonomi"],
        ["serika", "黑见芹香", "セリカ", "Serika"],
        ["ayane", "奥空绫音", "アヤネ", "Ayane"],
      ] },
    { id: "highlander", name: "高地人铁道学院", en: "Highlander Railroad Academy", tag: "高地人",
      source: "https://www.tanita.co.jp/content/bluearchive/",
      students: [
        ["hikari", "橘光", "橘ヒカリ", "Hikari"],
        ["nozomi", "橘望", "橘ノゾミ", "Nozomi"],
        ["aoba", "内海青叶", "内海アオバ", "Aoba"],
        ["suou", "朝雾苏芳", "朝霧スオウ", "Suou"],
      ] },
    { id: "odyssey", name: "奥德赛（奥德修斯）海洋学院", en: "Odyssey Maritime School", tag: "奥德赛", alias: "奥德修斯",
      source: "https://gamewith.jp/gamedb/6253/articles/62411",
      students: [
        ["toumi-kokoro", "渡海心", "渡海ココロ", "Toumi Kokoro"],
        ["fuchigami-kotone", "渊上琴音", "淵上コトネ", "Fuchigami Kotone"],
      ] },
    { id: "wildhunt", name: "狂猎艺术学院", en: "Wild Hunt Academy of Arts", tag: "狂猎",
      source: "https://game8.jp/blue-archive/711367",
      students: [
        ["eri", "エリ", "エリ", "Eri"],
        ["kanoe", "カノエ", "カノエ", "Kanoe"],
        ["miyo", "ミヨ", "ミヨ", "Miyo"],
        ["fuyu", "フユ", "フユ", "Fuyu"],
        ["ritsu", "リツ", "リツ", "Ritsu"],
        ["rena", "レナ", "レナ", "Rena"],
        ["tsumugi", "ツムギ", "ツムギ", "Tsumugi"],
      ] },
    { id: "millennium", name: "千年科学学园", en: "Millennium Science School", tag: "千年", students: [], source: "assets/rvc-models.json" },
    { id: "gehenna", name: "格黑娜学园", en: "Gehenna Academy", tag: "格黑娜", students: [], source: "assets/rvc-models.json" },
    { id: "trinity", name: "三一综合学园", en: "Trinity General School", tag: "三一", alias: "圣三一", students: INTERNAL_TRINITY_STUDENTS, source: "https://www.tanita.co.jp/content/bluearchive/" },
    { id: "shittim", name: "什亭之匣（其他）", en: "Shittim Chest (Other)", tag: "什亭之匣", students: [], source: "assets/rvc-models.json" },
  ];

  function getSchoolsDirectory() {
    const external = window.PostPrepSchools;
    if (external && Array.isArray(external.schools) && typeof external.schoolFor === "function") {
      return external;
    }
    if (!window.PostPrepSchools) {
      window.PostPrepSchools = {
        schools: INTERNAL_SCHOOLS,
        schoolFor(model) {
          if (!model) return "";
          return INTERNAL_SCHOOLS.find(s => (s.students || []).some(st => st[0] === model.id)
            || (model.tags || []).some(t => t === s.tag || t === s.alias))?.id || "";
        },
        syncCatalog(models) {
          if (!Array.isArray(models)) return;
          for (const school of INTERNAL_SCHOOLS) {
            if (school.id === "abydos" || school.id === "highlander" || school.id === "wildhunt" || school.id === "odyssey") continue;
            const installed = models.filter(m => m && (m.tags || []).some(t => t === school.tag || t === school.alias));
            school.students = school.id === "trinity"
              ? [...INTERNAL_TRINITY_STUDENTS, ...installed.filter(m => !INTERNAL_TRINITY_STUDENTS.some(s => s[0] === m.id)).map(m => [m.id, m.name, "", m.id])]
              : installed.map(m => [m.id, m.name, "", m.id]);
          }
        },
      };
    }
    return window.PostPrepSchools;
  }

  function renderSchoolBrowser(searchVal) {
    const wrapper = document.getElementById("rvc-school-browser");
    const select = document.getElementById("rvc-school-filter");
    const roster = document.getElementById("rvc-school-roster");
    const visible = state.activeCollectionId === "blue-archive";
    if (wrapper) wrapper.hidden = !visible;
    if (!wrapper || !select || !roster || !visible) return "";
    const directory = getSchoolsDirectory();
    if (!directory || !Array.isArray(directory.schools)) return "";
    try {
      directory.syncCatalog?.(state.catalog);
    } catch (e) {
      console.warn("syncCatalog failed", e);
    }
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
    if (select.value !== previous && previous !== "") {
      select.value = "";
    }
    select.onchange = () => renderModelGallery();
    const school = directory.schools.find(item => item.id === select.value);
    roster.innerHTML = "";
    if (school) {
      const note = document.createElement("p");
      note.textContent = state.lang === "en"
        ? "Character directory. Only installed voices appear as selectable cards below."
        : "角色目录：下方仅显示已接入的可选声线。“待接入”表示本站尚无可用模型；日服角色保留日文名便于检索。";
      roster.appendChild(note);
      (school.students || []).filter(student => !searchVal || student.join(" ").toLowerCase().includes(searchVal)).forEach(student => {
        const row = document.createElement("p");
        const available = state.catalog.some(model => model.id === student[0]);
        row.textContent = student[1] + " / " + student[3] + " · " + (state.lang === "en"
          ? available ? "Voice available" : "Voice not installed"
          : available ? "声线已接入" : "声线待接入");
        roster.appendChild(row);
      });
      if (school.source) {
        const source = document.createElement("a");
        source.href = school.source;
        source.target = "_blank";
        source.rel = "noopener noreferrer";
        source.className = "text-brand underline";
        source.textContent = state.lang === "en" ? "Character reference" : "查看角色资料来源";
        roster.appendChild(source);
      }
    }
    return select.value;
  }

  function renderModelGallery() {
    syncSpeechControls();
    const container = document.getElementById("rvc-model-gallery");
    const trainedContainer = document.getElementById("rvc-trained-model-gallery");
    const trainedSection = document.getElementById("rvc-trained-models-section");
    const trainedCount = document.getElementById("rvc-trained-models-count");
    const trainedTitle = document.getElementById("rvc-trained-models-title");
    const emptyEl = document.getElementById("rvc-model-empty");
    const searchVal = (document.getElementById("rvc-model-search")?.value || "").trim().toLowerCase();
    if (!container) return;

    try {
      renderCollectionNav();
    } catch (e) {
      console.error("renderCollectionNav failed", e);
    }
    let selectedSchool = "";
    try {
      selectedSchool = renderSchoolBrowser(searchVal);
    } catch (e) {
      console.error("renderSchoolBrowser failed", e);
    }
    const activeCollection = selectedCollectionDefinition();
    const directory = getSchoolsDirectory();
    const filtered = state.catalog.filter((m) => {
      if (String(m.collectionId || "other") !== state.activeCollectionId) return false;
      if (selectedSchool && directory?.schoolFor?.(m) !== selectedSchool) return false;
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
    if (trainedTitle) trainedTitle.textContent = ` ${localizedCollectionName(activeCollection) || t("trainedTitle").replace(/^\s*/u, "")}`;
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
        status: ` [1/3] 正在发送音频… 已发送 ${formatTransferredBytes(loaded)} · ${speed}`,
      };
    }

    const rawPercent = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
    const transferred = `${formatTransferredBytes(loaded)} / ${formatTransferredBytes(total)}`;
    if (rawPercent >= 100) {
      return {
        barPercent: 44,
        status: ` [1/3] 音频已从浏览器发出（${transferred} · ${speed}），正在等待云端接收确认…`,
      };
    }
    return {
      barPercent: Math.min(43, Math.max(6, Math.round(rawPercent * 0.43))),
      status: ` [1/3] 正在发送音频… ${rawPercent}%（${transferred} · ${speed}）`,
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
          cacheStatusEl.innerHTML = `<span class="inline-flex items-center gap-1.5 font-bold text-emerald-700"><i class="fa-solid fa-circle-check text-emerald-500"></i> 基础模型${charInfo}已在本地闪存就绪 (${totalMb}MB+) · 变声免下载</span>`;
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
      const selectedModel = state.catalog.find((m) => m.id === state.selectedModelId);
      const encoder = resolveContentEncoder(selectedModel, state.baseModels);
      const hubertCfg = encoder.config;
      const rmvpeCfg = state.baseModels?.rmvpe || EMBEDDED_BASE_MODELS.rmvpe;

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
        loadModelAuto(hubertCfg, encoder.cacheKey, "HuBERT 语义特征模型", "application/onnx", (loaded, total, c, t, cached, msg) => {
          hubertLoaded = loaded;
          if (total) hubertTotal = total;
          updatePreloadUI(msg || ` 正在缓存 HuBERT 模型 (${(loaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`);
        }),
        loadModelAuto(rmvpeCfg, "rmvpe.onnx", "RMVPE 音高模型", "application/onnx", (loaded, total, c, t, cached, msg) => {
          rmvpeLoaded = loaded;
          if (total) rmvpeTotal = total;
          updatePreloadUI(msg || ` 正在缓存 RMVPE 模型 (${(loaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`);
        }),
      ];

      if (selectedModel) {
        tasks.push(
          loadModelAuto(selectedModel, characterModelCacheKey(selectedModel), selectedModel.name, "application/onnx", (loaded, total, c, t, cached, msg) => {
            charLoaded = loaded;
            if (total) charTotal = total;
            updatePreloadUI(msg || ` 正在缓存 ${selectedModel.name} 角色模型 (${(loaded/1024/1024).toFixed(1)}MB / ${(total/1024/1024).toFixed(1)}MB)`);
          })
        );
      }

      await Promise.all(tasks);

      if (progressBar) progressBar.style.width = `100%`;
      if (percentText) percentText.textContent = `100%`;
      const charMsg = selectedModel ? `、${selectedModel.name}` : "";
      if (statusText) statusText.textContent = ` 基础模型${charMsg}预热完成！已存入浏览器闪存。`;

      showToast(` 预热完成！下次变声将直接从闪存秒级启动。`);
      await checkCacheStatus();
      setTimeout(() => {
        if (progressWrap) progressWrap.classList.add("hidden");
      }, 3000);
    } catch (err) {
      console.error("Prewarm failed:", err);
      showToast(" 预热失败，请重试");
      if (statusText) statusText.textContent = ` 预热失败: ${err.message || err}`;
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
        await removeCachedItem(`${m.id}.${characterAssetVersion(m.id)}.onnx`);
        await removeCachedItem(`${m.id}.${characterAssetVersion(m.id)}.retrieval.bin`);
        if (m.retrieval) {
          const retrievalPath = versionCharacterChunkPath(m.retrieval, m);
          for (const url of getChunkMirrorUrls(retrievalPath)) await removeCachedItem(url);
          for (const url of getChunkMirrorUrls(versionCharacterChunkPath(m.retrieval))) await removeCachedItem(url);
        }
        for (const chunkPath of m.chunks || []) {
          await removeCachedItem(`chunk:${chunkPath}`);
          await removeCachedItem(`chunk:${versionCharacterChunkPath(chunkPath, m)}`);
          await removeCachedItem(`chunk:${versionCharacterChunkPath(chunkPath)}`);
        }
      }
      showToast(" 本地模型缓存已清理");
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
            ? ` [2/3] ${longStageLabel}；任务已保存在服务端，网络波动后会继续查询…`
            : state.audioMode === "song"
              ? " [2/3] 云端正在分离人声、角色变声并回混原伴奏；网络短暂切换不会丢失任务…"
              : " [2/3] 云端 GPU 正在后台处理；页面会自动查询结果，网络短暂切换不会丢失任务…");
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
        const retryableError = isTransientCloudOutputError(error);
        if (!retryableError || transientFailures >= maxTransientFailures || Date.now() >= deadline) throw error;
        updateStatusDisplay(` [2/3] 查询结果时网络波动，正在恢复（${transientFailures}/${maxTransientFailures - 1}）…`);
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

  async function readCloudAudioBody(response, timeoutMs = 60000) {
    if (!response.body?.getReader) return response.blob();
    const reader = response.body.getReader();
    const chunks = [];
    let timer;
    try {
      return await Promise.race([
        (async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          return new Blob(chunks, { type: response.headers.get("Content-Type") || "audio/wav" });
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error("音频数据传输超时，将重新读取已完成任务"));
            void reader.cancel().catch(() => {});
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
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
        return await normalizeCloudAudioBlob(await readCloudAudioBody(response, Math.min(60000, Math.max(1, deadline - Date.now()))), format);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || Date.now() >= deadline) break;
        updateStatusDisplay(` [3/3] 结果下载中断，正在从已完成任务重新拉取（${attempt}/${maxAttempts - 1}）…`);
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
    if(isAppleMobile())return 'mp3';
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

  async function cloudResultUrl(outputUrl,response,format,timeoutMs) {
    if(isAppleMobile()) {
      // The successful poll response already exposed engine/format metadata.
      // Release its body; native audio and download can request ranges directly.
      try { await response.body?.cancel(); } catch {}
      return outputUrl;
    }
    const rawOutputBlob=await downloadLongCloudOutput(outputUrl,response,format,timeoutMs);
    return URL.createObjectURL(rawOutputBlob);
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
      avatarText: local?.avatarText || remote.emoji || "RVC",
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
        const statusUrl = new URL(OFFICIAL_RVC_STATUS_ENDPOINT, window.location.href);
        if (state.selectedModelId) statusUrl.searchParams.set("modelId", state.selectedModelId);
        const status = await fetchJsonWithRetry(statusUrl.href, CLOUD_STATUS_TIMEOUT_MS);
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
    chorusController?.refresh();
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
    if (!usesBrowserInference && state.audioMode === "song"
        && state.engineReady === true && state.engineInfo?.capabilities?.song === false) {
      if (statusEl) statusEl.textContent = state.lang === "en"
        ? "The cloud voice engine is online, but the song separator is not ready. Try again after it is available."
        : "云端变声引擎已连接，但伴奏分离模型尚未就绪；请稍后再试。";
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = state.lang === "en" ? "Song separator unavailable" : "等待伴奏分离模型";
      return;
    }

    if (statusEl) {
      let engineLabel = state.lang === "en" ? " Voice engine is ready" : " 变声引擎已就绪";
      if (isOwnModel) {
        engineLabel = state.lang === "en" ? " Imported model is ready" : " 专属导入模型已就绪";
      } else if (state.inferenceMode === "official" && state.engineReady === true) {
        engineLabel = state.lang === "en" ? " Cloud RVC engine is ready" : " 云端 RVC 高保真引擎已就绪";
      } else if (state.inferenceMode === "official") {
        engineLabel = state.lang === "en" ? " Cloud RVC is connecting; this request will retry" : " 云端 RVC 引擎正在连接；本次会直接重试";
      } else {
        engineLabel = state.lang === "en" ? " On-device engine is ready" : " 极速免上传引擎已就绪";
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

  // 代理关闭时 Cloudflare 域名可能不可达: 转换出现网络类失败时按候选入口
  // 依次转移 (配置入口 → 当前源 → 已知 Pages 域名), 全部失败时给出明确指引,
  // 不再只报笼统的网络错误。
  function buildRvcEndpointCandidates() {
    const candidates = [];
    const push = (value) => {
      const clean = String(value || "").trim().replace(/\/+$/u, "");
      if (clean && !candidates.includes(clean)) candidates.push(clean);
    };
    push(getOfficialEndpoint());
    try {
      const origin = String(globalThis.location?.origin || "");
      // GitHub Pages serves static files; POSTing there can only return 405.
      const host = new URL(origin).hostname;
      if (origin.startsWith("http") && !host.endsWith(".github.io")) push(origin.replace(/\/+$/u, "") + "/rvc-api");
    } catch (e) {}
    push("https://postprep-ae6.pages.dev/rvc-api");
    return candidates;
  }

  function isEndpointNetworkError(error) {
    const code = String(error?.code || "");
    if (["RVC_NETWORK_INTERRUPTED", "RVC_BACKEND_TIMEOUT", "RVC_BACKEND_UNAVAILABLE", "RVC_RELAY_UNAVAILABLE", "RVC_ROUTE_UNAVAILABLE", "UPSTREAM_UNAVAILABLE"].includes(code)) return true;
    const status = Number(error?.httpStatus) || 0;
    if (error?.httpStatus === 0 || status === 408 || status === 425 || status >= 500) return true;
    return !status && /网络|连接|超时|无法访问|fetch/i.test(String(error?.message || ""));
  }

  async function uploadWithRouteFallback(bases, upload, onRetry) {
    for (let index = 0; index < bases.length; index += 1) {
      const routes = officialRoutes(bases[index]);
      try {
        let payload;
        try {
          payload = await upload(routes, 1);
        } catch (error) {
          if (!error?.retryable) throw error;
          await onRetry(false, error);
          payload = await upload(routes, 2);
        }
        return { payload, routes };
      } catch (error) {
        if (!isEndpointNetworkError(error) || index + 1 === bases.length) throw error;
        await onRetry(true, error);
      }
    }
    throw new Error("No cloud endpoint configured");
  }

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
        remixUrl: (jobId, token) => `${base}/output/${encodeURIComponent(jobId)}/remix?token=${encodeURIComponent(token)}`,
      };
    }
    if (/\/v1\/convert$/u.test(base)) {
      const serviceBase = base.replace(/\/v1\/convert$/u, "");
      return {
        convertUrl: base,
        outputUrl: (jobId, token) => `${serviceBase}/v1/output/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
        remixUrl: (jobId, token) => `${serviceBase}/v1/output/${encodeURIComponent(jobId)}/remix?token=${encodeURIComponent(token)}`,
      };
    }
    return {
      convertUrl: `${base}/v1/convert`,
      outputUrl: (jobId, token) => `${base}/v1/output/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`,
      remixUrl: (jobId, token) => `${base}/v1/output/${encodeURIComponent(jobId)}/remix?token=${encodeURIComponent(token)}`,
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
        ? isOfficial ? "Cloud first" : "On device"
        : isOfficial ? "云端优先" : "设备端";
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
    renderAudioMode();
    updateStatusDisplay();
  }

  function renderAudioMode() {
    chorusController?.refresh();
    syncSpeechControls();
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
    syncMixControls();
    const mixHint = document.getElementById("rvc-mix-hint");
    if (mixHint && state.inferenceMode !== "official") {
      mixHint.textContent = state.lang === "en"
        ? "This mix panel uses the cloud stems. On-device conversion keeps its original output settings."
        : "独立混音使用云端分轨；设备端变声沿用原有输出设置。";
    } else if (mixHint && !song) {
      mixHint.textContent = state.lang === "en"
        ? "Dry-vocal mode has no backing stem. Only the vocal level and mute apply."
        : "纯人声模式没有伴奏轨；仅人声音量与静音生效。";
    } else if (mixHint) {
      mixHint.textContent = t("mixHint");
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
        ? ` 云端 RVC 引擎已就绪 (${displayUrl}) · PyTorch RVC`
        : ` 云端 RVC 引擎暂未响应 (${displayUrl}) · 可稍后重试，页面不会自动改用本地模式`;
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
        statusEl.textContent = ` 已导入「${id}」并设为当前角色（仅本机，可立即变声）。`;
        statusEl.classList.remove("hidden");
      }
      showToast(` 导入成功：${id}`);
    } catch (err) {
      showToast(` 导入失败：${err.message}`);
    }
  }

  async function initCatalog() {
    try {
      renderModelGallery();
    } catch (e) {
      console.error("Initial renderModelGallery failed", e);
    }
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
    try {
      await refreshOfficialService();
    } catch (e) {
      console.warn("refreshOfficialService failed", e);
    }
    try {
      await loadOwnModelsFromDB();
    } catch (e) {
      console.warn("loadOwnModelsFromDB failed", e);
    }
    try {
      renderModelGallery();
    } catch (e) {
      console.error("Post-fetch renderModelGallery failed", e);
    }
    try {
      applyCharacterPitch(getSelectedModel());
    } catch (e) {
      console.warn("applyCharacterPitch failed", e);
    }
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
    state.audio=null;
    chorusController?.refresh();

    try {
      // Cloud ffmpeg already validates and decodes this file. Avoid concurrent
      // full-song WebAudio copies on iOS; local inference decodes lazily below.
      if(state.inferenceMode==='official' && (isAppleMobile() || state.audioMode==='song')) {
        const duration=Number(fallbackDuration) || await probeAudioDuration(file);
        if(duration>audioDurationLimit(state.inferenceMode,state.selectedModelId)) {
          if(statusEl)statusEl.textContent=t('audioTooLong');updateStatusDisplay();return;
        }
        state.audio={file,float32:null,duration,name:file.name};
        if(statusEl)statusEl.textContent=duration>0
          ? t('analysisReady',{name:file.name,duration:`${duration.toFixed(1)}s`})
          : `${file.name} · 时长由云端校验，可直接上传`;
        updateStatusDisplay();return;
      }
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
    const rmsMixVal = selectedRmsMixRate();
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
      updateStatusDisplay(" 正在初始化本地推理引擎...");
      const runtimeModule = await import(new URL("assets/rvc-engine/rvc-web-runtime.js?v=20260930-fractional-r42", window.location.href).href);
      const { createRVC, runPipelineInWorker } = runtimeModule;

      const wasmAssetBase = new URL("assets/rvc-engine/ort126/", window.location.href);
      const rvc = createRVC({
        assetBaseUrl: new URL("assets/rvc-engine/", window.location.href).href,
        // Match the portable CPU backend with the smaller standard WASM build.
        wasmBaseUrl: {
          mjs: new URL("ort-wasm-simd-threaded.mjs", wasmAssetBase).href,
          wasm: new URL("ort-wasm-simd-threaded.wasm", wasmAssetBase).href,
        },
      });

      const encoder = resolveContentEncoder(selectedModel, state.baseModels);
      const hubertCfg = encoder.config;
      const rmvpeCfg = state.baseModels?.rmvpe || { chunks: [] };

      // Multi-Model Sequential Loading with Live Milestone Progress Tracking
      updateProgressBar(5);
      showProgressBar(true);

      updateStatusDisplay(" [1/4] 正在加载基础语义模型 (HuBERT)...");
      const hubertFile = await loadModelAuto(
        hubertCfg,
        encoder.cacheKey,
        "HuBERT 语义特征模型",
        "application/onnx",
        (l, t, cur, tot, fromCache, msg) => {
          updateProgressBar(Math.min(33, Math.round((cur / tot) * 33)));
          updateStatusDisplay(msg || ` [1/4] 正在加载 HuBERT 语义模型: 分片 ${cur}/${tot}`);
        }
      );
      updateProgressBar(33);

      updateStatusDisplay(" [1/4] 正在加载基础音高模型 (RMVPE)...");
      const rmvpeFile = await loadModelAuto(
        rmvpeCfg,
        "rmvpe.onnx",
        "RMVPE 音高模型",
        "application/onnx",
        (l, t, cur, tot, fromCache, msg) => {
          updateProgressBar(33 + Math.min(33, Math.round((cur / tot) * 33)));
          updateStatusDisplay(msg || ` [1/4] 正在加载 RMVPE 音高模型: 分片 ${cur}/${tot}`);
        }
      );
      updateProgressBar(66);

      updateStatusDisplay(` [1/4] 正在加载角色声音模型 (${selectedModel.name})...`);
      const modelFile = await loadModelAuto(
        selectedModel,
        characterModelCacheKey(selectedModel),
        selectedModel.name,
        "application/onnx",
        (l, t, cur, tot, fromCache, msg) => {
          updateProgressBar(66 + Math.min(34, Math.round((cur / tot) * 34)));
          updateStatusDisplay(msg || ` [1/4] 正在加载 ${selectedModel.name} 角色模型: 分片 ${cur}/${tot}`);
        }
      );

      let retrievalFile;
      if (selectedModel.retrieval && indexRateVal > 0) {
        try {
          updateStatusDisplay(` [1/4] 正在加载 ${selectedModel.name} 轻量音色检索码本...`);
          const retrievalPath = versionCharacterChunkPath(selectedModel.retrieval, selectedModel);
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
        ? " 云端暂时不可达，正在切换到用户设备端分段推理；请保持页面在前台…"
        : " [2/4] 本地 WebAssembly SIMD 推理开始 (完全在您的设备上运行)...");
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
                feature_model_loading: "正在载入语义引擎（2/3），请保持页面前台...",
                pitch_model_loading: "正在载入音高引擎（3/3），请保持页面前台...",
                feature_extraction: "正在提取人声语义特征 (HuBERT)...",
                pitch_estimation: "正在分析音高音调与共鸣 (RMVPE)...",
                voice_synthesis: "正在合成目标角色音色...",
                post_processing: "正在进行透明峰值与音量包络校准...",
                success: "变声完成，准备输出...",
              };
              updateStatusDisplay(` [3/4] ${stageMap[e.stage] || e.stage}`);
            } else if (e.type === "chunk_step") {
              const stepMap = {
                feature: `[4/4] 提取人声语义 (${e.current}/${e.total})`,
                pitch: `[4/4] 音高神经追踪 (${e.current}/${e.total})`,
                synth: `[4/4] 神经网络声线变换中 (${e.current}/${e.total})...`,
                done: `[4/4] 分段已完成 (${e.current}/${e.total})`,
              };
              updateStatusDisplay(` ${stepMap[e.step] || e.step}`);
            } else if (e.type === "chunk") {
              updateStatusDisplay(` [4/4] 正在合成音频分段: ${e.current} / ${e.total}`);
            }
          },
        },
        {
          contentEncoder: { name: encoder.name, outputLayer: encoder.outputLayer,
            featureDimension: encoder.featureDimension, onnxSha256: hubertCfg.sha256 || null,
            revision: hubertCfg.revision || null },
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
          // Healthy WASM inference can exceed the estimate on slower devices.
          // Extend only while milestones advance, with a finite total ceiling.
          maxTotalTimeout: Math.min(4 * 60 * 60 * 1000, localTimeoutMs * 4),
        }
      );

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      if (!result.outputWav) {
        throw new Error("No output wav generated by pipeline");
      }

      // 4. Attach generated audio to UI
      const outputUrl = URL.createObjectURL(result.outputWav);
      const previousResultUrl = state.resultUrl;
      if (resultAudio) {
        resultAudio.src = outputUrl;
        resultAudio.load();
      }
      if (resultDownload) {
        resultDownload.href = outputUrl;
        resultDownload.download = `postprep-rvc-${selectedModel.id}-${Date.now()}.wav`;
      }
      state.resultUrl = outputUrl;
      state.latestSongJob = null;
      syncMixControls();
      if (previousResultUrl) URL.revokeObjectURL(previousResultUrl);
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

      updateStatusDisplay(` 设备端变声成功！用时 ${elapsedSec} 秒，结果已生成在下方。`);
      showToast(" 设备端变声完成！可在下方试听或下载");
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
      updateStatusDisplay(` ${message}`);
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
    return !status && /网络|连接|超时|查询|下载|请求|network|fetch|timeout|connection/i.test(String(error?.message || ""));
  }

  async function runOfficialRvcInference({ allowDeviceFallback = false, endpointCandidates } = {}) {
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
    const modernSpeech = useNewSpeechEngine(selectedModel);
    const voiceEngine = modernSpeech ? "seed-vc-v2-speech" : "rvc";
    const pitch = modernSpeech ? 0 : parseInt(document.getElementById("rvc-pitch")?.value || "0", 10);
    const indexRate = parseFloat(document.getElementById("rvc-index-rate")?.value || "0.3");
    const protect = parseFloat(document.getElementById("rvc-protect")?.value || "0.25");
    const rmsMixRate = selectedRmsMixRate();
    const mixControls = selectedMixControls();
    const f0Method = document.getElementById("rvc-f0-method")?.value || "rmvpe";
    const filterRadius = parseInt(document.getElementById("rvc-filter-radius")?.value || "0", 10);
    // 纠正错误标称的音频容器 (mp4-in-mp3 等), 避免中继放行后 GPU 服务拒收。
    state.audio.file = await fixUploadContainer(state.audio.file);
    const preparedUpload = modernSpeech ? { file: state.audio.file } : prepareCloudUploadAudio(state.audio, state.audioMode);
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
    syncMixControls();
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.setAttribute("aria-busy", "true");
    }
    if (convertLabel) convertLabel.textContent = t("converting");
    showProgressBar(true);
    updateProgressBar(5);
    const startedAt = Date.now();

    try {
      // 候选云端入口: 首选配置入口; 网络类失败时依次转移到当前源与已知域名。
      const activeBases = Array.isArray(endpointCandidates) && endpointCandidates.length
        ? endpointCandidates
        : buildRvcEndpointCandidates();
      const requestTimeoutMs = cloudRequestTimeoutMs(uploadFile.size, state.audio.duration, state.audioMode);
      const jobTimeoutMs = modernSpeech
        ? Math.max(cloudJobTimeoutMs(state.audio.duration, state.audioMode), 240000 + state.audio.duration * 5000)
        : cloudJobTimeoutMs(state.audio.duration, state.audioMode);
      const longJob = state.audio.duration >= DURABLE_CLOUD_JOB_SECONDS;
      if (preparedUpload.optimized) {
        updateStatusDisplay(
          ` [1/3] 已把上传体积从 ${formatTransferredBytes(preparedUpload.originalBytes)} 压到 ${formatTransferredBytes(uploadFile.size)}（16kHz 单声道），正在连接云端…`,
        );
      } else {
        updateStatusDisplay(state.audioMode === "song"
          ? " [1/3] 正在上传原始混音；云端将分离人声、转换音色并回混原伴奏…"
          : " [1/3] 正在准备上传音频到云端 RVC 引擎…");
      }

      const body = new FormData();
      const cloudRequestId = createCloudRequestId();
      body.set("modelId", selectedModel.id);
      body.set("model_id", selectedModel.id);
      body.set("voiceEngine", voiceEngine);
      body.set("voice_engine", voiceEngine);
      body.set("pitch", String(pitch));
      body.set("indexRate", String(selectedModel.hasIndex !== false ? indexRate : 0));
      body.set("index_rate", String(selectedModel.hasIndex !== false ? indexRate : 0));
      body.set("protect", String(protect));
      body.set("f0Method", f0Method);
      body.set("f0_method", f0Method);
      const outputFormat = preferredCloudOutputFormat(state.audio.duration);
      body.set("format", outputFormat);
      body.set("resample", "0");
      body.set("rmsMixRate", String(rmsMixRate));
      body.set("rms_mix_rate", String(rmsMixRate));
      body.set("vocalGainDb", String(mixControls.vocalGainDb));
      body.set("accompanimentGainDb", String(mixControls.accompanimentGainDb));
      body.set("vocalMute", String(mixControls.vocalMute));
      body.set("accompanimentMute", String(mixControls.accompanimentMute));
      body.set("vocal_gain_db", String(mixControls.vocalGainDb));
      body.set("accompaniment_gain_db", String(mixControls.accompanimentGainDb));
      body.set("vocal_mute", String(mixControls.vocalMute));
      body.set("accompaniment_mute", String(mixControls.accompanimentMute));
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
      // after that, the caller explicitly handles on-device fallback.
      let ticker = null;
      const uploadAndInfer = (routes, attempt) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const uploadStartedAt = Date.now();
        xhr.open("POST", routes.convertUrl, true);
        xhr.timeout = requestTimeoutMs;

        xhr.upload.onprogress = (evt) => {
          const progress = cloudUploadProgress(evt, uploadStartedAt);
          updateProgressBar(progress.barPercent);
          updateStatusDisplay(progress.status);
        };

        xhr.upload.onload = () => {
          updateProgressBar(46);
          updateStatusDisplay(" [1/3] 音频传输已结束，正在等待云端确认并启动推理…");
          if (ticker) clearInterval(ticker);
          ticker = setInterval(() => {
            const sec = Math.round((Date.now() - startedAt) / 1000);
            updateStatusDisplay(state.audioMode === "song"
              ? ` [2/3] 云端正在分离人声 → RVC 变声 → 原伴奏回混… 已用时 ${sec}s（等待真实结果）`
              : ` [2/3] 云端已接收请求，RVC 神经声线重构中… 已用时 ${sec}s（等待服务端完成响应，不虚报百分比）`);
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
              errCode === "RVC_QUEUE_BUSY"
              ||
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
          error.code = "RVC_BACKEND_TIMEOUT";
          error.retryable = false;
          reject(error);
        };

        xhr.send(body);
      });

      // Reuse this FormData/request ID across entry retries. Once accepted,
      // polling and downloading stay on that job and never resubmit the audio.
      const { payload, routes } = await uploadWithRouteFallback(activeBases, uploadAndInfer, async (nextEntry, error) => {
        updateProgressBar(8);
        updateStatusDisplay(nextEntry
          ? " 当前云端入口不可达，正在尝试备用入口…"
          : " 云端连接短暂中断，正在重新连接同一入口并自动重试一次…");
        await waitFor(Math.min(15000, Math.max(1200, (error?.retryAfterSeconds || 0) * 1000)));
      });
      if (!payload || !payload.jobId || !payload.downloadToken) {
        throw new Error(payload?.message || payload?.code || "未获取到任务标识");
      }

      const outputUrl = routes.outputUrl(payload.jobId, payload.downloadToken);
      updateProgressBar(52);
      updateStatusDisplay(state.audioMode === "song"
        ? " [2/3] 混音已接收，云端正在分离人声、变声并回混伴奏…"
        : " [2/3] 音频已接收，云端 GPU 已转入后台推理…");
      const outputResponse = await pollCloudOutput(outputUrl, jobTimeoutMs, longJob);
      const actualEngine = outputResponse.headers.get("X-RVC-Engine") || "rvc";
      const actualRevision = outputResponse.headers.get("X-RVC-Engine-Revision") || "";
      const actualF0Method = outputResponse.headers.get("X-RVC-F0-Method") || "";
      const remixAvailable = outputResponse.headers.get("X-RVC-Remix-Available") === "true";
      updateProgressBar(82);
      updateStatusDisplay(" [3/3] 云端角色推理完成，正在下载变声结果…");
      const nextResultUrl = await cloudResultUrl(outputUrl, outputResponse, outputFormat, jobTimeoutMs);
      const previousResultUrl = state.resultUrl;
      if (resultDownload) {
        resultDownload.href = nextResultUrl;
        resultDownload.download = `postprep-rvc-${selectedModel.id}-${Date.now()}.${outputFormat}`;
      }
      if (resultAudio) {
        const mediaUrl = officialMediaUrl(payload.jobId, payload.downloadToken);
        try {
          await attachResultAudio(resultAudio, mediaUrl || nextResultUrl, Boolean(mediaUrl));
        } catch (mediaError) {
          try {
            if (!mediaUrl) throw mediaError;
            console.warn("Protected media route failed; using the already downloaded result blob", mediaError);
            await attachResultAudio(resultAudio, nextResultUrl, false);
          } catch (error) {
            URL.revokeObjectURL(nextResultUrl);
            if (resultDownload) resultDownload.href = previousResultUrl || "#";
            throw error;
          }
        }
        resultAudio.hidden = false;
      }
      state.resultUrl = nextResultUrl;
      state.latestSongJob = state.audioMode === "song" ? {
        jobId: payload.jobId, token: payload.downloadToken, routes,
        outputFormat, remixAvailable, durationSeconds: state.audio.duration,
        mixRevision: Number(outputResponse.headers.get("X-RVC-Mix-Revision") || 0),
      } : null;
      syncMixControls();
      const mixStatus = document.getElementById("rvc-mix-status");
      if (mixStatus && state.audioMode === "song") {
        mixStatus.textContent = remixAvailable
          ? t("mixInitial")
          : (state.lang === "en" ? "Temporary stems could not be retained; convert again to change this mix." : "本次分轨未能在短期缓存中保留；需要重新变声才能调整混音。");
      }
      if (previousResultUrl) URL.revokeObjectURL(previousResultUrl);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (resultMeta) {
        resultMeta.textContent = t("resultMeta", {
          model: selectedModel.name,
          pitch: `${pitch > 0 ? "+" : ""}${pitch}`,
          elapsed,
        }) + ` · ${actualEngine === "seed-vc-v2-speech" ? "新版角色讲话 · 100 步 · FP32" : `云端 PyTorch RVC · F0 ${actualF0Method || (f0Method === "auto" ? "自动（实际算法未返回）" : f0Method.toUpperCase())}`}${state.audioMode === "song" ? " · PyMSS 人声分离/原伴奏回混" : ""}${actualRevision ? ` · ${actualRevision.slice(0, 10)}` : ""} · ${outputFormat.toUpperCase()}`;
        state.resultMetaBase = resultMeta.textContent;
      }
      if (resultSection) {
        resultSection.hidden = false;
        resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      updateProgressBar(100);
      updateStatusDisplay(` 云端 RVC 变声完成！用时 ${elapsed} 秒。${longJob ? "长音频稳定链路已完成可恢复处理与下载。" : ""}可在下方试听或下载。`);
      showToast(" 云端 RVC 变声完成！可在下方试听或下载");
      return true;
    } catch (error) {
      console.warn("Cloud RVC inference failed", error);
      if (allowDeviceFallback && !modernSpeech && state.audioMode === "voice"
          && hasDeviceFallbackModel(selectedModel) && isDeviceFallbackEligible(error)) {
        updateStatusDisplay(" 云端 RVC 当前不可达，准备切换到用户设备端推理…");
        return { fallback: true, error };
      }
      const failureMessage = cloudRvcFailureMessage(error);
      const songFallbackHint = state.audioMode === "song" && hasDeviceFallbackModel(selectedModel)
        ? " · 如接受伴奏也被处理，可自行点击「转为本地直接变声」。" : "";
      const diagnostic = error?.requestId ? ` · 诊断号 ${error.requestId}` : "";
      const deviceHint = !hasDeviceFallbackModel(selectedModel) && isDeviceFallbackEligible(error)
        ? (state.lang === "en" ? " · This voice is cloud-only; choose an on-device voice to continue locally." : " · 该角色仅支持云端；如需本地接续，请更换支持设备端的角色。") : "";
      updateStatusDisplay(` ${failureMessage}${error?.code ? `（${error.code}）` : ""}${diagnostic}${deviceHint}${songFallbackHint}`);
      showToast(` ${failureMessage}`);
      return false;
    } finally {
      state.busy = false;
      syncMixControls();
      setTimeout(() => showProgressBar(false), 800);
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.setAttribute("aria-busy", "false");
      }
      if (convertLabel) convertLabel.textContent = t("convert");
    }
  }

  async function updateSongMix() {
    const job = state.latestSongJob;
    if (state.busy || !job?.remixAvailable || state.audioMode !== "song" || state.inferenceMode !== "official") return;
    const mix = selectedMixControls();
    const status = document.getElementById("rvc-mix-status");
    const player = document.getElementById("rvc-result-audio");
    const download = document.getElementById("rvc-result-download");
    const meta = document.getElementById("rvc-result-meta");
    const body = new FormData();
    body.set("vocalGainDb", String(mix.vocalGainDb));
    body.set("accompanimentGainDb", String(mix.accompanimentGainDb));
    body.set("vocalMute", String(mix.vocalMute));
    body.set("accompanimentMute", String(mix.accompanimentMute));
    body.set("vocal_gain_db", String(mix.vocalGainDb));
    body.set("accompaniment_gain_db", String(mix.accompanimentGainDb));
    body.set("vocal_mute", String(mix.vocalMute));
    body.set("accompaniment_mute", String(mix.accompanimentMute));
    state.busy = true;
    syncMixControls();
    if (status) status.textContent = state.lang === "en" ? "Updating the saved stems…" : "正在使用已保存分轨更新混音…";
    try {
      const response = await fetch(job.routes.remixUrl(job.jobId, job.token), {
        method: "POST", body, cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || payload.state !== "completed") throw new Error(payload.code || payload.message || `HTTP ${response.status}`);
      const outputUrl = job.routes.outputUrl(job.jobId, job.token);
      const timeout = cloudJobTimeoutMs(job.durationSeconds, "song");
      const outputResponse = await pollCloudOutput(outputUrl, timeout, job.durationSeconds >= DURABLE_CLOUD_JOB_SECONDS);
      const nextUrl = await cloudResultUrl(outputUrl, outputResponse, job.outputFormat, timeout);
      try {
        if (player) await attachResultAudio(player, nextUrl, !nextUrl.startsWith('blob:'));
      } catch (error) {
        URL.revokeObjectURL(nextUrl);
        throw error;
      }
      const previousUrl = state.resultUrl;
      state.resultUrl = nextUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      if (download) {
        download.href = nextUrl;
        download.download = `postprep-rvc-mix-${job.jobId}-${payload.mixRevision}.${job.outputFormat}`;
      }
      job.mixRevision = Number(payload.mixRevision || job.mixRevision + 1);
      if (meta) meta.textContent = `${state.resultMetaBase} · Mix ${job.mixRevision} · 人声 ${mix.vocalMute ? "静音" : `${mix.vocalGainDb} dB`} · 伴奏 ${mix.accompanimentMute ? "静音" : `${mix.accompanimentGainDb} dB`}`;
      if (status) status.textContent = state.lang === "en"
        ? "Mix updated. Preview and download now use the same audio."
        : "混音已更新；预听与下载现在使用同一份音频。";
    } catch (error) {
      if (status) status.textContent = state.lang === "en"
        ? `Mix update failed: ${String(error?.message || error)}`
        : `更新混音失败：${String(error?.message || error)}`;
    } finally {
      state.busy = false;
      syncMixControls();
    }
  }

  async function runRvcInference() {
    if (chorusController?.isEnabled()) return chorusController.convert();
    const localButton = document.getElementById("rvc-song-local-fallback");
    if (localButton) localButton.hidden = false;
    const selectedModel = state.catalog.find((model) => model.id === state.selectedModelId);
    if (selectedModel && String(selectedModel.id).startsWith(OWN_MODEL_PREFIX)) {
      return runWebRvcInference();
    }
    if (state.inferenceMode === "local") {
      return runWebRvcInference({ allowLong: true });
    }
    if (!isAppleMobile() && state.audioMode === "voice" && hasDeviceFallbackModel(selectedModel) && state.engineReady === false) {
      const cloudReady = await refreshOfficialService();
      if (cloudReady === false) {
        updateStatusDisplay(" 检测到电脑端云引擎离线，正在使用当前用户设备处理纯人声…");
        setInferenceMode("local");
        return runWebRvcInference({ allowLong: true, fallback: true });
      }
    }
    const cloudResult = await runOfficialRvcInference({ allowDeviceFallback: !isAppleMobile() });
    if (cloudResult?.fallback) {
      setInferenceMode("local");
      return runWebRvcInference({ allowLong: true, fallback: true });
    }
    return cloudResult;
  }

  document.getElementById("rvc-song-local-fallback")?.addEventListener("click", () => {
    if (state.busy) return;
    const model = state.catalog.find((model) => model.id === state.selectedModelId);
    if (!hasDeviceFallbackModel(model)) {
      showToast("请先选择支持设备端的角色。");
      return;
    }
    if (state.audioMode === "song") showToast("本地直接变声不分离伴奏，伴奏也会一起变声。");
    setAudioMode("voice");
    setInferenceMode("local");
    runRvcInference();
  });

  window.addEventListener("pagehide", () => {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = "";
  });

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
          setTrainingUi(100, ` ${label}`, false);
          clearStoredJob();
          if (cancelButton) cancelButton.classList.add("hidden");
          await refreshTrainedModel(payload.modelId);
          showToast(" 新模型训练完成，已加入独立训练模型区");
          return;
        }
        if (payload?.state === "failed" || payload?.state === "cancelled") {
          setTrainingUi(job.progress, ` ${label}${payload.errorCode ? `（${payload.errorCode}）` : ""}`, false);
          clearStoredJob();
          if (cancelButton) cancelButton.classList.add("hidden");
          return;
        }
        setTrainingUi(job.progress, ` ${label}`);
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
        setTrainingUi(0, ` 训练任务启动失败：${error.message}`, false);
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
          showToast(` 已保存云端 RVC 服务地址：${val}`);
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
        const pitch = maleToFemalePresetPitch();
        const fmt = (v) => (v > 0 ? "+" : "") + v;
        setPitchMode(
          pitch,
          model
            ? `已设置 +12 半音跨音域预设，用于低音讲话转换「${model.name}」等高音声线。高音输入或歌曲请先用原调，再按试听结果调整。`
            : ` 当前已设为 ${fmt(pitch)} 半音：男声变女角色推荐音高。`,
          btnPresetMaleFemale
        );
      });
    }

    if (btnPresetSame) {
      btnPresetSame.addEventListener("click", () => {
        setPitchMode(0, "当前已设为 0 半音：保留自然音高；若低音讲话转换高音角色后出现沙哑，可试听跨音域预设。", btnPresetSame);
      });
    }

    if (btnPresetFemaleMale) {
      btnPresetFemaleMale.addEventListener("click", () => {
        setPitchMode(-12, " 当前已设为 -12 半音：女声变男角色降低 1 个八度，沉稳低厚自然。", btnPresetFemaleMale);
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
          else pitchTip.textContent = ` 自定义音高偏移: ${(val > 0 ? "+" : "")}${val} 半音。`;
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

    const rmsMixInput = document.getElementById("rvc-rms-mix");
    const rmsMixValue = document.getElementById("rvc-rms-mix-value");
    const syncRmsMix = () => {
      if (rmsMixValue) rmsMixValue.textContent = selectedRmsMixRate().toFixed(2);
    };
    rmsMixInput?.addEventListener("input", syncRmsMix);
    rmsMixInput?.addEventListener("change", syncRmsMix);
    syncRmsMix();

    const markMixPending = () => {
      syncMixControls();
      const status = document.getElementById("rvc-mix-status");
      if (status && state.latestSongJob?.remixAvailable) {
        status.textContent = state.lang === "en"
          ? "Settings changed. Update the mix to change both preview and download."
          : "设置已改动；点击更新混音后，预听和下载才会同步改变。";
      }
    };
    for (const id of ["rvc-vocal-gain", "rvc-accompaniment-gain", "rvc-vocal-mute", "rvc-accompaniment-mute"]) {
      const input = document.getElementById(id);
      input?.addEventListener("input", markMixPending);
      input?.addEventListener("change", markMixPending);
    }
    document.getElementById("rvc-mix-reset")?.addEventListener("click", () => {
      for (const id of ["rvc-vocal-gain", "rvc-accompaniment-gain"]) {
        const input = document.getElementById(id);
        if (input) input.value = "0";
      }
      for (const id of ["rvc-vocal-mute", "rvc-accompaniment-mute"]) {
        const input = document.getElementById(id);
        if (input) input.checked = false;
      }
      markMixPending();
    });
    document.getElementById("rvc-mix-update")?.addEventListener("click", updateSongMix);
    syncMixControls();

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
      setTtsStatus(` 已连接 TTS 服务：${base}（已保存到本浏览器，立即生效）。也已下载配置文件备用。`, "ok");
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
            " 未检测到可用的 TTS 服务。请在下方“手动填写服务地址”输入你部署的 TTS 地址（如 http://192.168.1.3:8080），再点一次「一键适配」。", "err"
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
    applyRvcLanguage();
    const { initChorus, publishChorusResult } = await import('./rvc-chorus.js?v=20261004-search-1');
    chorusController = initChorus({ state, getEndpoint: getOfficialEndpoint, prepareFile: fixUploadContainer,
      setMode: () => { setInferenceMode('official'); setAudioMode('song'); },
      createRequestId: createCloudRequestId,
      setBusy: (value) => { state.busy = value; const button = document.getElementById('rvc-convert'); if (button) button.disabled = value; syncMixControls(); },
      onResult: async (next, job) => {
        const audio = document.getElementById('rvc-result-audio');
        if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
        state.resultUrl = next; state.latestSongJob = null;
        await publishChorusResult({audio,result:document.getElementById('rvc-result'),
          download:document.getElementById('rvc-result-download'),meta:document.getElementById('rvc-result-meta')},next,job,attachResultAudio);
      },
    });
    await initCatalog();
    chorusController.refresh();
    applyRvcLanguage();
  });
})();
