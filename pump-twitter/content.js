(() => {
  "use strict";
  const STORAGE_KEY = "stash.extension.state.v1";
  const TIP_ID = "stash-pump-description";
  const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  let enabled = false, showDescription = true, showAge = true, showTranslator = true, minAge = 0;
  let tip = null, hideTimer = 0, requestTimer = 0, currentAnchor = null;
  let activeDescription = "", translatedDescription = null, activeTokenData = {}, isTranslated = false, translationLoading = false, translationError = false;
  const cache = new Map();

  function readSettings(root) {
    const s = root?.settings?.pumpTwitter || {};
    enabled = root?.modules?.pumpTwitter === true;
    showDescription = s.showDescription !== false;
    showAge = s.showAge !== false;
    showTranslator = s.showTranslator !== false;
    minAge = Number.isFinite(Number(s.minAge)) ? Math.max(0, Number(s.minAge)) : 0;
    document.documentElement.setAttribute("data-pe-age", enabled && showAge ? String(minAge) : "");
    if (!enabled || !showDescription) hideTip();
    else if (tip?.style.display === "block" && currentAnchor?.isConnected) renderTipBody(currentAnchor);
  }
  function load() {
    chrome.storage.local.get(STORAGE_KEY).then(r => readSettings(r[STORAGE_KEY])).catch(() => readSettings(null));
  }
  load();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) readSettings(changes[STORAGE_KEY].newValue);
  });

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = TIP_ID;
    tip.style.cssText = "position:fixed;z-index:2147483647;display:none;max-width:348px;min-width:188px;padding:11px 13px;background:rgba(8,14,10,0.96);backdrop-filter:blur(10px);color:#f0f7f2;border:1px solid rgba(46,232,154,0.36);border-left:3px solid #2ee89a;border-radius:6px;box-shadow:0 12px 32px rgba(0,0,0,.58);font:12px/1.5 Inter,system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:auto;";
    tip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    tip.addEventListener("mouseleave", scheduleHide);
    tip.addEventListener("click", event => {
      const button = event.target.closest("[data-stash-translate]");
      if (!button) return;
      event.preventDefault(); event.stopPropagation(); toggleTranslation();
    });
    document.documentElement.append(tip);
    return tip;
  }
  function hideTip() { clearTimeout(hideTimer); if (tip) tip.style.display = "none"; currentAnchor = null; }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideTip, 180); }
  function positionTip(anchor) {
    const r = anchor.getBoundingClientRect(), t = ensureTip();
    let left = Math.min(Math.max(8, r.left), window.innerWidth - t.offsetWidth - 8);
    let top = r.top - t.offsetHeight - 8;
    if (top < 8) top = Math.min(window.innerHeight - t.offsetHeight - 8, r.bottom + 8);
    t.style.left = left + "px"; t.style.top = Math.max(8, top) + "px";
  }
  function renderTip(anchor, data) {
    if (!enabled || !showDescription || !anchor?.isConnected) return;
    currentAnchor = anchor;
    activeTokenData = data || {};
    activeDescription = typeof data?.description === "string" ? data.description : "";
    translatedDescription = null; isTranslated = false; translationLoading = false; translationError = false;
    renderTipBody(anchor, data);
  }
  function renderTipBody(anchor, data = activeTokenData) {
    const t = ensureTip();
    t.replaceChildren();
    const title = document.createElement("div");
    title.textContent = data?.name ? String(data.name) + (data.symbol ? " · $" + data.symbol : "") : "PUMP.FUN";
    title.style.cssText = "margin-bottom:6px;color:#8fa99a;font:600 9px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;";
    const body = document.createElement("div");
    body.textContent = isTranslated && translatedDescription ? translatedDescription : (activeDescription || "(без описания)");
    if (!activeDescription) body.style.color = "#84938a";
    t.append(title, body);
    if (showTranslator && activeDescription.trim()) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.stashTranslate = "1";
      button.textContent = translationLoading ? "…" : translationError ? "↻ ПОВТОРИТЬ" : isTranslated ? "ORIGINAL" : "RU";
      button.style.cssText = "all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:22px;margin:9px 0 0;padding:0 10px;background:rgba(10,18,13,.92);color:#2ee89a;border:1px solid rgba(46,232,154,.42);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.3),inset 0 0 6px rgba(46,232,154,.08);font:700 10.5px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em;cursor:pointer;vertical-align:middle;";
      button.disabled = translationLoading;
      t.append(button);
    }
    t.style.display = "block";
    positionTip(anchor);
  }
  function toggleTranslation() {
    if (!activeDescription.trim() || translationLoading || !currentAnchor?.isConnected) return;
    if (isTranslated) { isTranslated = false; translationError = false; renderTipBody(currentAnchor); return; }
    if (translatedDescription) { isTranslated = true; translationError = false; renderTipBody(currentAnchor); return; }
    translationLoading = true; translationError = false; renderTipBody(currentAnchor);
    const original = activeDescription, anchor = currentAnchor;
    chrome.runtime.sendMessage({ type: "TRANSLATE", text: original, to: "ru" }, response => {
      if (currentAnchor !== anchor || activeDescription !== original) return;
      translationLoading = false;
      if (chrome.runtime.lastError || !response || response.error || typeof response.text !== "string") {
        translationError = true; renderTipBody(anchor); return;
      }
      translatedDescription = response.text;
      isTranslated = true;
      renderTipBody(anchor);
    });
  }
  function mintFrom(el) {
    if (!(el instanceof Element)) return null;
    const icon = el.closest('img[src*="pump.webp"],img[src*="pump.png"],img[src*="pump.svg"]');
    if (!icon || !/protocol-marks\/.*pump|pump\.(webp|png|svg)/i.test(icon.getAttribute("src") || "")) return null;
    const card = icon.closest('[data-pulse-token-address]') || icon.closest('[class*="group"][class*="cursor-pointer"]') || icon.parentElement?.parentElement?.parentElement;
    const attr = card?.getAttribute("data-pulse-token-address");
    if (attr && MINT_RE.test(attr)) return { mint: attr, anchor: icon };
    const link = card?.querySelector('a[href*="pump.fun/coin/"],a[href*="pump.fun/advanced/coin/"]');
    if (link) {
      try {
        const u = new URL(link.href);
        const candidate = u.pathname.split("/").filter(Boolean).pop();
        if (MINT_RE.test(candidate || "")) return { mint: candidate, anchor: icon };
      } catch {}
    }
    return null;
  }
  function request(mint, anchor) {
    if (cache.has(mint)) { renderTip(anchor, cache.get(mint)); return; }
    const t = ensureTip(); currentAnchor = anchor; t.textContent = "Загрузка описания…"; t.style.display = "block"; positionTip(anchor);
    chrome.runtime.sendMessage({ type: "PUMP_COIN", mint }, response => {
      if (chrome.runtime.lastError) { if (currentAnchor === anchor) hideTip(); return; }
      if (response && !response.error) cache.set(mint, response);
      if (currentAnchor === anchor) renderTip(anchor, response);
    });
  }
  document.addEventListener("mouseover", event => {
    if (!enabled || !showDescription) return;
    const info = mintFrom(event.target);
    if (!info) return;
    clearTimeout(hideTimer); clearTimeout(requestTimer);
    currentAnchor = info.anchor;
    requestTimer = setTimeout(() => request(info.mint, info.anchor), 220);
  }, true);
  document.addEventListener("mouseout", event => {
    if (!enabled || !showDescription) return;
    const info = mintFrom(event.target);
    if (!info) return;
    clearTimeout(requestTimer); scheduleHide();
  }, true);
  window.addEventListener("scroll", () => { if (tip?.style.display === "block" && currentAnchor?.isConnected) positionTip(currentAnchor); else hideTip(); }, true);
  window.addEventListener("resize", () => { if (tip?.style.display === "block" && currentAnchor?.isConnected) positionTip(currentAnchor); });
})();
