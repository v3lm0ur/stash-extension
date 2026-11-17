(() => {
  "use strict";
// --- Config ---
const AXIOM_CARD_SELECTOR = 'div[class*="border-primaryStroke"][class*="group"][class*="cursor-pointer"], div[class*="h-[72px]"][class*="group"][class*="cursor-pointer"]';
const BADGE_CLASS = 'ax-parser-username';
const BADGE_TEXT_CLASS = 'ax-parser-username__text';
const LINK_SELECTOR = 'a[href*="x.com"], a[href*="twitter.com"]';
const SITE = 'axiom';

const DEFAULTS = {
  platform: "axiom", textColor: "#e6e6e6", badgeBgColor: "#1b1b1f",
  logFontSize: "12px", badgePadding: 3, badgeOffsetX: 0, badgeOffsetY: 0,
  showAccounts: true, showTweets: true, showCommunities: true
};

const PREF = '[content]';
const log = () => {};
const err = () => {};

const pending = new WeakMap();
let rafEvtId = null;

let _settingsCache = null;
let _settingsPromise = null;

function isEnabled(settings) {
  return location.hostname.endsWith("axiom.trade") && settings?.enabled === true;
}

function getCardSelector() {
  return AXIOM_CARD_SELECTOR;
}

function getCards(root = document) {
  return Array.from(root.querySelectorAll(getCardSelector()));
}

function reapplyAllCards() {
  try {
    getSettingsCached().then(settings => {
      if (!isEnabled(settings)) { clearAllBadgesOnly(); return; }
      getCards().forEach(card => queueProcessCard(card));
    });
  } catch (e) { err('reapplyAllCards error', e); }
}

function getSettingsCached() {
  if (_settingsCache) return Promise.resolve(_settingsCache);
  if (_settingsPromise) return _settingsPromise;
  _settingsPromise = chrome.storage.local.get("stash.extension.state.v1").then(data => {
    const root = data?.["stash.extension.state.v1"] || {};
    const saved = root.settings?.usernames || {};
    _settingsCache = {
      ...DEFAULTS, ...saved,
      enabled: root.modules?.usernames === true,
      logFontSize: (Number(saved.logFontSize) || 12) + "px"
    };
    _settingsPromise = null;
    return _settingsCache;
  }).catch(() => {
    _settingsPromise = null;
    _settingsCache = { ...DEFAULTS };
    return _settingsCache;
  });
  return _settingsPromise;
}

function invalidateSettingsCache() {
  _settingsCache = null;
  _settingsPromise = null;
}

function tryReadCommunityInfoFromCard(card, communityId) {
  try {
    const raw = card?.dataset?.axpCommunityInfo;
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (communityId && obj.communityId && obj.communityId !== communityId) return null;
    return obj.info || null;
  } catch {
    return null;
  }
}

function writeCommunityInfoToCard(card, communityId, info) {
  try {
    const safe = (info && typeof info === 'object')
      ? { screenName: info.screenName || null }
      : info;
    card.dataset.axpCommunityInfo = JSON.stringify({ communityId, info: safe });
  } catch {}
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// --- X helpers ---
function extractUsernameFromX(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)x\.com$/i.test(u.hostname) && !/(^|\.)twitter\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0];
    const banned = new Set(['home','explore','settings','i','compose','messages','notifications','search','login','signup','share']);
    if (banned.has(first.toLowerCase())) return null;
    if (!/^[A-Za-z0-9_]{1,32}$/.test(first)) return null;
    return first;
  } catch(e) {
    const m1 = url.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^\/?#]+)\/status/i);
    if (m1 && m1[1]) return m1[1];
    const m2 = url.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^\/?#]+)/i);
    if (m2 && m2[1] && /^[A-Za-z0-9_]{1,32}$/.test(m2[1])) return m2[1];
    return null;
  }
}

const COMMUNITY_URL_RE = /(?:^|https?:\/\/(?:www\.)?(?:x|twitter)\.com)\/i\/communities\/([0-9]{15,21})(?:[\/?#]|$)/i;
function extractCommunityIdFromUrlish(value) {
  const m = String(value).match(COMMUNITY_URL_RE);
  return m ? m[1] : null;
}
function extractCommunityIdFromAttr(name, value) {
  const n = String(name || '').toLowerCase();
  const v = String(value || '');
  if (!(n.includes('community') && n.includes('id'))) return null;
  const trimmed = v.trim();
  if (/^\d{19}$/.test(trimmed)) return trimmed;
  return null;
}

// Text of the card WITHOUT our own injected badge. The badge is appended as a
// direct child of the card, so its "@username" text would otherwise be re-matched
// by the @-fallback below and re-stick onto a recycled node (leak until reload).
function cardTextExcludingBadge(card) {
  let s = '';
  for (const node of card.childNodes) {
    if (node.nodeType === 1 && node.classList && node.classList.contains(BADGE_CLASS)) continue;
    s += node.textContent || '';
  }
  return s;
}

function cardHasTweetLink(card) {
  const anchors = card.querySelectorAll('a[href]');
  for (const a of anchors) {
    if (/\/status\//i.test(a.href)) return true;
  }
  return false;
}

function parseCardForUsername(card, settings) {
  const anchors = card.querySelectorAll(LINK_SELECTOR);
  for (const a of anchors) {
    const href = a.href || '';
    const isTweet = /\/status\//i.test(href);
    const usernameX = extractUsernameFromX(href);
    if (!usernameX) continue;
    if (isTweet && settings && settings.showTweets === false) continue;
    if (!isTweet && settings && settings.showAccounts === false) continue;
    return usernameX;
  }

  // Fallback: в карточке @username часто не ссылка на x.com, а просто текст
  try {
    const txt = cardTextExcludingBadge(card).replace(/\s+/g, ' ').trim();
    const m = txt.match(/@([A-Za-z0-9_]{1,32})\b/);
    if (m && m[1]) {
      const hasTweet = cardHasTweetLink(card);
      if (hasTweet && settings && settings.showTweets === false) return null;
      if (!hasTweet && settings && settings.showAccounts === false) return null;
      return m[1];
    }
  } catch {}
  return null;
}

function parseCardForCommunity(card, settings) {
  if (settings && settings.showCommunities === false) return null;
  const anchors = card.querySelectorAll('a[href]');
  for (const a of anchors) {
    try {
      const cid = extractCommunityIdFromUrlish(a.href);
      if (cid) return cid;
    } catch {}
  }
  const communityEls = card.querySelectorAll('[data-community-id], [data-communityid], [data-communityId], [communityid]');
  for (const el of communityEls) {
    for (const attr of Array.from(el.attributes || [])) {
      const byUrl = extractCommunityIdFromUrlish(attr.value);
      if (byUrl) return byUrl;
      const byName = extractCommunityIdFromAttr(attr.name, attr.value);
      if (byName) return byName;
    }
  }
  for (const attr of Array.from(card.attributes || [])) {
    const byUrl = extractCommunityIdFromUrlish(attr.value);
    if (byUrl) return byUrl;
    const byName = extractCommunityIdFromAttr(attr.name, attr.value);
    if (byName) return byName;
  }

  // inline inline community label (no fetch needed)
  try {
    const icon = card.querySelector(
      'svg.lucide-users, svg[data-lucide="users"], svg[data-icon="users"], svg[aria-label*="community" i], svg[aria-label*="users" i], svg[title*="community" i]'
    );
    if (icon) {
      const holder = icon.closest('div,span,a') || icon.parentElement;
      if (holder) {
        const txt = (holder.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt && txt.length <= 40 && !/[\$%]/.test(txt) && !/\b(?:MC|TX|SOL|BUY)\b/i.test(txt)) {
          return { screenName: txt, __inline: true };
        }
      }
    }
  } catch {}
  return null;
}

// Stable per-coin identity. the virtualized list recycles card NODES across
// different coins (data-index slots), so the node itself is not a reliable key —
// the contract address is. Read it from the card's [data-ca] / /token/<mint> link.
const MINT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
function getCardCoinId(card) {
  try {
    // 1) Explicit contract-address attribute (present on some card templates).
    const el = card.querySelector('[data-ca]');
    if (el) {
      const v = (el.getAttribute('data-ca') || '').trim();
      if (MINT_RE.test(v)) return v;
    }
    // 2) Token / coin links carry the full mint reliably. Restricted to
    //    /token/ and /coin/ hrefs so we never pick up image/preview URL hashes.
    const links = card.querySelectorAll('[href*="/token/"], [href*="/coin/"]');
    for (const a of links) {
      const m = (a.getAttribute('href') || '').match(MINT_RE);
      if (m) return m[0];
    }
  } catch {}
  return null;
}

// Drop our injected badge + per-card markers. Used when a recycled node moves to
// a different coin so nothing from the previous coin lingers (the leak-until-reload bug).
function clearCardBadge(card) {
  try { const b = card.querySelector(`.${BADGE_CLASS}`); if (b) b.remove(); } catch {}
  try {
    delete card.dataset.axpCommunityInfo;
    delete card.dataset.axpCommunityIdRequested;
  } catch {}
}

function findCardFor(node) {
  return node.closest ? node.closest(getCardSelector()) : null;
}

function isInsideOverlay(el) {
  let cur = el;
  for (let i = 0; i < 8 && cur; i++) {
    if (!(cur instanceof HTMLElement)) break;
    const role = cur.getAttribute('role');
    if (role === 'dialog' || role === 'tooltip') return true;
    if (cur.hasAttribute('aria-modal')) return true;
    if (cur.style.position === 'fixed' || cur.classList.contains('fixed')) return true;
    cur = cur.parentElement;
  }
  return false;
}

function ensureBadge(card) {
  let wrap = card.querySelector(`.${BADGE_CLASS}`);
  if (!wrap) {
    wrap = document.createElement('span');
    wrap.className = BADGE_CLASS;
    const inner = document.createElement('span');
    inner.className = BADGE_TEXT_CLASS;
    wrap.appendChild(inner);
    card.appendChild(wrap);
  } else if (!wrap.querySelector(`.${BADGE_TEXT_CLASS}`)) {
    const inner = document.createElement('span');
    inner.className = BADGE_TEXT_CLASS;
    inner.textContent = wrap.textContent || '';
    wrap.textContent = '';
    wrap.appendChild(inner);
  }
  return wrap;
}

function stateHash(username, community, settings) {
  let cKey = community;
  if (community && typeof community === 'object') cKey = community.screenName || '';
  return `${username}|${cKey}|${settings.textColor}|${settings.badgeBgColor}|${settings.logFontSize}|${settings.badgePadding}|${settings.badgeOffsetX || 0}|${settings.badgeOffsetY || 0}|${settings.showAccounts !== false}|${settings.showTweets !== false}|${settings.showCommunities !== false}`;
}

function applyToCard(card, settings, preUsername, preCommunity) {
  if (isInsideOverlay(card)) return;

  const username = preUsername !== undefined ? preUsername : parseCardForUsername(card, settings);
  const community = preCommunity !== undefined ? preCommunity : parseCardForCommunity(card, settings);
  const existing = card.querySelector(`.${BADGE_CLASS}`);

  if (!username && !community) {
    if (existing) existing.remove();
    return;
  }

  const desiredKey = stateHash(username, community, settings);
  const wrap = ensureBadge(card);
  if (wrap.dataset.axpState === desiredKey) return;

  const inner = wrap.querySelector(`.${BADGE_TEXT_CLASS}`);

  const htmlParts = [];
  if (username) htmlParts.push('@' + escHtml(username));
  if (community) {
    if (typeof community === 'object' && community.screenName) {
      const name = escHtml(community.screenName);
      const isPlaceholder = !!community.__placeholder;
      htmlParts.push(isPlaceholder
        ? `<span style="opacity:0.75; font-style:italic">community: ${name}</span>`
        : name);
    } else if (typeof community === 'string') {
      htmlParts.push(escHtml(community));
    }
  }

  const desiredHtml = htmlParts.join('\n');
  if (inner.innerHTML !== desiredHtml) inner.innerHTML = desiredHtml;

  if (!card.dataset.axpPos) {
    card.style.position = 'relative';
    card.dataset.axpPos = '1';
  }

  if (!wrap.classList.contains('axp-badge')) wrap.classList.add('axp-badge');
  wrap.style.padding = `${Number(settings.badgePadding)}px ${Number(settings.badgePadding) * 2 + 4}px`;
  wrap.style.left = `${8 + (Number(settings.badgeOffsetX) || 0)}px`;
  wrap.style.bottom = `${8 - (Number(settings.badgeOffsetY) || 0)}px`;
  wrap.style.color = settings.textColor || DEFAULTS.textColor;
  wrap.style.fontSize = settings.logFontSize || DEFAULTS.logFontSize;
  wrap.style.background = settings.badgeBgColor || DEFAULTS.badgeBgColor;

  if (!inner.classList.contains('axp-badge-inner')) inner.classList.add('axp-badge-inner');

  wrap.dataset.axpState = desiredKey;
  scheduleBadgeEvent();
}

function scheduleBadgeEvent() {
  if (rafEvtId) return;
  rafEvtId = requestAnimationFrame(() => {
    rafEvtId = null;
    try { document.body.dispatchEvent(new CustomEvent('axiom:badges-updated', { bubbles: true })); } catch(_){}
  });
}

async function processCard(card) {
  try {
    const settings = await getSettingsCached();
    if (!isEnabled(settings)) {
      clearCardBadge(card);
      return;
    }

    // Identity guard: if this recycled node now holds a different coin than the one
    // our badge/markers were drawn for, wipe them first so nothing leaks across coins.
    const coinId = getCardCoinId(card);
    const prevCoin = card.dataset.axpCoin || '';
    if (prevCoin && coinId && prevCoin !== coinId) clearCardBadge(card);
    if (coinId) card.dataset.axpCoin = coinId;

    const username = parseCardForUsername(card, settings);
    const communityParsed = parseCardForCommunity(card, settings);
    const communityId = (typeof communityParsed === 'string') ? communityParsed : null;
    const inlineCommunity = (!communityId && communityParsed && typeof communityParsed === 'object') ? communityParsed : null;

    // 1) Draw immediately (cached community + placeholder while fetch is in flight)
    const cachedCommunityInfo = communityId ? tryReadCommunityInfoFromCard(card, communityId) : null;
    const placeholderCommunity = (!cachedCommunityInfo && communityId) ? { screenName: '…', __placeholder: true } : null;
    applyToCard(card, settings, username, inlineCommunity || cachedCommunityInfo || placeholderCommunity || null);

    // 2) Fetch community screenName (only network call this extension makes per card)
    if (!communityId) {
      // card recycles card nodes in its virtualized list: a node that once held a
      // community coin can be repainted with a community-less coin. Clear the stale
      // marker so an in-flight fetch from the previous coin can't validate against it.
      delete card.dataset.axpCommunityIdRequested;
      return;
    }
    card.dataset.axpCommunityIdRequested = String(communityId);

    try {
      if (typeof window.fetchCommunityScreenName !== 'function') {
        err('processCard: fetchCommunityScreenName is not defined');
        return;
      }
      const communityInfo = await window.fetchCommunityScreenName(communityId);

      // The card node may have been recycled onto a different coin while we awaited
      // the network. Verify the coin identity AND re-read the LIVE DOM instead of
      // trusting values captured before the await — otherwise the previous coin's
      // @username/community leaks onto whatever coin now occupies this node.
      if (coinId && getCardCoinId(card) !== coinId) return; // node recycled to another coin
      const liveParsed = parseCardForCommunity(card, settings);
      const liveCommunityId = (typeof liveParsed === 'string') ? liveParsed : null;
      if (liveCommunityId !== communityId) return; // node no longer this coin
      const liveUsername = parseCardForUsername(card, settings);

      if (communityInfo) writeCommunityInfoToCard(card, communityId, communityInfo);
      applyToCard(card, settings, liveUsername, communityInfo || null);
    } catch (e) {
      err('processCard: error fetching community info', e);
    }
  } catch (e) {
    err('Axiom parser error processing card', e);
  }
}

function queueProcessCard(card) {
  if (!card || !(card instanceof HTMLElement)) return;
  if (pending.has(card)) return;
  pending.set(card, true);
  requestAnimationFrame(() => {
    pending.delete(card);
    processCard(card);
  });
}

function initialScan() {
  getSettingsCached().then(settings => {
    if (!isEnabled(settings)) { clearAllBadgesOnly(); return; }
    const cards = getCards();
    const links = document.querySelectorAll(LINK_SELECTOR);
    cards.forEach(card => queueProcessCard(card));
    links.forEach(a => {
      const card = findCardFor(a);
      if (card) queueProcessCard(card);
    });
  });
}

function clearAllBadgesOnly() {
  try { document.querySelectorAll(`.${BADGE_CLASS}`).forEach(el => el.remove()); } catch {}
}

// True only when a mutation adds/removes real ELEMENT nodes (a content swap),
// not when it just swaps a #text node (price/age ticks). Lets us re-evaluate a
// recycled card on coin change without re-running on every per-second tick.
function mutationHasElementChurn(m) {
  for (const n of m.addedNodes) if (n.nodeType === 1) return true;
  for (const n of m.removedNodes) if (n.nodeType === 1) return true;
  return false;
}

function observe() {
  const obs = new MutationObserver(muts => {
    if (_settingsCache && !isEnabled(_settingsCache)) return;
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches && node.matches(LINK_SELECTOR)) {
            const card = findCardFor(node); if (card) queueProcessCard(card);
          }
          const links = node.querySelectorAll ? node.querySelectorAll(LINK_SELECTOR) : [];
          if (links.length) links.forEach(l => { const card = findCardFor(l); if (card) queueProcessCard(l.closest(getCardSelector()) || card); });
          if (node.matches && node.matches(getCardSelector())) queueProcessCard(node);
          const innerCards = node.querySelectorAll ? node.querySelectorAll(getCardSelector()) : [];
          if (innerCards.length) innerCards.forEach(c => queueProcessCard(c));
        });
      }

      // the virtual list recycles a card NODE onto a different coin by swapping
      // its inner content. That swap (element churn) won't necessarily add an x.com
      // link or a fresh CARD node, so the branches above can miss it — leaving the
      // previous coin's badge stuck. Re-queue the enclosing card on any element churn
      // so processCard's identity guard can rebuild/clear it. Text-only ticks are
      // skipped by mutationHasElementChurn to avoid load.
      if (mutationHasElementChurn(m)) {
        const card = (m.target && m.target.nodeType === 1) ? findCardFor(m.target) : null;
        if (card) queueProcessCard(card);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  const obsAttrs = new MutationObserver(muts => {
    for (const m of muts) {
      const node = m.target;
      if (!(node instanceof HTMLElement)) continue;
      // href change on an x-link, or a coin-identity (data-ca) change on a recycled
      // node — both mean the card's coin may have changed; re-evaluate it.
      if (m.attributeName === 'data-ca') {
        const card = findCardFor(node);
        if (card) queueProcessCard(card);
      } else if (node instanceof HTMLAnchorElement && node.matches(LINK_SELECTOR)) {
        const card = findCardFor(node);
        if (card) queueProcessCard(card);
      }
    }
  });
  obsAttrs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['href', 'data-ca'] });
}

(function init() {
  if (!document.getElementById('axp-oracle-styles')) {
    const style = document.createElement('style');
    style.id = 'axp-oracle-styles';
    style.textContent = `
      .axp-badge{position:absolute;left:8px;bottom:8px;right:auto;z-index:1;display:inline-block;box-sizing:border-box;max-width:calc(100% - 16px);border-radius:8px;line-height:1.2;font-weight:500;border:1px solid rgba(255,255,255,0.08);user-select:text;-webkit-user-select:text;cursor:text}
      .axp-badge-inner{display:inline;white-space:pre-line;word-break:break-word;overflow:visible;text-overflow:clip;user-select:text;-webkit-user-select:text;cursor:text}
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  initialScan();
  observe();
})();

// Exposed for popup "Очистить кэш" button: drops session-accumulated state
// (community-api cache, badge DOM, card dataset markers) and re-scans the page.
// STASH settings in chrome.storage.local are intentionally NOT touched.
window.__axpClearAll = function() {
  try { window.__axpClearCommunityCache && window.__axpClearCommunityCache(); } catch (e) { err('clearCommunityCache failed', e); }
  try {
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach(el => el.remove());
    getCards().forEach(card => {
      delete card.dataset.axpCommunityInfo;
      delete card.dataset.axpCommunityIdRequested;
      delete card.dataset.axpPos;
      delete card.dataset.axpCoin;
    });
  } catch (e) { err('clearAll DOM cleanup failed', e); }
  try { initialScan(); } catch (e) { err('clearAll rescan failed', e); }
};

// Exposed for popup "Состояние" panel — cheap snapshot. Only runs when popup
// calls it via executeScript. Zero ongoing overhead.
window.__axpGetStats = function() {
  let badges = 0, cards = 0, cacheSize = 0, cacheLimit = 500;
  try { badges = document.querySelectorAll(`.${BADGE_CLASS}`).length; } catch {}
  try { cards = getCards().length; } catch {}
  try {
    const c = window.__axpGetCommunityCacheStats && window.__axpGetCommunityCacheStats();
    if (c) { cacheSize = c.size || 0; cacheLimit = c.limit || 500; }
  } catch {}
  return { badges, cards, cacheSize, cacheLimit };
};

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes["stash.extension.state.v1"]) return;
    invalidateSettingsCache();
    reapplyAllCards();
  });
} catch (e) { err('onChanged attach failed', e); }


})();
