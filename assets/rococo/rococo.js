/*! PostPrep · Rococo theme pack — static Apple-style palette.
 * The shared theme switcher owns theme selection and button labels.
 */
(function () {
  "use strict";
  var TIME_KEY = "rococo-time";
  var root = document.documentElement;
  var darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false };
  try { if (localStorage.getItem("postprep-ui-style") === "rococo") root.dataset.ui = "rococo"; } catch (e) {}
  function isRococo() { return root.dataset.ui === "rococo"; }

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
  if (themeMeta && !themeMeta.getAttribute("data-postprep-original")) themeMeta.setAttribute("data-postprep-original", themeOriginal);
  function applySky() {
    var p = phase();
    root.dataset.rcSky = p;
    var night = p === "night" || (!forced && !requestedPhase() && darkMQ.matches);
    if (night) root.setAttribute("data-rc-night", ""); else root.removeAttribute("data-rc-night");
    if (themeMeta && root.dataset.ui !== "ba") themeMeta.setAttribute("content", isRococo() ? (night ? "#000000" : "#f5f5f7") : themeOriginal);
  }
  applySky();
  if (window.__ROCOCO_PREVIEW__) window.addEventListener("message", function (e) {
    var t = e.data && e.data.rococoTime; if (!/^(morning|afternoon|dusk|night)$/.test(t || "")) return;
    forced = t; applySky();
  });
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", applySky);
  else if (darkMQ.addListener) darkMQ.addListener(applySky);

  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(applySky).observe(root, { attributes: true, attributeFilter: ["data-ui"] });
  }
})();
