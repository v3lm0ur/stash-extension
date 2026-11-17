// background.js — сервис-воркер; делает запросы к API (без ограничений CORS)
// и является единственным местом, которое пишет trackedWallets/walletColors/
// hiddenWallets по запросам со страницы и из синхронизации (через одну очередь).

const STORAGE_KEY = "trackedWallets";
const API_HOSTS = [
  "api10.axiom.trade", "api9.axiom.trade", "api.axiom.trade", "api2.axiom.trade",
  "api3.axiom.trade", "api4.axiom.trade", "api5.axiom.trade",
  "api6.axiom.trade", "api7.axiom.trade", "api8.axiom.trade",
];
// Сайт сейчас ходит на v4; v3 оставлен запасным на случай отката.
const API_PATHS = ["tracked-wallets-v4", "tracked-wallets-v3"];
const FETCH_TIMEOUT_MS = 6000;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const lc = (s) => String(s).toLowerCase();

// ── Очередь записей ──────────────────────────────────────────────────────────
// Все «прочитал-изменил-записал» идут строго по очереди, поэтому синхронизация
// и правки из палитры не затирают друг друга.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

// ── Синхронизация ────────────────────────────────────────────────────────────
// Принимает и старый формат (массив массивов [адрес, имя, эмодзи]), и объекты
// ({trackedWalletAddress|address|walletAddress, name, emoji}); сам список может
// лежать в data.trackedWallets, в data.wallets или быть самим ответом.
// null — ответ не распознан; [] — трекер на Axiom действительно пуст.
function normalizeWallets(data) {
  const arr = Array.isArray(data) ? data : (data?.trackedWallets ?? data?.wallets);
  if (!Array.isArray(arr)) return null;
  if (!arr.length) return [];
  const wallets = arr
    .map(w => {
      if (Array.isArray(w)) return { addr: w[0], name: w[1], emoji: w[2] };
      if (w && typeof w === "object") {
        return {
          addr: w.trackedWalletAddress || w.walletAddress || w.address,
          name: w.name || w.walletName,
          emoji: w.emoji,
        };
      }
      return null;
    })
    .filter(w => w && typeof w.addr === "string" && w.addr.length > 10)
    .map(w => ({
      trackedWalletAddress: w.addr,
      name: w.name || (w.addr.slice(0, 5) + "…" + w.addr.slice(-4)),
      emoji: w.emoji || "👛",
      source: "axiom",
    }));
  return wallets.length ? wallets : null; // массив непустой, но ничего не разобрали
}

// Список Axiom главный для кошельков, которые пришли оттуда. Добавленные руками
// переживают синхронизацию, а удалённые пользователем (hiddenWallets) не
// возвращаются.
function mergeAndSave(allApiWallets) {
  return serial(async () => {
    const stored = await chrome.storage.local.get([STORAGE_KEY, "hiddenWallets", "walletColors"]);
    const existing = stored[STORAGE_KEY] || [];
    const hidden = new Set((stored.hiddenWallets || []).map(lc));

    const apiWallets = allApiWallets.filter(w => !hidden.has(lc(w.trackedWalletAddress)));
    const apiAddrs = new Set(apiWallets.map(w => lc(w.trackedWalletAddress)));
    const manual = existing.filter(
      w => w.source !== "axiom" && !apiAddrs.has(lc(w.trackedWalletAddress))
    );

    // Имя/эмодзи, которые пользователь поправил в попапе, не затираем.
    const prev = new Map(existing.map(w => [lc(w.trackedWalletAddress), w]));
    const fromApi = apiWallets.map(w => {
      const old = prev.get(lc(w.trackedWalletAddress));
      return old?.edited ? { ...w, name: old.name, emoji: old.emoji, edited: true } : w;
    });

    const merged = [...fromApi, ...manual];
    const out = { [STORAGE_KEY]: merged };

    // Цвета кошельков, которых больше нет в списке, — мусор. Чистим только при
    // непустом ответе, чтобы случайно пустой ответ не стёр выбранные цвета.
    if (allApiWallets.length) {
      const keep = new Set(merged.map(w => lc(w.trackedWalletAddress)));
      const colors = stored.walletColors || {};
      const pruned = Object.fromEntries(Object.entries(colors).filter(([k]) => keep.has(lc(k))));
      if (Object.keys(pruned).length !== Object.keys(colors).length) out.walletColors = pruned;
    }

    await chrome.storage.local.set(out);
    return merged;
  });
}

// Последний рабочий хост/путь пробуем первым — обычно хватает одного запроса.
async function orderedRoutes() {
  const { syncRoute } = await chrome.storage.local.get("syncRoute");
  const routes = [];
  for (const host of API_HOSTS) for (const path of API_PATHS) routes.push({ host, path });
  if (syncRoute) {
    const i = routes.findIndex(r => r.host === syncRoute.host && r.path === syncRoute.path);
    if (i > 0) routes.unshift(...routes.splice(i, 1));
  }
  return routes;
}

async function syncWallets() {
  const reasons = [];
  const deadHosts = new Set();
  for (const { host, path } of await orderedRoutes()) {
    if (deadHosts.has(host)) continue;
    try {
      const res = await fetch(`https://${host}/${path}?v=${Date.now()}`, {
        credentials: "include",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 401 || res.status === 403) {
        
        return { success: false, reason: `не авторизован (HTTP ${res.status})` };
      }
      if (!res.ok) { reasons.push(`${host}/${path}: HTTP ${res.status}`); continue; }
      const json = await res.json();
      const wallets = normalizeWallets(json);
      if (!wallets) {
        const shape = Array.isArray(json) ? "массив" : Object.keys(json || {}).slice(0, 5).join(",");
        reasons.push(`${host}/${path}: не распознан ответ (${shape})`);
        continue;
      }
      const merged = await mergeAndSave(wallets);
      chrome.storage.local.set({ syncRoute: { host, path } });
      
      return { success: true, synced: wallets.length, total: merged.length };
    } catch (e) {
      // Сеть/таймаут: хост недоступен, второй путь на нём пробовать незачем.
      deadHosts.add(host);
      reasons.push(`${host}/${path}: ${e.message}`);
      
    }
  }
  
  const short = reasons.length > 2
    ? `${reasons[0]}; … ${reasons[reasons.length - 1]} (${reasons.length} попыток)`
    : reasons.join("; ");
  return { success: false, reason: short };
}

// Несколько вкладок/запросов одновременно — склеиваем в один.
let inflight = null;
function fetchAndSaveWallets() {
  inflight ??= syncWallets().finally(() => { inflight = null; });
  return inflight;
}

// ── Правки из палитры в окне кошелька ────────────────────────────────────────
function mutate(fn) {
  return serial(async () => {
    const r = await chrome.storage.local.get(["trackedWallets", "walletColors", "hiddenWallets"]);
    const s = {
      wallets: r.trackedWallets || [],
      colors: r.walletColors || {},
      hidden: r.hiddenWallets || [],
    };
    fn(s);
    await chrome.storage.local.set({
      trackedWallets: s.wallets,
      walletColors: s.colors,
      hiddenWallets: s.hidden,
    });
  });
}

// Добавить дева (имя/эмодзи берём из шапки Axiom) и/или задать цвет.
function upsertWallet(d) {
  const low = lc(d.address);
  return mutate((s) => {
    // Раньше удалённого дева снова добавили — снимаем со списка скрытых.
    s.hidden = s.hidden.filter(a => lc(a) !== low);
    const found = s.wallets.find(w => lc(w.trackedWalletAddress) === low);
    if (!found) {
      s.wallets.unshift({
        trackedWalletAddress: d.address,
        name: d.name || (d.address.slice(0, 5) + "…" + d.address.slice(-4)),
        emoji: d.emoji || "👛",
        source: "manual",
      });
    }
    if (HEX_RE.test(d.color)) s.colors[found ? found.trackedWalletAddress : d.address] = d.color;
  });
}

// Удалить дева. Адрес запоминаем в hiddenWallets, иначе синхронизация с Axiom
// вернёт его обратно.
function removeWallet(d) {
  const low = lc(d.address);
  return mutate((s) => {
    s.wallets = s.wallets.filter(w => lc(w.trackedWalletAddress) !== low);
    for (const k of Object.keys(s.colors)) {
      if (lc(k) === low) delete s.colors[k];
    }
    if (!s.hidden.some(a => lc(a) === low)) s.hidden.push(d.address);
  });
}

function normalizeMutationData(value, type) { if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.address !== "string" || !SOLANA_ADDRESS_RE.test(value.address)) return null; const safe={address:value.address}; if(type==="AXG_UPSERT"){safe.name=typeof value.name==="string"?value.name.trim().slice(0,48):"";safe.emoji=typeof value.emoji==="string"&&[...value.emoji].length<=8?value.emoji:"";safe.color=typeof value.color==="string"&&HEX_RE.test(value.color)?value.color:"";} return safe; }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender?.id !== chrome.runtime.id) return false;
  if (msg?.type === "FETCH_WALLETS") {
    fetchAndSaveWallets().then(sendResponse);
    return true;
  }
  if (msg?.type === "AXG_UPSERT" || msg?.type === "AXG_REMOVE") {
    const data = normalizeMutationData(msg.data, msg.type);
    if (!data) { sendResponse({ ok: false, error: "invalid_wallet_data" }); return false; }
    const job = msg.type === "AXG_UPSERT" ? upsertWallet(data) : removeWallet(data);
    job.then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

