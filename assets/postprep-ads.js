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
  native: String.raw`<script async="async" data-cfasync="false" src="https://expulsiondatabaseinnocent.com/b5fb385b745ea02ae696e7748d26b35f/invoke.js"></script>
<div id="container-b5fb385b745ea02ae696e7748d26b35f"></div>`,
});

(() => {
  "use strict";

  const PLACEHOLDER_PATTERN = /(?:YOUR_ADSTERRA_|PASTE_|REPLACE_|INSERT_)/i;
  const EMPTY_AD_TIMEOUT_MS = 12000;
  const state = {
    nativeMount: 0,
    nativeMounted: false,
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

  function slotHasRenderedContent(slot) {
    const content = slot?.querySelector("[data-ad-content]");
    if (!content) return false;
    return Boolean(content.querySelector("iframe, img, video, object, embed, a, [data-ad-rendered], [id^=\"container-\"] > *"));
  }

  function scheduleEmptyCheck(slot, mountId) {
    window.setTimeout(() => {
      if (!slot || slot.dataset.adMount !== String(mountId)) return;
      if (!slotHasRenderedContent(slot)) hideSlot(slot);
    }, EMPTY_AD_TIMEOUT_MS);
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

  function copyScriptNode(source) {
    const script = document.createElement("script");
    for (const attribute of Array.from(source.attributes)) {
      script.setAttribute(attribute.name, attribute.value);
    }
    script.textContent = source.textContent || "";
    return script;
  }

  function writeTopSnippetDuringParsing(loader) {
    const slot = loader?.closest(".postprep-ad-slot--top");
    if (!slot || document.readyState !== "loading") return;

    const isDesktop = window.matchMedia
      ? window.matchMedia("(min-width: 768px)").matches
      : window.innerWidth >= 768;
    const snippet = isDesktop ? AD_CONFIG.bannerDesktop : AD_CONFIG.bannerMobile;
    const mountId = `top-${isDesktop ? "desktop" : "mobile"}`;

    if (!isConfiguredSnippet(snippet)) {
      hideSlot(slot, false);
      return;
    }

    // Adsterra banner snippets can depend on parser-time script execution.
    // Writing the original snippet at this parser position preserves that behavior.
    slot.hidden = false;
    slot.classList.remove("is-loading");
    slot.classList.add("is-ready");
    slot.dataset.adState = "ready";
    slot.dataset.adMount = mountId;
    slot.dataset.adMode = isDesktop ? "desktop" : "mobile";
    document.write(
      `<span class="postprep-ad-slot__label" data-ad-label="true" aria-hidden="true">${currentLabel()}</span>`
        + `<div class="postprep-ad-slot__content" data-ad-content="true">${snippet}</div>`,
    );

    document.addEventListener("DOMContentLoaded", () => {
      scheduleEmptyCheck(slot, mountId);
    }, { once: true });
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
      scripts.forEach((script) => script.replaceWith(copyScriptNode(script)));
      if (!fragment.childNodes.length) throw new Error("Empty ad snippet");
    } catch {
      hideSlot(slot);
      return false;
    }

    try {
      content.appendChild(fragment);
    } catch {
      hideSlot(slot);
      return false;
    }

    if (slot.dataset.adMount !== String(mountId)) {
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
    scheduleEmptyCheck(slot, mountId);
    return true;
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

    if (native) {
      hideSlot(native);
      document.addEventListener("postprep:generatorresult", handleGeneratorResult);
    }
    document.addEventListener("postprep:languagechange", () => {
      updateLabel(top);
      updateLabel(native);
    });
  }

  writeTopSnippetDuringParsing(document.currentScript);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
