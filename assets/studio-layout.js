/* Presentation only: native disclosures retain the original inputs and controllers. */
(() => {
  'use strict';
  const root = document.documentElement;
  const label = (zh, en) => root.lang.startsWith('en') ? en : zh;
  function revealTarget(target) {
    for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    return target;
  }
  function visibleAnchor(target) {
    let anchor = target;
    for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) anchor = parent.querySelector('summary');
    }
    return anchor;
  }
  window.PostPrepStudio = Object.freeze({ revealTarget, visibleAnchor });

  function init() {
    const aside = document.querySelector('.rvc-inspector');
    if (!aside) return;
    const wrapMonitor = () => {
      for (const panel of [...aside.children]) {
        const classic = panel.classList.contains('classic-console');
        const glass = panel.classList.contains('studio-monitor');
        if (!classic && !glass) continue;
        const fold = document.createElement('details');
        fold.className = `studio-fold studio-optional ${classic ? 'classic-only' : 'glass-only'}`;
        const summary = document.createElement('summary');
        summary.dataset.studioLabel = classic ? 'navigation' : 'monitor';
        panel.before(fold);
        fold.append(summary, panel);
        // Opening a display:none ancestor must remeasure existing stack geometry.
        fold.addEventListener('toggle', () => {
          if (fold.open) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
      }
      localize();
    };
    function localize() {
      document.querySelectorAll('[data-studio-label]').forEach(node => {
        const labels = {
          navigation: ['叠层快捷导航', 'Stacked shortcuts'],
          monitor: ['原声监视器', 'Source monitor'],
          tools: ['导入与训练模型', 'Import & train models'],
          roster: ['角色目录与来源', 'Character directory & sources'],
          help: ['指南与使用提示', 'Guide & usage notes'],
          content: ['音频模式说明', 'Audio mode notes'],
        };
        const pair = labels[node.dataset.studioLabel];
        if (pair) node.textContent = label(...pair);
      });
    }
    wrapMonitor();
    new MutationObserver(wrapMonitor).observe(aside, { childList: true });
    new MutationObserver(localize).observe(root, { attributes: true, attributeFilter: ['lang'] });
    const roster = document.getElementById('rvc-school-roster');
    const syncRoster = () => {
      if (roster?.parentElement.tagName === 'DETAILS') roster.parentElement.hidden = !roster.textContent.trim();
    };
    syncRoster();
    if (roster) new MutationObserver(syncRoster).observe(roster, { childList: true, subtree: true, characterData: true });
    // Anchors and focus links still reach settings tucked inside native disclosures.
    document.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[href^="#rvc-"]');
      if (anchor) revealTarget(document.getElementById(anchor.getAttribute('href').slice(1)));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
