/*! PostPrep · Blue Archive theme pack — runtime (no dependencies, CSP-safe: external file, no eval)
 *  - Adds data-ui="ba" as the fourth option of the existing .style-toggle
 *    (glass → classic → rococo → ba → glass), persisted under the same key "postprep-ui-style".
 *  - Second-level switch html[data-ba="koyuki|hoshino|momoi|kei|shiroko"], persisted under "postprep-ba",
 *    driven by a header radiogroup of five avatar buttons and by window.PostPrepBA.set(name).
 *  - Everything it builds is decoration (aria-hidden, pointer-events:none) except the avatar
 *    switcher and the corner chibi, which are real buttons. Never touches ids, data-* hooks,
 *    forms or listeners of the app. Motion: transform/opacity; honours prefers-reduced-motion.
 */
(function () {
  "use strict";
  var KEY = "postprep-ui-style", SUB_KEY = "postprep-ba", TIME_KEY = "postprep-ba-time";
  var NAMES = ["koyuki", "hoshino", "momoi", "kei", "shiroko"];
  var root = document.documentElement;
  var reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isBA() { return root.dataset.ui === "ba"; }
  function valid(n) { return NAMES.indexOf(n) >= 0; }

  /* ---------- 1 · boot: runs synchronously in <head>, after liquid-ui.js (and rococo.js) ---------- */
  if (get(KEY) === "ba") root.dataset.ui = "ba";
  var urlSub = (location.search.match(/[?&]ba=(koyuki|hoshino|momoi|kei|shiroko)\b/) || [])[1];
  if (urlSub) put(SUB_KEY, urlSub);
  root.dataset.ba = valid(urlSub) ? urlSub : valid(get(SUB_KEY)) ? get(SUB_KEY) : "koyuki";

  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var themeOriginal = themeMeta && (themeMeta.getAttribute("data-postprep-original") || themeMeta.getAttribute("content"));
  var TINT = { koyuki: ["#fbf3fb", "#1a1230"], hoshino: ["#eef7fb", "#081a30"], momoi: ["#fff3f8", "#1d0f1f"], kei: ["#eef5ff", "#050f1f"], shiroko: ["#eff5f8", "#0a1520"] };
  function night() {
    var o = (location.search.match(/[?&]ba-time=(day|night)\b/) || [])[1] || get(TIME_KEY);
    if (o === "day" || o === "night") return o === "night";
    var h = new Date().getHours();
    return darkMQ.matches || h < 6 || h >= 19;
  }
  function applyTime() {
    var n = night();
    if (n) root.setAttribute("data-ba-night", ""); else root.removeAttribute("data-ba-night");
    if (themeMeta && isBA()) themeMeta.setAttribute("content", TINT[root.dataset.ba][n ? 1 : 0]);
    else if (themeMeta && root.dataset.ui !== "rococo") themeMeta.setAttribute("content", themeOriginal);
  }
  applyTime();
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", applyTime);
  setInterval(applyTime, 10 * 60 * 1000);

  /* ---------- 2 · vocabulary ---------- */
  var CHAR = {
    koyuki:  { zh: "小雪", en: "Koyuki",  ja: "コユキ", school: "Millennium", schoolZh: "千年科学学园", club: "Seminar", clubZh: "研讨会", no: "01",
               lines: ["嘿嘿，密码我早就猜到啦～", "这枚硬币……正面就归我！", "才、才没有偷偷溜出来！", "要不要来赌一把？"],
               linesEn: ["Hehe, I already guessed the password~", "Heads, and it's mine!", "I-I didn't sneak out!", "Wanna bet on it?"] },
    hoshino: { zh: "星野", en: "Hoshino", ja: "ホシノ", school: "Abydos", schoolZh: "阿拜多斯高中", club: "Foreclosure Task Force", clubZh: "对策委员会", no: "02",
               lines: ["呼啊……再睡五分钟嘛～", "大叔我今天也很努力了哦。", "海边的风，很舒服呢。", "老师，一起午睡吗？"],
               linesEn: ["Yawn… five more minutes~", "This old lady worked hard today.", "The sea breeze feels nice.", "Sensei, nap with me?"] },
    momoi:   { zh: "小桃", en: "Momoi",   ja: "モモイ", school: "Millennium", schoolZh: "千年科学学园", club: "Game Development Dept.", clubZh: "游戏开发部", no: "03",
               lines: ["PRESS START！新的冒险开始啦！", "这关我闭着眼都能过！", "存档、存档！先存档！", "Combo×99！"],
               linesEn: ["PRESS START! A new quest begins!", "I could beat this level blindfolded!", "Save first! Save first!", "Combo ×99!"] },
    kei:     { zh: "柯伊", en: "Kei",     ja: "ケイ",   school: "Millennium", schoolZh: "千年科学学园", club: "Game Development Dept.", clubZh: "游戏开发部", no: "04",
               lines: ["系统在线。等待指令。", "数据同步率 100%。", "……这个，叫做“开心”吗？", "正在解析声纹。"],
               linesEn: ["System online. Awaiting input.", "Sync rate 100%.", "…Is this what they call 'fun'?", "Analysing voiceprint."] },
    shiroko: { zh: "白子", full: "砂狼白子", en: "Shiroko", ja: "シロコ", school: "Abydos", schoolZh: "阿拜多斯高中", club: "Foreclosure Task Force", clubZh: "对策委员会", no: "05",
               lines: ["嗯。今早骑了四十公里。", "老师，一起去兜风吗？", "……抢银行？开玩笑的。", "为了阿拜多斯，我会加油。"],
               linesEn: ["Mm. Forty kilometres this morning.", "Sensei, want to go for a ride?", "…Rob a bank? Just kidding.", "For Abydos, I'll do my best."] }
  };
  var PAGES = {
    home: ["LOBBY", "大厅"], length: ["TASK 01", "长度检查"], hashtags: ["TASK 02", "标签整理"], formatter: ["TASK 03", "排版整理"],
    generator: ["TASK 04", "灵感生成"], rvc: ["VOICE", "声纹终端"], trust: ["TASK 05", "可信发布"], passport: ["ID", "学生证"],
    skills: ["CLUB", "社团活动"], privacy: ["NOTICE", "公告"], "404": ["LOST", "迷路了"]
  };
  var CONSOLE = {
    koyuki: ["VAULT · SEMINAR", "金库密码锁"], hoshino: ["SONAR · ABYDOS", "深海声呐"],
    momoi: ["GAME CONSOLE · G.D.D.", "游戏主机"], kei: ["HOLO TERMINAL · K-4", "全息终端"],
    shiroko: ["ROUTE · ABYDOS", "骑行路线"]
  };
  var page = function () { return (document.body && document.body.dataset.page) || "home"; };
  var isEn = function () { return (root.lang || "").indexOf("en") === 0; };
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; n.setAttribute("aria-hidden", "true"); return n; }
  function txt(node, sel, s) { var t = node && node.querySelector(sel); if (t) t.textContent = s; }

  /* ---------- 3 · sub-theme switch ---------- */
  var listeners = [];
  function setSub(name, opts) {
    if (!valid(name)) return false;
    var prev = root.dataset.ba;
    if (!(opts && opts.noStore)) put(SUB_KEY, name);
    if (prev === name) { syncSwitch(); return true; }
    var fxOld = fxBefore();
    root.dataset.ba = name;
    fxSwitch(fxOld);
    root.classList.remove("ba-swap"); void root.offsetWidth; root.classList.add("ba-swap");
    setTimeout(function () { root.classList.remove("ba-swap"); }, 620);
    applyTime(); syncSwitch(); relabel();
    try { document.dispatchEvent(new CustomEvent("postprep:ba-change", { detail: { name: name, previous: prev } })); } catch (e) {}
    listeners.forEach(function (f) { try { f(name, prev, opts || {}); } catch (e) {} });
    return true;
  }

  /* ---------- 3b · transition choreography (see css/60-motion.css) ---------- */
  var motionMQ = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function calm() { return motionMQ.matches || root.dataset.motion === "reduced" || !isBA() || document.hidden; }
  function fxLayer(ms) {
    var l = document.createElement("div"); l.className = "ba-fx-layer"; l.setAttribute("aria-hidden", "true");
    (document.body || root).appendChild(l);
    setTimeout(function () { if (l.parentNode) l.parentNode.removeChild(l); }, ms || 700);
    return l;
  }
  function fxBefore() {
    if (calm() || !document.body) return null;
    var o = { tint: getComputedStyle(root).getPropertyValue("--ba-p").trim() };
    var p = heroArt && heroArt.querySelector(".ba-art-portrait");
    if (p) { var cs = getComputedStyle(p); o.ghost = p.cloneNode(false); o.ghost.className = "ba-art-ghost"; o.ghost.style.cssText = "background:" + cs.backgroundImage + " " + cs.backgroundPosition + "/" + cs.backgroundSize + " no-repeat;inset:0;filter:" + cs.filter; }
    return o;
  }
  function fxSwitch(o) {
    if (!o || calm()) return;
    var l = fxLayer(700);
    if (o.tint) l.style.setProperty("--ba-fx-old", o.tint);
    l.innerHTML = '<i class="ba-tint"></i><i class="ba-slash s1"></i><i class="ba-slash s2"></i><i class="ba-slash s3"></i>';
    if (o.ghost && heroArt) { heroArt.appendChild(o.ghost); setTimeout(function () { if (o.ghost.parentNode) o.ghost.parentNode.removeChild(o.ghost); }, 480); }
  }
  var HALO_LOGO = '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5"><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="42" stroke-width="2" stroke-dasharray="6 7"/>' +
    [0, 60, 120, 180, 240, 300].map(function (a) { return '<path d="M50 6v12" transform="rotate(' + a + ' 50 50)"/>'; }).join("") + '<path d="M38 50l8 8 16-18" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function fxEnter() {
    if (calm() || !document.body) return;
    var l = fxLayer(680);
    l.innerHTML = '<div class="ba-load"><div class="ba-load-in">' + HALO_LOGO + '<b>SCHALE</b><i>NOW LOADING</i></div></div>';
  }
  function fxCards() {
    if (calm()) return;
    var vh = window.innerHeight || 800, n = 0;
    var nodes = document.querySelectorAll('main .h-cards > *, main section, main [class*="rounded-2xl"], main [class*="rounded-3xl"], #v3-studio > *');
    for (var i = 0; i < nodes.length && n < 14; i++) {
      var c = nodes[i], r = c.getBoundingClientRect();
      if (r.height < 24 || r.top > vh || r.bottom < 0 || c.closest(".ba-in")) continue;
      c.style.setProperty("--ba-i", n++); c.classList.add("ba-in");
      (function (c) { setTimeout(function () { c.classList.remove("ba-in"); c.style.removeProperty("--ba-i"); }, 1000); })(c);
    }
  }
  function fxPress() {
    document.addEventListener("pointerdown", function (e) {
      if (calm()) return;
      var b = e.target && e.target.closest && e.target.closest('button, [role="button"], .btn, a[class*="btn"]');
      if (!b || b.closest(".ba-chibi")) return;
      var r = b.getBoundingClientRect(); if (r.width > 600 || r.height > 200) return;
      var l = fxLayer(380), f = document.createElement("i"); f.className = "ba-flash";
      f.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
      l.appendChild(f);
    }, { passive: true });
  }
  function fxToast() {
    var t = document.getElementById("toast"); if (!t) return;
    var was = t.classList.contains("opacity-100");
    new MutationObserver(function () {
      var on = t.classList.contains("opacity-100");
      if (on && !was && !calm()) { t.classList.remove("ba-toast-pop"); void t.offsetWidth; t.classList.add("ba-toast-pop"); setTimeout(function () { t.classList.remove("ba-toast-pop"); }, 520); }
      was = on;
    }).observe(t, { attributes: true, attributeFilter: ["class"] });
  }
  window.PostPrepBA = {
    names: NAMES.slice(),
    get: function () { return root.dataset.ba; },
    set: function (n) { return setSub(String(n || "").toLowerCase()); },
    next: function () { return setSub(NAMES[(NAMES.indexOf(root.dataset.ba) + 1) % NAMES.length]); },
    onChange: function (f) { if (typeof f === "function") listeners.push(f); },
    activate: function () { root.dataset.ui = "ba"; put(KEY, "ba"); }
  };

  var switcher = null;
  function buildSwitch() {
    var s = document.createElement("div");
    s.className = "ba-switch";
    s.setAttribute("role", "radiogroup");
    NAMES.forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "ba-pick"; b.setAttribute("role", "radio"); b.dataset.baPick = n;
      b.innerHTML = '<span class="ba-pick-halo" aria-hidden="true"></span><span class="ba-pick-av" aria-hidden="true"></span><span class="ba-pick-tip" aria-hidden="true"></span>';
      b.addEventListener("click", function () { setSub(n); });
      s.appendChild(b);
    });
    s.addEventListener("keydown", function (e) {
      var k = e.key, i = NAMES.indexOf(root.dataset.ba), j = -1;
      if (k === "ArrowRight" || k === "ArrowDown") j = (i + 1) % NAMES.length;
      else if (k === "ArrowLeft" || k === "ArrowUp") j = (i + NAMES.length - 1) % NAMES.length;
      else if (k === "Home") j = 0; else if (k === "End") j = NAMES.length - 1;
      if (j < 0) return;
      e.preventDefault(); setSub(NAMES[j]);
      var t = s.querySelector('[data-ba-pick="' + NAMES[j] + '"]'); if (t) t.focus();
    });
    return s;
  }
  function syncSwitch() {
    if (!switcher) return;
    switcher.setAttribute("aria-label", isEn() ? "Choose a student" : "切换角色");
    switcher.querySelectorAll(".ba-pick").forEach(function (b) {
      var n = b.dataset.baPick, on = n === root.dataset.ba, c = CHAR[n];
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      var label = isEn() ? c.en + " · " + c.school + " " + c.club : (c.full || c.zh) + " · " + c.schoolZh + c.clubZh;
      b.setAttribute("aria-label", label); b.title = label;
      txt(b, ".ba-pick-tip", isEn() ? c.en : c.zh);
    });
  }
  function mountSwitch() {
    var header = document.getElementById("site-header");
    if (!header) return;
    if (!switcher) switcher = buildSwitch();
    if (switcher.isConnected && header.contains(switcher)) return;
    var anchor = header.querySelector(".style-toggle") || header.querySelector("[data-language-toggle]");
    if (!anchor) return;
    anchor.parentElement.insertBefore(switcher, anchor);
    syncSwitch();
  }

  /* ---------- 4 · background stage (all five decor sets; CSS shows the active one) ---------- */
  function rep(n, f) { var s = ""; for (var i = 0; i < n; i++) s += f(i); return s; }
  // polish 2026-11: one line-art motif per student, all drawn in the same 600×600 box with the same stroke and
  // opacity scale (.m-s structure 1px, .m-a accent 1.5px, .m-f tiny fills). Static SVG; motion lives on HTML wrappers.
  function f1(n) { return n.toFixed(1); }
  function polar(r, a) { return [f1(300 + r * Math.cos(a)), f1(300 + r * Math.sin(a))]; }
  // koyuki · vault combination dial: fixed bezel + a turning number ring
  var M_DIAL_BEZEL = '<svg viewBox="0 0 600 600"><g class="m-s"><circle cx="300" cy="300" r="292"/><circle cx="300" cy="300" r="282"/><circle cx="300" cy="300" r="120"/><circle cx="300" cy="300" r="64"/></g>' +
    '<path class="m-a" d="M291 0h18l-9 14z"/><g class="m-s">' + rep(8, function (i) { var a = i * Math.PI / 4 + Math.PI / 8, p = polar(64, a), q = polar(120, a); return '<path d="M' + p[0] + ' ' + p[1] + 'L' + q[0] + ' ' + q[1] + '"/>'; }) + '</g></svg>';
  var M_DIAL_RING = '<svg viewBox="0 0 600 600"><g class="m-s"><circle cx="300" cy="300" r="262"/><circle cx="300" cy="300" r="170"/>' +
    rep(100, function (i) { var a = i * Math.PI / 50 - Math.PI / 2, l = i % 10 ? 10 : 22, p = polar(262, a), q = polar(262 - l, a); return '<path d="M' + p[0] + ' ' + p[1] + 'L' + q[0] + ' ' + q[1] + '"/>'; }) + '</g>' +
    '<path class="m-a" d="M' + polar(170, -Math.PI / 2 - .5).join(' ') + 'A170 170 0 0 1 ' + polar(170, -Math.PI / 2 + .5).join(' ') + '"/></svg>';
  // hoshino · sonar: range rings, bearing ticks; the sweep is a separate rotating layer
  var M_SONAR = '<svg viewBox="0 0 600 600"><g class="m-s">' + [72, 144, 216, 288].map(function (r) { return '<circle cx="300" cy="300" r="' + r + '"/>'; }).join("") +
    '<path d="M300 0V600M0 300H600"/>' + rep(72, function (i) { var a = i * Math.PI / 36, l = i % 6 ? 6 : 14, p = polar(288, a), q = polar(288 - l, a); return '<path d="M' + p[0] + ' ' + p[1] + 'L' + q[0] + ' ' + q[1] + '"/>'; }) + '</g>' +
    '<circle class="m-a" cx="300" cy="300" r="144" stroke-dasharray="2 7"/><circle class="m-f" cx="' + polar(180, -2.2).join('" cy="') + '" r="3"/></svg>';
  // momoi · ordered-dither (Bayer 4×4) pixel field fading out of the corner + one 1UP heart
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var M_PIXEL = '<svg viewBox="0 0 600 600" shape-rendering="crispEdges"><g class="m-px">' + rep(30 * 30, function (k) {
      var x = k % 30, y = Math.floor(k / 30), d = Math.hypot(29 - x, 29 - y) / 29, v = 1 - d * .92;
      return (BAYER[(y % 4) * 4 + x % 4] + .5) / 16 < v ? '<rect x="' + (x * 20 + 4) + '" y="' + (y * 20 + 4) + '" width="12" height="12"/>' : ""; }) + '</g></svg>';
  var M_HEART = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/></svg>';
  // kei · circuit traces converging on a core (orthogonal + 45°), nodes pulse in sequence
  var M_TRACES = "M600 120H470l-40 40v110M600 210H520l-30 30v40M600 400H500M120 600V520l40-40h110M210 600V540l30-30h40M400 600V500M30 330H200l40 40h30M330 30V200l40 40v30M600 470H530l-30-30H400M470 600V530l-30-30V400";
  var M_NODES = [[470, 120], [520, 210], [600, 400], [120, 520], [210, 540], [400, 600], [200, 330], [330, 200], [530, 470], [470, 530]];
  var M_CIRCUIT = '<svg viewBox="0 0 600 600"><g class="m-s"><path d="' + M_TRACES + '"/><rect x="340" y="340" width="120" height="120"/></g>' +
    '<path class="m-a" d="M330 330h140v140H330z M352 352h96v96h-96z"/>' + M_NODES.map(function (n, i) { return '<circle class="m-n" style="--i:' + i + '" cx="' + n[0] + '" cy="' + n[1] + '" r="3.5"/>'; }).join("") + '</svg>';
  // shiroko · route map: contour lines, the Abydos → Schale route, checkpoints
  var M_ROUTE_D = "M60 430 C120 415 130 360 190 352 S290 370 315 310 S350 210 410 205 S470 190 480 130";
  var M_ROUTE = '<svg viewBox="0 0 600 600"><g class="m-s"><path d="M0 500C120 450 200 500 300 450S470 410 600 360M0 410C110 370 180 400 270 350S430 300 600 260M0 320C100 280 170 300 250 250S410 190 600 160" stroke-dasharray="1 5"/>' +
    '<path d="' + M_ROUTE_D + '" stroke-dasharray="6 6"/></g><path class="m-a" d="M60 430 C120 415 130 360 190 352 S290 370 315 310"/>' +
    '<g class="m-cp"><circle cx="60" cy="430" r="5"/><circle cx="190" cy="352" r="5"/><circle cx="315" cy="310" r="5"/></g><circle class="m-f" cx="480" cy="130" r="5"/>' +
    '<text class="m-l" x="60" y="458">ABYDOS</text><text class="m-l e" x="480" y="106">SCHALE</text></svg>';
  function buildStage() {
    var st = el("div", "ba-deco ba-stage");
    st.innerHTML =
      '<i class="ba-grid"></i><i class="ba-plane"></i>' +
      '<div class="ba-set" data-set="koyuki"><span class="ba-motif"><span class="m-layer">' + M_DIAL_BEZEL + '</span><span class="m-layer m-turn">' + M_DIAL_RING + '</span></span></div>' +
      '<div class="ba-set" data-set="hoshino"><span class="ba-motif"><span class="m-layer">' + M_SONAR + '</span><i class="m-sweep"></i></span></div>' +
      '<div class="ba-set" data-set="momoi"><span class="ba-motif"><span class="m-layer">' + M_PIXEL + '</span><span class="m-heart">' + M_HEART + '</span></span></div>' +
      '<div class="ba-set" data-set="kei"><span class="ba-motif"><span class="m-layer">' + M_CIRCUIT + '</span></span></div>' +
      '<div class="ba-set" data-set="shiroko"><span class="ba-motif"><span class="m-layer">' + M_ROUTE + '</span><i class="m-beacon"></i></span></div>';
    document.body.appendChild(st);
  }

  /* ---------- 5 · page head: Kivotos tag chips + school emblem ---------- */
  var head = null;
  function headHost() {
    var p = page();
    if (p === "home") return document.querySelector(".h-hero-copy");
    if (p === "rvc") return document.querySelector(".rvc-page-heading");
    return document.querySelector("main > header") || (document.querySelector("main h1") && document.querySelector("main h1").parentElement);
  }
  function buildHead() {
    var host = headHost(); if (!host) return;
    var h1 = host.querySelector("h1"), anchor = h1;
    while (anchor && anchor.parentElement !== host) anchor = anchor.parentElement;
    if (page() === "404" && host.querySelector(".v3-404-code")) anchor = host.querySelector(".v3-404-code");
    if (!anchor) anchor = host.firstElementChild;
    head = el("div", "ba-deco ba-head", '<span class="ba-emblem"><i></i></span><span class="ba-chip c-code"></span><span class="ba-chip c-page"></span><span class="ba-chip c-who"></span><span class="ba-chip c-school"></span>');
    host.insertBefore(head, anchor);
  }

  /* ---------- 6 · character art: home hero portrait, RVC side portrait ---------- */
  var heroArt = null;
  function buildArt() {
    var p = page(), host = null;
    if (p === "home") host = document.querySelector(".h-stage");
    else if (p === "rvc") host = document.querySelector(".rvc-page-heading");
    if (!host) return;
    heroArt = el("div", "ba-deco ba-art ba-art-" + p,
      '<i class="ba-art-stripes"></i><span class="ba-art-halo"></span><span class="ba-art-portrait"></span>' +
      '<span class="ba-art-plate"><b class="n"></b><i class="ja"></i><em class="s"></em></span>');
    if (getComputedStyle(host).position === "static") host.classList.add("ba-rel");
    host.insertBefore(heroArt, host.firstChild);
  }

  /* ---------- 7 · RVC console furniture (decorative; the app's controls are untouched) ---------- */
  var consoleDeco = null;
  function buildConsole() {
    if (page() !== "rvc") return;
    var studio = document.getElementById("v3-studio"); if (!studio) return;
    consoleDeco = el("div", "ba-deco ba-console",
      '<span class="ba-con-plate"><b></b><i></i></span><span class="ba-con-led"></span>' +
      '<div class="ba-con-set" data-set="koyuki"><span class="lcd">LOCKED · 0000</span></div>' +
      '<div class="ba-con-set" data-set="hoshino"><span class="lcd">DEPTH 0420 m</span></div>' +
      '<div class="ba-con-set" data-set="momoi"><span class="lcd">PRESS START</span></div>' +
      '<div class="ba-con-set" data-set="kei"><span class="brk tl"></span><span class="brk tr"></span><span class="brk bl"></span><span class="brk br"></span><span class="lcd">AL-1S · LINK</span></div>' +
      '<div class="ba-con-set" data-set="shiroko"><span class="lcd">41.6 km · ▲ 128 m</span></div>');
    studio.appendChild(consoleDeco);
  }

  /* ---------- 8 · corner chibi: idles, reacts on click / Enter ---------- */
  var chibi = null, bubbleT = 0, lineIx = 0;
  function buildChibi() {
    chibi = document.createElement("div");
    chibi.className = "ba-chibi-wrap";
    chibi.innerHTML = '<span class="ba-bubble" aria-hidden="true"><b></b><span></span></span><button type="button" class="ba-chibi"><span class="ba-chibi-shadow" aria-hidden="true"></span><span class="ba-chibi-img" aria-hidden="true"></span><span class="ba-chibi-fx" aria-hidden="true"></span></button>';
    var btn = chibi.querySelector(".ba-chibi");
    btn.addEventListener("click", function () {
      var c = CHAR[root.dataset.ba], lines = isEn() ? c.linesEn : c.lines;
      chibi.classList.remove("ba-react"); void btn.offsetWidth; chibi.classList.add("ba-react");
      txt(chibi, ".ba-bubble b", isEn() ? c.en : c.zh);
      txt(chibi, ".ba-bubble span", lines[lineIx++ % lines.length]);
      chibi.classList.add("ba-talk");
      clearTimeout(bubbleT);
      bubbleT = setTimeout(function () { chibi.classList.remove("ba-talk"); chibi.classList.remove("ba-react"); }, 2600);
    });
    document.body.appendChild(chibi);
  }

  function relabel() {
    var c = CHAR[root.dataset.ba], en = isEn(), pg = PAGES[page()] || PAGES.home;
    if (head) {
      txt(head, ".c-code", "SCHALE · " + pg[0]);
      txt(head, ".c-page", en ? (page() === "home" ? "Lobby" : pg[0]) : pg[1]);
      txt(head, ".c-who", en ? c.en : c.zh + " " + c.ja);
      txt(head, ".c-school", en ? c.school + " · " + c.club : c.schoolZh + " · " + c.clubZh);
    }
    if (heroArt) {
      txt(heroArt, ".n", c.en.toUpperCase());
      txt(heroArt, ".ja", en ? c.ja : c.zh);
      txt(heroArt, ".s", (en ? c.school + " · " + c.club : c.schoolZh + " · " + c.clubZh));
    }
    if (consoleDeco) { txt(consoleDeco, ".ba-con-plate b", CONSOLE[root.dataset.ba][0]); txt(consoleDeco, ".ba-con-plate i", en ? "No." + c.no : CONSOLE[root.dataset.ba][1] + " · No." + c.no); }
    if (chibi) { var b = chibi.querySelector(".ba-chibi"); b.setAttribute("aria-label", en ? "Poke " + c.en : "戳一下" + c.zh); b.title = b.getAttribute("aria-label"); }
    syncSwitch();
  }

  /* ---------- 9 · BA touch effect: a light-blue ring burst where you tap ---------- */
  function tapFx() {
    document.addEventListener("pointerdown", function (e) {
      if (!isBA() || reduced.matches || e.button > 0) return;
      var f = el("span", "ba-tap");
      f.style.setProperty("--tx", e.clientX + "px"); f.style.setProperty("--ty", e.clientY + "px");
      f.innerHTML = "<i></i><i></i><i></i>";
      document.body.appendChild(f);
      var gone = function () { if (f.parentNode) f.parentNode.removeChild(f); };
      f.addEventListener("animationend", function (ev) { if (ev.target === f) gone(); });
      setTimeout(gone, 900);
    }, { passive: true });
  }

  /* The shared theme controller owns style selection and labels. */
  window.addEventListener("storage", function (e) {
    if (e.key === SUB_KEY) setSub(valid(e.newValue) ? e.newValue : "koyuki", { noStore: true });
    if (e.key === TIME_KEY) applyTime();
  });

  /* ---------- 10b · studio voice follows the character (RVC page only) ---------- */
  var VOICE = { koyuki: "koyuki", hoshino: "hoshino", momoi: "momoi", kei: "key", shiroko: "shiroko" };
  var userPicked = false, voiceRevision = 0;
  function voiceCard(name) { return document.querySelector('#rvc-model-gallery [data-model-id="' + VOICE[name] + '"]'); }
  function syncVoice(force) {
    if (!isBA() || !document.getElementById("rvc-model-gallery")) return;
    if (userPicked && !force) return;
    var tries = 0, revision = ++voiceRevision;
    (function attempt() {
      if (revision !== voiceRevision || !isBA()) return;
      var c = voiceCard(root.dataset.ba);
      if (c) { if (c.getAttribute("aria-selected") !== "true") { c.__baAuto = true; c.click(); c.__baAuto = false; } return; }
      if (++tries < 40) setTimeout(attempt, 250);
    })();
  }
  /* the studio's voice caption only watched attribute changes, but the gallery re-renders its cards,
     so the caption stayed on the first voice (Hoshino). Resync it on any gallery change, in every skin. */
  (function fixStudioCaption() {
    function sync() {
      var cap = document.querySelector("#v3-studio .v3-studio-voice"); if (!cap) return;
      var p = document.querySelector('#rvc-model-gallery [data-model-id][aria-selected="true"] p');
      var txt = p && p.textContent ? p.textContent.trim() : "";
      if (txt && cap.textContent !== txt) cap.textContent = txt;
    }
    function hook() {
      var g = document.getElementById("rvc-model-gallery"); if (!g) return false;
      new MutationObserver(sync).observe(g, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
      new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
      sync(); return true;
    }
    if (!hook()) { var n = 0, t = setInterval(function () { if (hook() || ++n > 40) clearInterval(t); }, 250); }
  })();
  document.addEventListener("click", function (e) {
    var c = e.target && e.target.closest && e.target.closest("#rvc-model-gallery [data-model-id]");
    if (c && !c.__baAuto && e.isTrusted) { userPicked = true; voiceRevision++; }
  }, true);
  listeners.push(function (name, previous, opts) {
    if (opts.noStore) return; // Other tabs must not change this tab’s selected voice.
    userPicked = false; syncVoice(true);
  });

  /* ---------- 11 · activation ---------- */
  var built = false;
  function activate() {
    applyTime();
    if (!isBA()) return;
    mountSwitch();
    if (page() === "rvc") syncVoice(false);
    if (built) return;
    built = true;
    buildStage(); buildHead(); buildArt(); buildConsole(); buildChibi(); tapFx(); fxPress(); fxToast();
    relabel();
    if (document.readyState === "complete") fxCards(); else window.addEventListener("load", fxCards, { once: true });
  }
  function init() {
    var header = document.getElementById("site-header");
    if (header) new MutationObserver(function () { if (switcher) mountSwitch(); }).observe(header, { childList: true, subtree: true });
    var lastUi = root.dataset.ui;
    new MutationObserver(function () { var was = lastUi; lastUi = root.dataset.ui; activate(); if (isBA() && was !== "ba") { fxEnter(); setTimeout(fxCards, 240); } }).observe(root, { attributes: true, attributeFilter: ["data-ui"] });
    new MutationObserver(function () { relabel(); }).observe(root, { attributes: true, attributeFilter: ["lang"] });
    document.addEventListener("visibilitychange", function () { root.classList.toggle("ba-hidden", document.hidden); });
    if (isBA()) (window.requestIdleCallback || setTimeout)(activate, { timeout: 400 });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
