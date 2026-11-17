(() => {
  "use strict";
  const STYLE_ID = "stash-axiom-stretch-style";
  const STORAGE_KEY = "stash.extension.state.v1";
  const root = document.documentElement;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "TEMPLATE", "META"]);
  const moveCount = new WeakMap();
  let moduleEnabled = false;
  let settings = null;
  let fitY = 1;
  let bodyObserver = null;
  let observedBody = null;
  let resizeTimer = 0;

  function effective() {
    const x = Number(settings?.scaleX) || 1;
    const y = (Number(settings?.scaleY) || 1) * (settings?.autofit ? fitY : 1);
    const on = moduleEnabled && (x !== 1 || y !== 1);
    return { on, x, y };
  }

  function css(x, y) {
    return `
      html { overflow: hidden !important; }
      body {
        width: ${100 / x}vw !important;
        height: ${100 / y}vh !important;
        margin: 0 !important;
        transform: scale(${x}, ${y}) !important;
        transform-origin: 0 0 !important;
        overflow: hidden !important;
      }
    `;
  }

  function render() {
    if (!settings) return;
    const { on, x, y } = effective();
    root.setAttribute("data-ax-on", on ? "1" : "0");
    root.setAttribute("data-ax-sx", String(x));
    root.setAttribute("data-ax-sy", String(y));
    root.setAttribute("data-ax-sharp", settings.sharp ? "1" : "0");
    let style = document.getElementById(STYLE_ID);
    if (!on) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    } else if (document.head && style.parentNode !== document.head) {
      document.head.appendChild(style);
    }
    const next = css(x, y);
    if (style.textContent !== next) style.textContent = next;
  }

  function shadowOf(el) {
    try {
      if (chrome.dom?.openOrClosedShadowRoot) return chrome.dom.openOrClosedShadowRoot(el);
    } catch {}
    return el.shadowRoot;
  }

  function isForeign(el) {
    if (SKIP_TAGS.has(el.tagName) || el.id === STYLE_ID || el.tagName.startsWith("NEXT-")) return false;
    if (shadowOf(el)) return true;
    const z = Number.parseInt(getComputedStyle(el).zIndex, 10);
    return z >= 2147483000;
  }

  function relocate() {
    if (!settings || !document.body || !effective().on || !settings.foreign) return;
    const body = document.body;
    for (const el of Array.from(body.children)) {
      if (!isForeign(el)) continue;
      const count = moveCount.get(el) || 0;
      if (count >= 5) continue;
      moveCount.set(el, count + 1);
      root.appendChild(el);
    }
  }

  function watchBody() {
    const body = document.body;
    if (!body || body === observedBody) return;
    bodyObserver?.disconnect();
    observedBody = body;
    bodyObserver = new MutationObserver(relocate);
    bodyObserver.observe(body, { childList: true });
    relocate();
  }

  function contentBottom() {
    const body = document.body;
    if (!body) return 0;
    let bottom = 0;
    const walk = (parent, depth) => {
      for (const child of parent.children) {
        const cs = getComputedStyle(child);
        if (cs.display === "none" || cs.visibility === "hidden" ||
            cs.position === "fixed" || cs.position === "absolute") continue;
        const rect = child.getBoundingClientRect();
        if (!rect.height) continue;
        if (rect.bottom > bottom) bottom = rect.bottom;
        if (depth < 3) walk(child, depth + 1);
      }
    };
    walk(body, 0);
    return bottom;
  }

  function autofit() {
    if (!moduleEnabled || !settings?.autofit) return;
    const vh = window.innerHeight;
    const bottom = contentBottom();
    if (!bottom || !vh || bottom <= vh + 1) return;
    const next = Math.max(0.75, fitY * (vh / bottom));
    if (Math.abs(next - fitY) > 0.001) {
      fitY = next;
      render();
      window.dispatchEvent(new Event("resize"));
    }
  }

  function applyState(value) {
    const nextEnabled = value?.modules?.stretch === true;
    const nextSettings = value?.settings?.stretch || {};
    const changed = moduleEnabled !== nextEnabled || JSON.stringify(settings) !== JSON.stringify(nextSettings);
    moduleEnabled = nextEnabled;
    settings = {
      scaleX: 1.3333, scaleY: 1, sharp: true, autofit: true, foreign: true,
      ...nextSettings
    };
    if (!changed) return;
    fitY = 1;
    render();
    watchBody();
    relocate();
    window.dispatchEvent(new Event("resize"));
    if (moduleEnabled) setTimeout(autofit, 300);
  }

  chrome.storage.local.get(STORAGE_KEY)
    .then(data => applyState(data[STORAGE_KEY]))
    .catch(() => applyState(null));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) applyState(changes[STORAGE_KEY].newValue);
  });

  document.addEventListener("DOMContentLoaded", () => {
    render();
    watchBody();
    setTimeout(autofit, 500);
  });
  window.addEventListener("load", () => setTimeout(autofit, 500));
  window.addEventListener("resize", event => {
    if (!event.isTrusted) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fitY = 1;
      render();
      setTimeout(autofit, 300);
    }, 200);
  });

  setInterval(() => {
    if (!moduleEnabled) return;
    render();
    watchBody();
    relocate();
    autofit();
  }, 1000);
})();