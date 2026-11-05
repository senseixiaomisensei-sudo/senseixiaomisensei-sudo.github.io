/*! PostPrep · Blue Archive theme pack — runtime (no dependencies, CSP-safe: external file, no eval)
 *  - Adds data-ui="ba" as the fourth option of the existing .style-toggle
 *    (glass → classic → rococo → ba → glass), persisted under the same key "postprep-ui-style".
 *  - Second-level switch html[data-ba="koyuki|hoshino|momoi|kei"], persisted under "postprep-ba",
 *    driven by a header radiogroup of four avatar buttons and by window.PostPrepBA.set(name).
 *  - Everything it builds is decoration (aria-hidden, pointer-events:none) except the avatar
 *    switcher and the corner chibi, which are real buttons. Never touches ids, data-* hooks,
 *    forms or listeners of the app. Motion: transform/opacity; honours prefers-reduced-motion.
 */
(function () {
  "use strict";
  var KEY = "postprep-ui-style", SUB_KEY = "postprep-ba", TIME_KEY = "postprep-ba-time";
  var NAMES = ["koyuki", "hoshino", "momoi", "kei"];
  var root = document.documentElement;
  var reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isBA() { return root.dataset.ui === "ba"; }
  function valid(n) { return NAMES.indexOf(n) >= 0; }

  /* ---------- 1 · boot: runs synchronously in <head>, after liquid-ui.js (and rococo.js) ---------- */
  if (get(KEY) === "ba") root.dataset.ui = "ba";
  var urlSub = (location.search.match(/[?&]ba=(koyuki|hoshino|momoi|kei)\b/) || [])[1];
  if (urlSub) put(SUB_KEY, urlSub);
  root.dataset.ba = valid(urlSub) ? urlSub : valid(get(SUB_KEY)) ? get(SUB_KEY) : "koyuki";

  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var themeOriginal = themeMeta && (themeMeta.getAttribute("data-postprep-original") || themeMeta.getAttribute("content"));
  var TINT = { koyuki: ["#fbf3fb", "#1a1230"], hoshino: ["#eef7fb", "#081a30"], momoi: ["#fff3f8", "#1d0f1f"], kei: ["#eef5ff", "#050f1f"] };
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
               linesEn: ["System online. Awaiting input.", "Sync rate 100%.", "…Is this what they call 'fun'?", "Analysing voiceprint."] }
  };
  var PAGES = {
    home: ["LOBBY", "大厅"], length: ["TASK 01", "长度检查"], hashtags: ["TASK 02", "标签整理"], formatter: ["TASK 03", "排版整理"],
    generator: ["TASK 04", "灵感生成"], rvc: ["VOICE", "声纹终端"], trust: ["TASK 05", "可信发布"], passport: ["ID", "学生证"],
    skills: ["CLUB", "社团活动"], privacy: ["NOTICE", "公告"], "404": ["LOST", "迷路了"]
  };
  var CONSOLE = {
    koyuki: ["VAULT · SEMINAR", "金库密码锁"], hoshino: ["SONAR · ABYDOS", "深海声呐"],
    momoi: ["GAME CONSOLE · G.D.D.", "游戏主机"], kei: ["HOLO TERMINAL · K-4", "全息终端"]
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
      var label = isEn() ? c.en + " · " + c.school + " " + c.club : c.zh + " · " + c.schoolZh + c.clubZh;
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

  /* ---------- 4 · background stage (all four decor sets; CSS shows the active one) ---------- */
  function rep(n, f) { var s = ""; for (var i = 0; i < n; i++) s += f(i); return s; }
  // per-item custom properties (CSS calc() has no modulo): index, i mod 2/3/4 and two scattered offsets
  function vars(i) { return 'style="--i:' + i + ";--m2:" + i % 2 + ";--m3:" + i % 3 + ";--m4:" + i % 4 + ";--r1:" + (i * 37) % 70 + ";--r2:" + (i * 53) % 78 + '"'; }
  var KEYPAD = '<svg viewBox="0 0 120 150"><rect x="4" y="4" width="112" height="142" rx="10"/><rect class="scr" x="16" y="14" width="88" height="24" rx="4"/><text x="60" y="32">* * * *</text>' +
    rep(12, function (i) { var x = 16 + (i % 3) * 32, y = 48 + Math.floor(i / 3) * 24; return '<rect x="' + x + '" y="' + y + '" width="24" height="18" rx="4"/><text class="k" x="' + (x + 12) + '" y="' + (y + 13) + '">' + "123456789*0#".charAt(i) + "</text>"; }) + "</svg>";
  var WHALE = '<svg viewBox="0 0 160 90"><path d="M10 52c0-22 26-38 62-38 34 0 58 16 66 34l14-14c3-3 8-1 7 3l-6 22 8 10c2 3-1 7-5 5l-14-6c-10 12-36 18-62 16C34 82 10 72 10 52z"/><circle cx="44" cy="46" r="4" class="e"/><path class="e" d="M30 60c8 6 22 6 30 0" fill="none"/></svg>';
  var PAD = '<svg viewBox="0 0 200 110"><rect x="6" y="14" width="188" height="82" rx="41"/><path class="d" d="M46 38h14v14h14v14H60v14H46V66H32V52h14z"/><circle class="b1" cx="150" cy="44" r="9"/><circle class="b2" cx="168" cy="60" r="9"/><circle class="b3" cx="132" cy="60" r="9"/><circle class="b4" cx="150" cy="76" r="9"/></svg>';
  var CIRCUIT = '<svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice"><path d="M0 60h120l30 30h90l20-20h140M0 180h60l40 40h120l30-30h150M40 400V300l40-40h90l30 30v110M260 0v70l30 30v80l-30 30v60M330 400V310l30-30h40"/>' +
    '<circle cx="150" cy="90" r="5"/><circle cx="260" cy="70" r="5"/><circle cx="100" cy="220" r="5"/><circle cx="290" cy="100" r="5"/><circle cx="170" cy="260" r="5"/><circle cx="360" cy="280" r="5"/></svg>';
  function buildStage() {
    var st = el("div", "ba-deco ba-stage");
    st.innerHTML =
      '<i class="ba-grid"></i><i class="ba-shard s1"></i><i class="ba-shard s2"></i><i class="ba-shard s3"></i><i class="ba-sweep"></i>' +
      '<div class="ba-set" data-set="koyuki">' + rep(9, function (i) { return '<i class="star" ' + vars(i) + '></i>'; }) + rep(4, function (i) { return '<i class="coin" ' + vars(i) + '></i>'; }) +
        '<span class="keypad">' + KEYPAD + '</span><span class="pw">PASSWORD · ****</span><span class="pw p2">1 2 ? 4</span></div>' +
      '<div class="ba-set" data-set="hoshino"><i class="sea"></i><i class="wave w1"></i><i class="wave w2"></i><i class="sand"></i>' + rep(10, function (i) { return '<i class="bub" ' + vars(i) + '></i>'; }) +
        '<span class="whale">' + WHALE + '</span><span class="tag">ABYDOS · 对策委员会</span></div>' +
      '<div class="ba-set" data-set="momoi">' + rep(10, function (i) { return '<i class="px" ' + vars(i) + '></i>'; }) + rep(3, function (i) { return '<i class="heart" ' + vars(i) + '></i>'; }) +
        '<span class="pad">' + PAD + '</span><span class="start">PRESS START</span><span class="score">1UP 000990 · HI 999999</span></div>' +
      '<div class="ba-set" data-set="kei"><span class="circuit">' + CIRCUIT + '</span><i class="scan"></i>' + rep(6, function (i) { return '<i class="stream" ' + vars(i) + ' data-s="' + ["0x4B 0x45 0x49", "01001011", "SYNC 100%", "AL-1S", "0xFF 0x00", "10110100"][i] + '"></i>'; }) +
        '<i class="ring r1"></i><i class="ring r2"></i></div>';
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
      '<i class="ba-art-stripes"></i><i class="ba-art-tri t1"></i><i class="ba-art-tri t2"></i><span class="ba-art-halo"></span><span class="ba-art-portrait"></span>' +
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
      '<div class="ba-con-set" data-set="koyuki"><span class="keypad">' + KEYPAD + '</span><i class="bolt b1"></i><i class="bolt b2"></i><i class="bolt b3"></i><i class="bolt b4"></i><span class="dial"></span><span class="lcd">LOCKED · 0000</span></div>' +
      '<div class="ba-con-set" data-set="hoshino"><span class="sonar"><i></i></span>' + rep(6, function (i) { return '<i class="bub" ' + vars(i) + '></i>'; }) + '<span class="depth">DEPTH 0420 m</span><span class="whale">' + WHALE + '</span></div>' +
      '<div class="ba-con-set" data-set="momoi"><span class="pad">' + PAD + '</span><span class="start">PRESS START</span><span class="hp"><b>HP</b><i></i></span><span class="lv">LV.99</span></div>' +
      '<div class="ba-con-set" data-set="kei"><span class="circuit">' + CIRCUIT + '</span><i class="scan"></i><span class="brk tl"></span><span class="brk tr"></span><span class="brk bl"></span><span class="brk br"></span><span class="data"></span></div>');
    studio.appendChild(consoleDeco);
    var data = consoleDeco.querySelector(".data");
    if (data) data.textContent = rep(18, function (i) { return ((i * 7919) % 65536).toString(16).toUpperCase().padStart(4, "0") + " "; });
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
  var VOICE = { koyuki: "koyuki", hoshino: "hoshino", momoi: "momoi", kei: "key" };
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
