const AD_CONFIG = Object.freeze({
  bannerDesktop: String.raw`<script>
  atOptions = {
    'key' : '73b6058b10d20b5d847bbcb6ceccbed2',
    'format' : 'iframe',
    'height' : 90,
    'width' : 728,
    'params' : {}
  };
</script>
<script src="https://www.highperformanceformat.com/73b6058b10d20b5d847bbcb6ceccbed2/invoke.js"></script>`,
  bannerMobile: String.raw`YOUR_ADSTERRA_MOBILE_BANNER_CODE`,
  native: String.raw`<script async="async" data-cfasync="false" src="https://pl30761022.effectivecpmnetwork.com/b5fb385b745ea02ae696e7748d26b35f/invoke.js"></script>
<div id="container-b5fb385b745ea02ae696e7748d26b35f"></div>`,
});

(() => {
  "use strict";

  const PLACEHOLDER_PATTERN = /(?:YOUR_ADSTERRA_|PASTE_|REPLACE_|INSERT_)/i;
  const state = {
    topMode: "",
    topMount: 0,
    nativeMount: 0,
    nativeMounted: false,
    mediaQuery: null,
  };

  function isConfiguredSnippet(value) {
    if (typeof value !== "string") return false;
    const snippet = value.trim();
    return Boolean(snippet) && !PLACEHOLDER_PATTERN.test(snippet) && /<script\b/i.test(snippet);
  }

  function currentLabel() {
    return document.documentElement.lang.toLowerCase().startsWith("zh") ? "广告" : "Advertisement";
  }

  function updateLabel(slot) {
    if (!slot) return;
    const label = slot.querySelector("[data-ad-label]");
    const text = currentLabel();
    if (label) label.textContent = text;
    slot.setAttribute("aria-label", text);
  }

  function hideSlot(slot, clear = true) {
    if (!slot) return;
    slot.hidden = true;
    slot.classList.remove("is-loading");
    slot.classList.remove("is-ready");
    slot.dataset.adState = "hidden";
    if (clear) slot.replaceChildren();
  }

  function createSlotContent(slot) {
    slot.replaceChildren();
    const label = document.createElement("span");
    label.className = "postprep-ad-slot__label";
    label.dataset.adLabel = "true";
    label.setAttribute("aria-hidden", "true");
    label.textContent = currentLabel();

    const content = document.createElement("div");
    content.className = "postprep-ad-slot__content";
    content.dataset.adContent = "true";
    slot.append(label, content);
    // Keep a configured slot measurable while third-party code initializes.
    // Failure paths call hideSlot(), so an invalid or broken ad leaves no gap.
    slot.hidden = false;
    slot.classList.add("is-loading");
    slot.classList.remove("is-ready");
    slot.dataset.adState = "loading";
    updateLabel(slot);
    return content;
  }

  function copyScriptNode(source, slot, mountId) {
    const script = document.createElement("script");
    for (const attribute of Array.from(source.attributes)) {
      script.setAttribute(attribute.name, attribute.value);
    }
    script.textContent = source.textContent || "";
    script.addEventListener("error", () => {
      if (slot.dataset.adMount === String(mountId)) hideSlot(slot);
    }, { once: true });
    return script;
  }

  function mountSnippet(slot, snippet, mountId) {
    if (!slot || !isConfiguredSnippet(snippet)) {
      hideSlot(slot);
      return false;
    }

    const content = createSlotContent(slot);
    slot.dataset.adMount = String(mountId);
    const template = document.createElement("template");
    let fragment;
    try {
      template.innerHTML = snippet;
      fragment = template.content;
      const scripts = Array.from(fragment.querySelectorAll("script"));
      scripts.forEach((script) => script.replaceWith(copyScriptNode(script, slot, mountId)));
      if (!fragment.childNodes.length) throw new Error("Empty ad snippet");
    } catch {
      hideSlot(slot);
      return false;
    }

    let runtimeFailed = false;
    const onRuntimeError = () => {
      runtimeFailed = true;
      if (slot.dataset.adMount === String(mountId)) hideSlot(slot);
    };
    window.addEventListener("error", onRuntimeError, true);
    try {
      content.appendChild(fragment);
    } catch {
      runtimeFailed = true;
    } finally {
      window.removeEventListener("error", onRuntimeError, true);
    }

    if (runtimeFailed || slot.dataset.adMount !== String(mountId)) {
      hideSlot(slot);
      return false;
    }

    if (slot.dataset.adState !== "loading") {
      hideSlot(slot);
      return false;
    }

    slot.hidden = false;
    slot.classList.remove("is-loading");
    slot.classList.add("is-ready");
    slot.dataset.adState = "ready";
    updateLabel(slot);
    return true;
  }

  function mountTop() {
    const slot = document.getElementById("postprep-ad-top");
    if (!slot) return;
    const isMobile = state.mediaQuery ? !state.mediaQuery.matches : window.innerWidth < 768;
    const mode = isMobile ? "mobile" : "desktop";
    if (state.topMode === mode && slot.dataset.adState === "ready") return;
    state.topMode = mode;
    state.topMount += 1;
    const snippet = isMobile ? AD_CONFIG.bannerMobile : AD_CONFIG.bannerDesktop;
    mountSnippet(slot, snippet, state.topMount);
  }

  function mountNative() {
    const slot = document.getElementById("postprep-ad-native");
    if (!slot) return;
    if (state.nativeMounted && slot.dataset.adState === "ready") {
      slot.hidden = false;
      updateLabel(slot);
      return;
    }
    state.nativeMounted = false;
    state.nativeMount += 1;
    state.nativeMounted = mountSnippet(slot, AD_CONFIG.native, state.nativeMount);
  }

  function clearNative() {
    const slot = document.getElementById("postprep-ad-native");
    state.nativeMount += 1;
    state.nativeMounted = false;
    hideSlot(slot);
  }

  function handleGeneratorResult(event) {
    if (event && event.detail && event.detail.hasResult) {
      mountNative();
    } else {
      clearNative();
    }
  }

  function init() {
    const top = document.getElementById("postprep-ad-top");
    const native = document.getElementById("postprep-ad-native");
    if (!top && !native) return;

    if (top && window.matchMedia) {
      state.mediaQuery = window.matchMedia("(min-width: 768px)");
      const onViewportChange = () => mountTop();
      if (typeof state.mediaQuery.addEventListener === "function") {
        state.mediaQuery.addEventListener("change", onViewportChange);
      } else if (typeof state.mediaQuery.addListener === "function") {
        state.mediaQuery.addListener(onViewportChange);
      }
      mountTop();
    } else if (top) {
      mountTop();
    }

    if (native) {
      hideSlot(native);
      document.addEventListener("postprep:generatorresult", handleGeneratorResult);
    }
    document.addEventListener("postprep:languagechange", () => {
      updateLabel(top);
      updateLabel(native);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

