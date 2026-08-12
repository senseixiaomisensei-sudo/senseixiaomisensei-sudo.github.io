(() => {
  "use strict";

  const LANGUAGE_KEY = "postprep-language";
  const VERIFIED_DATE = "2026-08-06";
  const CONFIGURED_CLOUD_TEXT_ENDPOINT = typeof globalThis.POSTPREP_API_ENDPOINT === "string"
    ? globalThis.POSTPREP_API_ENDPOINT.trim()
    : "";
  const CONFIGURED_TURNSTILE_SITE_KEY = typeof globalThis.POSTPREP_TURNSTILE_SITE_KEY === "string"
    ? globalThis.POSTPREP_TURNSTILE_SITE_KEY.trim()
    : "";
  const CLOUD_TEXT_ENDPOINT = CONFIGURED_CLOUD_TEXT_ENDPOINT || "/api/text";
  const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const TURNSTILE_ACTION = "postprep_text";
  const TURNSTILE_PLACEHOLDER_PATTERN = /(?:YOUR_|PASTE_|REPLACE_|INSERT_)/i;
  const IS_GITHUB_PAGES_HOST = typeof window !== "undefined"
    && window.location.hostname.toLowerCase().endsWith(".github.io");
  let turnstileApiPromise = null;
  let turnstileRequestSequence = 0;

  const translations = {
    zh: {
      shared: {
        tagline: "发布前检查",
        home: "首页",
        length: "长度检查",
        hashtags: "标签整理",
        formatter: "排版整理",
        generator: "灵感生成",
        privacy: "隐私",
        language: "EN",
        languageLabel: "切换至 English",
        menu: "打开导航",
        closeMenu: "关闭导航",
        copy: "复制",
        clear: "清空",
        copied: "已复制到剪贴板",
        copyFallback: "请手动复制结果",
        nothingToCopy: "还没有可复制的内容",
        privacyShort: "基础工具在本机处理；生成或深度处理需主动点击并由服务端代理。",
        adLabel: "广告",
      },
      home: {
        eyebrow: "FOR CREATOR WORKFLOWS",
        title: "发布前，把文案收拾得更利落。",
        intro: "一个轻量、双语、无需登录的创作者工具站。基础整理留在浏览器，云端深度处理只在部署启用且你主动点击时工作。",
        openTools: "打开工具",
        toolHeading: "从你的草稿开始",
        lengthTitle: "文案长度检查",
        lengthBody: "按平台目标查看字符、英文词数与行数。",
        tagTitle: "标签整理",
        tagBody: "统一 # 格式、去重并整理成可直接粘贴的一行。",
        formatTitle: "文案排版整理",
        formatBody: "清掉多余空行与隐形字符，保留你的原意。",
        generatorTitle: "按平台生成文案",
        generatorBody: "输入一句主题、标题或标签，按平台生成可直接编辑的文案或标签。",
        open: "打开",
        privacyHeading: "文案留在你手边",
        privacyBody: "基础工具只在当前网页中计算和整理文字；云端生成或深度处理只有在部署启用且你主动点击时才发送当前主题或文案。",
        noteOne: "中英界面，一键切换",
        noteTwo: "手机与电脑都能使用",
        noteThree: "第三方广告脚本默认不加载",
      },
      length: {
        eyebrow: "TEXT LENGTH CHECKER",
        title: "文案长度检查",
        intro: "选择发布位置，贴入文案，实时查看适配情况。",
        platformLabel: "选择发布位置",
        customLabel: "自定义上限",
        customHint: "留空时使用当前平台目标",
        resetLimit: "恢复平台目标",
        textLabel: "你的文案",
        textPlaceholder: "在这里粘贴标题或文案...",
        characters: "字符",
        englishWords: "英文词数",
        lines: "行数",
        currentTarget: "当前目标",
        noText: "等待输入",
        ready: "贴入文案后开始检查",
        good: "长度在目标范围内",
        near: "接近目标上限",
        over: "超过当前目标",
        official: "平台规则",
        suggested: "建议目标",
        officialHint: "规则仍以平台发布页面为准。",
        suggestedHint: "这是建议目标，不是平台的绝对限制。",
        source: "规则说明",
        sourceUnavailable: "没有可引用的官方上限；请在发布页再次确认。",
        openSource: "查看来源",
        settingsNote: "字符统计按用户可见字符计算；表情符号、换行和各平台的实际计数方式可能不同。",
        update: "最后核对",
      },
      hashtags: {
        eyebrow: "HASHTAG CLEANER",
        title: "标签整理",
        intro: "把零散标签处理成干净、可直接粘贴的一行。",
        inputLabel: "原始标签",
        inputPlaceholder: "一行一个，或用空格、逗号分隔\n例如：#创作 生活记录  #创作",
        outputLabel: "整理结果",
        outputPlaceholder: "整理后的标签会显示在这里",
        count: "标签数量",
        inputHint: "支持半角 / 全角 #，自动去重。",
        outputHint: "标签按第一次出现的顺序保留。",
      },
      formatter: {
        eyebrow: "CAPTION FORMATTER",
        title: "文案排版整理",
        intro: "保留原文内容，只清理影响发布的空白与隐藏字符。",
        inputLabel: "原始文案",
        inputPlaceholder: "在这里粘贴文案...",
        outputLabel: "整理后的文案",
        outputPlaceholder: "整理结果会显示在这里",
        removeInvisible: "移除常见隐形字符",
        trimLines: "修整每行首尾空格",
        collapseBlank: "合并多余空行",
        preserved: "原文始终保留在左侧输入框",
        changes: "本次整理",
        removedInvisible: "移除隐形字符",
        collapsedBlank: "合并空行",
        noChanges: "没有需要整理的内容",
      },
      generator: {
        eyebrow: "PLATFORM CONTENT GENERATOR",
        title: "按平台生成文案",
        intro: "输入一句主题、标题或几个标签，选择发布平台和要生成的内容，就能得到可继续编辑的初稿。",
        platformLabel: "发布位置",
        typeLabel: "生成内容",
        caption: "生成文案",
        hashtags: "生成标签",
        inputLabel: "你想写什么",
        inputHint: "一句标题、主题、卖点或 1–3 个标签即可；生成前请确认事实准确。",
        inputPlaceholder: "例如：周末去江苏看初雪",
        generate: "开始生成",
        clear: "清空主题",
        resultLabel: "生成结果",
        resultHint: "结果会结合所选平台的表达方式；发布前请按实际情况调整。",
        resultPlaceholder: "选择平台并输入主题后，点击开始生成",
        selected: "当前选择",
        processing: "正在生成，请稍候…",
        empty: "先输入一个主题、标题或标签",
        noResult: "还没有可复制的生成结果",
      },
      cloud: {
        lengthTitle: "发布建议",
        lengthHint: "根据所选发布位置，给出简短调整方向。",
        lengthAction: "深度建议",
        hashtagTitle: "补充标签",
        hashtagHint: "提取贴近原文的精简标签。",
        hashtagAction: "深度整理",
        formatterTitle: "润色预览",
        formatterHint: "保持原意，调整语句与节奏。",
        formatterAction: "深度润色",
        copySuggestion: "复制建议",
        apply: "采用结果",
        restore: "恢复原文",
        processing: "正在整理，请稍候…",
        empty: "请先粘贴一段文字",
        networkError: "暂未响应，请稍后再试",
        unavailable: "深度处理暂未配置，基础工具可正常使用",
        verification: "请完成人机验证后重试",
        verificationTitle: "请完成人机验证",
        verificationHint: "验证通过后会自动继续处理，无需再次点击开始按钮。",
        verificationWaiting: "正在等待验证…",
        verificationCancel: "取消",
        verificationCancelled: "已取消人机验证",
        verificationTimeout: "人机验证超时，请重试",
        verificationUnavailable: "人机验证暂不可用，请检查网络后重试",
        rateLimited: "请求过于频繁，请稍后再试",
        resultNote: "结果仅供参考，请确认后再发布。",
        applied: "已采用处理结果",
        restored: "已恢复处理前的文本",
        noResult: "还没有可采用的结果",
      },
      privacy: {
        eyebrow: "PRIVACY",
        title: "隐私说明",
        intro: "基础工具在浏览器中本地处理；云端生成或深度处理仅在部署启用且你主动点击后调用。",
        localTitle: "基础工具不会上传",
        localBody: "长度检查、标签整理和排版整理都在你的浏览器内完成。我们不会建立账号、保存草稿或把这些基础工具的输入发送给 PostPrep 服务器。",
        cloudTitle: "云端深度处理（按部署配置）",
        cloudBody: "基础工具不会上传草稿。若当前部署启用了服务端代理，点击深度建议、深度整理、深度润色或按平台生成后，只会发送当前主题或文案来生成结果；未启用时按钮会提示暂不可用。",
        servicesTitle: "静态资源与人机验证",
        servicesBody: "页面样式、图标和首页图片都使用仓库内置资源。你主动使用云端生成或深度处理时，浏览器会向 Cloudflare Turnstile 请求一次性验证令牌；当前公开版本不加载第三方广告脚本。",
        turnstilePolicy: "查看 Cloudflare Turnstile 隐私说明",
        adsTitle: "第三方代码",
        adsBody: "当前公开版本不加载广告、统计或其他任意第三方脚本。云端处理只会访问配置的服务端代理和 Cloudflare Turnstile。若未来启用新的第三方服务，会先完成代码审查并更新本说明与安全策略。",
        controlTitle: "你的选择",
        controlBody: "你可以随时清空输入框、关闭页面或清除浏览器的本地站点数据。只有语言偏好保存在当前浏览器的 localStorage 中。",
        back: "返回首页",
      },
      platform: {
        xiaohongshu: "小红书",
        douyin: "抖音",
        wechat: "公众号",
        tiktok: "TikTok",
        instagram: "Instagram",
        youtube: "YouTube",
        xiaohongshuField: "笔记标题",
        douyinField: "视频文案",
        wechatField: "文章标题",
        tiktokField: "视频说明",
        instagramField: "帖子说明",
        youtubeField: "视频标题",
      },
    },
    en: {
      shared: {
        tagline: "Pre-publish checks",
        home: "Home",
        length: "Length check",
        hashtags: "Hashtags",
        formatter: "Formatter",
        generator: "Generator",
        privacy: "Privacy",
        language: "中文",
        languageLabel: "Switch to Chinese",
        menu: "Open navigation",
        closeMenu: "Close navigation",
        copy: "Copy",
        clear: "Clear",
        copied: "Copied to clipboard",
        copyFallback: "Select and copy the result manually",
        nothingToCopy: "There is nothing to copy yet",
        privacyShort: "Basic tools run locally; optional generation and deep processing use a server-side proxy.",
        adLabel: "Advertisement",
      },
      home: {
        eyebrow: "FOR CREATOR WORKFLOWS",
        title: "Tidy the draft before it goes live.",
        intro: "A lightweight bilingual toolkit for creator publishing. Basic cleanup stays local; optional deep processing runs only when enabled and chosen.",
        openTools: "Open tools",
        toolHeading: "Start with your draft",
        lengthTitle: "Length checker",
        lengthBody: "See characters, English words, and lines against a platform target.",
        tagTitle: "Hashtag cleaner",
        tagBody: "Normalize # formatting, remove duplicates, and prepare one clean line.",
        formatTitle: "Caption formatter",
        formatBody: "Remove extra blank lines and invisible characters without changing your message.",
        generatorTitle: "Platform copy generator",
        generatorBody: "Start with a topic, title, or tags and generate editable platform-ready copy or hashtags.",
        open: "Open",
        privacyHeading: "Keep your draft close",
        privacyBody: "Basic tools calculate and clean text in this page; optional generation or deep processing sends the current topic or draft only after you choose it and the deployment enables it.",
        noteOne: "Chinese and English interface",
        noteTwo: "Comfortable on mobile and desktop",
        noteThree: "Third-party advertising scripts stay disabled",
      },
      length: {
        eyebrow: "TEXT LENGTH CHECKER",
        title: "Length checker",
        intro: "Choose a publishing field, paste your draft, and check it as you work.",
        platformLabel: "Publishing field",
        customLabel: "Custom limit",
        customHint: "Leave blank to use the selected platform target",
        resetLimit: "Use platform target",
        textLabel: "Your draft",
        textPlaceholder: "Paste a title or caption here...",
        characters: "Characters",
        englishWords: "English words",
        lines: "Lines",
        currentTarget: "Current target",
        noText: "Waiting for text",
        ready: "Paste a draft to begin",
        good: "Within the current target",
        near: "Close to the current target",
        over: "Over the current target",
        official: "Platform rule",
        suggested: "Suggested target",
        officialHint: "The publishing screen remains the source of truth.",
        suggestedHint: "This is a suggested target, not a platform hard limit.",
        source: "Rule note",
        sourceUnavailable: "No reliable official cap is linked; confirm in the publishing screen.",
        openSource: "Open source",
        settingsNote: "Characters are counted as visible characters. Symbols, line breaks, and platform counters may behave differently.",
        update: "Last checked",
      },
      hashtags: {
        eyebrow: "HASHTAG CLEANER",
        title: "Hashtag cleaner",
        intro: "Turn scattered tags into one clean, ready-to-paste line.",
        inputLabel: "Raw tags",
        inputPlaceholder: "Use one tag per line, or separate tags with spaces or commas\nExample: #creator daily-life  #creator",
        outputLabel: "Clean result",
        outputPlaceholder: "Your cleaned hashtags will appear here",
        count: "Hashtags",
        inputHint: "Half-width and full-width # are accepted; duplicates are removed.",
        outputHint: "The first appearance determines the final order.",
      },
      formatter: {
        eyebrow: "CAPTION FORMATTER",
        title: "Caption formatter",
        intro: "Keep your words intact while clearing formatting noise before publishing.",
        inputLabel: "Original draft",
        inputPlaceholder: "Paste your draft here...",
        outputLabel: "Clean draft",
        outputPlaceholder: "Your formatted result will appear here",
        removeInvisible: "Remove common invisible characters",
        trimLines: "Trim each line",
        collapseBlank: "Collapse extra blank lines",
        preserved: "Your original draft stays in the left input.",
        changes: "This cleanup",
        removedInvisible: "Invisible characters removed",
        collapsedBlank: "Extra blank lines collapsed",
        noChanges: "Nothing needed cleanup",
      },
      generator: {
        eyebrow: "PLATFORM CONTENT GENERATOR",
        title: "Platform copy generator",
        intro: "Enter a topic, title, or a few tags, choose a publishing platform and output type, then get an editable first draft.",
        platformLabel: "Publishing platform",
        typeLabel: "Generate",
        caption: "Caption",
        hashtags: "Hashtags",
        inputLabel: "What do you want to write about?",
        inputHint: "A title, topic, value point, or 1–3 tags is enough. Check facts before publishing.",
        inputPlaceholder: "Example: A weekend trip to see the first snow in Jiangsu",
        generate: "Generate",
        clear: "Clear topic",
        resultLabel: "Generated result",
        resultHint: "The result follows the selected platform. Review and adjust it before publishing.",
        resultPlaceholder: "Choose a platform, enter a topic, then generate",
        selected: "Selected",
        processing: "Generating…",
        empty: "Enter a topic, title, or tags first",
        noResult: "There is no generated result to copy yet",
      },
      cloud: {
        lengthTitle: "Publishing suggestion",
        lengthHint: "Get a short adjustment direction for the selected publishing field.",
        lengthAction: "Deep suggestion",
        hashtagTitle: "Suggested tags",
        hashtagHint: "Extract a focused set of tags from your text.",
        hashtagAction: "Deep cleanup",
        formatterTitle: "Polish preview",
        formatterHint: "Keep the original intent while smoothing phrasing and rhythm.",
        formatterAction: "Deep polish",
        copySuggestion: "Copy suggestion",
        apply: "Use result",
        restore: "Restore original",
        processing: "Working on it…",
        empty: "Paste some text before starting",
        networkError: "The service is not responding. Please try again later.",
        unavailable: "Deep processing is not configured; the basic tools still work.",
        verification: "Complete the verification and try again.",
        verificationTitle: "Complete verification",
        verificationHint: "Processing continues automatically after verification. You do not need to press the action button again.",
        verificationWaiting: "Waiting for verification…",
        verificationCancel: "Cancel",
        verificationCancelled: "Verification cancelled",
        verificationTimeout: "Verification timed out. Please try again.",
        verificationUnavailable: "Verification is unavailable. Check your network and try again.",
        rateLimited: "Too many requests. Please wait and try again.",
        resultNote: "Review the result before publishing.",
        applied: "Processing result applied",
        restored: "Text from before processing restored",
        noResult: "There is no result to use yet",
      },
      privacy: {
        eyebrow: "PRIVACY",
        title: "Privacy",
        intro: "Basic tools run in this browser; optional generation or deep processing is available only when the deployment enables it and you choose it.",
        localTitle: "Basic tools stay local",
        localBody: "Length checking, hashtag cleaning, and caption formatting run in your browser. PostPrep does not create accounts, save drafts, or send these basic-tool inputs to a PostPrep server.",
        cloudTitle: "Optional deep processing",
        cloudBody: "Basic tools do not upload drafts. When the deployment has a server-side proxy and you choose Deep suggestion, Deep cleanup, Deep polish, or platform generation, only the current topic or draft is sent for a result; otherwise the button reports that the feature is unavailable.",
        servicesTitle: "Static resources and verification",
        servicesBody: "Page styles, icons, and the homepage photo are bundled with this site. When you choose cloud generation or deep processing, the browser requests a one-time verification token from Cloudflare Turnstile; the current public build does not load third-party advertising scripts.",
        turnstilePolicy: "View Cloudflare's Turnstile privacy notice",
        adsTitle: "Third-party code",
        adsBody: "The current public build does not load advertising, analytics, or arbitrary third-party scripts. Cloud processing contacts only the configured server-side proxy and Cloudflare Turnstile. Any future third-party service must be reviewed and documented before it is enabled.",
        controlTitle: "Your control",
        controlBody: "You can clear any input, close the page, or erase local site data at any time. Only your language preference is stored in this browser's localStorage.",
        back: "Back to home",
      },
      platform: {
        xiaohongshu: "Xiaohongshu",
        douyin: "Douyin",
        wechat: "WeChat OA",
        tiktok: "TikTok",
        instagram: "Instagram",
        youtube: "YouTube",
        xiaohongshuField: "Post title",
        douyinField: "Video caption",
        wechatField: "Article title",
        tiktokField: "Video caption",
        instagramField: "Post caption",
        youtubeField: "Video title",
      },
    },
  };

  const PLATFORM_PRESETS = [
    {
      id: "xiaohongshu",
      icon: "fa-book-open",
      labelKey: "platform.xiaohongshu",
      fieldKey: "platform.xiaohongshuField",
      limit: 20,
      ruleType: "suggested",
      lastVerified: VERIFIED_DATE,
      sourceUrl: "",
      sourceKey: "length.sourceUnavailable",
    },
    {
      id: "douyin",
      icon: "fa-play",
      labelKey: "platform.douyin",
      fieldKey: "platform.douyinField",
      limit: 55,
      ruleType: "suggested",
      lastVerified: VERIFIED_DATE,
      sourceUrl: "",
      sourceKey: "length.sourceUnavailable",
    },
    {
      id: "wechat",
      icon: "fa-comment-dots",
      labelKey: "platform.wechat",
      fieldKey: "platform.wechatField",
      limit: 64,
      ruleType: "suggested",
      lastVerified: VERIFIED_DATE,
      sourceUrl: "",
      sourceKey: "length.sourceUnavailable",
    },
    {
      id: "tiktok",
      icon: "fa-music",
      labelKey: "platform.tiktok",
      fieldKey: "platform.tiktokField",
      limit: 4000,
      ruleType: "suggested",
      lastVerified: VERIFIED_DATE,
      sourceUrl: "",
      sourceKey: "length.sourceUnavailable",
    },
    {
      id: "instagram",
      icon: "fa-camera",
      labelKey: "platform.instagram",
      fieldKey: "platform.instagramField",
      limit: 2200,
      ruleType: "suggested",
      lastVerified: VERIFIED_DATE,
      sourceUrl: "",
      sourceKey: "length.sourceUnavailable",
    },
    {
      id: "youtube",
      icon: "fa-circle-play",
      labelKey: "platform.youtube",
      fieldKey: "platform.youtubeField",
      limit: 100,
      ruleType: "official",
      lastVerified: VERIFIED_DATE,
      sourceUrl: "https://support.google.com/youtube/answer/57407?hl=en",
      sourceKey: "length.officialHint",
    },
  ];

  let currentLanguage = localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh";

  function lookup(object, path) {
    return path.split(".").reduce((value, key) => (value ? value[key] : undefined), object);
  }

  function t(path) {
    const value = lookup(translations[currentLanguage], path);
    return value === undefined ? path : value;
  }

  function applyTranslations() {
    document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    });

    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.setAttribute("title", t(element.dataset.i18nTitle));
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
    });

    document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
      element.setAttribute("alt", t(element.dataset.i18nAlt));
    });

    const titleKey = document.body.dataset.titleKey;
    if (titleKey) {
      document.title = t(titleKey) + " | PostPrep";
    }
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.remove("translate-y-3", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("translate-y-0", "opacity-100");
      toast.classList.add("translate-y-3", "opacity-0");
    }, 2600);
  }

  const reducedMotionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };
  const motionValues = new WeakMap();
  const motionFrames = new WeakMap();

  function animateChanged(element, value) {
    if (!element) return;

    const nextValue = String(value);
    if (!motionValues.has(element)) {
      motionValues.set(element, nextValue);
      return;
    }
    if (motionValues.get(element) === nextValue) return;

    motionValues.set(element, nextValue);
    if (reducedMotionQuery.matches) return;

    element.classList.remove("is-updating");
    const previousFrame = motionFrames.get(element);
    if (previousFrame) window.cancelAnimationFrame(previousFrame);

    const frame = window.requestAnimationFrame(() => {
      element.classList.add("is-updating");
      motionFrames.delete(element);
    });
    motionFrames.set(element, frame);
  }

  function switchLanguageWithMotion() {
    const main = document.querySelector("main");
    const applyLanguage = () => {
      currentLanguage = currentLanguage === "zh" ? "en" : "zh";
      localStorage.setItem(LANGUAGE_KEY, currentLanguage);
      applyTranslations();
      document.dispatchEvent(new CustomEvent("postprep:languagechange"));
    };

    if (!main || reducedMotionQuery.matches) {
      applyLanguage();
      return;
    }
    if (main.dataset.motionBusy === "true") return;

    main.dataset.motionBusy = "true";
    main.classList.add("is-content-switching");
    window.setTimeout(() => {
      applyLanguage();
      window.requestAnimationFrame(() => {
        main.classList.remove("is-content-switching");
        window.setTimeout(() => {
          delete main.dataset.motionBusy;
        }, 180);
      });
    }, 110);
  }

  async function copyText(value) {
    if (!value || !value.trim()) {
      showToast(t("shared.nothingToCopy"));
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const helper = document.createElement("textarea");
        helper.value = value;
        helper.setAttribute("readonly", "");
        helper.className = "fixed -left-full top-0 opacity-0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      showToast(t("shared.copied"));
    } catch {
      showToast(t("shared.copyFallback"));
    }
  }

  function renderSharedLayout() {
    const page = document.body.dataset.page || "home";
    const header = document.getElementById("site-header");
    const footer = document.getElementById("site-footer");
    const links = [
      { id: "home", href: "index.html", label: "shared.home" },
      { id: "length", href: "length-checker.html", label: "shared.length" },
      { id: "hashtags", href: "hashtag-cleaner.html", label: "shared.hashtags" },
      { id: "formatter", href: "caption-formatter.html", label: "shared.formatter" },
      { id: "generator", href: "idea-generator.html", label: "shared.generator" },
    ];

    const linkMarkup = links.map((link) => {
      const active = page === link.id;
      const activeClasses = "bg-teal-50 text-brand";
      const defaultClasses = "text-muted hover:bg-zinc-50 hover:text-ink";
      return '<a href="' + link.href + '" class="block rounded-lg px-3 py-2 text-sm font-semibold transition ' + (active ? activeClasses : defaultClasses) + '" ' + (active ? 'aria-current="page"' : "") + '><span data-i18n="' + link.label + '">' + t(link.label) + "</span></a>";
    }).join("");

    if (header) {
      header.innerHTML = '<header class="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">' +
        '<div class="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">' +
          '<a class="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2" href="index.html">' +
            '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>' +
            '<span class="min-w-0"><span class="block truncate text-sm font-black tracking-wide text-ink">PostPrep</span><span class="block truncate text-xs text-muted" data-i18n="shared.tagline">' + t("shared.tagline") + "</span></span>" +
          "</a>" +
          '<nav class="hidden items-center gap-1 md:flex" aria-label="Primary navigation">' + linkMarkup + "</nav>" +
          '<div class="flex items-center gap-2">' +
            '<button type="button" data-language-toggle class="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2" data-i18n-title="shared.languageLabel" data-i18n-aria-label="shared.languageLabel" title="' + t("shared.languageLabel") + '" aria-label="' + t("shared.languageLabel") + '">' +
              '<i class="fa-solid fa-language text-brand" aria-hidden="true"></i><span data-i18n="shared.language">' + t("shared.language") + "</span>" +
            "</button>" +
            '<button type="button" data-menu-toggle class="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-line bg-white text-ink transition hover:border-brand hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 md:hidden" aria-expanded="false" aria-controls="mobile-navigation" aria-label="' + t("shared.menu") + '" title="' + t("shared.menu") + '"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>' +
          "</div>" +
        "</div>" +
        '<nav id="mobile-navigation" class="hidden border-t border-line bg-white px-4 py-3 md:hidden" aria-label="Mobile navigation">' + linkMarkup + "</nav>" +
      "</header>";
    }

    if (footer) {
      footer.innerHTML = '<footer class="border-t border-line bg-white">' +
        '<div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">' +
          '<p class="max-w-xl" data-i18n="shared.privacyShort">' + t("shared.privacyShort") + "</p>" +
          '<a href="privacy.html" class="inline-flex items-center gap-2 font-semibold text-ink underline decoration-zinc-300 underline-offset-4 hover:text-brand" data-i18n="shared.privacy">' + t("shared.privacy") + "</a>" +
        "</div>" +
      "</footer>";
    }
  }

  function initCommon() {
    renderSharedLayout();
    applyTranslations();

    const languageToggle = document.querySelector("[data-language-toggle]");
    if (languageToggle) {
      languageToggle.addEventListener("click", switchLanguageWithMotion);
    }

    const menuToggle = document.querySelector("[data-menu-toggle]");
    const mobileNavigation = document.getElementById("mobile-navigation");
    if (menuToggle && mobileNavigation) {
      menuToggle.addEventListener("click", () => {
        const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
        menuToggle.setAttribute("aria-expanded", String(!isOpen));
        mobileNavigation.classList.toggle("hidden", isOpen);
        const icon = menuToggle.querySelector("i");
        if (icon) {
          icon.className = isOpen ? "fa-solid fa-bars" : "fa-solid fa-xmark";
        }
        menuToggle.setAttribute("aria-label", isOpen ? t("shared.menu") : t("shared.closeMenu"));
      });
    }

    document.querySelectorAll("[data-copy-from]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = document.getElementById(button.dataset.copyFrom);
        copyText(source ? source.value : "");
      });
    });
  }

  function countVisibleCharacters(value) {
    if (!value) return 0;
    if (window.Intl && Intl.Segmenter) {
      return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
    }
    return Array.from(value).length;
  }

  function countEnglishWords(value) {
    if (!value) return 0;
    return (value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
  }

  function countLines(value) {
    return value.trim().length ? value.split(/\r\n|\r|\n/u).length : 0;
  }

  function initLengthChecker() {
    const input = document.getElementById("length-input");
    if (!input) return;

    const presetRoot = document.getElementById("preset-list");
    const customLimit = document.getElementById("custom-limit");
    const resetLimit = document.getElementById("reset-limit");
    const countCharacters = document.getElementById("character-count");
    const countWords = document.getElementById("word-count");
    const countLinesElement = document.getElementById("line-count");
    const currentTarget = document.getElementById("current-target");
    const targetMeta = document.getElementById("target-meta");
    const targetKind = document.getElementById("target-kind");
    const sourceText = document.getElementById("source-text");
    const sourceLink = document.getElementById("source-link");
    const verified = document.getElementById("verified-date");
    const status = document.getElementById("length-status");
    const statusTitle = document.getElementById("length-status-title");
    const statusBody = document.getElementById("length-status-body");
    const progress = document.getElementById("length-progress");
    const cloudAction = document.getElementById("length-cloud-action");
    const cloudResult = document.getElementById("length-cloud-result");
    const cloudOutput = document.getElementById("length-cloud-output");

    let selectedPresetId = PLATFORM_PRESETS[0].id;

    function selectedPreset() {
      return PLATFORM_PRESETS.find((preset) => preset.id === selectedPresetId) || PLATFORM_PRESETS[0];
    }

    function activeLimit() {
      const customValue = Number.parseInt(customLimit.value, 10);
      return Number.isFinite(customValue) && customValue > 0 ? customValue : selectedPreset().limit;
    }

    function clearCloudResult() {
      if (!cloudResult || !cloudOutput) return;
      cloudResult.hidden = true;
      cloudOutput.textContent = "";
    }

    function renderPresetButtons() {
      presetRoot.innerHTML = PLATFORM_PRESETS.map((preset) => {
        const selected = preset.id === selectedPresetId;
        const selectedClasses = "border-brand bg-brand text-white shadow-sm";
        const defaultClasses = "border-zinc-200 bg-white text-ink hover:border-brand hover:bg-teal-50";
        return '<button type="button" class="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ' + (selected ? selectedClasses : defaultClasses) + '" data-preset-id="' + preset.id + '" aria-pressed="' + selected + '"><i class="fa-solid ' + preset.icon + '" aria-hidden="true"></i><span>' + t(preset.labelKey) + "</span></button>";
      }).join("");
      animateChanged(presetRoot, selectedPresetId + "|" + currentLanguage);

      presetRoot.querySelectorAll("[data-preset-id]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedPresetId = button.dataset.presetId;
          customLimit.value = "";
          renderPresetButtons();
          clearCloudResult();
          update();
        });
      });
    }

    function updatePresetInformation(limit) {
      const preset = selectedPreset();
      currentTarget.textContent = String(limit);
      targetMeta.textContent = t(preset.labelKey) + " · " + t(preset.fieldKey);
      targetKind.textContent = t("length." + preset.ruleType);
      verified.textContent = t("length.update") + " " + preset.lastVerified;
      sourceText.textContent = t(preset.sourceKey);
      sourceLink.classList.toggle("hidden", !preset.sourceUrl);
      animateChanged(targetMeta, targetMeta.textContent);
      animateChanged(targetKind, targetKind.textContent);
      animateChanged(verified, verified.textContent);
      animateChanged(sourceText, sourceText.textContent);

      if (preset.sourceUrl) {
        sourceLink.href = preset.sourceUrl;
        sourceLink.textContent = t("length.openSource");
      }
    }

    function statusStyle(kind) {
      const styles = {
        ready: {
          classes: "border-zinc-200 bg-zinc-50 text-zinc-800",
          icon: "fa-circle-info",
          title: t("length.noText"),
          body: t("length.ready"),
        },
        good: {
          classes: "border-emerald-200 bg-emerald-50 text-emerald-900",
          icon: "fa-circle-check",
          title: t("length.good"),
          body: t("length.settingsNote"),
        },
        near: {
          classes: "border-amber-200 bg-amber-50 text-amber-950",
          icon: "fa-triangle-exclamation",
          title: t("length.near"),
          body: t("length.settingsNote"),
        },
        over: {
          classes: "border-rose-200 bg-rose-50 text-rose-950",
          icon: "fa-circle-exclamation",
          title: t("length.over"),
          body: t("length.settingsNote"),
        },
      };
      return styles[kind];
    }

    function update() {
      const value = input.value;
      const limit = activeLimit();
      const characters = countVisibleCharacters(value);
      const words = countEnglishWords(value);
      const lines = countLines(value);

      countCharacters.textContent = String(characters);
      countWords.textContent = String(words);
      countLinesElement.textContent = String(lines);
      updatePresetInformation(limit);
      animateChanged(countCharacters, characters);
      animateChanged(countWords, words);
      animateChanged(countLinesElement, lines);
      animateChanged(currentTarget, limit);

      let kind = "ready";
      if (characters > 0 && characters > limit) {
        kind = "over";
      } else if (characters > 0 && characters / limit >= 0.75) {
        kind = "near";
      } else if (characters > 0) {
        kind = "good";
      }

      const style = statusStyle(kind);
      status.className = "mt-7 flex gap-3 rounded-lg border p-4 " + style.classes;
      statusTitle.innerHTML = '<i class="fa-solid ' + style.icon + ' mr-2" aria-hidden="true"></i>' + style.title;
      statusBody.textContent = style.body;
      animateChanged(status, kind + "|" + currentLanguage);

      const ratio = limit > 0 ? Math.min(characters / limit, 1) : 0;
      progress.style.width = String(Math.round(ratio * 100)) + "%";
      progress.className = "h-full rounded-full transition-[width] duration-200 " + (kind === "over" ? "bg-rose-600" : kind === "near" ? "bg-amber-500" : kind === "good" ? "bg-emerald-600" : "bg-zinc-400");
    }

    input.addEventListener("input", () => {
      clearCloudResult();
      update();
    });
    customLimit.addEventListener("input", () => {
      clearCloudResult();
      update();
    });
    resetLimit.addEventListener("click", () => {
      customLimit.value = "";
      clearCloudResult();
      update();
    });

    document.getElementById("length-clear").addEventListener("click", () => {
      input.value = "";
      customLimit.value = "";
      input.focus();
      clearCloudResult();
      update();
    });

    if (cloudAction && cloudResult && cloudOutput) {
      cloudAction.addEventListener("click", async () => {
        const draft = input.value.trim();
        if (!draft) {
          showToast(t("cloud.empty"));
          input.focus();
          return;
        }

        setCloudBusy(cloudAction, true);
        try {
          const content = await requestCloudText("length", draft, {
            platform: selectedPreset().id,
            limit: activeLimit(),
          });
          cloudOutput.textContent = content;
          cloudResult.hidden = false;
          animateChanged(cloudOutput, content);
        } catch (error) {
          showToast(cloudErrorMessage(error));
        } finally {
          setCloudBusy(cloudAction, false);
        }
      });
    }

    document.addEventListener("postprep:languagechange", () => {
      renderPresetButtons();
      update();
    });

    renderPresetButtons();
    update();
  }

  function normalizeHashtag(rawToken) {
    const normalized = rawToken
      .normalize("NFKC")
      .trim()
      .replace(/^[#＃]+/u, "")
      .replace(/[#＃]+$/u, "")
      .replace(/[，,;；|、]+$/u, "")
      .replace(/\s+/gu, "");

    const safe = normalized.replace(/[^\p{L}\p{N}_-]/gu, "");
    return safe.length ? safe : "";
  }

  function cleanHashtags(value) {
    const candidates = value.replace(/[#＃]/gu, " #").split(/[\s,，;；|、]+/u);
    const seen = new Set();
    const tags = [];

    candidates.forEach((candidate) => {
      const tag = normalizeHashtag(candidate);
      const fingerprint = tag.toLocaleLowerCase();
      if (tag && !seen.has(fingerprint)) {
        seen.add(fingerprint);
        tags.push("#" + tag);
      }
    });

    return tags;
  }

  function initHashtagCleaner() {
    const input = document.getElementById("hashtag-input");
    if (!input) return;

    const output = document.getElementById("hashtag-output");
    const count = document.getElementById("hashtag-count");
    const cloudAction = document.getElementById("hashtag-cloud-action");
    const cloudResult = document.getElementById("hashtag-cloud-result");
    const cloudOutput = document.getElementById("hashtag-cloud-output");

    function update() {
      const tags = cleanHashtags(input.value);
      output.value = tags.join(" ");
      count.textContent = String(tags.length);
      animateChanged(output, output.value);
      animateChanged(count, tags.length);
    }

    function clearCloudResult() {
      if (!cloudResult || !cloudOutput) return;
      cloudResult.hidden = true;
      cloudOutput.value = "";
    }

    input.addEventListener("input", () => {
      clearCloudResult();
      update();
    });
    document.getElementById("hashtag-clear").addEventListener("click", () => {
      input.value = "";
      output.value = "";
      count.textContent = "0";
      clearCloudResult();
      input.focus();
    });

    if (cloudAction && cloudResult && cloudOutput) {
      cloudAction.addEventListener("click", async () => {
        const draft = input.value.trim();
        if (!draft) {
          showToast(t("cloud.empty"));
          input.focus();
          return;
        }

        setCloudBusy(cloudAction, true);
        try {
          const content = await requestCloudText("hashtags", draft);
          const tags = cleanHashtags(content).slice(0, 5);
          if (!tags.length) throw new Error("No usable cloud tags");
          cloudOutput.value = tags.join(" ");
          cloudResult.hidden = false;
          animateChanged(cloudOutput, cloudOutput.value);
        } catch (error) {
          showToast(cloudErrorMessage(error));
        } finally {
          setCloudBusy(cloudAction, false);
        }
      });
    }

    update();
  }

  function countInvisibleCharacters(value) {
    return (value.match(/[\u200B\uFEFF\u2060\u00AD]/gu) || []).length;
  }

  function formatCaption(value, settings) {
    const source = value.replace(/\r\n?|\n/gu, "\n");
    const invisibleBefore = countInvisibleCharacters(source);
    let result = source;
    let collapsed = 0;

    if (settings.removeInvisible) {
      result = result.replace(/[\u200B\uFEFF\u2060\u00AD]/gu, "");
    }

    if (settings.trimLines) {
      result = result
        .split("\n")
        .map((line) => line.replace(/^[\t ]+|[\t ]+$/gu, ""))
        .join("\n");
    }

    if (settings.collapseBlank) {
      const beforeBlankLines = (result.match(/\n{3,}/gu) || []).length;
      result = result.replace(/\n{3,}/gu, "\n\n");
      collapsed = beforeBlankLines;
    }

    if (settings.trimLines) {
      result = result.replace(/^\n+|\n+$/gu, "");
    }

    return {
      result,
      invisibleRemoved: settings.removeInvisible ? invisibleBefore : 0,
      collapsed,
    };
  }

  function stripCodeFence(value) {
    return String(value || "")
      .trim()
      .replace(/^```[\w-]*\s*/u, "")
      .replace(/\s*```$/u, "")
      .trim();
  }

  function setCloudBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
    button.setAttribute("aria-busy", String(busy));
  }

  function isCloudUnavailable(error) {
    return Boolean(error && [
      "CLOUD_UNAVAILABLE_LOCAL",
      "MISSING_SERVER_SECRET",
      "ORIGIN_NOT_ALLOWED",
      "GATEWAY_NOT_CONFIGURED",
      "GATEWAY_NOT_ALLOWED",
      "TURNSTILE_NOT_CONFIGURED",
      "RATE_LIMITER_NOT_CONFIGURED",
      "RATE_LIMITER_UNAVAILABLE",
      "HUMAN_VERIFICATION_UNAVAILABLE",
    ].includes(error.code));
  }

  function cloudErrorMessage(error) {
    if (error && error.code === "RATE_LIMITED") return t("cloud.rateLimited");
    if (error && error.code === "HUMAN_VERIFICATION_CANCELLED") return t("cloud.verificationCancelled");
    if (error && error.code === "HUMAN_VERIFICATION_TIMEOUT") return t("cloud.verificationTimeout");
    if (error && error.code === "HUMAN_VERIFICATION_UNAVAILABLE") return t("cloud.verificationUnavailable");
    if (error && ["HUMAN_VERIFICATION_REQUIRED", "HUMAN_VERIFICATION_FAILED"].includes(error.code)) {
      return t("cloud.verification");
    }
    return isCloudUnavailable(error) ? t("cloud.unavailable") : t("cloud.networkError");
  }

  function turnstileError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function isTurnstileConfigured() {
    return Boolean(CONFIGURED_TURNSTILE_SITE_KEY)
      && !TURNSTILE_PLACEHOLDER_PATTERN.test(CONFIGURED_TURNSTILE_SITE_KEY);
  }

  function loadTurnstileApi() {
    if (window.turnstile && typeof window.turnstile.render === "function") {
      return Promise.resolve(window.turnstile);
    }
    if (turnstileApiPromise) return turnstileApiPromise;

    turnstileApiPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.turnstile && typeof window.turnstile.render === "function") {
          resolve(window.turnstile);
        } else {
          reject(turnstileError("HUMAN_VERIFICATION_UNAVAILABLE", "Turnstile did not initialize"));
        }
      };
      script.onerror = () => reject(turnstileError("HUMAN_VERIFICATION_UNAVAILABLE", "Turnstile failed to load"));
      document.head.append(script);
    }).catch((error) => {
      turnstileApiPromise = null;
      throw error;
    });
    return turnstileApiPromise;
  }

  async function requestTurnstileToken() {
    if (!isTurnstileConfigured()) {
      throw turnstileError("TURNSTILE_NOT_CONFIGURED", "Turnstile site key is not configured");
    }
    if (window.location.protocol === "file:") {
      throw turnstileError("CLOUD_UNAVAILABLE_LOCAL", "Turnstile requires an HTTP(S) page");
    }

    const turnstile = await loadTurnstileApi();
    return new Promise((resolve, reject) => {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const overlay = document.createElement("div");
      const dialog = document.createElement("section");
      const title = document.createElement("h2");
      const hint = document.createElement("p");
      const status = document.createElement("p");
      const mount = document.createElement("div");
      const cancel = document.createElement("button");
      const mountId = `postprep-turnstile-${Date.now()}-${turnstileRequestSequence += 1}`;
      mount.id = mountId;
      overlay.className = "postprep-turnstile-overlay";
      dialog.className = "postprep-turnstile-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", `${mountId}-title`);
      dialog.setAttribute("aria-describedby", `${mountId}-hint`);
      title.id = `${mountId}-title`;
      title.className = "postprep-turnstile-title";
      title.textContent = t("cloud.verificationTitle");
      hint.id = `${mountId}-hint`;
      hint.className = "postprep-turnstile-hint";
      hint.textContent = t("cloud.verificationHint");
      status.className = "postprep-turnstile-status";
      status.setAttribute("aria-live", "polite");
      status.textContent = t("cloud.verificationWaiting");
      mount.className = "postprep-turnstile-widget";
      cancel.type = "button";
      cancel.className = "postprep-turnstile-cancel";
      cancel.textContent = t("cloud.verificationCancel");
      dialog.append(title, hint, status, mount, cancel);
      overlay.append(dialog);
      document.body.append(overlay);

      let widgetId;
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        finish(null, turnstileError("HUMAN_VERIFICATION_TIMEOUT", "Turnstile timed out"));
      }, 60000);

      function onKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null, turnstileError("HUMAN_VERIFICATION_CANCELLED", "Turnstile verification was cancelled"));
        }
      }

      function cleanup() {
        window.clearTimeout(timeoutId);
        document.removeEventListener("keydown", onKeydown);
        if (widgetId !== undefined && typeof turnstile.remove === "function") {
          try {
            turnstile.remove(widgetId);
          } catch {
            // The widget may already have removed itself after a provider error.
          }
        }
        overlay.remove();
        if (previousFocus && document.contains(previousFocus)) {
          try {
            previousFocus.focus({ preventScroll: true });
          } catch {
            previousFocus.focus();
          }
        }
      }

      function finish(token, error) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(token);
      }

      cancel.addEventListener("click", () => {
        finish(null, turnstileError("HUMAN_VERIFICATION_CANCELLED", "Turnstile verification was cancelled"));
      });
      document.addEventListener("keydown", onKeydown);

      try {
        widgetId = turnstile.render(`#${mountId}`, {
          sitekey: CONFIGURED_TURNSTILE_SITE_KEY,
          execution: "render",
          appearance: "always",
          action: TURNSTILE_ACTION,
          language: currentLanguage === "zh" ? "zh-CN" : "en",
          size: "flexible",
          "response-field": false,
          callback: (token) => finish(token),
          "before-interactive-callback": () => {
            status.textContent = t("cloud.verificationWaiting");
          },
          "error-callback": () => finish(null, turnstileError("HUMAN_VERIFICATION_FAILED", "Turnstile verification failed")),
          "expired-callback": () => finish(null, turnstileError("HUMAN_VERIFICATION_FAILED", "Turnstile verification expired")),
          "timeout-callback": () => finish(null, turnstileError("HUMAN_VERIFICATION_FAILED", "Turnstile verification timed out")),
          "unsupported-callback": () => finish(null, turnstileError("HUMAN_VERIFICATION_UNAVAILABLE", "Turnstile is unsupported")),
        });
      } catch {
        finish(null, turnstileError("HUMAN_VERIFICATION_UNAVAILABLE", "Turnstile could not start"));
      }
    });
  }

  async function requestCloudText(action, draft, metadata) {
    if (window.location.protocol === "file:" || (IS_GITHUB_PAGES_HOST && !CONFIGURED_CLOUD_TEXT_ENDPOINT)) {
      const unavailable = new Error("Cloud processing is unavailable in this static deployment");
      unavailable.code = "CLOUD_UNAVAILABLE_LOCAL";
      throw unavailable;
    }

    let controller = null;
    let timeoutId = null;

    try {
      const turnstileToken = await requestTurnstileToken();
      controller = typeof AbortController === "function" ? new AbortController() : null;
      timeoutId = controller
        ? window.setTimeout(() => controller.abort(), 30000)
        : null;
      const response = await fetch(CLOUD_TEXT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          draft,
          language: currentLanguage,
          turnstileToken,
          ...(metadata || {}),
        }),
        signal: controller ? controller.signal : undefined,
      });

      const payload = await response.json().catch(() => null);
      const content = payload && typeof payload.content === "string" ? stripCodeFence(payload.content) : "";
      if (!response.ok) {
        const error = new Error(payload && typeof payload.message === "string" ? payload.message : "Cloud request failed");
        error.code = payload && typeof payload.code === "string" ? payload.code : "CLOUD_REQUEST_FAILED";
        if ((response.status === 404 || response.status === 405) && !CONFIGURED_CLOUD_TEXT_ENDPOINT) {
          error.code = "CLOUD_UNAVAILABLE_LOCAL";
        }
        throw error;
      }

      if (!content) {
        const error = new Error("Empty cloud response");
        error.code = "EMPTY_CLOUD_RESPONSE";
        throw error;
      }
      return content;
    } catch (error) {
      if (error && error.name === "AbortError") {
        error.code = "CLOUD_TIMEOUT";
      }
      throw error;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }

  function initFormatter() {
    const input = document.getElementById("formatter-input");
    if (!input) return;

    const output = document.getElementById("formatter-output");
    const invisibleCount = document.getElementById("invisible-count");
    const blankCount = document.getElementById("blank-count");
    const changesMessage = document.getElementById("formatter-changes");
    const settings = {
      removeInvisible: document.getElementById("remove-invisible"),
      trimLines: document.getElementById("trim-lines"),
      collapseBlank: document.getElementById("collapse-blank"),
    };
    const cloudAction = document.getElementById("formatter-cloud-action");
    const cloudResult = document.getElementById("formatter-cloud-result");
    const cloudOutput = document.getElementById("formatter-cloud-output");
    const cloudApply = document.getElementById("formatter-cloud-apply");
    const cloudRestore = document.getElementById("formatter-cloud-restore");
    let pendingCloudText = "";
    let previousCloudText = null;
    let preserveCloudPreview = false;

    function update() {
      const formatted = formatCaption(input.value, {
        removeInvisible: settings.removeInvisible.checked,
        trimLines: settings.trimLines.checked,
        collapseBlank: settings.collapseBlank.checked,
      });

      output.value = formatted.result;
      invisibleCount.textContent = String(formatted.invisibleRemoved);
      blankCount.textContent = String(formatted.collapsed);
      animateChanged(output, formatted.result);
      animateChanged(invisibleCount, formatted.invisibleRemoved);
      animateChanged(blankCount, formatted.collapsed);

      if (!input.value.trim() || (!formatted.invisibleRemoved && !formatted.collapsed && formatted.result === input.value)) {
        changesMessage.textContent = t("formatter.noChanges");
      } else {
        changesMessage.textContent = t("formatter.changes");
      }
      animateChanged(changesMessage, changesMessage.textContent);
    }

    function clearCloudResult() {
      pendingCloudText = "";
      if (cloudResult) cloudResult.hidden = true;
      if (cloudOutput) cloudOutput.value = "";
      if (cloudRestore && !preserveCloudPreview) {
        previousCloudText = null;
        cloudRestore.disabled = true;
      }
    }

    input.addEventListener("input", () => {
      update();
      if (!preserveCloudPreview) clearCloudResult();
    });
    Object.values(settings).forEach((checkbox) => checkbox.addEventListener("change", update));

    document.getElementById("formatter-clear").addEventListener("click", () => {
      input.value = "";
      output.value = "";
      previousCloudText = null;
      clearCloudResult();
      input.focus();
      update();
    });

    if (cloudAction && cloudResult && cloudOutput && cloudApply && cloudRestore) {
      cloudAction.addEventListener("click", async () => {
        const draft = input.value.trim();
        if (!draft) {
          showToast(t("cloud.empty"));
          input.focus();
          return;
        }

        setCloudBusy(cloudAction, true);
        try {
          const content = await requestCloudText("polish", draft);
          pendingCloudText = content;
          cloudOutput.value = content;
          cloudResult.hidden = false;
          animateChanged(cloudOutput, content);
        } catch (error) {
          showToast(cloudErrorMessage(error));
        } finally {
          setCloudBusy(cloudAction, false);
        }
      });

      cloudApply.addEventListener("click", () => {
        if (!pendingCloudText) {
          showToast(t("cloud.noResult"));
          return;
        }
        previousCloudText = input.value;
        preserveCloudPreview = true;
        input.value = pendingCloudText;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        preserveCloudPreview = false;
        pendingCloudText = "";
        cloudResult.hidden = true;
        cloudOutput.value = "";
        cloudRestore.disabled = false;
        input.focus();
        showToast(t("cloud.applied"));
      });

      cloudRestore.addEventListener("click", () => {
        if (previousCloudText === null) return;
        preserveCloudPreview = true;
        input.value = previousCloudText;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        preserveCloudPreview = false;
        previousCloudText = null;
        cloudRestore.disabled = true;
        input.focus();
        showToast(t("cloud.restored"));
      });
    }

    document.addEventListener("postprep:languagechange", update);
    update();
  }

  function initGenerator() {
    const input = document.getElementById("generator-input");
    if (!input) return;

    const platformList = document.getElementById("generator-platform-list");
    const typeList = document.getElementById("generator-type-list");
    const selectedMeta = document.getElementById("generator-selected-meta");
    const output = document.getElementById("generator-output");
    const generateButton = document.getElementById("generator-action");
    const generateLabel = document.getElementById("generator-action-label");
    const clearButton = document.getElementById("generator-clear");
    let selectedPresetId = PLATFORM_PRESETS[0].id;
    let generationKind = "caption";

    function announceGeneratorResult(hasResult) {
      document.dispatchEvent(new CustomEvent("postprep:generatorresult", {
        detail: {
          hasResult: Boolean(hasResult),
          generationKind: generationKind === "hashtags" ? "hashtags" : "caption",
        },
      }));
    }

    function selectedPreset() {
      return PLATFORM_PRESETS.find((preset) => preset.id === selectedPresetId) || PLATFORM_PRESETS[0];
    }

    function updateSelection() {
      const preset = selectedPreset();
      selectedMeta.textContent = t(preset.labelKey) + " · " + t("generator." + generationKind);
      output.placeholder = t("generator.resultPlaceholder");
      animateChanged(selectedMeta, selectedMeta.textContent);
    }

    function clearResult() {
      output.value = "";
      animateChanged(output, "");
      announceGeneratorResult(false);
    }

    function renderPlatformButtons() {
      platformList.innerHTML = PLATFORM_PRESETS.map((preset) => {
        const selected = preset.id === selectedPresetId;
        const selectedClasses = "border-brand bg-brand text-white shadow-sm";
        const defaultClasses = "border-zinc-200 bg-white text-ink hover:border-brand hover:bg-teal-50";
        return '<button type="button" class="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ' + (selected ? selectedClasses : defaultClasses) + '" data-generator-platform="' + preset.id + '" aria-pressed="' + selected + '"><i class="fa-solid ' + preset.icon + '" aria-hidden="true"></i><span>' + t(preset.labelKey) + "</span></button>";
      }).join("");

      platformList.querySelectorAll("[data-generator-platform]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedPresetId = button.dataset.generatorPlatform;
          clearResult();
          renderPlatformButtons();
          updateSelection();
        });
      });
    }

    function renderGenerationKinds() {
      const kinds = ["caption", "hashtags"];
      typeList.innerHTML = kinds.map((kind) => {
        const selected = kind === generationKind;
        const selectedClasses = "border-brand bg-teal-50 text-brand";
        const defaultClasses = "border-zinc-200 bg-white text-ink hover:border-brand hover:bg-teal-50";
        const icon = kind === "caption" ? "fa-pen-nib" : "fa-hashtag";
        return '<button type="button" class="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ' + (selected ? selectedClasses : defaultClasses) + '" data-generator-kind="' + kind + '" aria-pressed="' + selected + '"><i class="fa-solid ' + icon + '" aria-hidden="true"></i><span>' + t("generator." + kind) + "</span></button>";
      }).join("");

      typeList.querySelectorAll("[data-generator-kind]").forEach((button) => {
        button.addEventListener("click", () => {
          generationKind = button.dataset.generatorKind;
          clearResult();
          renderGenerationKinds();
          updateSelection();
        });
      });
    }

    function setGeneratorBusy(busy) {
      setCloudBusy(generateButton, busy);
      generateLabel.textContent = busy ? t("generator.processing") : t("generator.generate");
    }

    input.addEventListener("input", clearResult);

    clearButton.addEventListener("click", () => {
      input.value = "";
      clearResult();
      input.focus();
    });

    generateButton.addEventListener("click", async () => {
      const seed = input.value.trim();
      if (!seed) {
        showToast(t("generator.empty"));
        input.focus();
        return;
      }

      announceGeneratorResult(false);
      setGeneratorBusy(true);
      try {
        const content = await requestCloudText("generate", seed, {
          platform: selectedPresetId,
          generationKind,
        });
        const result = generationKind === "hashtags"
          ? cleanHashtags(content).slice(0, 5).join(" ")
          : content;
        if (!result) throw new Error("No usable generated content");
        output.value = result;
        animateChanged(output, result);
        announceGeneratorResult(true);
      } catch (error) {
        showToast(cloudErrorMessage(error));
      } finally {
        setGeneratorBusy(false);
      }
    });

    document.addEventListener("postprep:languagechange", () => {
      renderPlatformButtons();
      renderGenerationKinds();
      updateSelection();
      setGeneratorBusy(generateButton.disabled);
    });

    renderPlatformButtons();
    renderGenerationKinds();
    updateSelection();
  }

  globalThis.PostPrep = Object.freeze({
    PLATFORM_PRESETS,
    countVisibleCharacters,
    countEnglishWords,
    countLines,
    cleanHashtags,
    formatCaption,
  });

  document.addEventListener("DOMContentLoaded", () => {
    initCommon();
    initLengthChecker();
    initHashtagCleaner();
    initFormatter();
    initGenerator();
  });
})();
