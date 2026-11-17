(() => {
  const PREFIX = '[community-api]';
  const cache = new Map();
  // LRU cap on cached community screenNames.
  const CACHE_LIMIT = 500;

  const dbg = () => {};
  const dbe = () => {};

  function touchCacheLru(key) {
    if (!cache.has(key)) return;
    const v = cache.get(key);
    cache.delete(key);
    cache.set(key, v);
  }

  function evictCacheIfNeeded() {
    if (cache.size <= CACHE_LIMIT) return;
    const toDrop = Math.max(1, Math.floor(CACHE_LIMIT * 0.15));
    const it = cache.keys();
    for (let i = 0; i < toDrop; i++) {
      const next = it.next();
      if (next.done) break;
      cache.delete(next.value);
    }
  }

  function normalizeKey(k) {
    return String(k || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function deepFindString(obj, keys) {
    const keySetNorm = new Set(keys.map(normalizeKey));
    const queue = [obj];
    const seen = new Set();
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
      seen.add(cur);
      try {
        for (const k of Object.keys(cur)) {
          if (keySetNorm.has(normalizeKey(k))) {
            const v = cur[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
          }
          const v = cur[k];
          if (v && typeof v === 'object') queue.push(v);
        }
      } catch {}
    }
    return null;
  }

  function pickScreenName(data) {
    let screenName = null;
    try {
      const direct =
        data?.screenName || data?.screen_name ||
        data?.data?.screenName || data?.data?.screen_name ||
        data?.data?.creator?.screen_name || data?.data?.creator?.screenName ||
        data?.creator?.screen_name || data?.creator?.screenName;
      if (direct && typeof direct === 'string') screenName = direct;
      else screenName = deepFindString(data?.data?.creator || data?.data || data, ['screen_name', 'screenName', 'screen']);
    } catch {}
    return screenName ? { screenName } : null;
  }

  window.fetchCommunityScreenName = async function fetchCommunityScreenName(communityId) {
    const id = String(communityId || '').trim();
    if (!id) return null;

    const key = 'c:' + id;
    if (cache.has(key)) {
      const cached = cache.get(key);
      if (cached && typeof cached.then !== 'function') touchCacheLru(key);
      return (cached && typeof cached.then === 'function') ? await cached : cached;
    }

    // Resolve X community screenName via Axiom endpoint.
    const url = `https://api.axiom.trade/wo/twitter-community-info-v2?communityId=${encodeURIComponent(id)}&v=${Date.now()}`;

    const req = (async () => {
      try {
        const res = await fetch(url, { method: 'GET', credentials: 'include', headers: { 'Accept': 'application/json' } });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        return { ok: true, value: pickScreenName(data) };
      } catch (e) {
        dbe('community fetch error', e);
        return { ok: false };
      }
    })();

    cache.set(key, req.then(r => r.ok ? r.value : null));
    const wrapped = await req;
    if (wrapped.ok) {
      cache.set(key, wrapped.value);
      evictCacheIfNeeded();
      return wrapped.value;
    } else {
      cache.delete(key);
      return null;
    }
  };

  // Tweet fetch (tweet-by-tweet-id) removed: extension no longer requests it.

  // Exposed for popup "Очистить кэш" button — drops all cached screenName entries.
  window.__axpClearCommunityCache = function() {
    cache.clear();
  };

  // Exposed for popup "Состояние" panel — cheap snapshot of cache occupancy.
  window.__axpGetCommunityCacheStats = function() {
    return { size: cache.size, limit: CACHE_LIMIT };
  };
})();

