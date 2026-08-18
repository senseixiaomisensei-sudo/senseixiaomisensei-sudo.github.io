(() => {
  "use strict";

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MIN_AUDIO_SECONDS = 0.5;
  const WARN_AUDIO_SECONDS = 2;
  const MAX_AUDIO_SECONDS = 300;
  const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg", "webm", "flac", "aac"]);

  const translations = {
    zh: {
      eyebrow: "RVC VOICE CHANGER · WEB EDITION",
      title: "AI 变声器",
      intro: "选一个角色声音，上传或录制一段你自己的声音，一键变成角色的音色。变声计算 100% 在您的浏览器本地运行，不消耗任何服务器算力，零录音泄露风险。",
      noteTitle: "使用提示",
      noteBody: "变声计算由您的设备浏览器本地完成（配置好则变声快，配置稍慢则多等几秒，但最终音质完全一致）。请仅将变声结果用于正当合规场景，并清晰标注为 AI 变声。",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "三步完成变声",
      privacyBadge: "纯本地运行 · 零隐私上传",
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
      recordHint: "录音在浏览器本地完成，不会上传至任何云端服务器。",
      recordUnsupported: "当前浏览器不支持录音，请改用上传音频。",
      recordDenied: "麦克风权限被拒绝。请在浏览器设置中允许麦克风后重试，或改用上传音频。",
      recordInsecure: "录音需要 HTTPS 环境。当前页面不是安全上下文，请改用上传音频。",
      recordError: "录音启动失败，请改用上传音频。",
      stepSettings: "3. 调节声音（可选）",
      stepSettingsHint: "大多数时候保持默认就好。男生变女声建议音高设为 +12（女变男设为 -12）。",
      pitchLabel: "音高调整 (变调)",
      pitchLow: "男声化 (-12)",
      pitchDefault: "原调 (0)",
      pitchHigh: "女声化 (+12)",
      advancedToggle: "高级设置（进阶选项）",
      indexRateLabel: "音色相似度",
      indexRateHint: "越高音色越贴近角色，太高可能不自然。建议 0.3–0.8。",
      protectLabel: "辅音与呼吸保护",
      protectHint: "保护清辅音和呼吸声，防止破音。0 不保护，0.5 最保守。",
      f0Label: "音高算法",
      f0Rmvpe: "RMVPE（超高精度 · 推荐）",
      f0Harvest: "Harvest（传统稳健）",
      formatLabel: "输出格式",
      formatWav: "WAV（40kHz 高保真）",
      resampleLabel: "输出采样率",
      resampleKeep: "40 kHz / 48 kHz (标准)",
      checkingService: "正在初始化本地 AI 变声引擎 (ONNX Runtime Web WASM)...",
      serviceReady: "🟢 本地 AI 变声引擎已就绪（算力由本机提供 · 零服务器费用）",
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
      resultDisclosure: "变声音频已保存在浏览器内存中，点击下方按钮即可保存到本地电脑/手机。",
      resultMeta: "角色：{model} · 音高变调：{pitch} · 耗时：{elapsed}s · 纯本地生成",
      analyzing: "正在分析音频…",
      analysisReady: "音频已就绪：{name} · 时长 {duration} · 可以变声。",
      invalidFile: "请选择有效格式的音频文件 (WAV/MP3/M4A/OGG/WebM)。",
      fileTooLarge: "文件超过大小限制 (25 MB)。",
      audioTooShort: "音频太短（不足 0.5 秒），请换一段更长的录音。",
      audioShortWarn: "音频不足 2 秒，建议使用稍长的句子获得更自然效果。",
      audioTooLong: "音频超过 5 分钟，建议裁剪为更短的片段以加快转换速度。",
      decodeFailed: "无法解码此音频文件。请换成标准 WAV 或 MP3 重试。",
      missingModel: "请先选择一个角色声音。",
      missingAudio: "请先上传或录制一段你的声音。",
      generationFailed: "变声处理出错，请查看控制台日志或换一段简短音频重试。",
      selectedModel: "已选择角色：{name}。",
      noModels: "未找到可用角色模型。",
      tips: [
        "使用安静环境、单人清晰的人声录音效果最佳。",
        "男生转女声角色建议将音高调为 +12（女转男调为 -12）。",
        "所有变声运算均在您的浏览器本地进行，数据 100% 私密安全。",
      ],
    },
    en: {
      eyebrow: "RVC VOICE CHANGER · WEB EDITION",
      title: "AI Voice Changer",
      intro: "Pick a character voice, upload or record your own audio, and convert it in one click. 100% runs locally in your browser with zero server costs and full privacy.",
      noteTitle: "Notice",
      noteBody: "Inference runs on your device's browser (faster on powerful hardware, slightly longer on mobile, but audio quality is identical). Use ethically and label AI audio.",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "Three steps to a new voice",
      privacyBadge: "100% Client-Side · Private",
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
      recordHint: "Recording is processed locally and never uploaded to any server.",
      recordUnsupported: "Recording is not supported in this browser. Please upload audio instead.",
      recordDenied: "Microphone permission was denied. Allow it in settings or upload a file.",
      recordInsecure: "Recording requires HTTPS. Please upload audio instead.",
      recordError: "Recording could not start. Please upload audio instead.",
      stepSettings: "3. Tune the sound (optional)",
      stepSettingsHint: "For male-to-female voices, set pitch to +12 (female-to-male to -12).",
      pitchLabel: "Pitch Shift",
      pitchLow: "Male (-12)",
      pitchDefault: "Original (0)",
      pitchHigh: "Female (+12)",
      advancedToggle: "Advanced settings",
      indexRateLabel: "Similarity",
      indexRateHint: "Higher matches character timbre more closely. 0.3–0.8 recommended.",
      protectLabel: "Consonant protection",
      protectHint: "Protects unvoiced consonants and breaths. 0.33 default.",
      f0Label: "Pitch extraction",
      f0Rmvpe: "RMVPE (High Precision)",
      f0Harvest: "Harvest (Classic)",
      formatLabel: "Output format",
      formatWav: "WAV (40kHz Lossless)",
      resampleLabel: "Output sample rate",
      resampleKeep: "40 kHz / 48 kHz (Standard)",
      checkingService: "Initializing ONNX Runtime Web WASM engine...",
      serviceReady: "🟢 Local AI Voice Engine Ready (Powered by your device)",
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
      resultDisclosure: "Audio generated in your browser. Click below to download.",
      resultMeta: "Voice: {model} · Pitch: {pitch} · Time: {elapsed}s · Pure Local Inference",
      analyzing: "Analyzing audio…",
      analysisReady: "Audio ready: {name} · Duration {duration} · Ready to convert.",
      invalidFile: "Choose a valid WAV, MP3, M4A, OGG, or WebM file.",
      fileTooLarge: "File exceeds 25 MB limit.",
      audioTooShort: "Audio is too short (under 0.5s).",
      audioShortWarn: "Audio under 2s may sound robotic. Longer speech is recommended.",
      audioTooLong: "Audio exceeds 5 minutes. Please trim to a shorter clip.",
      decodeFailed: "Could not decode audio. Try converting to standard MP3 or WAV.",
      missingModel: "Pick a character voice first.",
      missingAudio: "Upload or record your voice first.",
      generationFailed: "Conversion failed. Please try a shorter audio clip.",
      selectedModel: "Voice selected: {name}.",
      noModels: "No character models available.",
      tips: [
        "Use a clear, quiet single-person vocal recording.",
        "Male-to-female conversion works best with pitch +12.",
        "All calculations run inside your browser. 100% private and free.",
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
      description: "《蔚蓝档案》阿拜多斯对策委员会副会长 · 哎呀呀~ 慵懒可靠大叔系萌少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "阿拜多斯"],
      defaultPitch: 1,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/hoshino/chunk_${i}.bin`)
    },
    {
      id: "arisu",
      name: "天童爱丽丝 (Alice)",
      avatarText: "爱丽丝",
      description: "《蔚蓝档案》千年游戏开发部 · 邦邦卡邦~ 纯真机械勇者少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "千年"],
      defaultPitch: 2,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/arisu/chunk_${i}.bin`)
    },
    {
      id: "shiroko",
      name: "砂狼白子 (Shiroko)",
      avatarText: "白子",
      description: "《蔚蓝档案》阿拜多斯对策委员会 · 沉稳酷飒行动派少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "阿拜多斯"],
      defaultPitch: 1,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/shiroko/chunk_${i}.bin`)
    },
    {
      id: "yuuka",
      name: "早濑优香 (Yuuka)",
      avatarText: "优香",
      description: "《蔚蓝档案》千年研讨会会计 · 傲娇理智计算系少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "千年"],
      defaultPitch: 2,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/yuuka/chunk_${i}.bin`)
    },
    {
      id: "hina",
      name: "空崎日奈 (Hina)",
      avatarText: "日奈",
      description: "《蔚蓝档案》格黑娜风纪委员会长 · 威严中带着疲倦的温柔少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "格黑娜"],
      defaultPitch: 1,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/hina/chunk_${i}.bin`)
    },
    {
      id: "noa",
      name: "生盐诺亚 (Noa)",
      avatarText: "诺亚",
      description: "《蔚蓝档案》千年研讨会书记 · 温柔腹黑记录系少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "千年"],
      defaultPitch: 2,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/noa/chunk_${i}.bin`)
    },
    {
      id: "koharu",
      name: "下江小春 (Koharu)",
      avatarText: "小春",
      description: "《蔚蓝档案》三一补课部 · 色情是不行的！死刑！傲娇纯情少女音 · RVC v2",
      tags: ["女声", "蔚蓝档案", "三一"],
      defaultPitch: 3,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/koharu/chunk_${i}.bin`)
    },
    {
      id: "tomori",
      name: "高松灯 (Tomori)",
      avatarText: "灯",
      description: "《BanG Dream! It's MyGO!!!!!》主唱 · 清澈少年感少女音 · RVC v2",
      tags: ["女声", "动漫", "MyGO"],
      defaultPitch: 2,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/tomori/chunk_${i}.bin`)
    },
    {
      id: "rana",
      name: "要乐奈 (Rana)",
      avatarText: "乐奈",
      description: "《BanG Dream! It's MyGO!!!!!》吉他手 · 慵懒灵动猫系少女音 · RVC v2",
      tags: ["女声", "动漫", "MyGO"],
      defaultPitch: 2,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/rana/chunk_${i}.bin`)
    },
    {
      id: "teio",
      name: "东海帝皇 (Tokai Teio)",
      avatarText: "帝皇",
      description: "《赛马娘 Pretty Derby》· 活泼元气高辨识度少女音 · RVC v2",
      tags: ["女声", "动漫", "赛马娘"],
      defaultPitch: 3,
      chunks: Array.from({ length: 6 }, (_, i) => `models/characters/teio/chunk_${i}.bin`)
    }
  ];

  const state = {
    lang: "zh",
    engineReady: false,
    busy: false,
    selectedModelId: "hoshino",
    audio: null, // { file, buffer, float32, sampleRate, name, duration }
    sourceMode: "upload",
    recording: false,
    mediaRecorder: null,
    recordChunks: [],
    recordStream: null,
    recordStartAt: 0,
    recordTimerId: 0,
    catalog: EMBEDDED_RVC_CATALOG,
    baseModels: EMBEDDED_BASE_MODELS,
    rvcContext: null,
  };

  // High-Performance Concurrency Pool (3 concurrent HTTP streams - optimal for Mobile & Desktop)
  class ConcurrencyPool {
    constructor(limit = 3) {
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

  const globalDownloadPool = new ConcurrencyPool(3);

  // IndexedDB Persistent Storage for Instant 0-second reloads
  const DB_NAME = "rvc_web_models_v5_db";
  const STORE_NAME = "model_blobs";

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

  // Multi-CDN Candidate URLs for any relative chunk path (Live-Tested Fast Mirror Order)
  function getChunkMirrorUrls(relPath) {
    const cleanPath = relPath.startsWith("/") ? relPath.slice(1) : relPath;
    const sameOriginUrl = new URL(cleanPath, window.location.href).href;
    const rawGhUrl = `https://raw.githubusercontent.com/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io/main/${cleanPath}`;
    return [
      `https://cdn.jsdmirror.com/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
      sameOriginUrl,
      `https://gh-proxy.com/${rawGhUrl}`,
      `https://ghproxy.net/${rawGhUrl}`,
      `https://cdn.jsdelivr.net/gh/senseixiaomisensei-sudo/senseixiaomisensei-sudo.github.io@main/${cleanPath}`,
    ];
  }

  // Fetch single chunk with Multi-Node Concurrent Racing & Automatic Failover
  async function fetchSingleChunkWithFallback(chunkPath, chunkIndex, totalChunks, onChunkProgress) {
    const mirrors = getChunkMirrorUrls(chunkPath);

    const fetchWithTimeout = (url, timeoutMs = 8000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { signal: controller.signal })
        .then(async (resp) => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = await resp.arrayBuffer();
          clearTimeout(timer);
          if (!buf || buf.byteLength === 0) throw new Error("Empty buffer");
          return buf;
        })
        .catch((err) => {
          clearTimeout(timer);
          throw err;
        });
    };

    let winningBuffer = null;
    try {
      winningBuffer = await Promise.any([
        fetchWithTimeout(mirrors[0], 9000),
        fetchWithTimeout(mirrors[1], 9000),
        new Promise((resolve, reject) => setTimeout(() => {
          fetchWithTimeout(mirrors[2], 9000).then(resolve, reject);
        }, 1500))
      ]);
    } catch (raceErr) {
      for (let m = 3; m < mirrors.length; m++) {
        try {
          winningBuffer = await fetchWithTimeout(mirrors[m], 10000);
          if (winningBuffer && winningBuffer.byteLength > 0) break;
        } catch (e) {}
      }
    }

    if (!winningBuffer || winningBuffer.byteLength === 0) {
      throw new Error(`无法从所有镜像节点下载分片 ${chunkIndex + 1}/${totalChunks}，请检查网络`);
    }

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
        const msg = `⏳ [1/4] 正在下载 ${displayName}: 分片 ${completedCount}/${totalCount} (${(totalLoaded/1024/1024).toFixed(1)}MB / ${(estimatedTotalBytes/1024/1024).toFixed(1)}MB)`;
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
            completedCount++;
            reportProgress();
          }
        );
        blobParts[idx] = buffer;
        chunkBytesLoaded[idx] = buffer.byteLength;
        reportProgress();
      });
    });

    await Promise.all(tasks);

    const fullBlob = new Blob(blobParts, { type: mimeType });
    try {
      await setCachedItem(name, fullBlob);
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
      return await fetchChunkedModel(chunks, name, displayName || name, mimeType, onProgress);
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
        if (typeof m.defaultPitch === "number") {
          const pitchInput = document.getElementById("rvc-pitch");
          const pitchVal = document.getElementById("rvc-pitch-value");
          if (pitchInput && pitchVal) {
            pitchInput.value = String(m.defaultPitch);
            pitchVal.textContent = (m.defaultPitch > 0 ? "+" : "") + m.defaultPitch;
          }
        }
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
    const cacheStatusEl = document.getElementById("rvc-cache-status");
    const preloadBtn = document.getElementById("rvc-preload-btn");
    try {
      const hubertCached = await getCachedItem("hubert.onnx");
      const rmvpeCached = await getCachedItem("rmvpe.onnx");
      if (hubertCached && rmvpeCached) {
        if (cacheStatusEl) {
          cacheStatusEl.innerHTML = `<i class="fa-solid fa-bolt text-emerald-500"></i><span class="text-emerald-700">⚡ 基础模型已在本地就绪 · 秒级极速变声 (0MB 下载)</span>`;
        }
        if (preloadBtn) preloadBtn.classList.add("hidden");
      } else {
        if (cacheStatusEl) {
          cacheStatusEl.innerHTML = `<i class="fa-solid fa-cloud-arrow-down text-brand"></i><span>本地极速缓存：首次需下载，已开启 3 线程多源加速</span>`;
        }
        if (preloadBtn) {
          preloadBtn.classList.remove("hidden");
          preloadBtn.onclick = async () => {
            preloadBtn.disabled = true;
            preloadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>正在极速预热中…</span>`;
            showProgressBar(true);
            try {
              const hubertCfg = state.baseModels?.hubert || { chunks: [] };
              const rmvpeCfg = state.baseModels?.rmvpe || { chunks: [] };

              await loadModelAuto(
                hubertCfg,
                "hubert.onnx",
                "HuBERT 语义特征模型",
                "application/onnx",
                (l, t, cur, tot, fromCache, msg) => {
                  updateProgressBar(Math.min(50, Math.round((cur / tot) * 50)));
                  updateStatusDisplay(msg || `⏳ [1/2] 正在预热 HuBERT 语义模型: 分片 ${cur}/${tot}`);
                }
              );
              updateProgressBar(50);

              await loadModelAuto(
                rmvpeCfg,
                "rmvpe.onnx",
                "RMVPE 音高模型",
                "application/onnx",
                (l, t, cur, tot, fromCache, msg) => {
                  updateProgressBar(50 + Math.min(50, Math.round((cur / tot) * 50)));
                  updateStatusDisplay(msg || `⏳ [2/2] 正在预热 RMVPE 音高模型: 分片 ${cur}/${tot}`);
                }
              );
              updateProgressBar(100);
              setTimeout(() => showProgressBar(false), 800);
              showToast("🎉 基础模型已全部下载并缓存至本地！后续变声零等待！");
              updateStatusDisplay(t("serviceReady"));
              checkCacheStatus();
            } catch (e) {
              console.warn("Preload error:", e);
              preloadBtn.innerHTML = `<i class="fa-solid fa-rotate-right"></i><span>重试预热</span>`;
              preloadBtn.disabled = false;
              showProgressBar(false);
              updateStatusDisplay(`❌ 预热失败: ${e.message || e}，可直接点击开始变声重试`);
            }
          };
        }
      }
    } catch (e) {}
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

    if (!state.audio) {
      if (statusEl) statusEl.textContent = t("missingAudio");
      if (convertBtn) convertBtn.disabled = true;
      if (convertLabel) convertLabel.textContent = t("convert");
      return;
    }

    if (statusEl) {
      statusEl.textContent = `${t("serviceReady")} · 已选角色: ${selectedModel.name} · 音频: ${
        state.audio.name
      } (${formatTime(state.audio.duration)})`;
    }
    if (convertBtn) convertBtn.disabled = state.busy;
    if (convertLabel) convertLabel.textContent = state.busy ? t("converting") : t("convert");
  }

  async function initCatalog() {
    renderModelGallery();
    checkCacheStatus();
    try {
      const res = await fetch("assets/rvc-models.json?v=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          state.catalog = data.models;
        }
        if (data.baseModels) {
          state.baseModels = data.baseModels;
        }
      }
    } catch (e) {
      console.warn("Failed to load rvc-models.json", e);
    }
    renderModelGallery();
    checkCacheStatus();
    // Silent background pre-warm after 3 seconds of user idle
    setTimeout(() => {
      if (!state.busy) {
        const hubertCfg = state.baseModels?.hubert || EMBEDDED_BASE_MODELS.hubert;
        const rmvpeCfg = state.baseModels?.rmvpe || EMBEDDED_BASE_MODELS.rmvpe;
        Promise.all([
          loadModelAuto(hubertCfg, "hubert.onnx", "application/onnx", () => {}),
          loadModelAuto(rmvpeCfg, "rmvpe.onnx", "application/onnx", () => {}),
        ]).then(() => checkCacheStatus()).catch(() => {});
      }
    }, 3000);
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
    const protectVal = parseFloat(document.getElementById("rvc-protect")?.value || "0.33");
    const indexRateVal = parseFloat(document.getElementById("rvc-index-rate")?.value || "0.5");

    state.busy = true;
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.setAttribute("aria-busy", "true");
    }

    const startTime = Date.now();
    try {
      // 1. Dynamic import of rvc-web-runtime
      updateStatusDisplay("⏳ 正在初始化本地推理引擎...");
      const runtimeModule = await import(new URL("assets/rvc-engine/rvc-web-runtime.js?v=20260818-v14", window.location.href).href);
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
        `${selectedModel.id}.onnx`,
        selectedModel.name,
        "application/onnx",
        (l, t, cur, tot, fromCache, msg) => {
          updateProgressBar(66 + Math.min(34, Math.round((cur / tot) * 34)));
          updateStatusDisplay(msg || `⏳ [1/4] 正在加载 ${selectedModel.name} 角色模型: 分片 ${cur}/${tot}`);
        }
      );

      updateProgressBar(100);
      setTimeout(() => showProgressBar(false), 800);
      checkCacheStatus();

      // 3. Run Pipeline in Web Worker
      updateStatusDisplay("🚀 [2/4] 本地 WebAssembly SIMD 推理开始 (完全在您的设备上运行)...");
      const result = await runPipelineInWorker(
        rvc,
        {
          model: modelFile,
          contentVec: hubertFile,
          rmvpe: rmvpeFile,
        },
        state.audio.float32,
        16000,
        {
          onEvent: (e) => {
            if (e.type === "stage") {
              const stageMap = {
                preparing: "正在预处理音频...",
                feature: "正在提取人声语义特征 (HuBERT)...",
                pitch: "正在分析音高音调 (RMVPE)...",
                synth: "正在合成目标角色音色...",
              };
              updateStatusDisplay(`✨ [3/4] ${stageMap[e.stage] || e.stage}`);
            } else if (e.type === "chunk") {
              updateStatusDisplay(`✨ [4/4] 正在合成音频分段: ${e.current} / ${e.total}`);
            }
          },
        },
        {
          pitchShift: pitchVal,
          medianFilter: true,
          protect: protectVal,
          indexRate: indexRateVal,
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

  function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById("rvc-model-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => renderModelGallery());
    }

    // Source switch (Upload vs Record)
    const btnUpload = document.getElementById("rvc-source-upload");
    const btnRecord = document.getElementById("rvc-source-record");
    const wrapUpload = document.getElementById("rvc-upload-wrap");
    const wrapRecord = document.getElementById("rvc-record-wrap");

    if (btnUpload && btnRecord) {
      btnUpload.addEventListener("click", () => {
        state.sourceMode = "upload";
        btnUpload.classList.add("border-brand", "bg-teal-50");
        btnUpload.classList.remove("border-line", "bg-white");
        btnRecord.classList.remove("border-brand", "bg-teal-50");
        btnRecord.classList.add("border-line", "bg-white");
        if (wrapUpload) wrapUpload.classList.remove("hidden");
        if (wrapRecord) wrapRecord.classList.add("hidden");
      });

      btnRecord.addEventListener("click", () => {
        state.sourceMode = "record";
        btnRecord.classList.add("border-brand", "bg-teal-50");
        btnRecord.classList.remove("border-line", "bg-white");
        btnUpload.classList.remove("border-brand", "bg-teal-50");
        btnUpload.classList.add("border-line", "bg-white");
        if (wrapRecord) wrapRecord.classList.remove("hidden");
        if (wrapUpload) wrapUpload.classList.add("hidden");
      });
    }

    // File Input
    const fileInput = document.getElementById("rvc-audio-file");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) handleAudioSelected(file);
      });
    }

    // Slider pitch feedback
    const pitchInput = document.getElementById("rvc-pitch");
    const pitchVal = document.getElementById("rvc-pitch-value");
    if (pitchInput && pitchVal) {
      pitchInput.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        pitchVal.textContent = (val > 0 ? "+" : "") + val;
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
      convertBtn.addEventListener("click", () => runWebRvcInference());
    }

    setupRecording();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    await initCatalog();
    updateStatusDisplay(t("serviceReady"));
  });
})();
