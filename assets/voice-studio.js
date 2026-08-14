(() => {
  "use strict";

  const VOICE_ACTION = "postprep_voice";
  const REQUIRED_RIGHTS_PHRASE = "I HAVE THE RIGHTS";
  const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
  const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 45 * 1024 * 1024;
  const MIN_AUDIO_SECONDS = 5;
  const MAX_REFERENCE_SECONDS = 180;
  const MAX_SOURCE_SECONDS = 180;
  const MAX_TEXT_CHARS = 1000;
  const REQUEST_TIMEOUT_MS = 120000;
  const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg"]);
  const ALLOWED_MIME_TYPES = new Set([
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
  ]);

  const configuredGateway = typeof globalThis.POSTPREP_API_ENDPOINT === "string"
    ? globalThis.POSTPREP_API_ENDPOINT.trim().replace(/\/+$/u, "")
    : "";
  const VOICE_ENDPOINT = typeof globalThis.POSTPREP_VOICE_API_ENDPOINT === "string"
    && globalThis.POSTPREP_VOICE_API_ENDPOINT.trim()
    ? globalThis.POSTPREP_VOICE_API_ENDPOINT.trim().replace(/\/+$/u, "")
    : configuredGateway ? `${configuredGateway}/voice` : "";
  const VOICE_STATUS_ENDPOINT = typeof globalThis.POSTPREP_VOICE_STATUS_ENDPOINT === "string"
    && globalThis.POSTPREP_VOICE_STATUS_ENDPOINT.trim()
    ? globalThis.POSTPREP_VOICE_STATUS_ENDPOINT.trim()
    : VOICE_ENDPOINT ? `${VOICE_ENDPOINT}/status` : "";

  const translations = {
    zh: {
      title: "声音工作台",
      eyebrow: "AUTHORIZED VOICE STUDIO",
      intro: "为你本人、已获书面许可的声音，或你拥有权利的原创虚构声音生成文本朗读或干声音转换。选中文件后的质量预检只在本机进行；只有你确认授权并点击生成，且受保护 GPU 服务已就绪时，音频才会上传。",
      noticeTitle: "使用公告：未授权克隆不开放",
      noticePolicy: "查看完整使用与权利公告",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "先确认权利，再处理声音",
      localBadge: "预检仅本机",
      modeLabel: "选择生成方式",
      modeRead: "文本朗读",
      modeReadHint: "用参考人声朗读你输入的文本；不上传时不会保存声音。",
      modeCover: "干声音转换",
      modeCoverHint: "将你拥有权利的干声转换为授权参考声音；不提供伴奏分离或下载。",
      referenceLabel: "授权参考人声",
      referenceHint: "推荐单人、干净、无音乐和强混响的 15–90 秒录音。支持 WAV、MP3、M4A、OGG；最大 20 MB。",
      sourceLabel: "拥有权利的源干声",
      sourceHint: "只上传单人干声，不要伴奏、电影对白、下载音轨或他人演唱。建议 5–180 秒，最大 25 MB。",
      localOnly: "仅本机预检",
      fileEmpty: "尚未选择音频文件。",
      textLabel: "要朗读的文本",
      textHint: "最多 1,000 个字符。请确认文本内容及其使用权；质量会受标点、语言与参考音质影响。",
      textPlaceholder: "输入需要朗读的文字…",
      rightsLabel: "你对声音拥有哪种权利？",
      rightsHint: "系统不接受“我不确定”“网络素材”或“只是练习”作为授权依据。",
      rightsSelf: "本人声音",
      rightsSelfHint: "我拥有录音与表演使用权。",
      rightsPermission: "已获书面许可",
      rightsPermissionHint: "许可覆盖克隆、生成、使用范围和本次素材。",
      rightsFictional: "原创虚构声音",
      rightsFictionalHint: "我拥有角色、声线表演和本次使用所需的权利。",
      rightsConfirm: "我确认上述声音和源音频不包含未授权真人、公众人物、演员／主播表演或受保护角色配音，并且我拥有本次生成所需权利。",
      phraseLabel: "输入确认短语",
      phraseHint: "输入 I HAVE THE RIGHTS 才能继续。",
      phrasePlaceholder: "I HAVE THE RIGHTS",
      disclosureConfirm: "我会在发布或分享输出时清晰标示为 AI 合成音频，并自行确认文本、歌词、伴奏和发行权利。",
      checkingService: "正在确认受保护声音服务是否可用；此检查不上传音频。",
      serviceReady: "受保护声音服务已就绪。完成本机预检和授权确认后才会上传音频。",
      serviceUnavailable: "声音生成功能尚未配置 GPU 推理服务；不会上传文件。其余本机预检仍可使用。",
      serviceError: "暂时无法确认声音服务状态；为保护你的音频，生成已保持关闭。",
      checkService: "重新检查声音服务",
      checkingServiceAction: "正在检查服务…",
      generate: "确认授权并生成",
      generating: "正在生成…",
      qualityTitle: "自然度不能被保证",
      qualityBody: "清晰、单人、少噪音的参考音频通常更稳定；音高跨度、伴奏残留、压缩失真和过短样本都可能造成失真、断裂或不像原声。预检只能提示风险，不是质量承诺。",
      resultTitle: "生成结果",
      download: "下载 AI 合成音频",
      resultDisclosure: "请在发布或分享时标示“AI 合成音频”；不要把结果表示为真实人物原声。",
      analyze: "正在本机分析音频…",
      analysisReady: "本机预检完成：{name} · {duration} · {rate} Hz · {channels} 声道 · 峰值约 {peak}。",
      analysisFallback: "文件格式与大小通过本机检查；当前浏览器无法读取完整音频参数，服务端仍会在生成前验证。",
      invalidFile: "请选择 WAV、MP3、M4A 或 OGG 音频文件。",
      fileTooLarge: "文件超过本机安全上限（{limit}）。",
      totalTooLarge: "两段音频合计超过 45 MB，不能上传。",
      audioTooShort: "音频少于 5 秒，样本通常不足以稳定生成。",
      audioTooLong: "音频超过当前单次任务允许的时长（{limit} 秒）。请裁剪为更短、更干净的片段。",
      decodeFailed: "无法在本机读取该音频。请导出为清晰的 WAV、MP3、M4A 或 OGG 后重试。",
      clipped: "检测到接近满幅的峰值；原音可能削波，输出可能失真。建议换用未爆音原始录音。",
      silent: "检测到较多静音或极弱片段；裁去空白、保留连续人声通常更稳定。",
      stereo: "检测到多声道音频；后端会转换为单声道，建议先准备单人干声。",
      selectedModeRead: "已切换为文本朗读。",
      selectedModeCover: "已切换为干声音转换。请额外上传拥有权利的源干声。",
      missingReference: "请先选择授权参考人声。",
      missingSource: "声音转换还需要选择拥有权利的源干声。",
      missingText: "请输入要朗读的文本。",
      missingScope: "请说明你对声音拥有的权利范围。",
      missingRightsCheck: "请勾选声音权利确认。",
      missingPhrase: "请输入完整确认短语 I HAVE THE RIGHTS。",
      missingDisclosure: "请确认会标示 AI 合成音频。",
      uploadBlocked: "声音服务尚未就绪；为保护你的音频，本次没有上传任何文件。",
      verificationUnavailable: "人机验证不可用，未上传任何音频。请检查网络后重试。",
      verificationCancelled: "已取消人机验证，未上传任何音频。",
      rateLimited: "生成请求过于频繁。请稍后再试；未保存本机文件。",
      rightsRejected: "服务器未收到完整的授权确认，未开始生成。",
      audioRejected: "服务器未通过该音频的格式、时长或大小检查，未开始生成。",
      backendUnavailable: "受保护 GPU 服务暂不可用，未保留本次生成文件。",
      generationFailed: "生成暂时失败。请换用更短、更干净的授权干声，或稍后再试。",
      networkFailed: "网络请求未完成。请确认服务状态后再试。",
      resultMeta: "AI 合成音频 · 临时下载链接将于 {expires} 失效。",
      outputUnavailable: "音频已生成，但暂时无法播放或下载。请重新生成，不要重复上传未授权素材。",
      notice: [
        "仅可上传你本人、已获得书面许可，或你拥有完整角色与表演权利的原创虚构声音。",
        "禁止克隆公众人物、真实他人、演员／主播表演，或没有明确许可的角色与配音。",
        "“二次元声”仅限你拥有原创角色与声音表演权利的素材；不是对现有作品角色或配音的例外。",
        "所有输出都应明确标注为 AI 合成音频。免责声明不能替代你取得声音、文本、歌词、伴奏和发行所需的权利。",
      ],
      quality: [
        "参考音频中只保留一个说话者或演唱者。",
        "转换前先准备你拥有权利的清晰干声，不上传伴奏或受限音源。",
        "先用短片段试听；不要把输出描述为真人原声。",
      ],
    },
    en: {
      title: "Voice studio",
      eyebrow: "AUTHORIZED VOICE STUDIO",
      intro: "Create text reading or dry-vocal conversion only from your own voice, a voice with written permission, or an original fictional voice whose rights you control. File preflight stays in this browser; audio uploads only after you confirm rights, choose Generate, and the protected GPU service is ready.",
      noticeTitle: "Notice: unauthorized cloning is not available",
      noticePolicy: "Read the full use and rights notice",
      workflowEyebrow: "VOICE WORKFLOW",
      workflowTitle: "Confirm rights before processing audio",
      localBadge: "Local preflight only",
      modeLabel: "Choose a generation mode",
      modeRead: "Text reading",
      modeReadHint: "Read your text in the reference voice. No voice is retained when it is not uploaded.",
      modeCover: "Dry-vocal conversion",
      modeCoverHint: "Convert an authorized dry vocal into the authorized reference voice. No stem separation or downloads are provided.",
      referenceLabel: "Authorized reference voice",
      referenceHint: "A clean, single-speaker 15–90 second recording without music or strong reverb is recommended. WAV, MP3, M4A, OGG; max 20 MB.",
      sourceLabel: "Authorized source dry vocal",
      sourceHint: "Use only a single-person dry vocal—no backing track, film dialogue, downloaded track, or someone else's performance. Recommended 5–180 seconds; max 25 MB.",
      localOnly: "Local preflight only",
      fileEmpty: "No audio file selected.",
      textLabel: "Text to read",
      textHint: "Up to 1,000 characters. Confirm the text and usage rights; punctuation, language, and reference quality affect output quality.",
      textPlaceholder: "Enter the text to read…",
      rightsLabel: "What right do you have to this voice?",
      rightsHint: "“I am not sure”, “from the internet”, and “just for practice” are not authorization.",
      rightsSelf: "My own voice",
      rightsSelfHint: "I control the recording and performance rights.",
      rightsPermission: "Written permission",
      rightsPermissionHint: "The permission covers cloning, generation, usage scope, and this material.",
      rightsFictional: "Original fictional voice",
      rightsFictionalHint: "I control the character, vocal performance, and rights needed for this use.",
      rightsConfirm: "I confirm that the reference and source audio do not contain an unauthorized real person, public figure, actor/host performance, or protected character voice, and that I have the rights needed for this generation.",
      phraseLabel: "Type the confirmation phrase",
      phraseHint: "Type I HAVE THE RIGHTS to continue.",
      phrasePlaceholder: "I HAVE THE RIGHTS",
      disclosureConfirm: "When publishing or sharing the result, I will clearly label it as AI-generated audio and will independently confirm text, lyric, backing-track, and distribution rights.",
      checkingService: "Checking whether the protected voice service is available. This check does not upload audio.",
      serviceReady: "The protected voice service is ready. Audio uploads only after local preflight and rights confirmation.",
      serviceUnavailable: "Voice generation has not been configured with a GPU inference service. Files will not be uploaded; local preflight is still available.",
      serviceError: "The voice service status could not be confirmed. To protect your audio, generation remains closed.",
      checkService: "Check voice service again",
      checkingServiceAction: "Checking service…",
      generate: "Confirm rights and generate",
      generating: "Generating…",
      qualityTitle: "Naturalness cannot be guaranteed",
      qualityBody: "A clean, single-speaker, low-noise reference is usually more stable. Wide pitch changes, backing-track residue, compression artifacts, and short samples can cause distortion, breaks, or a poor match. Preflight only flags risks; it is not a quality guarantee.",
      resultTitle: "Generated result",
      download: "Download AI-generated audio",
      resultDisclosure: "Label the result as “AI-generated audio” when publishing or sharing it. Do not represent it as a real person's original voice.",
      analyze: "Analyzing audio locally…",
      analysisReady: "Local preflight complete: {name} · {duration} · {rate} Hz · {channels} channel(s) · approx. peak {peak}.",
      analysisFallback: "The file type and size passed local checks. This browser could not read full audio parameters; the server will still validate before generation.",
      invalidFile: "Choose a WAV, MP3, M4A, or OGG audio file.",
      fileTooLarge: "This file exceeds the local safety limit ({limit}).",
      totalTooLarge: "The two audio files exceed the 45 MB combined upload limit.",
      audioTooShort: "The audio is shorter than 5 seconds, which is usually insufficient for stable generation.",
      audioTooLong: "The audio exceeds this task's permitted duration ({limit} seconds). Trim it to a shorter, cleaner clip.",
      decodeFailed: "This browser could not read the audio. Export a clean WAV, MP3, M4A, or OGG file and try again.",
      clipped: "Near-full-scale peaks were detected; the source may be clipped and the output may distort. Use an unclipped original recording if possible.",
      silent: "Substantial silence or very quiet audio was detected. Removing empty sections and keeping continuous voice is usually more stable.",
      stereo: "Multi-channel audio was detected; the backend will convert it to mono. A single-person dry vocal is recommended.",
      selectedModeRead: "Text reading selected.",
      selectedModeCover: "Dry-vocal conversion selected. Upload an authorized source dry vocal as well.",
      missingReference: "Choose an authorized reference voice first.",
      missingSource: "Dry-vocal conversion also needs an authorized source dry vocal.",
      missingText: "Enter text to read.",
      missingScope: "State the rights scope for the voice.",
      missingRightsCheck: "Confirm the voice-rights statement.",
      missingPhrase: "Type the full confirmation phrase: I HAVE THE RIGHTS.",
      missingDisclosure: "Confirm that you will label AI-generated audio.",
      uploadBlocked: "The voice service is not ready. To protect your audio, no file was uploaded.",
      verificationUnavailable: "Human verification is unavailable. No audio was uploaded; check your network and try again.",
      verificationCancelled: "Human verification was cancelled. No audio was uploaded.",
      rateLimited: "Too many generation requests. Try again later; local files were not saved.",
      rightsRejected: "The server did not receive complete rights confirmation, so generation did not begin.",
      audioRejected: "The server did not accept this audio's type, duration, or size, so generation did not begin.",
      backendUnavailable: "The protected GPU service is unavailable. This generation's files were not retained.",
      generationFailed: "Generation failed temporarily. Try a shorter, cleaner authorized dry vocal or try again later.",
      networkFailed: "The network request did not complete. Confirm service status and try again.",
      resultMeta: "AI-generated audio · The temporary download link expires at {expires}.",
      outputUnavailable: "The audio was generated but cannot be played or downloaded right now. Generate again; do not re-upload unauthorized material.",
      notice: [
        "Upload only your own voice, a voice with written permission, or an original fictional voice whose character and performance rights you control.",
        "Do not clone a public figure, another real person, an actor/host performance, or a character/voice without clear permission.",
        "An “anime-style voice” is allowed only when you own the original character and vocal-performance rights; it is not an exception for existing characters or voice actors.",
        "Clearly label all outputs as AI-generated audio. A disclaimer does not replace the rights needed for voice, text, lyrics, backing tracks, or distribution.",
      ],
      quality: [
        "Keep one speaker or singer in the reference audio.",
        "For conversion, prepare an authorized clean dry vocal; do not upload backing tracks or restricted sources.",
        "Audition a short clip first, and never describe output as a real person's original voice.",
      ],
    },
  };

  const state = {
    mode: "read",
    reference: null,
    source: null,
    backend: "checking",
    busy: false,
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

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
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

  function appendStatusLine(element, message, className = "text-muted") {
    if (!element) return;
    const line = document.createElement("span");
    line.className = `block ${className}`;
    line.textContent = message;
    element.append(line);
  }

  function setFileStatus(element, messages, tone = "normal") {
    if (!element) return;
    element.replaceChildren();
    const color = tone === "error" ? "text-rose-700" : tone === "warning" ? "text-amber-800" : "text-muted";
    (Array.isArray(messages) ? messages : [messages]).filter(Boolean).forEach((message) => appendStatusLine(element, message, color));
  }

  function setServiceStatus(message, tone = "normal") {
    const element = document.getElementById("voice-service-status");
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

  function primaryActionLabel() {
    if (state.busy) return t("generating");
    if (state.backend === "checking") return t("checkingServiceAction");
    return state.backend === "ready" ? t("generate") : t("checkService");
  }

  function updatePrimaryAction() {
    const button = document.getElementById("voice-generate");
    const label = document.getElementById("voice-generate-label");
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

  function selectedScope() {
    const selected = document.querySelector('input[name="voice-rights-scope"]:checked');
    return selected ? selected.value : "";
  }

  function selectedFile(kind) {
    const input = document.getElementById(kind === "reference" ? "voice-reference-file" : "voice-source-file");
    return input && input.files && input.files[0] ? input.files[0] : null;
  }

  function warningForAnalysis(analysis, kind) {
    const warnings = [];
    if (analysis.channels > 1) warnings.push(t("stereo"));
    if (analysis.peak >= 0.995) warnings.push(t("clipped"));
    if (analysis.silenceRatio >= 0.45) warnings.push(t("silent"));
    const limit = kind === "reference" ? MAX_REFERENCE_SECONDS : MAX_SOURCE_SECONDS;
    if (analysis.duration < MIN_AUDIO_SECONDS) warnings.push(t("audioTooShort"));
    if (analysis.duration > limit) warnings.push(interpolate(t("audioTooLong"), { limit }));
    return warnings;
  }

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

  function summarizeAudioBuffer(buffer) {
    let peak = 0;
    let observed = 0;
    let silent = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel);
      const stride = Math.max(1, Math.floor(samples.length / 120000));
      for (let index = 0; index < samples.length; index += stride) {
        const amplitude = Math.abs(samples[index]);
        if (amplitude > peak) peak = amplitude;
        if (amplitude < 0.008) silent += 1;
        observed += 1;
      }
    }
    return {
      duration: buffer.duration,
      rate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      peak,
      silenceRatio: observed ? silent / observed : 0,
    };
  }

  function maxBytesFor(kind) {
    return kind === "reference" ? MAX_REFERENCE_BYTES : MAX_SOURCE_BYTES;
  }

  async function analyzeFile(kind) {
    const element = document.getElementById(kind === "reference" ? "voice-reference-status" : "voice-source-status");
    const file = selectedFile(kind);
    state[kind] = null;
    if (!file) {
      setFileStatus(element, t("fileEmpty"));
      updateGenerateEnabled();
      return;
    }
    if (!isAllowedAudioFile(file)) {
      setFileStatus(element, t("invalidFile"), "error");
      updateGenerateEnabled();
      return;
    }
    if (file.size > maxBytesFor(kind)) {
      setFileStatus(element, interpolate(t("fileTooLarge"), { limit: formatBytes(maxBytesFor(kind)) }), "error");
      updateGenerateEnabled();
      return;
    }
    const other = state.mode === "cover" ? (kind === "reference" ? selectedFile("source") : selectedFile("reference")) : null;
    if (other && other.size + file.size > MAX_TOTAL_BYTES) {
      setFileStatus(element, t("totalTooLarge"), "error");
      updateGenerateEnabled();
      return;
    }

    setFileStatus(element, t("analyze"));
    try {
      const buffer = await decodeAudioFile(file);
      if (!buffer) {
        state[kind] = { file, valid: true, analysis: null };
        setFileStatus(element, t("analysisFallback"), "warning");
        updateGenerateEnabled();
        return;
      }
      const analysis = summarizeAudioBuffer(buffer);
      const warnings = warningForAnalysis(analysis, kind);
      const valid = analysis.duration >= MIN_AUDIO_SECONDS
        && analysis.duration <= (kind === "reference" ? MAX_REFERENCE_SECONDS : MAX_SOURCE_SECONDS);
      state[kind] = { file, valid, analysis };
      const detail = interpolate(t("analysisReady"), {
        name: readableFileName(file.name),
        duration: formatSeconds(analysis.duration),
        rate: Math.round(analysis.rate),
        channels: analysis.channels,
        peak: analysis.peak.toFixed(3),
      });
      setFileStatus(element, [detail, ...warnings], warnings.length ? "warning" : "normal");
    } catch {
      setFileStatus(element, t("decodeFailed"), "error");
    }
    updateGenerateEnabled();
  }

  function updateMode(mode, announce = true) {
    state.mode = mode === "cover" ? "cover" : "read";
    const read = document.getElementById("voice-mode-read");
    const cover = document.getElementById("voice-mode-cover");
    const source = document.getElementById("voice-source-wrap");
    const text = document.getElementById("voice-text-wrap");
    const readSelected = state.mode === "read";
    if (read) {
      read.setAttribute("aria-pressed", String(readSelected));
      read.className = readSelected
        ? "rounded-lg border border-brand bg-teal-50 p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
        : "rounded-lg border border-line bg-white p-4 text-left transition hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2";
    }
    if (cover) {
      cover.setAttribute("aria-pressed", String(!readSelected));
      cover.className = !readSelected
        ? "rounded-lg border border-violet-700 bg-violet-50 p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
        : "rounded-lg border border-line bg-white p-4 text-left transition hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2";
    }
    if (source) source.classList.toggle("hidden", readSelected);
    if (text) text.classList.toggle("hidden", !readSelected);
    if (announce && state.backend === "ready") setServiceStatus(t(readSelected ? "selectedModeRead" : "selectedModeCover"), "normal");
    updateGenerateEnabled();
  }

  function validateInput() {
    if (state.backend !== "ready") return t("uploadBlocked");
    if (!state.reference || !state.reference.valid) return t("missingReference");
    if (state.mode === "cover" && (!state.source || !state.source.valid)) return t("missingSource");
    if (state.mode === "read") {
      const text = document.getElementById("voice-text");
      const value = text ? text.value.trim() : "";
      if (!value) return t("missingText");
      if (value.length > MAX_TEXT_CHARS) return t("missingText");
    }
    if (!selectedScope()) return t("missingScope");
    const rightsConfirmed = document.getElementById("voice-rights-confirmed");
    if (!rightsConfirmed || !rightsConfirmed.checked) return t("missingRightsCheck");
    const phrase = document.getElementById("voice-rights-phrase");
    if (!phrase || phrase.value.trim() !== REQUIRED_RIGHTS_PHRASE) return t("missingPhrase");
    const disclosureConfirmed = document.getElementById("voice-disclosure-confirmed");
    if (!disclosureConfirmed || !disclosureConfirmed.checked) return t("missingDisclosure");
    return "";
  }

  function updateGenerateEnabled() {
    updatePrimaryAction();
  }

  function errorMessage(error) {
    const code = error && error.code;
    if (["HUMAN_VERIFICATION_CANCELLED"].includes(code)) return t("verificationCancelled");
    if (["HUMAN_VERIFICATION_UNAVAILABLE", "TURNSTILE_NOT_CONFIGURED", "HUMAN_VERIFICATION_TIMEOUT"].includes(code)) return t("verificationUnavailable");
    if (code === "RATE_LIMITED") return t("rateLimited");
    if (["VOICE_RIGHTS_CONFIRMATION_REQUIRED", "VOICE_INVALID_RIGHTS_SCOPE", "VOICE_AI_DISCLOSURE_REQUIRED"].includes(code)) return t("rightsRejected");
    if (["VOICE_INVALID_AUDIO", "VOICE_AUDIO_TOO_LARGE", "VOICE_AUDIO_TOO_SHORT", "VOICE_AUDIO_TOO_LONG", "VOICE_INVALID_MEDIA_TYPE"].includes(code)) return t("audioRejected");
    if (["VOICE_BACKEND_NOT_CONFIGURED", "VOICE_BACKEND_UNAVAILABLE", "VOICE_BACKEND_TIMEOUT"].includes(code)) return t("backendUnavailable");
    if (["VOICE_OUTPUT_UNAVAILABLE", "VOICE_INVALID_OUTPUT"].includes(code)) return t("outputUnavailable");
    return code === "NETWORK_ERROR" ? t("networkFailed") : t("generationFailed");
  }

  function buildOutputUrl(jobId, token) {
    const validJob = /^[a-f0-9-]{36}$/iu.test(String(jobId || ""));
    const validToken = /^[A-Za-z0-9_-]{32,128}$/u.test(String(token || ""));
    if (!VOICE_ENDPOINT || !validJob || !validToken) return "";
    const url = new URL(`${VOICE_ENDPOINT}/output/${encodeURIComponent(jobId)}`);
    url.searchParams.set("token", token);
    return url.toString();
  }

  async function showResult(payload) {
    const result = document.getElementById("voice-result");
    const audio = document.getElementById("voice-result-audio");
    const download = document.getElementById("voice-result-download");
    const meta = document.getElementById("voice-result-meta");
    const outputUrl = buildOutputUrl(payload && payload.jobId, payload && payload.downloadToken);
    if (!result || !audio || !download || !meta || !outputUrl) {
      setServiceStatus(t("outputUnavailable"), "warning");
      return;
    }
    const expires = payload && typeof payload.expiresAt === "string"
      ? new Date(payload.expiresAt)
      : null;
    const expiresText = expires && !Number.isNaN(expires.getTime())
      ? expires.toLocaleString(language() === "en" ? "en-US" : "zh-CN")
      : "—";
    let audioBlob;
    try {
      const response = await fetch(outputUrl, { headers: { Accept: "audio/wav, audio/*;q=0.8" } });
      const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
      if (!response.ok || !contentType.startsWith("audio/")) throw new Error("Invalid voice output");
      audioBlob = await response.blob();
      if (!audioBlob.size) throw new Error("Empty voice output");
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
    download.download = `postprep-ai-${state.mode === "cover" ? "voice-conversion" : "voice-reading"}.wav`;
    meta.textContent = interpolate(t("resultMeta"), { expires: expiresText });
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function requestGeneration() {
    const issue = validateInput();
    if (issue) {
      setServiceStatus(issue, "warning");
      return;
    }
    const verify = globalThis.PostPrep && globalThis.PostPrep.requestHumanVerification;
    if (typeof verify !== "function" || !VOICE_ENDPOINT) {
      setServiceStatus(t("verificationUnavailable"), "error");
      return;
    }
    setBusy(true);
    try {
      const turnstileToken = await verify(VOICE_ACTION);
      const body = new FormData();
      body.set("mode", state.mode);
      body.set("referenceAudio", state.reference.file, readableFileName(state.reference.file.name));
      if (state.mode === "cover") body.set("sourceAudio", state.source.file, readableFileName(state.source.file.name));
      if (state.mode === "read") body.set("text", document.getElementById("voice-text").value.trim());
      body.set("rightsScope", selectedScope());
      body.set("rightsDeclaration", REQUIRED_RIGHTS_PHRASE);
      body.set("aiDisclosure", "confirmed");
      body.set("language", language());
      body.set("turnstileToken", turnstileToken);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(VOICE_ENDPOINT, { method: "POST", body, signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) {
        const error = new Error("Voice request failed");
        error.code = payload && typeof payload.code === "string" ? payload.code : "VOICE_REQUEST_FAILED";
        throw error;
      }
      await showResult(payload);
      setServiceStatus(t("serviceReady"), "ready");
    } catch (error) {
      if (error && error.name === "AbortError") error.code = "VOICE_BACKEND_TIMEOUT";
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
    await requestGeneration();
  }

  async function checkAvailability() {
    if (!VOICE_STATUS_ENDPOINT || window.location.protocol === "file:") {
      state.backend = "unavailable";
      setServiceStatus(t("serviceUnavailable"), "warning");
      updatePrimaryAction();
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
        response = await fetch(VOICE_STATUS_ENDPOINT, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
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
    updatePrimaryAction();
  }

  function applyTranslations() {
    document.title = `${t("title")} | PostPrep`;
    document.querySelectorAll("[data-voice-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.voiceI18n);
    });
    document.querySelectorAll("[data-voice-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", t(element.dataset.voiceI18nPlaceholder));
    });
    document.querySelectorAll("[data-voice-list]").forEach((list) => {
      const entries = t(list.dataset.voiceList);
      list.replaceChildren();
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        const item = document.createElement("li");
        if (list.dataset.voiceList === "quality") {
          item.className = "flex gap-3";
          const icon = document.createElement("i");
          icon.className = "fa-solid fa-check mt-1 text-brand";
          icon.setAttribute("aria-hidden", "true");
          const text = document.createElement("span");
          text.textContent = entry;
          item.append(icon, text);
        } else {
          item.textContent = entry;
        }
        list.append(item);
      });
    });
    const status = state.backend === "ready" ? t("serviceReady")
      : state.backend === "checking" ? t("checkingService")
        : t("serviceUnavailable");
    setServiceStatus(status, state.backend === "ready" ? "ready" : state.backend === "checking" ? "normal" : "warning");
    setBusy(state.busy);
  }

  function init() {
    const referenceInput = document.getElementById("voice-reference-file");
    const sourceInput = document.getElementById("voice-source-file");
    const read = document.getElementById("voice-mode-read");
    const cover = document.getElementById("voice-mode-cover");
    const generate = document.getElementById("voice-generate");
    if (!referenceInput || !sourceInput || !read || !cover || !generate) return;
    applyTranslations();
    updateMode("read", false);
    referenceInput.addEventListener("change", () => { analyzeFile("reference"); });
    sourceInput.addEventListener("change", () => { analyzeFile("source"); });
    read.addEventListener("click", () => updateMode("read"));
    cover.addEventListener("click", () => updateMode("cover"));
    generate.addEventListener("click", handlePrimaryAction);
    ["voice-rights-confirmed", "voice-rights-phrase", "voice-disclosure-confirmed", "voice-text"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener("input", updateGenerateEnabled);
      if (element && element.type === "checkbox") element.addEventListener("change", updateGenerateEnabled);
    });
    document.querySelectorAll('input[name="voice-rights-scope"]').forEach((element) => element.addEventListener("change", updateGenerateEnabled));
    document.addEventListener("postprep:languagechange", applyTranslations);
    checkAvailability();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
