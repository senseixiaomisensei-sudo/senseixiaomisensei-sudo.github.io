(() => {
  "use strict";

  const REQUIRED_RIGHTS_PHRASE = "I HAVE THE RIGHTS";
  const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg"]);

  const configuredGateway = typeof globalThis.POSTPREP_API_ENDPOINT === "string"
    ? globalThis.POSTPREP_API_ENDPOINT.trim().replace(/\/+$/u, "")
    : "";
  const VOICE_ENDPOINT = typeof globalThis.POSTPREP_VOICE_API_ENDPOINT === "string"
    && globalThis.POSTPREP_VOICE_API_ENDPOINT.trim()
    ? globalThis.POSTPREP_VOICE_API_ENDPOINT.trim().replace(/\/+$/u, "")
    : configuredGateway ? `${configuredGateway}/voice` : "/api/voice";

  // Elements
  const dropzone = document.getElementById("dropzone");
  const audioInput = document.getElementById("reference-audio-input");
  const dropzoneEmpty = document.getElementById("dropzone-empty");
  const dropzoneSelected = document.getElementById("dropzone-selected");
  const selectedFilename = document.getElementById("selected-filename");
  const selectedFileinfo = document.getElementById("selected-fileinfo");
  const btnRemoveAudio = document.getElementById("btn-remove-audio");
  const audioPreview = document.getElementById("audio-preview");

  const voiceText = document.getElementById("voice-text");
  const charCount = document.getElementById("char-count");
  const btnGenerate = document.getElementById("btn-generate");
  const btnGenerateText = document.getElementById("btn-generate-text");
  const statusMsg = document.getElementById("status-msg");

  const resultCard = document.getElementById("result-card");
  const resultAudio = document.getElementById("result-audio");
  const btnDownload = document.getElementById("btn-download");
  const toast = document.getElementById("toast");

  let selectedFile = null;
  let isGenerating = false;

  function showToast(message, duration = 3000) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("opacity-0", "translate-y-3");
    toast.classList.add("opacity-100", "translate-y-0");
    setTimeout(() => {
      toast.classList.remove("opacity-100", "translate-y-0");
      toast.classList.add("opacity-0", "translate-y-3");
    }, duration);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function formatSeconds(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function handleFileSelect(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      showToast("请上传 WAV、MP3、M4A 或 OGG 格式的音频");
      return;
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      showToast("文件大小超出限制（最大 20MB）");
      return;
    }

    selectedFile = file;
    selectedFilename.textContent = file.name;
    selectedFileinfo.textContent = `${formatBytes(file.size)} · 检测中...`;

    // Preview
    const blobUrl = URL.createObjectURL(file);
    audioPreview.src = blobUrl;

    const tempAudio = new Audio();
    tempAudio.src = blobUrl;
    tempAudio.onloadedmetadata = () => {
      selectedFileinfo.textContent = `${formatBytes(file.size)} · ${formatSeconds(tempAudio.duration)}`;
    };

    dropzoneEmpty.classList.add("hidden");
    dropzoneSelected.classList.remove("hidden");
    updateButtonState();
  }

  function removeFile() {
    selectedFile = null;
    audioInput.value = "";
    if (audioPreview.src) {
      URL.revokeObjectURL(audioPreview.src);
      audioPreview.src = "";
    }
    dropzoneSelected.classList.add("hidden");
    dropzoneEmpty.classList.remove("hidden");
    updateButtonState();
  }

  function updateButtonState() {
    const hasAudio = !!selectedFile;
    const hasText = voiceText.value.trim().length > 0;
    btnGenerate.disabled = isGenerating || !hasAudio || !hasText;
  }

  // Drag & Drop
  if (dropzone) {
    ["dragenter", "dragover"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("dropzone-active");
      });
    });

    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dropzone-active");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    });

    audioInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });

    btnRemoveAudio.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFile();
    });
  }

  // Text Area Input
  if (voiceText) {
    voiceText.addEventListener("input", () => {
      const len = voiceText.value.length;
      charCount.textContent = `${len} / 1000 字`;
      updateButtonState();
    });
  }

  // Quick Samples
  document.querySelectorAll(".btn-sample").forEach(btn => {
    btn.addEventListener("click", () => {
      const sample = btn.getAttribute("data-sample") || "";
      voiceText.value = sample;
      charCount.textContent = `${sample.length} / 1000 字`;
      updateButtonState();
    });
  });

  // Generate Action
  if (btnGenerate) {
    btnGenerate.addEventListener("click", async () => {
      if (isGenerating || !selectedFile || !voiceText.value.trim()) return;

      isGenerating = true;
      btnGenerate.disabled = true;
      btnGenerateText.textContent = "正在高保真合成中 (24kHz)...";
      statusMsg.textContent = "已启动音频降噪、音色锚定与声码器渲染，请稍候...";
      resultCard.classList.add("hidden");

      const formData = new FormData();
      formData.set("mode", "read");
      formData.set("rights_scope", "self");
      formData.set("rights_declaration", REQUIRED_RIGHTS_PHRASE);
      formData.set("ai_disclosure", "confirmed");
      formData.set("language", "zh");
      formData.set("text", voiceText.value.trim());
      formData.set("reference_audio", selectedFile);

      try {
        const response = await fetch(VOICE_ENDPOINT, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.code || errData.message || `请求失败 (${response.status})`);
        }

        // Output can be direct wav blob or json with job info
        const contentType = response.headers.get("Content-Type") || "";
        let audioBlobUrl = "";
        
        if (contentType.includes("audio/")) {
          const blob = await response.blob();
          audioBlobUrl = URL.createObjectURL(blob);
        } else {
          const json = await response.json();
          if (json.outputUrl) {
            audioBlobUrl = json.outputUrl;
          } else if (json.jobId && json.downloadToken) {
            audioBlobUrl = `/api/voice-output?job_id=${encodeURIComponent(json.jobId)}&token=${encodeURIComponent(json.downloadToken)}`;
          } else {
            throw new Error("服务未返回有效音频");
          }
        }

        resultAudio.src = audioBlobUrl;
        btnDownload.href = audioBlobUrl;
        resultCard.classList.remove("hidden");
        resultAudio.play().catch(() => {});
        showToast("🎉 音频生成成功！已为您自动消除金属音与杂音");
        statusMsg.textContent = "";

      } catch (err) {
        console.error("Voice synthesis failed:", err);
        showToast(`❌ 生成失败: ${err.message}`);
        statusMsg.textContent = `生成异常: ${err.message}`;
      } finally {
        isGenerating = false;
        btnGenerateText.textContent = "立即生成高保真音频";
        updateButtonState();
      }
    });
  }

  updateButtonState();
})();
