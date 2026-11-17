(() => {
  "use strict";
// STASH Dev Glow bridge: isolated world <-> Axiom page world.
const STORAGE_KEY = "stash.extension.state.v1";
const TRACKER_KEYS = ["trackedWallets", "walletColors"];
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
function alive() { try { return !!chrome.runtime?.id; } catch { return false; } }
let staleNotified = false;
function notifyStale() { if (staleNotified) return; staleNotified = true; window.dispatchEvent(new CustomEvent("axg:stale")); }
function pushConfig() {
  if (!alive()) return;
  chrome.storage.local.get([STORAGE_KEY, ...TRACKER_KEYS], (r) => {
    if (chrome.runtime.lastError) return;
    const root = r[STORAGE_KEY] || {};
    window.dispatchEvent(new CustomEvent("axg:config", { detail: JSON.stringify({
      wallets: r.trackedWallets || [], colors: r.walletColors || {},
      settings: root.settings?.devglow || {}, enabled: root.modules?.devglow === true
    }) }));
  });
}
function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("devglow/glow.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}
function forward(type, event) {
  if (typeof event.detail !== "string" || event.detail.length > 512) return;
  let data; try { data = JSON.parse(event.detail); } catch { return; }
  if (!data || typeof data.address !== "string" || !SOLANA_ADDRESS_RE.test(data.address)) return;
  const safeData = { address: data.address };
  if (type === "AXG_UPSERT") { safeData.name = typeof data.name === "string" ? data.name.trim().slice(0, 48) : ""; safeData.emoji = typeof data.emoji === "string" && [...data.emoji].length <= 8 ? data.emoji : ""; safeData.color = typeof data.color === "string" && HEX_COLOR_RE.test(data.color) ? data.color : ""; }
  if (!alive()) { notifyStale(); return; }
  try { chrome.runtime.sendMessage({ type, data: safeData }, () => { if (chrome.runtime.lastError) notifyStale(); }); }
  catch { notifyStale(); }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (STORAGE_KEY in changes || TRACKER_KEYS.some(k => k in changes))) pushConfig();
});
window.addEventListener("axg:requestConfig", pushConfig);
window.addEventListener("axg:upsert", e => forward("AXG_UPSERT", e));
window.addEventListener("axg:remove", e => forward("AXG_REMOVE", e));
injectScript();
pushConfig();

})();
