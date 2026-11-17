(() => {
  "use strict";
const BADGE_CLASS = "stash-migration-percent-badge";
const SITE = "axiom";
const STORAGE_KEY = "stash.extension.state.v1";
let moduleEnabled = false;

// Карточка токена
const AXIOM_CARD_SELECTOR =
  'div[class*="border-primaryStroke"][class*="group"][class*="cursor-pointer"], ' +
  'div[class*="border-b"][class*="group"][class*="cursor-pointer"], ' +
  'div[class*="h-[72px]"][class*="group"][class*="cursor-pointer"], ' +
  'div[class*="h-[142px]"][class*="group"][class*="cursor-pointer"], ' +
  'div[class*="sm:h-[116px]"][class*="group"][class*="cursor-pointer"]';

const NO_ACCENT = { hide: false, borderColor: null, percentColor: null, fractionColor: null };

function getCardSelector() {
  return AXIOM_CARD_SELECTOR;
}

function isEnabledHere() {
  return moduleEnabled;
}

function clearAllBadges() {
  document.querySelectorAll("." + BADGE_CLASS).forEach((badge) => {
    const owner = badge.parentElement;
    if (owner) {
      owner.style.fontSize = "";
      owner.style.lineHeight = "";
      if (owner.dataset.migrationPositionWasSet === "1") {
        owner.style.position = owner.dataset.migrationPreviousPosition || "";
        delete owner.dataset.migrationPositionWasSet;
        delete owner.dataset.migrationPreviousPosition;
      }
      Array.from(owner.parentElement?.children || []).forEach((sibling) => {
        if (sibling !== owner && isIconEl(sibling)) sibling.style.display = "";
      });
    }
    badge.remove();
  });
}

// Общие настройки бейджа
let badgeSettings = {
  platform: "axiom",
  scale: 1.4,
  offsetX: 0,
  offsetY: 0,
  borderColor: "#ffffff",   // цвет обводки по умолчанию, если профили не срабатывают
  percentColor: "#ffffff",  // цвет текста "%"
  fractionColor: "#ffffff", // цвет текста "x/y"
  borderWidth: 2.5,         // толщина обводки круга, px
  percentSize: 9.5,         // размер шрифта "%", px (до масштаба)
  fractionSize: 6.5         // размер шрифта "x/y", px (до масштаба)
};

// Профили: [{ enabled, threshold, mode: 'colorAbove'|'hideBelow', borderColor, percentColor, fractionColor }]
const DEFAULT_PROFILES = [
  { enabled: true, threshold: 10, mode: "colorAbove", borderColor: "#ffff00", percentColor: "#ffff00", fractionColor: "#ffffff" },
  { enabled: true, threshold: 25, mode: "colorAbove", borderColor: "#ff0000", percentColor: "#ff0000", fractionColor: "#ffffff" },
  { enabled: true, threshold: 50, mode: "colorAbove", borderColor: "#00ff00", percentColor: "#00ff00", fractionColor: "#ffffff" }
];
let badgeProfiles = DEFAULT_PROFILES.map((p) => ({ ...p }));

// Состояние по карточкам на один "проход" скана
let scanId = 0;
const cardScanState = new WeakMap(); // card -> { scanId, hiddenCount, hideAll }

function getCardState(card) {
  let st = cardScanState.get(card);
  if (!st || st.scanId !== scanId) {
    st = { scanId, hiddenCount: 0, hideAll: false };
    cardScanState.set(card, st);
  }
  return st;
}

// "#rrggbb" -> rgba с заданной прозрачностью
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 2200 -> "2.2K", 1500000 -> "1.5M", 999 -> "999"
function formatCompact(value) {
  const n = Number(value);
  if (n >= 1e6) return trimZero((n / 1e6).toFixed(1)) + "M";
  if (n >= 1e3) return trimZero((n / 1e3).toFixed(1)) + "K";
  return String(n);
}

function trimZero(s) {
  return s.replace(/\.0$/, "");
}

function shouldHideByProfile(percent) {
  for (const profile of badgeProfiles) {
    if (!profile || !profile.enabled) continue;
    if (profile.mode === "hideBelow" && percent < profile.threshold) {
      return true;
    }
  }
  return false;
}

// Возвращает { hide, borderColor, percentColor, fractionColor }.
// null означает "профиль не задал этот цвет, использовать значение по умолчанию из настроек".
function getAccentForPercent(percent) {
  if (shouldHideByProfile(percent)) return { ...NO_ACCENT, hide: true };

  let best = null;
  let bestThreshold = -Infinity;
  for (const profile of badgeProfiles) {
    if (!profile || !profile.enabled) continue;
    if (profile.mode === "colorAbove" && percent >= profile.threshold) {
      if (profile.threshold > bestThreshold) {
        bestThreshold = profile.threshold;
        best = profile;
      }
    }
  }
  if (!best) return NO_ACCENT;

  return {
    hide: false,
    borderColor: best.borderColor || null,
    percentColor: best.percentColor || null,
    fractionColor: best.fractionColor || null
  };
}

function applyStylesToBadge(span, overrideAccent) {
  const { scale, offsetX, offsetY, borderColor, percentColor, fractionColor, borderWidth, percentSize, fractionSize } = badgeSettings;
  const percent = parseFloat(span.dataset.migrationPercentValue);
  const from = span.dataset.migrationFrom || "";
  const total = span.dataset.migrationTotal || "";

  let accent = overrideAccent;
  if (accent === undefined) {
    accent = getAccentForPercent(percent);
    if (accent.hide) { span.style.display = "none"; return; }
  }

  const borderBase = accent.borderColor || borderColor;
  const percentBase = accent.percentColor || percentColor;
  const fractionBase = accent.fractionColor || fractionColor;

  span.style.display = "flex";

  // Круглый бейдж с двумя строками: процент сверху, x/n снизу.
  const diameter = 32 * scale;
  const percentFontSize = percentSize * scale;
  const fractionFontSize = fractionSize * scale;

  span.style.width = diameter + "px";
  span.style.height = diameter + "px";
  span.style.borderRadius = "50%";
  span.style.flexDirection = "column";
  span.style.alignItems = "center";
  span.style.justifyContent = "center";
  span.style.lineHeight = "1.1";
  span.style.fontWeight = "500";
  span.style.pointerEvents = "none";
  span.style.whiteSpace = "nowrap";
  span.style.boxSizing = "border-box";
  span.style.textAlign = "center";
  span.style.overflow = "hidden";

  span.style.color = percentBase;
  span.style.background = "transparent";
  span.style.border = `${borderWidth}px solid ${hexToRgba(borderBase, 0.35)}`;

  span.innerHTML = "";

  const percentLine = document.createElement("span");
  percentLine.textContent = `${percent.toFixed(0)}%`;
  percentLine.style.fontSize = percentFontSize + "px";
  percentLine.style.fontWeight = "600";
  percentLine.style.color = percentBase;

  const fractionLine = document.createElement("span");
  fractionLine.textContent = from && total ? `${formatCompact(from)}/${formatCompact(total)}` : "";
  fractionLine.style.fontSize = fractionFontSize + "px";
  fractionLine.style.opacity = "0.85";
  fractionLine.style.color = fractionBase;

  span.appendChild(percentLine);
  if (fractionLine.textContent) span.appendChild(fractionLine);

  // Absolute positioning — badge садится прямо на место скрытых короны/X-Y и НЕ
  // занимает место в layout строки (иначе на узких окнах он выталкивает MC/V/F
  // за viewport). offsetX/offsetY — тонкая подстройка стрелками в попапе.
  span.style.position = "absolute";
  span.style.left = `${offsetX}px`;
  span.style.top = `calc(50% + ${offsetY}px)`;
  span.style.transform = "translateY(-50%)";
}

function createBadge(percent, from, total) {
  const acc = getAccentForPercent(percent);
  if (acc.hide) return null;

  const span = document.createElement("span");
  span.className = BADGE_CLASS;
  span.dataset.migrationPercentValue = String(percent);
  span.dataset.migrationFrom = String(from);
  span.dataset.migrationTotal = String(total);
  applyStylesToBadge(span, acc);
  return span;
}

function updateAllBadgesStyles() {
  if (!isEnabledHere()) {
    clearAllBadges();
    return;
  }
  document.querySelectorAll("." + BADGE_CLASS).forEach((badge) => {
    applyStylesToBadge(badge);
  });
}

// Текст ТОЛЬКО самого элемента (его прямые текстовые узлы), без потомков.
// Нельзя использовать el.textContent: он склеивает текст со всех вложенных элементов,
// поэтому несвязанные числа (строка соцсетей/наград g-social, бейджи, которые в эту же
// строку инжектят ДРУГИЕ расширения вроде сторонние плагины) слепляются в фейковый "X/Y".
// Настоящее значение миграции (мигрировало/создано у дева — стат с короной) лежит в одном
// leaf-элементе, чей собственный текст РОВНО равен "X/Y".
function directTextOf(el) {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.nodeValue; // 3 = TEXT_NODE
  }
  return s.replace(/\s+/g, " ").trim();
}

// Иконка: <i> или <svg> (сам элемент или внутри), без собственного текста
function isIconEl(node) {
  if (!(node instanceof Element)) return false;
  if (node.classList.contains(BADGE_CLASS)) return false;
  if ((node.textContent || "").trim()) return false;
  return node.matches("i, svg") || !!node.querySelector("i, svg");
}

function processElement(el) {
  if (!(el instanceof HTMLElement)) return;
  if (el.classList.contains(BADGE_CLASS)) return;

  const text = directTextOf(el);
  if (!text) return;

  // Якорим по всей строке: элемент должен быть ИМЕННО значением "X/Y", а не содержать
  // его как часть более длинного текста. Это и отсекает склейки из чужих мест.
  const match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return;

  // Счётчики миграций из расширения Axiom Funding тоже выглядят как "X/Y", но это
  // не стат деве с короной. Не трогаем их, иначе наш круг налезает на их плашку.
  if (el.closest(".axf-badge, .axf-mig-only")) return;


  const from = parseInt(match[1], 10);
  const total = parseInt(match[2], 10);
  if (total === 0) return;

  const percent = (from / total) * 100;

  // Иконка-«корона» — соседний элемент рядом с текстом X/Y в одном контейнере.
  const wrapper = el.parentElement;
  const iconSiblings = wrapper
    ? Array.from(wrapper.children).filter(
        (child) => child !== el && !child.classList.contains(BADGE_CLASS)
      )
    : [];

  // Круг только у стата, к которому привязана корона: рядом с X/Y должна стоять иконка.
  // Любой другой "X/Y" (без иконки рядом) не трогаем.
  if (!iconSiblings.some(isIconEl)) {
    el.querySelector(":scope > ." + BADGE_CLASS)?.remove();
    return;
  }

  // Возвращает корону и текст X/Y в исходный вид, прячет наш круг (если он есть).
  function restoreOriginal() {
    iconSiblings.forEach((ic) => { ic.style.display = ""; });
    el.style.fontSize = "";
    el.style.lineHeight = "";
    const existingBadge = el.querySelector(":scope > ." + BADGE_CLASS);
    if (existingBadge) existingBadge.style.display = "none";
  }

  if (!Number.isFinite(percent) || percent > 100) {
    const existingOver = el.querySelector(":scope > ." + BADGE_CLASS);
    if (existingOver) existingOver.remove();
    restoreOriginal();
    return;
  }

  // Совсем свежий токен у дева (X/1) — процент неинформативен: оставляем корону
  // с текстом как есть, круг не показываем вообще.
  if (total === 1) {
    restoreOriginal();
    return;
  }

  const card = el.closest(getCardSelector());
  if (!card) { restoreOriginal(); return; }
  const cardState = getCardState(card);
  if (shouldHideByProfile(percent)) {
    cardState.hiddenCount++;
    if (cardState.hiddenCount >= 2) cardState.hideAll = true;
  }
  if (cardState.hideAll) {
    card.querySelectorAll("." + BADGE_CLASS).forEach((b) => { b.style.display = "none"; });
    restoreOriginal();
    return;
  }

  // Прячем корону и оригинальный текст X/Y — круг встаёт на их место.
  iconSiblings.forEach((ic) => { ic.style.display = "none"; });
  el.style.fontSize = "0px";
  el.style.lineHeight = "0";

  const existing = el.querySelector(":scope > ." + BADGE_CLASS);
  if (existing) {
    existing.dataset.migrationPercentValue = String(percent);
    existing.dataset.migrationFrom = String(from);
    existing.dataset.migrationTotal = String(total);
    applyStylesToBadge(existing);
    return;
  }

  const badge = createBadge(percent, from, total);
  if (!badge) return;
  // Бейдж — absolute; даём родителю relative-якорь, если у него ещё нет positioning.
  // Без этого badge зацепится за более дальний ancestor и уедет не туда.
  const cs = getComputedStyle(el);
  if (cs.position === "static") { el.dataset.migrationPreviousPosition = el.style.position; el.dataset.migrationPositionWasSet = "1"; el.style.position = "relative"; }
  el.appendChild(badge);
}

function scanNode(root) {
  if (!isEnabledHere()) {
    clearAllBadges();
    return;
  }
  if (!(root instanceof HTMLElement)) return;
  processElement(root);
  root.querySelectorAll("*").forEach(processElement);
}

// ═══════════════════════════════════════════════════════════════════════════
// PERF: scoped scanning instead of full-DOM walk + setInterval.
// Each mutation marks its closest card as "dirty"; a single RAF coalesces all
// pending cards into one pass per frame.
// ═══════════════════════════════════════════════════════════════════════════

const dirtyRoots = new Set();
let rafPending = false;

function scheduleProcess(root) {
  if (!root) return;
  dirtyRoots.add(root);
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(processDirty);
}

function processDirty() {
  rafPending = false;
  if (!dirtyRoots.size || !isEnabledHere()) { dirtyRoots.clear(); return; }
  scanId++; // new pass — resets per-card aggregation state
  const roots = Array.from(dirtyRoots);
  dirtyRoots.clear();
  for (const root of roots) {
    if (!document.body.contains(root)) continue;
    scanNode(root);
  }
}

function initialScan() {
  scheduleProcess(document.body);
}

let mutationObserver = null;

function observeMutations() {
  if (!moduleEnabled || badgeSettings.platform !== SITE || !document.body || mutationObserver) return;
  mutationObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.classList?.contains(BADGE_CLASS) || node.closest?.("." + BADGE_CLASS)) continue;
          const card = node.closest(getCardSelector());
          scheduleProcess(card || node);
        }
      } else if (m.type === "characterData") {
        // Fast-skip: most text changes on Axiom are price updates that can't be X/Y.
        // Only enqueue if the new text actually has the X/Y pattern.
        const text = m.target.nodeValue || "";
        if (!/\d+\s*\/\s*\d+/.test(text)) continue;
        const parent = m.target.parentElement;
        if (!parent || parent.closest("." + BADGE_CLASS)) continue;
        const card = parent.closest(getCardSelector());
        scheduleProcess(card || parent);
      }
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function disconnectMutations() { mutationObserver?.disconnect(); mutationObserver = null; }

function loadSettings() {
  const applyState = (root) => {
    const cfg = root?.settings?.migration || {};
    badgeSettings = Object.assign({}, badgeSettings, cfg);
    badgeProfiles = Array.isArray(cfg.profiles) ? cfg.profiles : DEFAULT_PROFILES.map(p => ({ ...p }));
    moduleEnabled = root?.modules?.migration === true && badgeSettings.platform === SITE;
    updateAllBadgesStyles();
    if (moduleEnabled) { observeMutations(); initialScan(); }
    else { disconnectMutations(); dirtyRoots.clear(); clearAllBadges(); }
  };
  chrome.storage.local.get(STORAGE_KEY).then(data => applyState(data[STORAGE_KEY])).catch(() => applyState(null));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) applyState(changes[STORAGE_KEY].newValue);
  });
}
// ═══ Start ═══════════════════════════════════════════════════════════════════
loadSettings();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (moduleEnabled) { initialScan(); observeMutations(); }
  });
} else {
  if (moduleEnabled) { initialScan(); observeMutations(); }
}


})();
