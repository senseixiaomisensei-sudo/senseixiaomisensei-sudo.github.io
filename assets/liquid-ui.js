(() => {
  "use strict";
  const key = "postprep-ui-style";
  const root = document.documentElement;
  try { root.dataset.ui = localStorage.getItem(key) === "classic" ? "classic" : "glass"; }
  catch { root.dataset.ui = "glass"; }

  function init() {
    const en = () => root.lang.startsWith("en");
    const text = (zh, english) => en() ? english : zh;
    const header = document.getElementById("site-header");
    const optics = document.createElement("div");
    optics.setAttribute("aria-hidden", "true");
    optics.className = "glass-optics";
    optics.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs><filter id="glass-refraction" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".008 .015" numOctaves="1" seed="7" result="texture"/><feGaussianBlur in="texture" stdDeviation="2" result="lens"/><feDisplacementMap in="SourceGraphic" in2="lens" scale="12" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>';
    document.body.append(optics);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "style-toggle";
    toggle.innerHTML = '<i class="fa-solid fa-layer-group" aria-hidden="true"></i>';
    function labelToggle() {
      const glass = root.dataset.ui === "glass";
      const label = glass ? text("切换至经典风格", "Switch to Classic") : text("切换至液态玻璃", "Switch to Liquid Glass");
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("aria-pressed", String(glass));
      toggle.dataset.tooltip = label;
      toggle.title = label;
    }
    function mountToggle() {
      const language = header?.querySelector("[data-language-toggle]");
      if (language && !toggle.isConnected) language.before(toggle);
      labelToggle();
    }
    mountToggle();
    const measureHeader = () => root.style.setProperty("--site-header-height", `${header?.getBoundingClientRect().height || 72}px`);
    if (header && typeof ResizeObserver !== "undefined") new ResizeObserver(measureHeader).observe(header);
    measureHeader();
    if (header) new MutationObserver(mountToggle).observe(header, { childList: true, subtree: true });
    toggle.addEventListener("click", () => {
      root.dataset.ui = root.dataset.ui === "glass" ? "classic" : "glass";
      try { localStorage.setItem(key, root.dataset.ui); } catch { /* Private browsing still allows a session toggle. */ }
      labelToggle();
      if (root.dataset.ui !== "glass") document.getElementById("studio-input-audio")?.pause();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === key) {
        root.dataset.ui = event.newValue === "classic" ? "classic" : "glass";
        labelToggle();
      }
    });
    new MutationObserver(labelToggle).observe(root, { attributes: true, attributeFilter: ["lang"] });
    document.addEventListener("pointermove", (event) => {
      if (root.dataset.ui !== "glass" || event.pointerType === "touch" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const surface = event.target.closest(".style-toggle, .studio-monitor, .studio-dock, [data-model-id], #rvc-upload-wrap, #rvc-result-section, .studio-shortcuts button");
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty("--glass-angle", `${100 + (event.clientX - rect.left) / rect.width * 70}deg`);
      surface.style.setProperty("--light-x", `${(event.clientX - rect.left) / rect.width * 100}%`);
      surface.style.setProperty("--light-y", `${(event.clientY - rect.top) / rect.height * 100}%`);
    }, { passive: true });
    if (document.body.dataset.page === "rvc") initStudio(text);
  }

  function initStudio(text) {
    const aside = document.querySelector("main aside");
    if (!aside) return;
    const panel = document.createElement("section");
    panel.className = "glass-only studio-monitor";
    panel.setAttribute("aria-label", text("声音工作台", "Voice studio"));
    panel.innerHTML = `
      <div class="studio-kicker"><span>POSTPREP / VOICE STUDIO</span><i class="fa-solid fa-sliders" aria-hidden="true"></i></div>
      <h2 class="studio-name" id="studio-model"></h2>
      <p class="studio-caption" id="studio-caption"></p>
      <canvas class="studio-wave" width="620" height="280" aria-hidden="true"></canvas>
      <p class="studio-file" id="studio-file" role="status"></p>
      <audio class="studio-audio" id="studio-input-audio" controls preload="metadata" hidden></audio>
      <input class="studio-playhead" id="studio-seek" type="range" min="0" max="1000" value="0" hidden>
      <dl class="studio-readouts"><div><dt id="studio-pitch-label"></dt><dd id="studio-pitch"></dd></div><div><dt id="studio-duration-label"></dt><dd id="studio-duration">--:--</dd></div></dl>
      <div class="studio-shortcuts">
        <button type="button" data-studio-target="rvc-model-search"><i class="fa-solid fa-user-group" aria-hidden="true"></i></button>
        <button type="button" data-studio-target="rvc-step-audio-label"><i class="fa-solid fa-microphone" aria-hidden="true"></i></button>
        <button type="button" data-studio-target="rvc-pitch"><i class="fa-solid fa-sliders" aria-hidden="true"></i></button>
        <button type="button" data-studio-target="rvc-convert"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
      </div>`;
    aside.prepend(panel);
    const dock = document.createElement("nav");
    dock.className = "glass-only studio-dock";
    dock.setAttribute("aria-label", text("变声流程", "Voice workflow"));
    dock.innerHTML = '<span class="studio-dock-lens" aria-hidden="true"></span>';
    const steps = [
      ["rvc-step-model-label", "fa-user-group", "角色", "Voice"],
      ["rvc-step-audio-label", "fa-microphone", "声音", "Audio"],
      ["rvc-pitch", "fa-sliders", "调音", "Tune"],
    ];
    steps.forEach(([id, icon, zh, english], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span></span>`;
      button.dataset.step = String(index);
      if (!index) button.setAttribute("aria-current", "step");
      button.addEventListener("click", () => {
        const target = document.getElementById(id);
        dock.style.setProperty("--step", String(index));
        dock.querySelectorAll("button").forEach(item => item.removeAttribute("aria-current"));
        button.setAttribute("aria-current", "step");
        target.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "center" });
        if (!target.matches("input")) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      });
      dock.append(button);
    });
    document.querySelector('[aria-labelledby="rvc-workflow-heading"]').prepend(dock);
    let scrollFrame = 0;
    function syncDock() {
      scrollFrame = 0;
      const threshold = (document.getElementById("site-header")?.getBoundingClientRect().height || 72) + 140;
      let active = 0;
      steps.forEach(([id], index) => {
        if (document.getElementById(id)?.getBoundingClientRect().top <= threshold) active = index;
      });
      dock.style.setProperty("--step", String(active));
      dock.querySelectorAll("button").forEach((button, index) => {
        if (index === active) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });
    }
    window.addEventListener("scroll", () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(syncDock);
    }, { passive: true });
    const canvas = panel.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const audio = panel.querySelector("audio");
    const seek = panel.querySelector("#studio-seek");
    const fileLabel = panel.querySelector("#studio-file");
    const pitch = document.getElementById("rvc-pitch");
    let peaks = null;
    let objectUrl = "";
    let revision = 0;
    let decodeContext = null;
    let fileState = "empty";
    let fileName = "";
    let pointer = 0.5;
    let drawingFrame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    function draw() {
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#64887825";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 31) {
        ctx.beginPath(); ctx.moveTo(x, 15); ctx.lineTo(x, h - 15); ctx.stroke();
      }
      for (let y = 35; y < h; y += 35) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.fillStyle = "#00866c";
      if (peaks) {
        const progress = Number.isFinite(audio.duration) ? audio.currentTime / audio.duration : 0;
        peaks.forEach((peak, i) => {
          ctx.fillStyle = i / peaks.length < progress ? "#b96e58" : "#00866c";
          const height = Math.max(3, peak * (h - 35));
          ctx.fillRect(i * w / peaks.length, (h - height) / 2, Math.max(2, w / peaks.length - 2), height);
        });
      } else {
        // Particle contours echo the reference's sculptural motion. They are
        // decoration; loaded audio always keeps the real waveform above.
        for (let i = 0; i < 420; i++) {
          const angle = i * 2.399963;
          const radius = Math.sqrt(i / 420);
          const twist = Math.sin(angle * 3 + pointer * 2) * 12;
          const x = w / 2 + Math.cos(angle + pointer * .12) * radius * (w * .43 + twist);
          const y = h / 2 + Math.sin(angle) * radius * (h * .42 + twist);
          ctx.fillStyle = i % 5 === 0 ? "#bd8263aa" : "#21796370";
          ctx.beginPath(); ctx.arc(x, y, i % 7 === 0 ? 1.5 : .8, 0, Math.PI * 2); ctx.fill();
        }
        // A decorative folded ribbon, not an invented audio measurement.
        for (let strand = 0; strand < 28; strand++) {
          const offset = strand / 27;
          const ink = ctx.createLinearGradient(0, 0, w, h);
          ink.addColorStop(0, "#b2c6bd");
          ink.addColorStop(.24, "#007f6b");
          ink.addColorStop(.48, "#dbf8ec");
          ink.addColorStop(.66, "#176b5c");
          ink.addColorStop(.88, "#c58d7d");
          ink.addColorStop(1, "#efdbd3");
          ctx.strokeStyle = ink;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 3) {
            const u = x / w;
            const envelope = Math.sin(u * Math.PI);
            const y = h / 2 + Math.sin(u * Math.PI * 2 + offset * 2.8 + pointer) * envelope * 78 + (offset - .5) * 70;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }
    canvas.addEventListener("pointermove", (event) => {
      if (peaks || reduced.matches || event.pointerType === "touch") return;
      pointer = (event.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth * 2;
      if (!drawingFrame) drawingFrame = requestAnimationFrame(() => { drawingFrame = 0; draw(); });
    });
    function localize() {
      dock.setAttribute("aria-label", text("变声流程", "Voice workflow"));
      dock.querySelectorAll("button span").forEach((span, index) => {
        span.textContent = text(steps[index][2], steps[index][3]);
      });
      panel.querySelector("#studio-caption").textContent = text("当前角色 / 原声试听", "Selected voice / Source preview");
      panel.querySelector("#studio-pitch-label").textContent = text("音高 · 半音", "Pitch · semitones");
      panel.querySelector("#studio-duration-label").textContent = text("原声时长", "Source duration");
      seek.setAttribute("aria-label", text("原声播放位置", "Source playback position"));
      const labels = [text("选择角色", "Choose voice"), text("提供声音", "Audio source"), text("调整音高", "Adjust pitch"), text("前往变声", "Go to conversion")];
      panel.querySelectorAll("[data-studio-target]").forEach((button, i) => {
        button.title = labels[i];
        button.setAttribute("aria-label", labels[i]);
      });
      fileLabel.textContent = fileState === "empty" ? text("尚未载入原声", "No source audio")
        : fileState === "loading" ? text("正在读取波形…", "Reading waveform…")
        : fileState === "large" ? text("大文件可直接试听，省略波形解码", "Large file: playback available, waveform skipped")
        : fileState === "error" ? text("此格式暂不支持波形预览，不影响原有上传", "Waveform unavailable for this format; upload remains available")
        : fileName;
    }
    function syncSelection() {
      const selected = document.querySelector('[data-model-id][aria-selected="true"] p');
      panel.querySelector("#studio-model").textContent = selected?.textContent || text("选择角色", "Choose a voice");
      const n = Number(pitch?.value || 0);
      panel.querySelector("#studio-pitch").textContent = `${n > 0 ? "+" : ""}${n}`;
    }
    panel.querySelectorAll("[data-studio-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.studioTarget);
        if (!target) return;
        target.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "center" });
        if (!target.matches("button,input")) target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.classList.remove("studio-target-flash");
        requestAnimationFrame(() => target.classList.add("studio-target-flash"));
      });
    });
    const gallery = document.getElementById("rvc-model-gallery");
    const upload = document.getElementById("rvc-upload-wrap");
    if (upload) {
      upload.addEventListener("dragover", (event) => {
        if (!event.dataTransfer?.types.includes("Files")) return;
        event.preventDefault();
        upload.classList.add("is-dragging");
      });
      upload.addEventListener("dragleave", (event) => {
        if (!upload.contains(event.relatedTarget)) upload.classList.remove("is-dragging");
      });
      upload.addEventListener("drop", (event) => {
        event.preventDefault();
        upload.classList.remove("is-dragging");
        const file = event.dataTransfer?.files[0];
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.getElementById("rvc-audio-file");
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    if (gallery) {
      new MutationObserver(syncSelection).observe(gallery, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-selected"] });
      gallery.addEventListener("pointermove", (event) => {
        if (reduced.matches || root.dataset.ui !== "glass" || event.pointerType === "touch") return;
        const card = event.target.closest("[data-model-id]");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--light-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--light-y", `${event.clientY - rect.top}px`);
      });
    }
    document.addEventListener("input", syncSelection);
    document.addEventListener("click", () => queueMicrotask(syncSelection));
    new MutationObserver(() => { localize(); syncSelection(); }).observe(root, { attributes: true, attributeFilter: ["lang"] });
    function updateTime() {
      const duration = audio.duration;
      panel.querySelector("#studio-duration").textContent = Number.isFinite(duration)
        ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : "--:--";
      seek.value = Number.isFinite(duration) && duration > 0 ? String(Math.round(audio.currentTime / duration * 1000)) : "0";
      draw();
    }
    audio.addEventListener("loadedmetadata", updateTime);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("play", () => {
      document.querySelectorAll("audio").forEach((other) => { if (other !== audio) other.pause(); });
    });
    document.addEventListener("play", (event) => {
      if (event.target instanceof HTMLMediaElement && event.target !== audio) audio.pause();
    }, true);
    seek.addEventListener("input", () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 1000 * audio.duration;
    });
    document.getElementById("rvc-audio-file")?.addEventListener("change", async (event) => {
      const current = ++revision;
      audio.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      cancelAnimationFrame(drawingFrame);
      drawingFrame = 0;
      if (decodeContext) { void decodeContext.close().catch(() => {}); decodeContext = null; }
      peaks = null;
      seek.value = "0";
      const file = event.target.files?.[0];
      audio.hidden = !file;
      seek.hidden = !file;
      fileName = file?.name || "";
      fileState = file ? "loading" : "empty";
      localize();
      draw();
      panel.querySelector("#studio-duration").textContent = "--:--";
      if (!file) { audio.removeAttribute("src"); audio.load(); return; }
      objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;
      // Bound optional visualization memory; never invoke an inference or upload API.
      if (file.size > 20 * 1024 * 1024) { fileState = "large"; localize(); return; }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      let context;
      try {
        context = new AudioCtx({ sampleRate: 8000 });
        decodeContext = context;
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (current !== revision) return;
        const samples = buffer.getChannelData(0);
        peaks = Array.from({ length: 100 }, (_, i) => {
          const start = Math.floor(i * samples.length / 100);
          const end = Math.floor((i + 1) * samples.length / 100);
          let peak = 0;
          for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 500))) peak = Math.max(peak, Math.abs(samples[j]));
          return peak;
        });
        fileState = "ready";
      } catch {
        if (current !== revision) return;
        fileState = "error";
      } finally {
        if (context && context.state !== "closed") await context.close().catch(() => {});
        if (decodeContext === context) decodeContext = null;
      }
      if (current === revision) { localize(); draw(); }
    });
    window.addEventListener("pagehide", () => {
      audio.pause();
      cancelAnimationFrame(drawingFrame);
      drawingFrame = 0;
    });
    localize();
    syncSelection();
    draw();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
