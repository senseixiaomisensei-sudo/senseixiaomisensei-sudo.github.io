(() => {
  "use strict";

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MIN_AUDIO_SECONDS = 0.5;
  const WARN_AUDIO_SECONDS = 2;
  const MAX_AUDIO_SECONDS = 180;
  const OFFICIAL_RVC_ENDPOINT = String(globalThis.POSTPREP_RVC_API_ENDPOINT || "/rvc").trim();
  const OFFICIAL_RVC_STATUS_ENDPOINT = String(globalThis.POSTPREP_RVC_STATUS_ENDPOINT || "/rvc/status").trim();
  const OFFICIAL_RVC_MODELS_ENDPOINT = String(globalThis.POSTPREP_RVC_MODELS_ENDPOINT || "/rvc/models").trim();
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
    return TTS_SAME_ORIGIN;
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
      intro: "选一个你有权使用的声音模型，上传或录制一段你自己的声音，使用官方 RVC 推理管线完成变声。输入和结果仅在处理期间发送到受保护的 GPU 服务，并会自动删除。",
      noteTitle: "使用提示",
      noteBody: "默认使用固定版本的 RVC-Project 官方 HuBERT、RMVPE、真实 FAISS 索引与生成器推理。请仅处理你有权使用的声音，并清晰标注为 AI 变声；公开可下载不等于拥有再分发或冒充许可。",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "三步完成变声",
      privacyBadge: "受保护 GPU 推理 · 用完即删",
      stepModel: "1. 选择角色声音",
      stepModelHint: "点击卡片即可选中。搜索框可快速筛选角色。",
      searchPlaceholder: "搜索角色…",
      modelEmpty: "没有找到匹配的角色。换个关键词试试。",
      modelCatalogTitle: "角色声音库",
      modelInstalled: "已就绪",
      modelPick: "已选择",
      stepAudio: "2. 上传或录制你的声音",
      stepAudioHint: "建议单人、清晰、无背景噪音的说话或唱歌片段。支持 WAV、MP3、M4A、OGG、WebM 和浏览器录音。",
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
      protectHint: "保护清辅音和呼吸声，防止破音。0 不保护，0.5 最保守。",
      f0Label: "音高算法",
      f0Rmvpe: "RMVPE（超高精度 · 推荐）",
      f0Harvest: "Harvest（传统稳健）",
      formatLabel: "输出格式",
      formatWav: "WAV（40kHz 高保真）",
      resampleLabel: "输出采样率",
      resampleKeep: "40 kHz / 48 kHz (标准)",
      checkingService: "正在检查官方 RVC GPU 服务；此检查不会上传音频…",
      serviceReady: "🟢 官方 RVC 2.3.260718 GPU 推理服务已就绪",
      serviceOffline: "官方 RVC GPU 服务暂不可用。为避免继续输出失真的兼容结果，公开角色变声已停用。",
      serviceLoading: "正在从本地缓存或 CDN 加载模型权重...",
      convert: "开始变声",
      converting: "正在变声中...",
      howtoTitle: "三步上手",
      howtoOne: "在左侧选一个角色声音（点击卡片即可）。",
      howtoTwo: "上传一段你自己的录音，或直接用麦克风录制。",
      howtoThree: "点“开始变声”，等待本地推理完成即可试听与下载。",
      tipsTitle: "让效果更好",
      resultTitle: "变声结果",
      download: "下载变声结果",
      resultDisclosure: "结果已取回浏览器内存；GPU 服务端的输入临时文件会在任务结束时删除，输出会在短时保留后删除。",
      resultMeta: "角色：{model} · 音高变调：{pitch} · 耗时：{elapsed}s · 官方 RVC GPU 推理",
      analyzing: "正在分析音频…",
      analysisReady: "音频已就绪：{name} · 时长 {duration} · 可以变声。",
      invalidFile: "请选择有效格式的音频文件 (WAV/MP3/M4A/OGG/WebM)。",
      fileTooLarge: "文件超过大小限制 (25 MB)。",
      audioTooShort: "音频太短（不足 0.5 秒），请换一段更长的录音。",
      audioShortWarn: "音频不足 2 秒，建议使用稍长的句子获得更自然效果。",
      audioTooLong: "音频超过 3 分钟。请裁剪后再转换，以免超过受保护网关的任务时限。",
      decodeFailed: "无法解码此音频文件。请换成标准 WAV 或 MP3 重试。",
      missingModel: "请先选择一个角色声音。",
      missingAudio: "请先上传或录制一段你的声音。",
      generationFailed: "变声处理出错，请查看控制台日志或换一段简短音频重试。",
      selectedModel: "已选择角色：{name}。",
      noModels: "未找到可用角色模型。",
      tips: [
        "使用安静环境、单人清晰的人声录音效果最佳。",
        "男生转女声角色建议将音高调为 +12（女转男调为 -12）。",
        "点击变声才会上传音频；服务端输入用完即删，输出短时保留后自动删除。",
      ],
    },
    en: {
      eyebrow: "RVC VOICE CHANGER · WEB EDITION",
      title: "AI Voice Changer",
      intro: "Pick a voice model you are authorized to use, upload or record audio you are allowed to use, and convert it with the pinned official RVC inference pipeline.",
      noteTitle: "Notice",
      noteBody: "The default path uses the pinned RVC-Project HuBERT, RMVPE, real FAISS index, and generator pipeline on a protected GPU service. Public availability is not a redistribution or impersonation license.",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "Three steps to a new voice",
      privacyBadge: "Protected GPU · Ephemeral files",
      stepModel: "1. Pick a character voice",
      stepModelHint: "Click a card to select it. Use the search box to find a voice.",
      searchPlaceholder: "Search voices…",
      modelEmpty: "No matching voice. Try another keyword.",
      modelCatalogTitle: "Voice library",
      modelInstalled: "Ready",
      modelPick: "Selected",
      stepAudio: "2. Upload or record your voice",
      stepAudioHint: "A clean single-person voice clip without background noise is best. WAV, MP3, M4A, OGG, and WebM supported.",
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
      protectHint: "Protects unvoiced consonants and breaths. 0.33 default.",
      f0Label: "Pitch extraction",
      f0Rmvpe: "RMVPE (High Precision)",
      f0Harvest: "Harvest (Classic)",
      formatLabel: "Output format",
      formatWav: "WAV (40kHz Lossless)",
      resampleLabel: "Output sample rate",
      resampleKeep: "40 kHz / 48 kHz (Standard)",
      checkingService: "Checking the official RVC GPU service; no audio is uploaded…",
      serviceReady: "🟢 Official RVC 2.3.260718 GPU service is ready",
      serviceOffline: "The official RVC GPU service is unavailable. Public voice conversion is disabled instead of falling back to the lower-fidelity compatibility engine.",
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
      resultDisclosure: "The result is back in browser memory. Server input is deleted after the task and output expires shortly.",
      resultMeta: "Voice: {model} · Pitch: {pitch} · Time: {elapsed}s · Official RVC GPU",
      analyzing: "Analyzing audio…",
      analysisReady: "Audio ready: {name} · Duration {duration} · Ready to convert.",
      invalidFile: "Choose a valid WAV, MP3, M4A, OGG, or WebM file.",
      fileTooLarge: "File exceeds 25 MB limit.",
      audioTooShort: "Audio is too short (under 0.5s).",
      audioShortWarn: "Audio under 2s may sound robotic. Longer speech is recommended.",
      audioTooLong: "Audio exceeds 3 minutes. Trim it to stay within the protected gateway time limit.",
      decodeFailed: "Could not decode audio. Try converting to standard MP3 or WAV.",
      missingModel: "Pick a character voice first.",
      missingAudio: "Upload or record your voice first.",
      generationFailed: "Conversion failed. Please try a shorter audio clip.",
      selectedModel: "Voice selected: {name}.",
      noModels: "No character models available.",
      tips: [
        "Use a clear, quiet single-person vocal recording.",
        "Male-to-female conversion works best with pitch +12.",
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
      id: "hoshino",
      name: "小鸟游星野 (Hoshino)",
      avatarText: "星野",
      description: "《蔚蓝档案》阿拜多斯对策委员会副会长 · 哎呀呀~ 慵懒可靠大叔系萌少女音 · RVC v2 Ov2 音源焕新",
      tags: ["女声", "蔚蓝档案", "阿拜多斯"],
      defaultPitch: 8,
      pitchNote: "慵懒低音域少女：男声输入推荐 +8",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/hoshino2/chunk_${i}.bin`)
    },
    {
      id: "arisu",
      name: "天童爱丽丝 (Alice)",
      avatarText: "爱丽丝",
      description: "《蔚蓝档案》千年游戏开发部 · 邦邦卡邦~ 纯真机械勇者少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "千年"],
      defaultPitch: 12,
      pitchNote: "明亮高音少女：男声输入推荐 +12",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/arisu/chunk_${i}.bin`)
    },
    {
      id: "shiroko",
      name: "砂狼白子 (Shiroko)",
      avatarText: "白子",
      description: "《蔚蓝档案》阿拜多斯对策委员会 · 沉稳酷飒行动派少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "阿拜多斯"],
      defaultPitch: 10,
      pitchNote: "沉稳中音域少女：男声输入推荐 +10",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/shiroko/chunk_${i}.bin`)
    },
    {
      id: "yuuka",
      name: "早濑优香 (Yuuka)",
      avatarText: "优香",
      description: "《蔚蓝档案》千年研讨会会计 · 傲娇理智计算系少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "千年"],
      defaultPitch: 11,
      pitchNote: "理智中高音域少女：男声输入推荐 +11",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/yuuka/chunk_${i}.bin`)
    },
    {
      id: "hina",
      name: "空崎日奈 (Hina)",
      avatarText: "日奈",
      description: "《蔚蓝档案》格黑娜风纪委员会长 · 威严中带着疲倦的温柔少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "格黑娜"],
      defaultPitch: 10,
      pitchNote: "威严中音域少女：男声输入推荐 +10",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/hina/chunk_${i}.bin`)
    },
    {
      id: "noa",
      name: "生盐诺亚 (Noa)",
      avatarText: "诺亚",
      description: "《蔚蓝档案》千年研讨会书记 · 温柔腹黑记录系少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "千年"],
      defaultPitch: 11,
      pitchNote: "温柔中高音域少女：男声输入推荐 +11",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/noa/chunk_${i}.bin`)
    },
    {
      id: "koharu",
      name: "下江小春 (Koharu)",
      avatarText: "小春",
      description: "《蔚蓝档案》三一补课部 · 色情是不行的！死刑！傲娇纯情少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "三一"],
      defaultPitch: 12,
      pitchNote: "明亮高音域少女：男声输入推荐 +12",
      noiseSeed: 1337,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/koharu/chunk_${i}.bin`)
    },
    {
      id: "tomori",
      name: "高松灯 (Tomori)",
      avatarText: "灯",
      description: "《BanG Dream! It's MyGO!!!!!》主唱 · 清澈少年感少女音 · RVC v2",
      tags: ["女声", "动漫", "MyGO"],
      defaultPitch: 9,
      pitchNote: "少年感低中音域少女：男声输入推荐 +9",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/tomori/chunk_${i}.bin`)
    },
    {
      id: "rana",
      name: "要乐奈 (Rana)",
      avatarText: "乐奈",
      description: "《BanG Dream! It's MyGO!!!!!》吉他手 · 慵懒灵动猫系少女音 · RVC v2",
      tags: ["女声", "动漫", "MyGO"],
      defaultPitch: 10,
      pitchNote: "慵懒中音域猫系少女：男声输入推荐 +10",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/rana/chunk_${i}.bin`)
    },
    {
      id: "teio",
      name: "东海帝皇 (Tokai Teio)",
      avatarText: "帝皇",
      description: "《赛马娘 Pretty Derby》· 活泼元气高辨识度少女音 · RVC v2",
      tags: ["女声", "动漫", "赛马娘"],
      defaultPitch: 12,
      pitchNote: "元气高音域少女：男声输入推荐 +12",
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/teio/chunk_${i}.bin`)
    }
  ];

  const CHARACTER_SAMPLE_RATES = Object.freeze({
    tomori: 48000,
    rana: 48000,
  });

  function normalizeCharacterRuntimeConfig(model) {
    if (!model || String(model.id || "").startsWith("own:")) return model;
    return {
      ...model,
      sampleRate: Number(model.sampleRate) || CHARACTER_SAMPLE_RATES[model.id] || 40000,
      retrieval: model.retrieval || `models/characters/${model.id}/retrieval.bin`,
      noiseScale: Number.isFinite(Number(model.noiseScale)) ? Number(model.noiseScale) : 0.5,
      defaultIndexRate: Number.isFinite(Number(model.defaultIndexRate)) ? Number(model.defaultIndexRate) : 0.3,
    };
  }

  const state = {
    lang: "zh",
    engineReady: false,
    engineInfo: null,
    busy: false,
    selectedModelId: "hoshino",
    audio: null, // { file, buffer, float32, sampleRate, name, duration }
    sourceMode: "upload",
    ttsEnabled: false,
    ttsLoading: false,
    ttsAdapting: false,
    recording: false,
    mediaRecorder: null,
    recordChunks: [],
    recordStream: null,
    recordStartAt: 0,
    recordTimerId: 0,
    catalog: EMBEDDED_RVC_CATALOG.map(normalizeCharacterRuntimeConfig),
    baseModels: EMBEDDED_BASE_MODELS,
    rvcContext: null,
    resultUrl: "",
  };

  // High-Performance Concurrency Pool (5 concurrent HTTP streams for max speed)
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

  const globalDownloadPool = new ConcurrencyPool(5);

  // IndexedDB Persistent Storage for Instant 0-second reloads & Resumable Downloads
  const DB_NAME = "rvc_web_models_v5_db";
  const STORE_NAME = "model_blobs";
  const CHARACTER_MODEL_ASSET_VERSION = "20260821-v24";

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
      `https://gh-proxy.com/${rawGhUrl}`,
      `https://fastly.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://gcore.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://testingcf.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      `https://cdn.jsdmirror.com/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
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

    const fetchWithProgress = async (url) => {
      const controller = new AbortController();
      let activityTimer = setTimeout(() => controller.abort(), 18000); // 18s inactivity watchdog

      const resetActivity = () => {
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => controller.abort(), 18000);
      };

      try {
        const resp = await fetch(url, { signal: controller.signal });
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
      }
    };

    let winningBuffer = null;
    let lastError = null;

    // Retry loop: up to 3 attempts with progressive fallbacks
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        winningBuffer = await Promise.any([
          fetchWithProgress(mirrors[0]),
          fetchWithProgress(mirrors[1]),
          new Promise((resolve, reject) => setTimeout(() => {
            fetchWithProgress(mirrors[2]).then(resolve, reject);
          }, 2000))
        ]);
        if (winningBuffer && winningBuffer.byteLength > 0) break;
      } catch (raceErr) {
        lastError = raceErr;
        // Fallback to secondary mirrors
        for (let m = 2; m < mirrors.length; m++) {
          try {
            winningBuffer = await fetchWithProgress(mirrors[m]);
            if (winningBuffer && winningBuffer.byteLength > 0) break;
          } catch (e) {
            lastError = e;
          }
        }
        if (winningBuffer && winningBuffer.byteLength > 0) break;
        if (attempt < 2) {
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
        const msg = `⏳ [1/4] 正在下载 ${displayName}: 分片 ${completedCount}/${totalCount} (${(totalLoaded/1024/1024).toFixed(1)}MB / ${(estimatedTotalBytes/1024/1024).toFixed(1)}MB) · 5 线程断点极速加速中`;
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
            chunkBytesLoaded[idx] = bytesLoaded;
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

  function renderModelGallery() {
    const container = document.getElementById("rvc-model-gallery");
    const emptyEl = document.getElementById("rvc-model-empty");
    const searchVal = (document.getElementById("rvc-model-search")?.value || "").trim().toLowerCase();
    if (!container) return;

    container.innerHTML = "";
    const filtered = state.catalog.filter((m) => {
      if (!searchVal) return true;
      return (
        m.name.toLowerCase().includes(searchVal) ||
        (m.description || "").toLowerCase().includes(searchVal) ||
        (m.tags || []).some((tag) => tag.toLowerCase().includes(searchVal))
      );
    });

    if (filtered.length === 0) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");

    filtered.forEach((m) => {
      const isSelected = m.id === state.selectedModelId;
      const card = document.createElement("button");
      card.type = "button";
      card.className = `flex flex-col items-start p-4 rounded-xl border text-left transition-all relative ${
        isSelected
          ? "border-brand bg-teal-50/80 shadow-md ring-2 ring-brand"
          : "border-line bg-white hover:border-brand/60 hover:shadow-sm"
      }`;
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", isSelected ? "true" : "false");
      card.dataset.modelId = m.id;

      const avatarText = m.avatarText || m.name.slice(0, 2);
      card.innerHTML = `
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50/80 border border-teal-200/60 font-black text-brand text-xs shadow-xs">
              ${avatarText}
            </div>
            <div>
              <p class="text-sm font-black text-ink">${m.name}</p>
              <div class="flex flex-wrap gap-1 mt-1">
                ${(m.tags || [])
                  .map(
                    (tag) =>
                      `<span class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-zinc-100 text-zinc-600">${tag}</span>`
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <span class="text-xs font-bold ${
            isSelected ? "text-brand" : "text-zinc-400"
          }">
            ${isSelected ? `<i class="fa-solid fa-circle-check"></i> ${t("modelPick")}` : t("modelInstalled")}
          </span>
        </div>
        <p class="mt-2 text-xs leading-5 text-muted line-clamp-2">${m.description || ""}</p>
      `;

      card.addEventListener("click", () => {
        state.selectedModelId = m.id;
        applyCharacterPitch(m);
        renderModelGallery();
        updateStatusDisplay();
      });

      container.appendChild(card);
    });
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
      description: remote.description || local?.description || "管理员挂载的官方 RVC 推理模型",
      tags: license === "unverified" ? [...remoteTags, "许可未核验"] : remoteTags,
      remote: true,
      hasIndex: remote.hasIndex === true,
      license,
      source: typeof remote.source === "string" && remote.source ? remote.source : (local?.source || ""),
      modelVersion: typeof remote.modelVersion === "string" && remote.modelVersion ? remote.modelVersion : (local?.modelVersion || ""),
    });
  }

  async function refreshOfficialService() {
    try {
      const status = await fetchJsonWithTimeout(OFFICIAL_RVC_STATUS_ENDPOINT, 6500);
      state.engineReady = status?.ready === true;
      state.engineInfo = state.engineReady ? status : null;
      if (!state.engineReady) return false;
      const payload = await fetchJsonWithTimeout(OFFICIAL_RVC_MODELS_ENDPOINT, 10000);
      const models = Array.isArray(payload?.models)
        ? payload.models.filter((model) => model && /^[A-Za-z0-9_-]{1,64}$/u.test(String(model.id || "")))
        : [];
      if (!models.length) {
        state.engineReady = false;
        state.engineInfo = null;
        return false;
      }
      state.catalog = models.map(displayMetadataForRemote);
      if (!state.catalog.some((model) => model.id === state.selectedModelId)) {
        state.selectedModelId = state.catalog[0].id;
      }
      return true;
    } catch (error) {
      console.warn("Official RVC service is unavailable", error);
      state.engineReady = false;
      state.engineInfo = null;
      return false;
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
    if (!isOwnModel && !state.engineReady) {
      if (statusEl) statusEl.textContent = t("serviceOffline");
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = t("convert");
      return;
    }

    if (!state.audio) {
      if (statusEl) statusEl.textContent = t("missingAudio");
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = t("convert");
      return;
    }

    if (statusEl) {
      const engineLabel = isOwnModel ? "本机自带 ONNX 兼容模式" : t("serviceReady");
      statusEl.textContent = `${engineLabel} · 已选角色: ${selectedModel.name} · 音频: ${
        state.audio.name
      } (${formatTime(state.audio.duration)})`;
    }
    if (convertBtn) convertBtn.disabled = state.busy;
    if (convertLabel) convertLabel.textContent = state.busy ? t("converting") : t("convert");
  }

  // 用户自己训练/转换的 .onnx 模型（仅本机使用，不回传）：
  // 以 IndexedDB Blob 存储，key = `own:<id>.onnx`，catalog 项记录 id 便于检索。
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

  async function handleAudioSelected(file) {
    if (!file) return;
    const statusEl = document.getElementById("rvc-audio-status");
    if (statusEl) statusEl.textContent = t("analyzing");

    try {
      const decoded = await decodeAudioFileTo16kMono(file);
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
      state.audio = null;
      if (statusEl) statusEl.textContent = t("decodeFailed");
      showToast(t("decodeFailed"));
      updateStatusDisplay();
    }
  }

  function setupRecording() {
    const recordBtn = document.getElementById("rvc-record-toggle");
    const recordLabel = document.getElementById("rvc-record-label");
    const recordTimer = document.getElementById("rvc-record-timer");
    const recordPreview = document.getElementById("rvc-record-preview");

    if (!recordBtn) return;

    recordBtn.addEventListener("click", async () => {
      if (state.recording) {
        // Stop recording
        if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
          state.mediaRecorder.stop();
        }
        clearInterval(state.recordTimerId);
        state.recording = false;
        if (recordLabel) recordLabel.textContent = t("recordStart");
        recordBtn.classList.remove("bg-red-600", "hover:bg-red-700");
        recordBtn.classList.add("bg-brand", "hover:bg-brandDark");
        return;
      }

      // Start recording
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast(t("recordUnsupported"));
        return;
      }

      try {
        state.recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.recordChunks = [];
        const recorder = new MediaRecorder(state.recordStream);
        state.mediaRecorder = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) state.recordChunks.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(state.recordChunks, { type: recorder.mimeType || "audio/webm" });
          const recFile = new File([blob], `mic_recording_${Date.now()}.webm`, {
            type: blob.type,
          });
          if (recordPreview) {
            recordPreview.src = URL.createObjectURL(blob);
            recordPreview.hidden = false;
          }
          if (state.recordStream) {
            state.recordStream.getTracks().forEach((track) => track.stop());
          }
          await handleAudioSelected(recFile);
        };

        recorder.start(100);
        state.recording = true;
        state.recordStartAt = Date.now();
        if (recordLabel) recordLabel.textContent = t("recordStop");
        recordBtn.classList.remove("bg-brand", "hover:bg-brandDark");
        recordBtn.classList.add("bg-red-600", "hover:bg-red-700");

        state.recordTimerId = setInterval(() => {
          const sec = (Date.now() - state.recordStartAt) / 1000;
          if (recordTimer) recordTimer.textContent = formatTime(sec);
        }, 500);
      } catch (err) {
        console.error("Mic access denied or error:", err);
        showToast(t("recordDenied"));
      }
    });
  }

  async function runWebRvcInference() {
    if (state.busy || !state.audio || !state.selectedModelId) return;

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
    const protectVal = parseFloat(document.getElementById("rvc-protect")?.value || "0.33");

    state.busy = true;
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.setAttribute("aria-busy", "true");
    }

    const startTime = Date.now();
    try {
      // 1. Dynamic import of rvc-web-runtime
      updateStatusDisplay("⏳ 正在初始化本地推理引擎...");
      const runtimeModule = await import(new URL("assets/rvc-engine/rvc-web-runtime.js?v=20260821-v24", window.location.href).href);
      const { createRVC, runPipelineInWorker } = runtimeModule;

      const rvc = createRVC({
        assetBaseUrl: new URL("assets/rvc-engine/", window.location.href).href,
        wasmBaseUrl: new URL("assets/rvc-engine/ort126/", window.location.href).href,
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

      // 3. Run Pipeline in Web Worker
      updateStatusDisplay("🚀 [2/4] 本地 WebAssembly SIMD 推理开始 (完全在您的设备上运行)...");
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
          timeout: 600000,
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
        resultMeta.textContent = t("resultMeta", {
          model: selectedModel.name,
          pitch: (pitchVal > 0 ? "+" : "") + pitchVal,
          elapsed: elapsedSec,
        });
      }
      if (resultSection) {
        resultSection.hidden = false;
        resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      updateStatusDisplay(`🎉 变声成功！用时 ${elapsedSec} 秒，结果已生成在下方。`);
      showToast("🎉 变声完成！可在下方试听或下载");
    } catch (err) {
      console.error("RVC Inference Error:", err);
      showToast(t("generationFailed"));
      updateStatusDisplay(`❌ 变声失败: ${err.message || err}`);
    } finally {
      state.busy = false;
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.setAttribute("aria-busy", "false");
      }
      if (convertLabel) convertLabel.textContent = t("convert");
    }
  }

  async function runOfficialRvcInference() {
    if (state.busy || !state.audio?.file || !state.selectedModelId || !state.engineReady) return;
    const selectedModel = state.catalog.find((model) => model.id === state.selectedModelId);
    if (!selectedModel || !selectedModel.remote) {
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
    const protect = parseFloat(document.getElementById("rvc-protect")?.value || "0.33");
    const rmsMixRate = parseFloat(document.getElementById("rvc-rms-mix")?.value || "1");
    const filterRadius = parseInt(document.getElementById("rvc-filter-radius")?.value || "0", 10);
    const extension = String(state.audio.file.name || "").toLowerCase().split(".").pop();
    if (!["wav", "mp3", "m4a", "ogg", "webm"].includes(extension)) {
      showToast("官方 GPU 服务当前仅接受 WAV、MP3、M4A、OGG 或 WebM，请先转换格式。");
      return;
    }

    state.busy = true;
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.setAttribute("aria-busy", "true");
    }
    if (convertLabel) convertLabel.textContent = t("converting");
    showProgressBar(true);
    updateProgressBar(12);
    const startedAt = Date.now();

    try {
      updateStatusDisplay("⏳ 正在通过受保护网关上传音频；输入会在任务结束后删除…");
      const body = new FormData();
      body.set("modelId", selectedModel.id);
      body.set("pitch", String(pitch));
      body.set("indexRate", String(selectedModel.hasIndex ? indexRate : 0));
      body.set("protect", String(protect));
      body.set("f0Method", "rmvpe");
      body.set("format", "wav");
      body.set("resample", "0");
      body.set("rmsMixRate", String(rmsMixRate));
      body.set("filterRadius", String(filterRadius));
      body.set("language", state.lang === "en" ? "en" : "zh");
      body.set("audio", state.audio.file, state.audio.file.name || `input.${extension}`);

      updateProgressBar(25);
      const response = await fetch(OFFICIAL_RVC_ENDPOINT, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.jobId || !payload.downloadToken) {
        throw new Error(payload?.code || `HTTP ${response.status}`);
      }

      updateProgressBar(82);
      updateStatusDisplay("⏳ 官方 RVC 推理完成，正在安全取回短时结果…");
      const outputBase = OFFICIAL_RVC_ENDPOINT.replace(/\/+$/u, "");
      const outputUrl = `${outputBase}/output/${encodeURIComponent(payload.jobId)}?token=${encodeURIComponent(payload.downloadToken)}`;
      const outputResponse = await fetch(outputUrl, { credentials: "omit", cache: "no-store" });
      if (!outputResponse.ok) throw new Error(`RVC_OUTPUT_${outputResponse.status}`);
      const outputBlob = await outputResponse.blob();
      if (!outputBlob.size || outputBlob.size > 100 * 1024 * 1024) throw new Error("RVC_INVALID_OUTPUT");

      if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
      state.resultUrl = URL.createObjectURL(outputBlob);
      if (resultAudio) {
        resultAudio.src = state.resultUrl;
        resultAudio.load();
      }
      if (resultDownload) {
        resultDownload.href = state.resultUrl;
        resultDownload.download = `postprep-rvc-${selectedModel.id}-${Date.now()}.wav`;
      }
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (resultMeta) {
        resultMeta.textContent = t("resultMeta", {
          model: selectedModel.name,
          pitch: `${pitch > 0 ? "+" : ""}${pitch}`,
          elapsed,
        });
      }
      if (resultSection) {
        resultSection.hidden = false;
        resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      updateProgressBar(100);
      updateStatusDisplay(`🎉 官方 RVC 变声完成，用时 ${elapsed} 秒。`);
      showToast("🎉 官方 RVC 变声完成，可试听或下载");
    } catch (error) {
      console.error("Official RVC inference failed", error);
      updateStatusDisplay(`❌ 官方 RVC 变声失败：${error?.message || error}`);
      showToast(t("generationFailed"));
      await refreshOfficialService();
    } finally {
      state.busy = false;
      setTimeout(() => showProgressBar(false), 600);
      if (convertBtn) {
        convertBtn.setAttribute("aria-busy", "false");
      }
      updateStatusDisplay();
    }
  }

  function runRvcInference() {
    const selectedModel = state.catalog.find((model) => model.id === state.selectedModelId);
    if (selectedModel && String(selectedModel.id).startsWith(OWN_MODEL_PREFIX)) {
      return runWebRvcInference();
    }
    return runOfficialRvcInference();
  }

  function setupEventListeners() {
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

    // 文本朗读（TTS，第三输入源）：探测本机 edge-tts 服务 → 合成中性人声 → 自动用当前角色变声
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
        ttsReady.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-500"></i>本机 TTS 服务正常 · 可角色朗读';
        ttsReady.className = "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700";
      } else {
        ttsReady.innerHTML = '<i class="fa-solid fa-plug-circle-xmark text-red-500"></i>未检测到本机 TTS 服务 (edge-tts)';
        ttsReady.className = "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700";
      }
    };

    // 探测端点是否可达（GET /health 或 OPTIONS），仅用于 UI 状态
    const probeSingleBase = async (base) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const res = await fetch(`${base}/v1/tts-health`, { method: "GET", signal: controller.signal }).catch(() => null);
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
        setTtsStatus("本机 TTS 服务未就绪，请先启动 rvc-service（见 tools/ 说明）。", "err");
        return null;
      }
      setTtsStatus("正在合成中性人声…（本机 edge-tts）", null);
      try {
        const res = await fetch(`${getTtsBase()}/v1/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.size) throw new Error("空响应");
        const file = new File([blob], `tts_${Date.now()}.mp3`, { type: res.headers.get("Content-Type") || "audio/mpeg" });
        return file;
      } catch (err) {
        setTtsStatus(`合成失败：${err.message}。可用「一键适配」自动连接本机 rvc-service。`, "err");
        return null;
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

    // 进入 TTS 源时触发一次探测；页面加载 1s 后台探测一次
    const ttsBtn = document.getElementById("rvc-source-tts");
    if (ttsBtn) ttsBtn.addEventListener("click", probeTts);
    setTimeout(probeTts, 1000);

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
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    await initCatalog();
    updateStatusDisplay();
  });
})();
