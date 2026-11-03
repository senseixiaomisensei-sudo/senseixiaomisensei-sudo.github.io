/*! PostPrep · Rococo theme pack — runtime (no dependencies, CSP-safe: external file, no eval)
 *  - Adds data-ui="rococo" as the third option of the existing .style-toggle (glass → classic → rococo),
 *    persisted under the same localStorage key "postprep-ui-style".
 *  - Builds purely decorative, aria-hidden, pointer-events:none layers (stickers, petals, page
 *    ornaments, gold-foil sheen, wax-seal stamps). Never touches ids, data-* hooks, forms or listeners.
 *  - Motion: transform/opacity only; honours prefers-reduced-motion and pauses when the tab is hidden.
 */
(function () {
  "use strict";
  var KEY = "postprep-ui-style";
  var TIME_KEY = "rococo-time";           // optional override: morning | afternoon | dusk | night | auto
  var root = document.documentElement;
  var ASSET = (function () {               // resolve assets/rococo/ from this script's own URL
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/rococo\.js(\?.*)?$/, "") : "assets/rococo/";
  })();
  var reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false };

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function isRococo() { return root.dataset.ui === "rococo"; }

  /* ---------- 1 · boot: runs synchronously in <head>, after liquid-ui.js ---------- */
  if (stored() === "rococo") root.dataset.ui = "rococo";

  var forced = null;
  function requestedPhase() {
    var o = null;
    try { o = (location.search.match(/[?&]rococo-time=(morning|afternoon|dusk|night)/) || [])[1] || localStorage.getItem(TIME_KEY); } catch (e) {}
    return o && /^(morning|afternoon|dusk|night)$/.test(o) ? o : null;
  }
  function phase() {
    var requested = forced || requestedPhase();
    if (requested) return requested;
    var h = new Date().getHours();
    return h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "afternoon" : h >= 17 && h < 20 ? "dusk" : "night";
  }
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var themeOriginal = themeMeta && themeMeta.getAttribute("content");
  function applySky() {
    var p = phase();
    root.dataset.rcSky = p;
    var night = p === "night" || (!forced && !requestedPhase() && darkMQ.matches);
    if (night) root.setAttribute("data-rc-night", ""); else root.removeAttribute("data-rc-night");
    if (themeMeta) themeMeta.setAttribute("content", isRococo() ? (night ? "#0e1730" : "#dfe8f3") : themeOriginal);
    if (headRefs) relabelHead();
  }
  applySky();
  if (window.__ROCOCO_PREVIEW__) window.addEventListener("message", function (e) {
    var t = e.data && e.data.rococoTime; if (!/^(morning|afternoon|dusk|night)$/.test(t || "")) return;
    forced = t; applySky(); relabelHead();
  });
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", applySky);
  else if (darkMQ.addListener) darkMQ.addListener(applySky);
  setInterval(applySky, 10 * 60 * 1000);   // the sky follows the clock

  /* ---------- 2 · page vocabulary ---------- */
  var PAGES = {
    home:      { no: 1, fr: "Correspondance",             cn: "书信",   en: "Letters",     g: "信", n: "I" },
    length:    { no: 2, fr: "La Mesure",                  cn: "量度",   en: "Measure",     g: "量", n: "II" },
    hashtags:  { no: 3, fr: "Les Étiquettes",             cn: "标签",   en: "Labels",      g: "签", n: "III" },
    formatter: { no: 4, fr: "La Mise en Page",            cn: "排版",   en: "Layout",      g: "排", n: "IV" },
    generator: { no: 5, fr: "Le Cahier d’Idées",          cn: "灵感",   en: "Ideas",       g: "思", n: "V" },
    rvc:       { no: 6, fr: "La Boîte à Musique",         cn: "声之匣", en: "Music box",   g: "声", n: "VI" },
    trust:     { no: 7, fr: "Le Certificat",              cn: "可信",   en: "Certificate", g: "证", n: "VII" },
    passport:  { no: 8, fr: "Le Passeport",               cn: "护照",   en: "Passport",    g: "照", n: "VIII" },
    skills:    { no: 9, fr: "L’Atelier",                  cn: "工坊",   en: "Atelier",     g: "艺", n: "IX" },
    privacy:   { no: 10, fr: "Lettre de Confidentialité",  cn: "隐私",   en: "Privacy",     g: "密", n: "X" },
    "404":     { no: 11, fr: "Retour à l’Expéditeur",      cn: "迷途",   en: "Return",      g: "迷", n: "XI" }
  };
  var GREET = {
    morning:   ["Bonjour",        "早安",   "Good morning"],
    afternoon: ["Bon après-midi", "午安",   "Good afternoon"],
    dusk:      ["Bonsoir",        "晚上好", "Good evening"],
    night:     ["Bonne nuit",     "晚安",   "Good night"]
  };
  var STICKERS = {
    home:  ["rose", "teapot", "swallows", "cherub", "column", "letter", "strawberries", "bow", "balloon", "watch"],
    rvc:   ["lyre", "cherub", "bow", "birdcage", "dove", "watch", "cameo", "swallows", "lily", "moon-candle"],
    a:     ["pen", "mirror-quill", "waxseal", "ladder", "key", "rose", "macarons", "cherries", "shell", "urn"],
    b:     ["perfume", "bust", "lily", "cartouche", "letter", "strawberries", "balloon", "swallows", "column", "postmark"]
  };
  // slot: [left, top, width(px), rotate(deg), layer, extra class]
  var SLOTS = [
    ["1.4%", "17%", 132, -8, 3, "wide"], ["90.6%", "57%", 128, 7, 3, "wide"],
    ["2.2%", "60%", 112, 6, 2, "wide"],  ["91.2%", "22%", 116, -6, 2, "wide"], ["3.6%", "84%", 98, -4, 2, "wide"],
    ["92.6%", "83%", 84, 10, 1, "wide"], ["5.6%", "39%", 72, 12, 1, "wide"],  ["93.4%", "5%", 70, -10, 1, "wide"],
    ["calc(100% - 92px)", "70px", 92, 9, 3, "corner"], ["-18px", "calc(100% - 132px)", 96, -9, 2, "corner desk"]
  ];

  var page = function () { return (document.body && document.body.dataset.page) || "home"; };
  var isEn = function () { return (root.lang || "").indexOf("en") === 0; };
  var built = false, stage = null;

  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; n.setAttribute("aria-hidden", "true"); return n; }
  function img(name, cls) { var i = new Image(), map = window.__ROCOCO_IMG__; i.alt = ""; i.decoding = "async"; i.loading = "lazy"; i.src = (map && map[name]) || ASSET + "img/" + name + ".webp"; if (cls) i.className = cls; i.setAttribute("aria-hidden", "true"); return i; }

  /* ---------- 3 · sticker stage + petals ---------- */
  function buildStage() {
    var p = page(), set = STICKERS[p] || STICKERS[(p.charCodeAt(0) + p.length) % 2 ? "a" : "b"];
    stage = el("div", "rc-deco rc-stage");
    var layers = [null, el("div", "rc-layer rc-l1"), el("div", "rc-layer rc-l2"), el("div", "rc-layer rc-l3")];
    SLOTS.forEach(function (s, i) {
      var name = set[i % set.length];
      if (p === "rvc" && i === 7 && root.hasAttribute("data-rc-night")) name = "moon-candle";
      var st = el("span", "rc-st " + s[5] + (name === "moon-candle" ? " rc-glow" : ""));
      st.style.cssText = "--x:" + s[0] + ";--y:" + s[1] + ";--w:" + s[2] + "px;--r:" + s[3] + "deg;--d:" + (7 + (i * 1.7) % 6).toFixed(1) + "s;--dl:-" + (i * 1.3).toFixed(1) + "s";
      st.appendChild(img(name));
      layers[s[4]].appendChild(st);
    });
    stage.appendChild(layers[1]); stage.appendChild(layers[2]); stage.appendChild(layers[3]);
    if (!reduced.matches) {
      var pet = el("div", "rc-petals");
      for (var k = 0; k < 7; k++) {
        var b = document.createElement("i");
        if (k % 3 === 2) b.className = "f";
        b.style.cssText = "--x:" + (6 + (k * 37) % 88) + "%;--s:" + (12 + (k * 5) % 10) + "px;--t:" + (22 + (k * 7) % 14) + "s;--dl:-" + (k * 4.3).toFixed(1) + "s;--dx:" + ((k % 2 ? 1 : -1) * (30 + k * 9)) + "px";
        pet.appendChild(b);
      }
      stage.appendChild(pet);
    }
    document.body.appendChild(stage);
    return layers;
  }

  /* parallax: pointer (desktop) or gyro (phones) + a little scroll; transforms only */
  function parallax(layers) {
    if (reduced.matches) return;
    var tx = 0, ty = 0, sy = 0, raf = 0;
    var depth = [0, 6, 14, 24];
    function paint() {
      raf = 0;
      for (var i = 1; i < 4; i++) {
        var scroll = Math.max(-90, Math.min(90, -sy * [0, .015, .035, .06][i]));
        layers[i].style.transform = "translate3d(" + (tx * depth[i]).toFixed(1) + "px," + (ty * depth[i] + scroll).toFixed(1) + "px,0)";
      }
    }
    function req() { if (!reduced.matches && !raf) raf = requestAnimationFrame(paint); }
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch" || !isRococo()) return;
      tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; req();
    }, { passive: true });
    window.addEventListener("deviceorientation", function (e) {
      if (!isRococo() || e.gamma == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 30)) * .5; ty = Math.max(-1, Math.min(1, (e.beta - 40) / 30)) * .5; req();
    }, { passive: true });
    window.addEventListener("scroll", function () { sy = scrollY; req(); }, { passive: true });
  }

  /* ---------- 4 · page head ornaments + ink-written script title ---------- */
  var SVGNS = "http://www.w3.org/2000/svg", inkId = 0;
  function inkTitle(text) {
    var id = "rc-ink-" + (++inkId);
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "rc-deco rc-ink"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.setAttribute("viewBox", "0 0 640 92");
    svg.innerHTML = '<defs><clipPath id="' + id + '"><rect class="w" x="0" y="0" width="640" height="92"/></clipPath></defs>' +
      '<text class="s" x="6" y="66" clip-path="url(#' + id + ')"></text><text class="f" x="6" y="66"></text><circle class="n" cx="8" cy="58" r="3.2"/>';
    svg.querySelectorAll("text").forEach(function (t) { t.textContent = text; });
    requestAnimationFrame(function () {
      try { var len = svg.querySelector("text").getComputedTextLength(); if (len) svg.querySelector(".n").style.setProperty("--len", len + "px"); } catch (e) {}
    });
    return svg;
  }
  function greetText() { var g = GREET[root.dataset.rcSky] || GREET.afternoon; return { fr: g[0], other: isEn() ? g[2] : g[1] }; }
  function headHost() {
    var p = page();
    if (p === "home") return document.querySelector(".h-hero-copy");
    if (p === "rvc") return document.querySelector(".rvc-page-heading");
    return document.querySelector("main > header") || document.querySelector("main h1") && document.querySelector("main h1").parentElement;
  }
  var headRefs = null;
  function buildHead() {
    var host = headHost(), meta = PAGES[page()] || PAGES.home;
    if (!host) return;
    var h1 = host.querySelector("h1");
    var anchor = h1; while (anchor && anchor.parentElement !== host) anchor = anchor.parentElement;
    if (page() === "404" && host.querySelector(".v3-404-code")) anchor = host.querySelector(".v3-404-code");
    if (!anchor) anchor = host.firstElementChild;
    var greet = el("div", "rc-deco rc-greet");
    var ink = inkTitle(meta.fr);
    host.insertBefore(greet, anchor);
    host.insertBefore(ink, anchor);
    var orn = el("div", "rc-deco rc-head",
      '<span class="rc-crop tl"></span><span class="rc-crop tr"></span><span class="rc-crop bl"></span><span class="rc-crop br"></span>' +
      '<span class="rc-glyph"></span><span class="rc-numeral"></span><span class="rc-no"></span><span class="rc-barcode"></span><span class="rc-fr"></span>');
    host.insertBefore(orn, anchor);
    headRefs = { greet: greet, orn: orn, meta: meta, host: host };
    relabelHead();
    fitHead();
    window.addEventListener("resize", function () { requestAnimationFrame(fitHead); }, { passive: true });
  }
  // the ornaments may reach into the empty column right of the title, but never past the viewport
  function fitHead() {
    if (!headRefs) return;
    if (page() === "home") { headRefs.orn.style.right = ""; return; }
    var r = headRefs.host.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    var ext = vw >= 1100 ? r.width * .38 : 4;
    var edge = Math.min(r.right + ext, vw - 20);           // where the ornaments may end
    headRefs.orn.style.right = (r.right - edge).toFixed(0) + "px";
  }
  function relabelHead() {
    if (!headRefs) return;
    var g = greetText(), m = headRefs.meta, o = headRefs.orn;
    headRefs.greet.innerHTML = "<b></b><span></span>";
    headRefs.greet.querySelector("b").textContent = g.fr;
    headRefs.greet.querySelector("span").textContent = "· " + g.other;
    var glyph = o.querySelector(".rc-glyph"); glyph.textContent = m.g; glyph.setAttribute("data-g", m.g);
    o.querySelector(".rc-numeral").textContent = m.n;
    o.querySelector(".rc-no").textContent = "N° " + ("0" + m.no).slice(-2) + " · PostPrep · Paris";
    o.querySelector(".rc-fr").textContent = m.fr + " · " + (isEn() ? m.en : m.cn);
  }

  /* ---------- 5 · page-specific furniture ---------- */
  function buildPageFurniture() {
    var p = page();
    if (p === "rvc") {
      var studio = document.getElementById("v3-studio");
      if (studio) {
        var d = el("div", "rc-deco rc-console-deco", '<span class="plate">Boîte à musique · N° 06 · 声之匣</span>');
        d.insertBefore(img("gramophone", "g"), d.firstChild);
        d.insertBefore(img("musicbox", "m"), d.firstChild);
        studio.appendChild(d);
      }
      var wfTitle = document.querySelector(".rvc-workflow .studio-workflow-title h2");
      if (wfTitle && wfTitle.parentElement) wfTitle.parentElement.insertBefore(el("span", "rc-deco rc-script-label", "L’Atelier des Voix"), wfTitle);
    }
    if (p === "home") {
      var obj = document.querySelector(".h-obj");
      if (obj) obj.appendChild(el("div", "rc-deco rc-letter-deco", '<span class="ribbon"></span><span class="pm"></span><span class="stamp"></span><span class="seal"></span>'));
    }
  }

  /* ---------- 6 · gold-leaf foil with cursor-tracked sheen ---------- */
  var FOIL_SEL = "#v3-studio, .rvc-workflow, #rvc-result, .h-device, .h-rack, a.h-tool, " +
    "body:not([data-page='home']):not([data-page='rvc']) main > div > :is(section, aside):is(.rounded-lg, .rounded-xl), " +
    "body:not([data-page='home']):not([data-page='rvc']) main > :is(section, aside):is(.rounded-lg, .rounded-xl)";
  function buildFoil() {
    var hosts; try { hosts = document.querySelectorAll(FOIL_SEL); } catch (e) { return; }
    hosts.forEach(function (h) {
      if (h.querySelector(":scope > .rc-foil")) return;
      if (getComputedStyle(h).position === "static") h.classList.add("rc-foilhost");
      h.appendChild(el("span", "rc-foil", "<i></i>"));
    });
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || reduced.matches) return;
    var raf = 0, last = null;
    document.addEventListener("pointermove", function (e) {
      if (!isRococo() || reduced.matches) return;
      last = e;
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        var t = last.target && last.target.closest && last.target.closest(FOIL_SEL);
        var f = t && t.querySelector(":scope > .rc-foil > i");
        if (!f) return;
        var r = t.getBoundingClientRect();
        f.style.transform = "translate3d(" + (last.clientX - r.left).toFixed(0) + "px," + (last.clientY - r.top).toFixed(0) + "px,0)";
      });
    }, { passive: true });
  }

  /* ---------- 7 · wax seals on confirm / success ---------- */
  function stamp(x, y) {
    if (!isRococo()) return;
    var s = el("span", "rc-seal-fx");
    s.style.setProperty("--sx", x + "px"); s.style.setProperty("--sy", y + "px");
    document.body.appendChild(s);
    s.addEventListener("animationend", function () { s.remove(); });
    setTimeout(function () { if (s.isConnected) s.remove(); }, 2600);
  }
  function stampStay(host) {
    if (!isRococo() || !host || host.querySelector(":scope > .rc-seal-fx")) return;
    var s = el("span", "rc-seal-fx rc-stay");
    s.style.cssText = "--sx:auto;--sy:auto;left:auto;top:-18px;right:-10px;margin:0;width:70px;height:72px";
    host.appendChild(s);
  }
  function watchSeals() {
    var toast = document.getElementById("toast"), lastText = "", lastAt = 0;
    if (toast) new MutationObserver(function () {
      var txt = (toast.textContent || "").trim();
      if (!txt || toast.classList.contains("opacity-0") || toast.hidden) return;
      var now = Date.now(); if (txt === lastText && now - lastAt < 1500) return;
      lastText = txt; lastAt = now;
      setTimeout(function () { var r = toast.getBoundingClientRect(); if (r.width) stamp(r.left + 32, r.top + r.height / 2); }, 220);
    }).observe(toast, { attributes: true, childList: true, subtree: true, characterData: true });
    var result = document.getElementById("rvc-result");
    if (result) {
      var check = function () { if (!result.hidden && result.querySelector("audio[src], audio source")) stampStay(result); };
      new MutationObserver(check).observe(result, { attributes: true, attributeFilter: ["hidden", "class", "src"], childList: true, subtree: true });
    }
    var convert = document.getElementById("rvc-convert");
    if (convert) convert.addEventListener("click", function () {
      if (convert.disabled) return;
      var r = convert.getBoundingClientRect(); stamp(r.left + 42, r.top + r.height / 2);
    });
  }

  /* ---------- 8 · the shared switcher owns all three styles ---------- */

  /* ---------- 9 · activation ---------- */
  function activate() {
    applySky();
    if (!isRococo() || built) return;
    built = true;
    var layers = buildStage();
    parallax(layers);
    buildHead();
    buildPageFurniture();
    buildFoil();
    watchSeals();
  }
  function init() {
    new MutationObserver(activate).observe(root, { attributes: true, attributeFilter: ["data-ui"] });
    new MutationObserver(relabelHead).observe(root, { attributes: true, attributeFilter: ["lang"] });
    document.addEventListener("visibilitychange", function () { root.classList.toggle("rc-hidden", document.hidden); });
    // let the page's own scripts render header/footer/cards first
    if (isRococo()) {
      if (window.requestIdleCallback) window.requestIdleCallback(activate, { timeout: 400 });
      else setTimeout(activate, 0);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
