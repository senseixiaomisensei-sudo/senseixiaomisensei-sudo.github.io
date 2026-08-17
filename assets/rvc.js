(() => {
  "use strict";

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MIN_AUDIO_SECONDS = 1;
  const WARN_AUDIO_SECONDS = 3;
  const MAX_AUDIO_SECONDS = 180;
  const REQUEST_TIMEOUT_MS = 180000;
  const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg", "webm"]);
  const ALLOWED_MIME_TYPES = new Set([
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
    "audio/webm",
  ]);

  const configuredGateway = typeof globalThis.POSTPREP_API_ENDPOINT === "string"
    ? globalThis.POSTPREP_API_ENDPOINT.trim().replace(/\/+$/u, "")
    : "";
  const RVC_BASE = typeof globalThis.POSTPREP_RVC_API_ENDPOINT === "string"
    && globalThis.POSTPREP_RVC_API_ENDPOINT.trim()
    ? globalThis.POSTPREP_RVC_API_ENDPOINT.trim().replace(/\/+$/u, "")
    : configuredGateway ? `${configuredGateway}/rvc` : "";
  const RVC_STATUS_ENDPOINT = typeof globalThis.POSTPREP_RVC_STATUS_ENDPOINT === "string"
    && globalThis.POSTPREP_RVC_STATUS_ENDPOINT.trim()
    ? globalThis.POSTPREP_RVC_STATUS_ENDPOINT.trim()
    : RVC_BASE ? `${RVC_BASE}/status` : "";
  const RVC_MODELS_ENDPOINT = typeof globalThis.POSTPREP_RVC_MODELS_ENDPOINT === "string"
    && globalThis.POSTPREP_RVC_MODELS_ENDPOINT.trim()
    ? globalThis.POSTPREP_RVC_MODELS_ENDPOINT.trim()
    : RVC_BASE ? `${RVC_BASE}/models` : "";

  const translations = {
    zh: {
      eyebrow: "RVC VOICE CHANGER",
      title: "AI 变声器",
      intro: "选一个角色声音，上传或录制一段你自己的声音，一键变成角色的音色。全程三步：选角色 → 给声音 → 点变声。文件只用于本次转换，生成后自动删除。",
      noteTitle: "使用提示",
      noteBody: "角色音色来自各模型的许可情况，请仅将变声结果用于你有权使用的场景，并为 AI 生成内容做清晰标注。请勿用他人声音冒充本人或用于欺骗。",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "三步完成变声",
      privacyBadge: "用完即删",
      stepModel: "1. 选择角色声音",
      stepModelHint: "点一下卡片即可选中。搜索框可快速找到角色。",
      searchPlaceholder: "搜索角色…",
      modelEmpty: "没有找到匹配的角色。换个关键词试试。",
      modelCatalogTitle: "角色声音库",
      modelInstalled: "已就绪",
      modelMissing: "未安装",
      modelMissingHint: "把模型放入 GPU 服务后自动启用",
      modelPick: "已选择",
      stepAudio: "2. 上传或录制你的声音",
      stepAudioHint: "建议单人、干净、无伴奏的说话或唱歌片段，3 秒到 3 分钟，最大 25 MB。支持 WAV、MP3、M4A、OGG 和浏览器录音。",
      sourceUpload: "上传音频",
      sourceUploadHint: "选择电脑或手机里已有的录音文件。",
      sourceRecord: "录制声音",
      sourceRecordHint: "直接用麦克风录一段，录完自动可用。",
      fileEmpty: "尚未选择音频文件。",
      recordStart: "开始录音",
      recordStop: "停止录音",
      recordHint: "录音在浏览器本地完成，只有点击“开始变声”后才会发送。",
      recordUnsupported: "当前浏览器不支持录音，请改用上传音频。",
      recordDenied: "麦克风权限被拒绝。请在浏览器设置中允许麦克风后重试，或改用上传音频。",
      recordInsecure: "录音需要 HTTPS 环境。当前页面不是安全上下文，请改用上传音频。",
      recordError: "录音启动失败，请改用上传音频。",
      stepSettings: "3. 调节声音（可选）",
      stepSettingsHint: "大多数时候保持默认就好。想更贴近角色音色，可以把“相似度”调高一些。",
      pitchLabel: "音高",
      pitchLow: "低沉（-12）",
      pitchDefault: "原声（0）",
      pitchHigh: "清脆（+12）",
      advancedToggle: "高级设置（进阶用户）",
      indexRateLabel: "相似度",
      indexRateHint: "越高音色越像角色，太高可能不自然。建议 0.3–0.8。",
      protectLabel: "辅音保护",
      protectHint: "保护清辅音和呼吸声，防止破音。0 不保护，0.5 最保守。",
      f0Label: "音高提取算法",
      f0Rmvpe: "RMVPE（推荐）",
      f0Crepe: "Crepe（更准更慢）",
      f0Fcpe: "FCPE（快）",
      f0Harvest: "Harvest（传统）",
      formatLabel: "输出格式",
      formatWav: "WAV（无损）",
      formatMp3: "MP3（体积小）",
      resampleLabel: "重采样率",
      resampleKeep: "保持原样",
      rmsLabel: "音量跟随",
      filterLabel: "滤波半径",
      checkingService: "正在确认变声服务是否可用；此检查不会上传音频。",
      serviceReady: "变声服务已就绪。选好角色和声音后即可开始变声。",
      serviceUnavailable: "变声服务尚未配置 GPU 推理服务；你可以先选角色和上传声音，但无法开始变声。",
      serviceError: "暂时无法确认变声服务状态；为保护你的音频，变声已保持关闭。",
      checkService: "重新检查变声服务",
      checkingServiceAction: "正在检查服务…",
      convert: "开始变声",
      converting: "正在变声，请稍候…",
      howtoTitle: "三步上手",
      howtoOne: "在左侧选一个角色声音（点击卡片即可）。",
      howtoTwo: "上传一段你自己的录音，或直接用麦克风录制。",
      howtoThree: "点“开始变声”，等几秒，试听并下载结果。",
      tipsTitle: "让效果更好",
      resultTitle: "变声结果",
      download: "下载变声结果",
      resultDisclosure: "临时链接会在约 15 分钟后失效，请及时下载。",
      resultMeta: "角色：{model} · 音高：{pitch} · 临时链接约 {expires} 后失效。",
      analyzing: "正在检查音频…",
      analysisReady: "音频检查完成：{name} · {duration} · 可以变声。",
      analysisFallback: "文件格式与大小通过检查；当前浏览器无法读取完整音频参数，服务端仍会验证。",
      invalidFile: "请选择 WAV、MP3、M4A、OGG 或 WebM 音频文件。",
      fileTooLarge: "文件超过安全上限（25 MB）。",
      audioTooShort: "音频太短（不足 1 秒），请换一段更长的录音。",
      audioShortWarn: "音频不足 3 秒，效果可能不稳定，建议换更长的片段。",
      audioTooLong: "音频超过 3 分钟，请裁剪为更短、更干净的片段。",
      decodeFailed: "无法在本机读取该音频。请导出为清晰的 WAV、MP3 或 M4A 后重试。",
      stereo: "检测到多声道音频；服务端会转换为单声道。",
      missingModel: "请先选择一个角色声音。",
      modelNotInstalled: "这个角色的模型尚未安装到服务端，请换一个已就绪的角色。",
      missingAudio: "请先上传或录制一段你的声音。",
      uploadBlocked: "变声服务尚未就绪，本次没有上传任何文件。",
      rateLimited: "请求过于频繁，请稍后再试。",
      backendUnavailable: "变声服务暂不可用，请稍后再试。",
      generationFailed: "变声失败。请换更短、更干净的录音，或稍后再试。",
      networkFailed: "网络请求未完成。请确认服务状态后再试。",
      outputUnavailable: "音频已生成，但暂时无法播放或下载。请重新变声。",
      selectedModel: "已选择角色：{name}。",
      noModels: "角色库暂时为空。部署 GPU 服务并放入模型后，角色会自动出现。",
      tips: [
        "使用安静环境、单人声音的清晰录音。",
        "5–30 秒效果最稳；带背景音乐或混响会降低质量。",
        "变声结果请标注“AI 合成音频”，不要冒充真人。",
      ],
    },
    en: {
      eyebrow: "RVC VOICE CHANGER",
      title: "AI Voice Changer",
      intro: "Pick a character voice, upload or record your own audio, and convert it in one click. Just three steps: pick a voice → provide audio → convert. Files are used for this conversion only and deleted afterwards.",
      noteTitle: "Heads-up",
      noteBody: "Character voices come from models with their own licensing. Use conversions only where you have the right to, and clearly label AI-generated content. Never impersonate another person.",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "Three steps to a new voice",
      privacyBadge: "Deleted after use",
      stepModel: "1. Pick a character voice",
      stepModelHint: "Click a card to select it. Use the search box to find a voice.",
      searchPlaceholder: "Search voices…",
      modelEmpty: "No matching voice. Try another keyword.",
      modelCatalogTitle: "Voice library",
      modelInstalled: "Ready",
      modelMissing: "Not installed",
      modelMissingHint: "Add the model to the GPU service to enable it",
      modelPick: "Selected",
      stepAudio: "2. Upload or record your voice",
      stepAudioHint: "A clean single-person speech or singing clip is best: 3 seconds to 3 minutes, max 25 MB. WAV, MP3, M4A, OGG and browser recording are supported.",
      sourceUpload: "Upload audio",
      sourceUploadHint: "Choose an existing recording from your device.",
      sourceRecord: "Record voice",
      sourceRecordHint: "Record directly with your microphone; it is ready when you stop.",
      fileEmpty: "No audio file selected.",
      recordStart: "Start recording",
      recordStop: "Stop recording",
      recordHint: "Recording happens locally in your browser. Audio is sent only when you click “Convert”.",
      recordUnsupported: "Recording is not supported in this browser. Please upload audio instead.",
      recordDenied: "Microphone permission was denied. Allow the microphone in your browser settings and try again, or upload audio instead.",
      recordInsecure: "Recording requires an HTTPS page. Please upload audio instead.",
      recordError: "Recording could not start. Please upload audio instead.",
      stepSettings: "3. Tune the sound (optional)",
      stepSettingsHint: "Defaults work for most people. Raise “Similarity” to get closer to the character voice.",
      pitchLabel: "Pitch",
      pitchLow: "Lower (-12)",
      pitchDefault: "Original (0)",
      pitchHigh: "Higher (+12)",
      advancedToggle: "Advanced settings (for pros)",
      indexRateLabel: "Similarity",
      indexRateHint: "Higher means closer to the character, but it can sound unnatural. 0.3–0.8 is recommended.",
      protectLabel: "Consonant protection",
      protectHint: "Protects unvoiced consonants and breaths from artifacts. 0 = off, 0.5 = most conservative.",
      f0Label: "Pitch extraction",
      f0Rmvpe: "RMVPE (recommended)",
      f0Crepe: "Crepe (more accurate, slower)",
      f0Fcpe: "FCPE (fast)",
      f0Harvest: "Harvest (classic)",
      formatLabel: "Output format",
      formatWav: "WAV (lossless)",
      formatMp3: "MP3 (smaller)",
      resampleLabel: "Resample rate",
      resampleKeep: "Keep original",
      rmsLabel: "Volume tracking",
      filterLabel: "Filter radius",
      checkingService: "Checking whether the voice-changer service is available. This check uploads nothing.",
      serviceReady: "The voice-changer service is ready. Pick a voice and your audio, then convert.",
      serviceUnavailable: "The voice-changer service is not configured with a GPU backend yet. You can still pick a voice and upload audio, but conversion stays off.",
      serviceError: "The service status could not be confirmed. To protect your audio, conversion stays off.",
      checkService: "Check the service again",
      checkingServiceAction: "Checking service…",
      convert: "Convert now",
      converting: "Converting, please wait…",
      howtoTitle: "How it works",
      howtoOne: "Pick a character voice on the left (click a card).",
      howtoTwo: "Upload your recording or record with the microphone.",
      howtoThree: "Click “Convert now”, wait a few seconds, then preview and download.",
      tipsTitle: "Better results",
      resultTitle: "Result",
      download: "Download result",
      resultDisclosure: "The temporary link expires in about 15 minutes. Download in time.",
      resultMeta: "Voice: {model} · Pitch: {pitch} · Temporary link expires at {expires}.",
      analyzing: "Checking audio…",
      analysisReady: "Audio check passed: {name} · {duration} · ready to convert.",
      analysisFallback: "The file type and size passed local checks. This browser could not read full audio parameters; the server will still validate.",
      invalidFile: "Choose a WAV, MP3, M4A, OGG, or WebM audio file.",
      fileTooLarge: "This file exceeds the safety limit (25 MB).",
      audioTooShort: "The audio is shorter than 1 second. Use a longer recording.",
      audioShortWarn: "Audio under 3 seconds may convert poorly. A longer clip is recommended.",
      audioTooLong: "The audio exceeds 3 minutes. Trim it to a shorter, cleaner clip.",
      decodeFailed: "This browser could not read the audio. Export a clean WAV, MP3, or M4A file and try again.",
      stereo: "Multi-channel audio detected; the server will convert it to mono.",
      missingModel: "Pick a character voice first.",
      modelNotInstalled: "This character's model is not installed on the server yet. Pick a voice that is ready.",
      missingAudio: "Upload or record your voice first.",
      uploadBlocked: "The voice-changer service is not ready, so nothing was uploaded.",
      rateLimited: "Too many requests. Please try again later.",
      backendUnavailable: "The voice-changer service is temporarily unavailable. Please try again later.",
      generationFailed: "Conversion failed. Try a shorter, cleaner recording or try again later.",
      networkFailed: "The network request did not complete. Check the service status and try again.",
      outputUnavailable: "The audio was generated but cannot be played or downloaded right now. Please convert again.",
      selectedModel: "Voice selected: {name}.",
      noModels: "The voice library is empty for now. Deploy the GPU service and add models and voices will appear automatically.",
      tips: [
        "Use a clear recording of one person in a quiet environment.",
        "5–30 seconds works best; background music or reverb lowers quality.",
        "Label results as “AI-generated audio” and never impersonate a real person.",
      ],
    },
  };

  const state = {
    backend: "checking",
    busy: false,
    selectedModelId: "",
    availableModelIds: new Set(),
    audio: null, // { blob, name, duration, analysis }
    sourceMode: "upload",
    recording: false,
    mediaRecorder: null,
    recordChunks: [],
    recordStream: null,
    recordStartAt: 0,
    recordTimerId: 0,
    catalog: [],
  };

  function language() {
    const fromPostPrep = globalThis.PostPrep && typeof globalThis.PostPrep.getLanguage === "function"
      ? globalThis.PostPrep.getLanguage()
      : "";
    return fromPostPrep === "en" || document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
  }

  function t(key) {
    return translations[language()][key] || translations.zh[key] || key;
  }

  function interpolate(template, values) {
    return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/gu, (_, key) => (
      Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key]) : ""
    ));
  }

  function formatSeconds(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function readableFileName(name) {
    return String(name || "audio").replace(/[\u0000-\u001F\u007F]/gu, "").slice(0, 120) || "audio";
  }

  function extensionFor(file) {
    const name = String(file && file.name || "");
    const match = name.toLowerCase().match(/\.([a-z0-9]+)$/u);
    return match ? match[1] : "";
  }

  function isAllowedAudioFile(file) {
    if (!file || typeof file !== "object" || typeof file.size !== "number") return false;
    const extension = extensionFor(file);
    const mime = String(file.type || "").toLowerCase();
    return ALLOWED_EXTENSIONS.has(extension) && (!mime || ALLOWED_MIME_TYPES.has(mime));
  }

  function setServiceStatus(message, tone = "normal") {
    const element = document.getElementById("rvc-service-status");
    if (!element) return;
    const colors = {
      normal: "border-line bg-canvas text-muted",
      ready: "border-emerald-200 bg-emerald-50 text-emerald-900",
      warning: "border-amber-200 bg-amber-50 text-amber-950",
      error: "border-rose-200 bg-rose-50 text-rose-900",
    };
    element.className = `rounded-lg border px-4 py-3 text-sm leading-6 ${colors[tone] || colors.normal}`;
    element.textContent = message;
  }

  function setAudioStatus(messages, tone = "normal") {
    const element = document.getElementById("rvc-audio-status");
    if (!element) return;
    element.replaceChildren();
    const color = tone === "error" ? "text-rose-700" : tone === "warning" ? "text-amber-800" : "text-muted";
    (Array.isArray(messages) ? messages : [messages]).filter(Boolean).forEach((message) => {
      const line = document.createElement("span");
      line.className = `block ${color}`;
      line.textContent = message;
      element.append(line);
    });
  }

  function primaryActionLabel() {
    if (state.busy) return t("converting");
    if (state.backend === "checking") return t("checkingServiceAction");
    return state.backend === "ready" ? t("convert") : t("checkService");
  }

  function updatePrimaryAction() {
    const button = document.getElementById("rvc-convert");
    const label = document.getElementById("rvc-convert-label");
    if (button) {
      const ready = state.backend === "ready";
      const checking = state.backend === "checking";
      button.disabled = state.busy || checking;
      button.classList.toggle("is-loading", state.busy);
      button.classList.toggle("bg-brand", ready);
      button.classList.toggle("text-white", ready);
      button.classList.toggle("hover:bg-brandDark", ready);
      button.classList.toggle("border", !ready);
      button.classList.toggle("border-amber-300", !ready);
      button.classList.toggle("bg-amber-50", !ready);
      button.classList.toggle("text-amber-950", !ready);
      button.classList.toggle("hover:bg-amber-100", !ready && !checking);
      button.setAttribute("aria-busy", String(state.busy || checking));
    }
    if (label) label.textContent = primaryActionLabel();
  }

  function setBusy(busy) {
    state.busy = busy;
    updatePrimaryAction();
  }

  // ---- model gallery ----

  async function loadCatalog() {
    try {
      const response = await fetch("assets/rvc-models.json", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("catalog unavailable");
      const payload = await response.json();
      state.catalog = Array.isArray(payload && payload.models) ? payload.models : [];
    } catch {
      state.catalog = [];
    }
  }

  function displayModels() {
    const gallery = document.getElementById("rvc-model-gallery");
    const empty = document.getElementById("rvc-model-empty");
    if (!gallery || !empty) return;

    const query = (document.getElementById("rvc-model-search")?.value || "").trim().toLowerCase();
    const catalogMap = new Map(state.catalog.map((entry) => [entry.id, entry]));

    // Backend-only voices get auto-generated cards.
    const allIds = new Set(state.catalog.map((entry) => entry.id));
    state.availableModelIds.forEach((id) => allIds.add(id));
    const ids = [...allIds].sort((a, b) => {
      const an = (catalogMap.get(a)?.name || a).toLowerCase();
      const bn = (catalogMap.get(b)?.name || b).toLowerCase();
      return an.localeCompare(bn);
    });

    const visible = ids.filter((id) => {
      if (!query) return true;
      const entry = catalogMap.get(id);
      const haystack = [id, entry?.name, ...(entry?.tags || [])].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });

    empty.classList.toggle("hidden", visible.length > 0);
    gallery.replaceChildren();

    visible.forEach((id) => {
      const entry = catalogMap.get(id) || {};
      const installed = state.availableModelIds.has(id);
      const selected = state.selectedModelId === id;
      const name = entry.name || id;
      const emoji = entry.emoji || "🎵";
      const tags = Array.isArray(entry.tags) ? entry.tags : [];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "rvc-model-card relative flex min-h-24 flex-col rounded-lg border p-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 " +
        (selected ? "border-brand bg-teal-50" : "border-line bg-white hover:border-brand");
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", String(selected));
      card.setAttribute("aria-pressed", String(selected));
      card.dataset.modelId = id;

      const check = document.createElement("span");
      check.className = "rvc-model-check absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white";
      check.innerHTML = '<i class="fa-solid fa-check text-[10px]" aria-hidden="true"></i>';

      const titleRow = document.createElement("span");
      titleRow.className = "flex items-center gap-2 pr-6";
      const avatar = document.createElement("span");
      avatar.className = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-lg";
      avatar.textContent = emoji;
      const nameEl = document.createElement("span");
      nameEl.className = "min-w-0 flex-1 truncate text-sm font-black text-ink";
      nameEl.textContent = name;
      titleRow.append(avatar, nameEl);

      const statusEl = document.createElement("span");
      statusEl.className = `mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${installed ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-muted"}`;
      statusEl.textContent = installed ? t("modelInstalled") : t("modelMissing");

      const descEl = document.createElement("span");
      descEl.className = "mt-2 line-clamp-2 text-xs leading-5 text-muted";
      descEl.textContent = entry.description || "";

      const tagRow = document.createElement("span");
      tagRow.className = "mt-2 flex flex-wrap gap-1";
      (tags.length ? tags : ["—"]).slice(0, 3).forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "rounded bg-zinc-50 px-1.5 py-0.5 text-[11px] font-semibold text-muted";
        chip.textContent = tag;
        tagRow.append(chip);
      });

      card.append(check, titleRow, statusEl, descEl, tagRow);
      card.addEventListener("click", () => selectModel(id, name));
      gallery.append(card);
    });
  }

  async function fetchBackendModels() {
    if (!RVC_MODELS_ENDPOINT) return;
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);
      let response;
      try {
        response = await fetch(RVC_MODELS_ENDPOINT, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const payload = await response.json().catch(() => null);
      if (response.ok && payload && Array.isArray(payload.models)) {
        const ids = new Set();
        payload.models.forEach((model) => {
          if (model && typeof model.id === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(model.id)) ids.add(model.id);
        });
        state.availableModelIds = ids;
        if (state.selectedModelId && !ids.has(state.selectedModelId)) state.selectedModelId = "";
        return;
      }
      state.availableModelIds = new Set();
    } catch {
      state.availableModelIds = new Set();
    }
  }

  function selectModel(id, name) {
    state.selectedModelId = id;
    const entry = state.catalog.find((candidate) => candidate.id === id);
    if (entry && Number.isFinite(Number(entry.defaultPitch))) {
      const pitch = document.getElementById("rvc-pitch");
      if (pitch) {
        pitch.value = String(entry.defaultPitch);
        const value = document.getElementById("rvc-pitch-value");
        if (value) value.textContent = String(entry.defaultPitch);
        syncRangeFill(pitch);
      }
    }
    displayModels();
    if (state.backend === "ready") setServiceStatus(interpolate(t("selectedModel"), { name }), "normal");
  }

  // ---- audio ----

  async function decodeAudioFile(file) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    const context = new AudioContextConstructor();
    try {
      const raw = await file.arrayBuffer();
      return await context.decodeAudioData(raw.slice(0));
    } finally {
      if (typeof context.close === "function") await context.close().catch(() => {});
    }
  }

  async function analyzeAudio(blob, name) {
    state.audio = null;
    if (!blob || blob.size < 1) {
      setAudioStatus(t("fileEmpty"));
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      setAudioStatus(t("fileTooLarge"), "error");
      return;
    }
    setAudioStatus(t("analyzing"));
    try {
      const buffer = await decodeAudioFile(blob);
      if (!buffer) {
        state.audio = { blob, name, duration: null, warnings: [] };
        setAudioStatus(t("analysisFallback"), "warning");
        return;
      }
      const duration = buffer.duration;
      const warnings = [];
      if (duration < MIN_AUDIO_SECONDS) warnings.push({ text: t("audioTooShort"), error: true });
      else if (duration < WARN_AUDIO_SECONDS) warnings.push({ text: t("audioShortWarn"), error: false });
      if (duration > MAX_AUDIO_SECONDS) warnings.push({ text: t("audioTooLong"), error: true });
      if (buffer.numberOfChannels > 1) warnings.push({ text: t("stereo"), error: false });
      state.audio = { blob, name, duration, warnings };
      const messages = [
        interpolate(t("analysisReady"), { name: readableFileName(name), duration: formatSeconds(duration) }),
        ...warnings.map((warning) => warning.text),
      ];
      const hasError = warnings.some((warning) => warning.error);
      setAudioStatus(messages, hasError ? "error" : warnings.length ? "warning" : "normal");
    } catch {
      state.audio = null;
      setAudioStatus(t("decodeFailed"), "error");
    }
  }

  function handleFileInput() {
    const input = document.getElementById("rvc-audio-file");
    const file = input && input.files && input.files[0] ? input.files[0] : null;
    if (!file) {
      setAudioStatus(t("fileEmpty"));
      return;
    }
    if (!isAllowedAudioFile(file)) {
      setAudioStatus(t("invalidFile"), "error");
      return;
    }
    analyzeAudio(file, file.name);
  }

  function stopRecordingStream() {
    if (state.recordStream) {
      state.recordStream.getTracks().forEach((track) => track.stop());
      state.recordStream = null;
    }
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      try {
        state.mediaRecorder.stop();
      } catch {
        // already stopped
      }
    }
    state.mediaRecorder = null;
  }

  function updateRecordTimer() {
    const timer = document.getElementById("rvc-record-timer");
    if (!timer) return;
    if (!state.recording) {
      timer.textContent = "0:00";
      return;
    }
    const elapsed = Math.floor((Date.now() - state.recordStartAt) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const remainder = String(elapsed % 60).padStart(2, "0");
    timer.textContent = `${minutes}:${remainder}`;
    if (elapsed > MAX_AUDIO_SECONDS) {
      stopRecording();
      setAudioStatus(t("audioTooLong"), "error");
    }
  }

  async function startRecording() {
    if (state.recording) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setAudioStatus(t("recordUnsupported"), "error");
      return;
    }
    if (!window.isSecureContext) {
      setAudioStatus(t("recordInsecure"), "error");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setAudioStatus(error && error.name === "NotAllowedError" ? t("recordDenied") : t("recordError"), "error");
      return;
    }
    state.recordStream = stream;
    state.recordChunks = [];
    const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    let mimeType = "";
    for (const candidate of preferred) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidate)) {
        mimeType = candidate;
        break;
      }
    }
    try {
      state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stopRecordingStream();
      setAudioStatus(t("recordError"), "error");
      return;
    }
    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) state.recordChunks.push(event.data);
    });
    state.mediaRecorder.addEventListener("stop", () => {
      const blob = new Blob(state.recordChunks, { type: mimeType || "audio/webm" });
      const preview = document.getElementById("rvc-record-preview");
      if (preview) {
        if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
        const url = URL.createObjectURL(blob);
        preview.dataset.objectUrl = url;
        preview.src = url;
        preview.load();
        preview.hidden = false;
      }
      analyzeAudio(blob, "recording.webm");
    });
    state.recording = true;
    state.recordStartAt = Date.now();
    state.mediaRecorder.start(250);
    document.getElementById("rvc-record-wrap")?.classList.add("rvc-recording");
    const label = document.getElementById("rvc-record-label");
    const toggle = document.getElementById("rvc-record-toggle");
    if (label) label.textContent = t("recordStop");
    if (toggle) toggle.classList.add("bg-red-600", "hover:bg-red-700");
    if (toggle) toggle.classList.remove("bg-brand", "hover:bg-brandDark");
    state.recordTimerId = window.setInterval(updateRecordTimer, 250);
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    window.clearInterval(state.recordTimerId);
    state.recordTimerId = 0;
    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    }
    stopRecordingStream();
    document.getElementById("rvc-record-wrap")?.classList.remove("rvc-recording");
    const label = document.getElementById("rvc-record-label");
    const toggle = document.getElementById("rvc-record-toggle");
    if (label) label.textContent = t("recordStart");
    if (toggle) toggle.classList.remove("bg-red-600", "hover:bg-red-700");
    if (toggle) toggle.classList.add("bg-brand", "hover:bg-brandDark");
    const timer = document.getElementById("rvc-record-timer");
    if (timer) timer.textContent = "0:00";
  }

  // ---- settings ----

  function syncRangeFill(input) {
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || 0);
    const percent = max > min ? (value - min) / (max - min) * 100 : 0;
    input.style.setProperty("--rvc-fill", `${percent}%`);
  }

  function bindRange(inputId, valueId) {
    const input = document.getElementById(inputId);
    const value = document.getElementById(valueId);
    if (!input || !value) return;
    const update = () => {
      value.textContent = Number(input.value).toFixed(input.step >= 1 ? 0 : 2).replace(/\.00$/u, "");
      syncRangeFill(input);
    };
    input.addEventListener("input", update);
    update();
  }

  // ---- validation & conversion ----

  function validateInput() {
    if (state.backend !== "ready") return t("uploadBlocked");
    if (!state.selectedModelId) return t("missingModel");
    if (!state.availableModelIds.has(state.selectedModelId)) return t("modelNotInstalled");
    if (!state.audio || !state.audio.blob) return t("missingAudio");
    if (state.audio.warnings && state.audio.warnings.some((warning) => warning.error)) {
      return state.audio.warnings.find((warning) => warning.error).text;
    }
    return "";
  }

  function buildOutputUrl(jobId, token) {
    const validJob = /^[a-f0-9-]{36}$/iu.test(String(jobId || ""));
    const validToken = /^[A-Za-z0-9_-]{32,128}$/u.test(String(token || ""));
    if (!RVC_BASE || !validJob || !validToken) return "";
    const url = new URL(`${RVC_BASE}/output/${encodeURIComponent(jobId)}`);
    url.searchParams.set("token", token);
    return url.toString();
  }

  async function showResult(payload) {
    const result = document.getElementById("rvc-result");
    const audio = document.getElementById("rvc-result-audio");
    const download = document.getElementById("rvc-result-download");
    const meta = document.getElementById("rvc-result-meta");
    const outputUrl = buildOutputUrl(payload && payload.jobId, payload && payload.downloadToken);
    if (!result || !audio || !download || !meta || !outputUrl) {
      setServiceStatus(t("outputUnavailable"), "warning");
      return;
    }
    let audioBlob;
    try {
      const response = await fetch(outputUrl, { headers: { Accept: "audio/wav, audio/mpeg, audio/*;q=0.8" } });
      const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
      if (!response.ok || !contentType.startsWith("audio/")) throw new Error("Invalid rvc output");
      audioBlob = await response.blob();
      if (!audioBlob.size) throw new Error("Empty rvc output");
    } catch {
      setServiceStatus(t("outputUnavailable"), "warning");
      return;
    }
    const blobUrl = URL.createObjectURL(audioBlob);
    const previousObjectUrl = audio.dataset.objectUrl;
    if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
    audio.dataset.objectUrl = blobUrl;
    audio.src = blobUrl;
    audio.load();
    audio.onerror = () => setServiceStatus(t("outputUnavailable"), "warning");
    download.href = blobUrl;
    download.download = `postprep-rvc-${state.selectedModelId || "voice"}.${payload.format || "wav"}`;
    const expires = payload && typeof payload.expiresAt === "string" ? new Date(payload.expiresAt) : null;
    const expiresText = expires && !Number.isNaN(expires.getTime())
      ? expires.toLocaleString(language() === "en" ? "en-US" : "zh-CN")
      : "—";
    const catalogEntry = state.catalog.find((entry) => entry.id === state.selectedModelId);
    meta.textContent = interpolate(t("resultMeta"), {
      model: catalogEntry?.name || state.selectedModelId,
      pitch: document.getElementById("rvc-pitch")?.value || "0",
      expires: expiresText,
    });
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function errorMessage(error) {
    const code = error && error.code;
    if (code === "RATE_LIMITED") return t("rateLimited");
    if (["RVC_BACKEND_NOT_CONFIGURED", "RVC_BACKEND_UNAVAILABLE", "RVC_BACKEND_TIMEOUT"].includes(code)) return t("backendUnavailable");
    if (["RVC_MODEL_NOT_FOUND", "RVC_INVALID_MODEL"].includes(code)) return t("modelNotInstalled");
    if (["RVC_OUTPUT_UNAVAILABLE", "RVC_INVALID_OUTPUT"].includes(code)) return t("outputUnavailable");
    return code === "NETWORK_ERROR" ? t("networkFailed") : t("generationFailed");
  }

  async function requestConversion() {
    const issue = validateInput();
    if (issue) {
      setServiceStatus(issue, "warning");
      return;
    }
    if (!RVC_BASE) {
      setServiceStatus(t("uploadBlocked"), "error");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("modelId", state.selectedModelId);
      body.set("pitch", String(document.getElementById("rvc-pitch")?.value || "0"));
      body.set("indexRate", String(document.getElementById("rvc-index-rate")?.value || "0.5"));
      body.set("protect", String(document.getElementById("rvc-protect")?.value || "0.33"));
      body.set("f0Method", String(document.getElementById("rvc-f0-method")?.value || "rmvpe"));
      body.set("format", String(document.getElementById("rvc-format")?.value || "wav"));
      body.set("resample", String(document.getElementById("rvc-resample")?.value || "0"));
      body.set("rmsMixRate", String(document.getElementById("rvc-rms-mix")?.value || "1"));
      body.set("filterRadius", String(document.getElementById("rvc-filter-radius")?.value || "3"));
      body.set("language", language());
      body.set("audio", state.audio.blob, readableFileName(state.audio.name));

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(RVC_BASE, { method: "POST", body, signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const error = new Error("RVC request failed");
        error.code = payload && typeof payload.code === "string" ? payload.code : "RVC_REQUEST_FAILED";
        throw error;
      }
      await showResult(payload);
      setServiceStatus(t("serviceReady"), "ready");
    } catch (error) {
      if (error && error.name === "AbortError") error.code = "RVC_BACKEND_TIMEOUT";
      setServiceStatus(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handlePrimaryAction() {
    if (state.busy || state.backend === "checking") return;
    if (state.backend !== "ready") {
      await checkAvailability();
      return;
    }
    await requestConversion();
  }

  // ---- service availability ----

  async function checkAvailability() {
    if (!RVC_STATUS_ENDPOINT || window.location.protocol === "file:") {
      state.backend = "unavailable";
      setServiceStatus(t("serviceUnavailable"), "warning");
      updatePrimaryAction();
      displayModels();
      return;
    }
    state.backend = "checking";
    setServiceStatus(t("checkingService"));
    updatePrimaryAction();
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);
      let response;
      try {
        response = await fetch(RVC_STATUS_ENDPOINT, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const payload = await response.json().catch(() => null);
      if (response.ok && payload && payload.ready === true) {
        state.backend = "ready";
        setServiceStatus(t("serviceReady"), "ready");
      } else {
        state.backend = "unavailable";
        setServiceStatus(t("serviceUnavailable"), "warning");
      }
    } catch {
      state.backend = "unavailable";
      setServiceStatus(t("serviceError"), "error");
    }
    await fetchBackendModels();
    displayModels();
    updatePrimaryAction();
  }

  // ---- i18n ----

  function applyTranslations() {
    document.title = `${t("title")} | PostPrep`;
    document.querySelectorAll("[data-rvc-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.rvcI18n);
    });
    document.querySelectorAll("[data-rvc-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", t(element.dataset.rvcI18nPlaceholder));
    });
    document.querySelectorAll("[data-rvc-list]").forEach((list) => {
      const entries = t(list.dataset.rvcList);
      list.replaceChildren();
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        const item = document.createElement("li");
        item.className = "flex gap-3";
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-check mt-1 text-brand";
        icon.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.textContent = entry;
        item.append(icon, text);
        list.append(item);
      });
    });
    const status = state.backend === "ready" ? t("serviceReady")
      : state.backend === "checking" ? t("checkingService")
        : t("serviceUnavailable");
    setServiceStatus(status, state.backend === "ready" ? "ready" : state.backend === "checking" ? "normal" : "warning");
    const recordLabel = document.getElementById("rvc-record-label");
    if (recordLabel) recordLabel.textContent = state.recording ? t("recordStop") : t("recordStart");
    setBusy(state.busy);
  }

  // ---- init ----

  function updateSourceMode(mode) {
    state.sourceMode = mode === "record" ? "record" : "upload";
    const upload = document.getElementById("rvc-source-upload");
    const record = document.getElementById("rvc-source-record");
    const uploadWrap = document.getElementById("rvc-upload-wrap");
    const recordWrap = document.getElementById("rvc-record-wrap");
    const selectedClasses = "rounded-lg border border-brand bg-teal-50 p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2";
    const idleClasses = "rounded-lg border border-line bg-white p-4 text-left transition hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2";
    if (upload) {
      upload.setAttribute("aria-pressed", String(state.sourceMode === "upload"));
      upload.className = state.sourceMode === "upload" ? selectedClasses : idleClasses;
    }
    if (record) {
      record.setAttribute("aria-pressed", String(state.sourceMode === "record"));
      record.className = state.sourceMode === "record"
        ? "rounded-lg border border-violet-700 bg-violet-50 p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
        : idleClasses;
    }
    if (uploadWrap) uploadWrap.classList.toggle("hidden", state.sourceMode !== "upload");
    if (recordWrap) recordWrap.classList.toggle("hidden", state.sourceMode !== "record");
    if (state.sourceMode === "upload") stopRecording();
  }

  function init() {
    const fileInput = document.getElementById("rvc-audio-file");
    const uploadTab = document.getElementById("rvc-source-upload");
    const recordTab = document.getElementById("rvc-source-record");
    const recordToggle = document.getElementById("rvc-record-toggle");
    const convert = document.getElementById("rvc-convert");
    const search = document.getElementById("rvc-model-search");
    if (!fileInput || !uploadTab || !recordTab || !recordToggle || !convert || !search) return;

    applyTranslations();
    bindRange("rvc-pitch", "rvc-pitch-value");
    bindRange("rvc-index-rate", "rvc-index-rate-value");
    bindRange("rvc-protect", "rvc-protect-value");
    bindRange("rvc-rms-mix", "rvc-rms-mix-value");

    fileInput.addEventListener("change", handleFileInput);
    uploadTab.addEventListener("click", () => updateSourceMode("upload"));
    recordTab.addEventListener("click", () => updateSourceMode("record"));
    recordToggle.addEventListener("click", () => {
      if (state.recording) stopRecording();
      else startRecording();
    });
    convert.addEventListener("click", handlePrimaryAction);
    search.addEventListener("input", displayModels);
    document.addEventListener("postprep:languagechange", applyTranslations);
    window.addEventListener("beforeunload", stopRecording);

    updateSourceMode("upload");
    loadCatalog().then(() => {
      displayModels();
      checkAvailability();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
