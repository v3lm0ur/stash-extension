(() => {
  "use strict";
  if (window.__alhBridgeV2) return;
  window.__alhBridgeV2 = true;
  const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const cache = new Map();
  const metaCache = new Map(); // tokenAddress -> { creator, pairAddress, createdAt }
  const HISTORY_TTL = 90000;
  const MAX_ACTIVE = 3;
  const SPACING = 350;
  const inFlight = new Map();
  const requests = [];
  let active = 0;
  let nextStart = 0;
  let blockedUntil = 0;
  let pumpTimer = 0;

  const fail = (code) => Object.assign(new Error(code), { code });
  function emit(type, data) {
    window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(data) }));
  }
  function origin() {
    // Only allow Axiom API origins. Never send session credentials to arbitrary URLs.
    const candidate = window.__BOOTSTRAP__?.apiUrl;
    if (typeof candidate === "string" && /^https:\/\/api(?:[2-9]|10)?\.axiom\.trade\/?$/.test(candidate)) {
      return candidate.replace(/\/$/, "");
    }
    return "https://api.axiom.trade";
  }
  // История девов теперь на sol-api*.axiom.trade (без параметра v).
  function solOrigin() {
    const b = window.__BOOTSTRAP__;
    if (b && typeof b === "object") {
      for (const value of Object.values(b)) {
        if (typeof value === "string" && /^https:\/\/sol-api\d{0,2}\.axiom\.trade\/?$/.test(value)) return value.replace(/\/$/, "");
      }
    }
    return "https://sol-api2.axiom.trade";
  }
  async function getJson(path, params, base, withV = true) {
    if (Date.now() < blockedUntil) throw fail("RATE_LIMIT");
    const url = new URL(path, base || origin());
    for (const [key, value] of Object.entries(withV ? { ...params, v: 2 } : params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url.href, {
        credentials: "include", signal: controller.signal, method: "GET"
      });
      if (response.status === 429) {
        blockedUntil = Date.now() + 60000;
        throw fail("RATE_LIMIT");
      }
      if (response.status === 401 || response.status === 403) throw fail("AUTH");
      if (!response.ok) throw fail("HTTP_" + response.status);
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      throw fail(error.name === "AbortError" ? "TIMEOUT" : "NETWORK");
    } finally { clearTimeout(timeout); }
  }

  function number(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function time(value) {
    if (value === null || value === undefined || value === "") return NaN;
    if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
    return Date.parse(value);
  }

  // Inspect only the token-card's React props, never account state or storage.
  // Token mint addresses and pool addresses are different; do not substitute one for the other.
  function cardMetadata(tokenAddress) {
    const card = [...document.querySelectorAll("[data-pulse-token-address]")]
      .find(el => el.getAttribute("data-pulse-token-address") === tokenAddress &&
        el.closest('[data-pulse-chain="sol"]'));
    if (!card) throw fail("CARD_GONE");
    const found = { creator: null, pairAddress: null, createdAt: null };
    const visited = new Set();
    let visitedCount = 0;
    const address = value => addressPattern.test(value || "") ? value : null;
    const first = (value, keys) => {
      for (const key of keys) {
        const candidate = address(value?.[key]);
        if (candidate) return candidate;
      }
      return null;
    };
    function visit(value, depth, matchedScope = false) {
      if (found.creator && found.createdAt) return;
      if (!value || typeof value !== "object" || depth > 7 || visited.has(value) || visitedCount >= 2500) return;
      if (typeof Node !== "undefined" && value instanceof Node) return;
      visited.add(value);
      visitedCount++;
      const itemToken = first(value, ["tokenAddress", "mintAddress", "tokenMint", "mint"]);
      const creator = first(value, ["deployerAddress", "creatorAddress", "developerAddress", "devAddress"]);
      const pairAddress = first(value, ["pairAddress", "poolAddress", "pairId", "poolId"]);
      const matchesToken = matchedScope || itemToken === tokenAddress;
      if (matchesToken) {
        found.creator ||= creator;
        found.pairAddress ||= pairAddress;
        found.createdAt ||= value.extra?.tokenCreatedAt || value.tokenCreatedAt || value.createdAt || value.creationTime || null;
      }
      let keys;
      try { keys = Object.keys(value); } catch { return; }
      for (const key of keys.slice(0, 80)) {
        let child;
        try { child = value[key]; } catch { continue; }
        if (child && typeof child === "object") visit(child, depth + 1, matchesToken);
      }
    }
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_ELEMENT);
    let element = card;
    for (let n = 0; element && n < 140; n++, element = walker.nextNode()) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (key.startsWith("__reactProps$")) visit(element[key], 0);
        if (key.startsWith("__reactFiber$")) {
          let fiber = element[key];
          for (let i = 0; fiber && i < 24; i++, fiber = fiber.return) {
            visit(fiber.memoizedProps, 0);
            visit(fiber.pendingProps, 0);
          }
        }
      }
      found.creator ||= address(element.dataset?.deployerAddress) || address(element.dataset?.creatorAddress);
      found.pairAddress ||= address(element.dataset?.pairAddress) || address(element.dataset?.poolAddress);
      if (found.creator && found.createdAt) break;
    }
    if (!found.creator && !found.pairAddress) throw fail("CARD_METADATA");
    return found;
  }

  function decode(payload) {
    if (!payload || !Array.isArray(payload.tokens)) throw fail("HISTORY_FORMAT");
    return payload.tokens.map(row => {
      const t = row?.token;
      if (!t || !addressPattern.test(t.tokenAddress || "") || !Number.isFinite(time(t.tokenCreatedAt))) {
        throw fail("HISTORY_FORMAT");
      }
      return {
        tokenAddress: t.tokenAddress,
        createdAt: time(t.tokenCreatedAt),
        ath: number(row.allTimeHighMarketcapUsd),
        fees: number(row.totalPairFeesPaid)
      };
    });
  }
  async function history(creator, force) {
    const cached = cache.get(creator);
    if (!force && cached && Date.now() - cached.at < HISTORY_TTL) return cached.rows;
    if (inFlight.has(creator)) return inFlight.get(creator);
    const promise = getJson("/dev-tokens", { devAddress: creator }, solOrigin(), false).then(decode).then(rows => {
      cache.set(creator, { at: Date.now(), rows });
      if (cache.size > 250) cache.delete(cache.keys().next().value);
      return rows;
    }).finally(() => inFlight.delete(creator));
    inFlight.set(creator, promise);
    return promise;
  }
  async function lookup(tokenAddress) {
    let meta = metaCache.get(tokenAddress) || cardMetadata(tokenAddress);
    // The current launch is normally present in dev-tokens-v5, so a creator
    // address is enough. Some Chromium/React builds omit createdAt from card props.
    if ((!meta.creator || !meta.createdAt) && meta.pairAddress) {
      const pair = await getJson("/pair-info", { pairAddress: meta.pairAddress });
      if (pair?.tokenAddress !== tokenAddress) throw fail("PAIR_MISMATCH");
      meta = {
        ...meta,
        creator: meta.creator || pair.deployerAddress,
        createdAt: meta.createdAt || pair.extra?.tokenCreatedAt || pair.createdAt
      };
    }
    if (!addressPattern.test(meta.creator || "")) throw fail("CREATOR_MISSING");
    metaCache.set(tokenAddress, meta);
    if (metaCache.size > 500) metaCache.delete(metaCache.keys().next().value);
    let rows = await history(meta.creator);
    let current = rows.find(row => row.tokenAddress === tokenAddress);
    // Кеш мог устареть: свежей монеты в нём ещё нет, тогда один раз перезапрашиваем.
    if (!current) {
      const cached = cache.get(meta.creator);
      if (cached && Date.now() - cached.at > 2000) {
        rows = await history(meta.creator, true);
        current = rows.find(row => row.tokenAddress === tokenAddress);
      }
    }
    const cutoff = current?.createdAt ?? time(meta.createdAt);
    if (!Number.isFinite(cutoff)) throw fail("TOKEN_TIME");
    const unique = new Map();
    for (const row of rows) {
      if (row.tokenAddress === tokenAddress || row.createdAt >= cutoff) continue;
      if (!unique.has(row.tokenAddress)) unique.set(row.tokenAddress, row);
    }
    return [...unique.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 2);
  }

  function pump() {
    if (active >= MAX_ACTIVE || !requests.length) return;
    const delay = Math.max(0, nextStart - Date.now());
    if (delay) {
      if (!pumpTimer) pumpTimer = setTimeout(() => { pumpTimer = 0; pump(); }, delay);
      return;
    }
    const item = requests.shift();
    active++;
    nextStart = Date.now() + SPACING;
    lookup(item.tokenAddress).then(
      launches => emit("alh:result-v2", { id: item.id, launches }),
      error => { emit("alh:result-v2", { id: item.id, error: error.code || "INTERNAL" }); }
    ).finally(() => { active--; pump(); });
    pump();
  }
  window.addEventListener("alh:lookup-v2", event => {
    try {
      const item = JSON.parse(event.detail);
      if (!/^alh-\d+$/.test(item.id) || !addressPattern.test(item.tokenAddress)) return;
      if (requests.length >= 50) {
        emit("alh:result-v2", { id: item.id, error: "BUSY" });
        return;
      }
      requests.push({ id: item.id, tokenAddress: item.tokenAddress });
      pump();
    } catch { /* Ignore unrelated events. */ }
  });
  window.addEventListener("alh:ping-v2", () => emit("alh:ready-v2", {}));
  emit("alh:ready-v2", {});
})();
