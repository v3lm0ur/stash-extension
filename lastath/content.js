(() => {
  "use strict";
  const STORAGE_KEY = "stash.extension.state.v1";
  let moduleEnabled = false;
  let moduleStateRevision = 0;
  const initialStateRevision = moduleStateRevision;
  chrome.storage.local.get(STORAGE_KEY).then(data => {
    if (moduleStateRevision !== initialStateRevision) return;
    moduleEnabled = data[STORAGE_KEY]?.modules?.lastath === true;
    layer.style.display = moduleEnabled ? "" : "none";
    if (moduleEnabled) scheduleScan();
  }).catch(() => {});
  const VERSION = "0.3.7";
  const DEFAULT_SETTINGS = Object.freeze({
    x: 38,
    y: 9,
    minAth: 40000,
    minFees: 0,
    highlightAth: true,
    athColor: "#ffd166",
    highlightFees: true,
    feesColor: "#78e8c7",
    showInColumns: { newPairs: true, finalStretch: true, migrated: true }
  });
  const columnIds = Object.freeze({
    "pulse-newPairs": "newPairs",
    "pulse-finalStretch": "finalStretch",
    "pulse-migrated": "migrated"
  });
  const columnSelector = '[data-perf-id="pulse-newPairs"], [data-perf-id="pulse-finalStretch"], [data-perf-id="pulse-migrated"]';
  const cardSelector = '[data-perf-id="pulse-newPairs"] [data-pulse-chain="sol"] [data-pulse-token-address], [data-perf-id="pulse-finalStretch"] [data-pulse-chain="sol"] [data-pulse-token-address], [data-perf-id="pulse-migrated"] [data-pulse-chain="sol"] [data-pulse-token-address]';
  const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const MAX_PARALLEL = 3;
  const MAX_ATTEMPTS = 5;

  let settings = { ...DEFAULT_SETTINGS };
  let settingsRev = 0;
  let ready = false;
  let sequence = 0;
  let scanTimer = 0;
  let placeFrame = 0;
  let initialScanComplete = false;
  let observedColumns = new Set();
  let nextRetryAt = 0;

  const entries = new Map();     // tokenAddress -> состояние загрузки и строки истории
  const pending = new Map();     // id запроса -> { tokenAddress, timer }
  const queue = [];
  const panels = new Map();      // tokenAddress -> элемент панели
  const hostByToken = new Map(); // tokenAddress -> { host, column, visible }
  const infoByHost = new WeakMap();
  const attrs = ["data-pulse-token-address", "data-pulse-chain"];
  document.documentElement.dataset.alhVersion = VERSION;

  // Карточки вне экрана не трогаем: их панели скрыты без чтения геометрии.
  const io = new IntersectionObserver(items => {
    for (const item of items) {
      const info = infoByHost.get(item.target);
      if (info) info.visible = item.isIntersecting;
    }
    schedulePlace();
  });

  // Панели живут в отдельном слое поверх страницы: карточки Axiom приглушают
  // себя прозрачностью, а слой её не наследует, и оверлеи Axiom его не перекрывают.
  const layer = document.createElement("div");
  layer.className = "alh-layer";
  layer.style.display = "none";
  document.documentElement.append(layer);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    moduleStateRevision++;
    moduleEnabled = changes[STORAGE_KEY].newValue?.modules?.lastath === true;
    layer.style.display = moduleEnabled ? "" : "none";
    if (!moduleEnabled) {
      for (const job of pending.values()) {
        clearTimeout(job.timer);
        const entry = entries.get(job.tokenAddress);
        if (entry) entry.state = "idle";
      }
      for (const token of queue) {
        const entry = entries.get(token);
        if (entry) entry.state = "idle";
      }
      pending.clear();
      queue.length = 0;
    } else scheduleScan();
  });

  function emit(type, data) {
    window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) }));
  }
  function usd(value) {
    if (!Number.isFinite(value)) return "—";
    for (const [n, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
      if (value >= n) return "$" + Number((value / n).toFixed(1)) + suffix;
    }
    return "$" + Math.round(value);
  }
  function fees(value) {
    return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 3 }) : "—";
  }
  function cell(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }
  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const num = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const hex = (v, fallback) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    const bool = (v, fallback) => typeof v === "boolean" ? v : fallback;
    return {
      x: num(source.x, 0, 90, DEFAULT_SETTINGS.x),
      y: num(source.y, -20, 100, DEFAULT_SETTINGS.y),
      minAth: num(source.minAth, 0, 1e9, DEFAULT_SETTINGS.minAth),
      minFees: num(source.minFees, 0, 1e9, DEFAULT_SETTINGS.minFees),
      highlightAth: bool(source.highlightAth, DEFAULT_SETTINGS.highlightAth),
      athColor: hex(source.athColor, DEFAULT_SETTINGS.athColor),
      highlightFees: bool(source.highlightFees, DEFAULT_SETTINGS.highlightFees),
      feesColor: hex(source.feesColor, DEFAULT_SETTINGS.feesColor),
      showInColumns: {
        newPairs: bool(source.showInColumns?.newPairs, true),
        finalStretch: bool(source.showInColumns?.finalStretch, true),
        migrated: bool(source.showInColumns?.migrated, true)
      }
    };
  }
  function applySettings(value) {
    settings = normalizeSettings(value);
    settingsRev++;
    layer.style.setProperty("--alh-ath-color", settings.athColor);
    layer.style.setProperty("--alh-fees-color", settings.feesColor);
    for (const entry of entries.values()) render(entry);
  }
  function loadSettings() {
    chrome.storage.local.get(STORAGE_KEY)
      .then(result => applySettings(result[STORAGE_KEY]?.settings?.lastath || DEFAULT_SETTINGS))
      .catch(() => applySettings(DEFAULT_SETTINGS));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORAGE_KEY]) applySettings(changes[STORAGE_KEY].newValue?.settings?.lastath || DEFAULT_SETTINGS);
    });
  }

  // Панель показывается, если последняя предыдущая монета проходит оба порога.
  function qualifies(entry) {
    const first = entry.rows[0];
    return settings.showInColumns[entry.columnKey] !== false && entry.state === "success" && !!first &&
      Number.isFinite(first.ath) && first.ath >= settings.minAth &&
      Number.isFinite(first.fees) && first.fees >= settings.minFees;
  }
  // Повтор с нарастающей паузой; при лимите API ждём минуту.
  function markError(entry, code) {
    entry.state = "error";
    const wait = code === "RATE_LIMIT" ? 60000 : [3000, 10000, 30000, 60000][Math.min(entry.attempts, 4) - 1] || 60000;
    entry.retryAt = Date.now() + wait;
    nextRetryAt = nextRetryAt ? Math.min(nextRetryAt, entry.retryAt) : entry.retryAt;
  }
  function playAlert(entry) {
    if (!entry.notifyEligible || entry.notified || !qualifies(entry)) return;
    entry.notified = true;
    Promise.resolve(chrome.runtime.sendMessage({ type: "alh:play-alert", tokenAddress: entry.tokenAddress })).catch(() => {});
  }

  function dropHost(info) {
    io.unobserve(info.host);
    infoByHost.delete(info.host);
  }
  function removePanel(token) {
    const panel = panels.get(token);
    if (!panel) return;
    panel.remove();
    panels.delete(token);
  }
  function render(entry) {
    if (!qualifies(entry)) return removePanel(entry.tokenAddress);
    let panel = panels.get(entry.tokenAddress);
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "alh-history";
      layer.append(panel);
      panels.set(entry.tokenAddress, panel);
    }
    const key = settingsRev + ":" + entry.rev;
    if (panel._key !== key) {
      panel._key = key;
      panel._h = 0;
      panel.dataset.alhHighlight = String(settings.highlightAth);
      panel.dataset.alhFeesHighlight = String(settings.highlightFees);
      panel.replaceChildren();
      panel.replaceChildren(
        cell("span", "alh-heading", "ATH"),
        cell("span", "alh-heading", "FEES")
      );
      for (const launch of entry.rows.slice(0, 2)) {
        panel.append(cell("span", "alh-ath", usd(launch.ath)));
        const value = cell("span", "alh-fees", "");
        value.append(cell("span", "alh-fees-value", fees(launch.fees)), cell("small", "alh-sol", "SOL"));
        panel.append(value);
      }
    }
    schedulePlace();
  }

  // Один проход: сначала все чтения геометрии, потом все записи.
  function schedulePlace() {
    if (!placeFrame) placeFrame = requestAnimationFrame(place);
  }
  function place() {
    placeFrame = 0;
    if (!moduleEnabled || document.hidden || !panels.size) return;
    const vh = innerHeight;
    const clips = new Map();
    const jobs = [];
    let stale = false;
    for (const [token, panel] of panels) {
      const info = hostByToken.get(token);
      if (!info || !info.host.isConnected) {
        stale = true;
        jobs.push({ panel, hidden: true });
        continue;
      }
      if (info.visible === false) { jobs.push({ panel, hidden: true }); continue; }
      if (!panel._h) panel._h = panel.offsetHeight;
      const r = info.host.getBoundingClientRect();
      let clip = clips.get(info.column);
      if (!clip) { clip = info.column.getBoundingClientRect(); clips.set(info.column, clip); }
      const bottom = r.bottom - settings.y;
      jobs.push({
        panel,
        hidden: r.width === 0 || bottom > Math.min(clip.bottom, vh) || bottom - panel._h < Math.max(clip.top, 0),
        x: Math.round(r.left + r.width * settings.x / 100),
        y: Math.round(bottom - panel._h)
      });
    }
    for (const { panel, hidden, x, y } of jobs) {
      if (hidden) {
        if (panel._vis !== false) { panel.style.visibility = "hidden"; panel._vis = false; }
        continue;
      }
      if (panel._vis !== true) { panel.style.visibility = "visible"; panel._vis = true; }
      if (panel._x !== x || panel._y !== y) {
        panel.style.left = x + "px";
        panel.style.top = y + "px";
        panel._x = x;
        panel._y = y;
      }
    }
    if (stale) scheduleScan();
  }

  function settle(id, response) {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    clearTimeout(job.timer);
    const entry = entries.get(job.tokenAddress);
    if (!entry) return;
    if (response.error) {
      markError(entry, response.error);
    } else if (Array.isArray(response.launches)) {
      entry.rows = response.launches.slice(0, 2).map(row => ({
        ath: Number.isFinite(row.ath) ? row.ath : null,
        fees: Number.isFinite(row.fees) ? row.fees : null
      }));
      entry.state = entry.rows.length ? "success" : "empty";
    } else {
      markError(entry, "FORMAT");
    }
    entry.rev++;
    playAlert(entry);
    render(entry);
    runQueue();
  }
  function runQueue() {
    if (!ready || !moduleEnabled) return;
    while (pending.size < MAX_PARALLEL && queue.length) {
      const tokenAddress = queue.shift();
      const entry = entries.get(tokenAddress);
      if (!entry) continue;
      if (!hostByToken.get(tokenAddress)?.host.isConnected) { entry.state = "idle"; continue; }
      entry.state = "loading";
      entry.attempts++;
      const id = "alh-" + (++sequence);
      const timer = setTimeout(() => settle(id, { error: "TIMEOUT" }), 25000);
      pending.set(id, { tokenAddress, timer });
      emit("alh:lookup-v2", { id, tokenAddress });
    }
  }

  function scan() {
    scanTimer = 0;
    if (!moduleEnabled) return;
    nextRetryAt = 0;
    const visible = new Set();
    for (const container of document.querySelectorAll(cardSelector)) {
      const column = container.closest(columnSelector);
      const columnKey = columnIds[column?.getAttribute("data-perf-id")];
      if (!columnKey || settings.showInColumns[columnKey] === false) continue;
      const tokenAddress = container.dataset.pulseTokenAddress;
      if (!addressPattern.test(tokenAddress || "") || visible.has(tokenAddress)) continue;
      visible.add(tokenAddress);
      const host = container.firstElementChild || container;
      let info = hostByToken.get(tokenAddress);
      if (!info || info.host !== host) {
        if (info) dropHost(info);
        info = { host, column: column || document.documentElement, visible: true };
        hostByToken.set(tokenAddress, info);
        infoByHost.set(host, info);
        io.observe(host);
      }
      let entry = entries.get(tokenAddress);
      let fresh = false;
      if (!entry) {
        fresh = true;
        entry = {
          tokenAddress,
          columnKey,
          state: "idle",
          rows: [],
          attempts: 0,
          rev: 0,
          retryAt: 0,
          notifyEligible: initialScanComplete,
          notified: false
        };
        entries.set(tokenAddress, entry);
      }
      entry.columnKey = columnKey;
      if (entry.state === "error" && entry.attempts < MAX_ATTEMPTS && Date.now() < entry.retryAt) {
        nextRetryAt = nextRetryAt ? Math.min(nextRetryAt, entry.retryAt) : entry.retryAt;
      }
      if (entry.state === "idle" || (entry.state === "error" && entry.attempts < MAX_ATTEMPTS && Date.now() >= entry.retryAt)) {
        entry.state = "queued";
        // Новая монета после первого скана идёт первой: от неё зависит скорость алерта.
        if (fresh && initialScanComplete) queue.unshift(tokenAddress);
        else queue.push(tokenAddress);
      }
      render(entry);
    }
    for (const [token, info] of hostByToken) {
      if (visible.has(token)) continue;
      dropHost(info);
      hostByToken.delete(token);
      removePanel(token);
    }
    if (entries.size > 250) {
      for (const [token, entry] of entries) {
        if (!visible.has(token) && entry.state !== "loading" && entry.state !== "queued") entries.delete(token);
        if (entries.size <= 200) break;
      }
    }
    initialScanComplete = true;
    runQueue();
  }
  function scheduleScan() {
    if (!moduleEnabled) return;
    if (!scanTimer) scanTimer = setTimeout(scan, 150);
  }

  window.addEventListener("alh:ready-v2", () => {
    ready = true;
    document.documentElement.dataset.alhBridge = "ready";
    scheduleScan();
  });
  window.addEventListener("alh:result-v2", event => {
    try { const result = JSON.parse(event.detail); settle(result.id, result); }
    catch { /* чужое или битое событие */ }
  });

  function hasCard(nodes) {
    for (const n of nodes) {
      if (n.nodeType === 1 && (n.hasAttribute("data-pulse-token-address") || n.querySelector("[data-pulse-token-address]"))) return true;
    }
    return false;
  }
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === "attributes" || hasCard(m.addedNodes) || hasCard(m.removedNodes)) {
        schedulePlace();
        scheduleScan();
        return;
      }
    }
  });
  function attach() {
    const columns = new Set(document.querySelectorAll(columnSelector));
    const unchanged = columns.size === observedColumns.size && [...columns].every(column => observedColumns.has(column));
    if (unchanged) return;
    observer.disconnect();
    observedColumns = columns;
    for (const column of observedColumns) {
      observer.observe(column, { childList: true, subtree: true, attributes: true, attributeFilter: attrs });
    }
    if (observedColumns.size) scheduleScan();
  }

  window.addEventListener("scroll", schedulePlace, { capture: true, passive: true });
  window.addEventListener("resize", schedulePlace);
  document.addEventListener("visibilitychange", schedulePlace);

  // Раз в секунду: рукопожатие с page-bridge, поиск колонки, страховочный пересчёт позиций.
  setInterval(() => {
    if (!moduleEnabled) return;
    if (!ready) emit("alh:ping-v2", {});
    if ([...observedColumns].some(column => !column.isConnected) || !observedColumns.size) attach();
    if (nextRetryAt && Date.now() >= nextRetryAt) { nextRetryAt = 0; scheduleScan(); }
    if (!document.hidden && panels.size) schedulePlace();
  }, 1000);
  emit("alh:ping-v2", {});
  attach();

  loadSettings();
  scan();
})();

