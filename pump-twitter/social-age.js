// social-age.js — главный мир страницы (world: MAIN).
// Возраст рядом с иконкой твиттера (офлайн, из ID-снежинки):
//   • твит (/status/<id>) — из ID твита (Axiom);
//   • профиль (x.com/<handle>) — из user-id в пропсах (Axiom user-id не отдаёт).
// Число вплотную к иконке, цвет = цвет иконки. Фильтр «показывать от X секунд».
// Настройки через <html data-pe-age="<minSeconds>"> (пусто = выключено), ставит content.js.

(function () {
  'use strict';
  const EPOCH = 1288834974657n;
  const STYLE_ID = 'pe-age-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.pe-age{display:inline-flex;align-items:center;font:600 11px/1 ui-monospace,monospace;' +
      'margin:0 0 0 2px;vertical-align:middle;flex:none;white-space:nowrap;pointer-events:none;}';
    (document.head || document.documentElement).appendChild(s);
  }

  // null = выключено; иначе минимальный возраст в секундах, с которого показывать
  function getMin() {
    const v = document.documentElement.getAttribute('data-pe-age');
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function snow(idStr) {
    try {
      const id = BigInt(idStr);
      if (id <= 0n) return NaN;
      return Number((id >> 22n) + EPOCH);
    } catch (e) {
      return NaN;
    }
  }
  const valid = (ms) => ms && ms > 1356998400000 && ms < Date.now() + 86400000;

  // Время "на начало текущей секунды": сколько бы раз ни перерисовывали между тиками,
  // число меняется только на границе секунды — счётчик идёт ровно, без скачков.
  const nowTick = () => Math.floor(Date.now() / 1000) * 1000;

  function fmt(ms) {
    const s = Math.max(0, Math.floor((nowTick() - ms) / 1000));
    const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (s < 60) return s + 's';
    if (m < 60) return m + 'm';
    if (h < 24) return h + 'h';
    return d + 'd';
  }

  function getFiber(el) {
    for (const k in el) if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return el[k];
    return null;
  }
  function deepFindId(o, d, seen) {
    if (o == null || d < 0 || typeof o !== 'object' || o instanceof Node || seen.has(o)) return null;
    seen.add(o);
    if ('idOrHandle' in o && o.isHandle === false && typeof o.idOrHandle === 'string' && /^\d{5,}$/.test(o.idOrHandle)) {
      return o.idOrHandle;
    }
    for (const k of Object.keys(o)) {
      let v; try { v = o[k]; } catch (e) { continue; }
      if (v && typeof v === 'object') { const r = deepFindId(v, d - 1, seen); if (r) return r; }
    }
    return null;
  }
  function profileId(a) {
    let f = getFiber(a), hop = 0;
    while (f && hop++ < 8) {
      const r = deepFindId(f.memoizedProps, 4, new WeakSet());
      if (r) return r;
      f = f.return;
    }
    return null;
  }

  function computeMs(a) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/(?:x|twitter)\.com\/[^\/]+\/status\/(\d+)/i);
    if (m) { const ms = snow(m[1]); return valid(ms) ? ms : null; }
    if (/^https:\/\/(?:x|twitter|mobile\.twitter)\.com\/[^\/?#]+\/?$/i.test(href)) {
      const id = profileId(a);
      if (id) { const ms = snow(id); return valid(ms) ? ms : null; }
    }
    return null;
  }

  function iconColor(a) {
    const svg = a.querySelector('svg,i');
    let c = '';
    try { c = getComputedStyle(svg || a).color; } catch (e) {}
    return c || 'currentColor';
  }

  // Сайт уже сам показывает возраст рядом с иконкой (Axiom на Robinhood и др.)?
  // Тогда своё число не добавляем, чтобы не было дубля.
  const AGE_TXT = /^\d+\s?(s|m|h|d|mo|y)$/i;
  function hasNativeAge(a) {
    if (/\d/.test((a.textContent || '').trim())) return true;
    let n = a.nextElementSibling;
    for (let i = 0; n && i < 3; i++, n = n.nextElementSibling) {
      if (n.classList && n.classList.contains('pe-age')) { i--; continue; }
      if (AGE_TXT.test((n.textContent || '').trim())) return true;
    }
    return false;
  }

  function clearWrapper(w) {
    if (w.dataset.peWrap !== '1') return; // обёртку не меняли — не трогаем стили сайта
    delete w.dataset.peWrap;
    w.style.removeProperty('display');
    w.style.removeProperty('align-items');
    w.style.removeProperty('width');
    w.style.removeProperty('overflow');
  }

  function scan() {
    const min = getMin();
    const prev = document.querySelectorAll('.pe-age');
    if (min == null) {
      prev.forEach((e) => { const w = e.parentElement; e.remove(); if (w) clearWrapper(w); });
      return;
    }
    injectStyle();
    // ссылки с aria-label; Axiom: обычный href (поиск x.com/search пропускаем)
    const anchors = document.querySelectorAll(
      'a[aria-label^="https://x.com"],a[aria-label^="https://twitter.com"],a[aria-label^="https://mobile.twitter.com"],' +
      'a[href^="https://x.com/"]:not([href*="/search"]),a[href^="https://twitter.com/"]:not([href*="/search"])'
    );
    anchors.forEach((a) => {
      const w = a.parentElement;
      if (!w) return;

      // кэш ms на самом якоре (дата твита не меняется — считаем один раз).
      // Сбрасываем, если сайт переиспользовал этот элемент под другой твит.
      const href = a.getAttribute('href') || '';
      if (a.dataset.peHref !== href) { delete a.dataset.peMs; a.dataset.peHref = href; }
      let cached = a.dataset.peMs;
      if (cached === undefined) {
        const c = computeMs(a);
        a.dataset.peMs = c == null ? '' : String(c);
        cached = a.dataset.peMs;
      }
      const ms = cached === '' ? null : Number(cached);

      let span = a.nextElementSibling;
      const hasSpan = span && span.classList && span.classList.contains('pe-age');
      const ageSec = ms == null ? -1 : Math.floor((nowTick() - ms) / 1000);
      const shouldShow = ms != null && ageSec >= min && !hasNativeAge(a);

      if (!shouldShow) {
        if (hasSpan) { span.remove(); clearWrapper(w); }
        return;
      }
      if (!hasSpan) {
        // иконка в отдельной обёртке фиксированного размера — расширяем её,
        // чтобы число было вплотную. Если в обёртке есть что-то ещё (Axiom: ряд иконок) —
        // не трогаем, число просто встаёт следом за иконкой.
        if (w.children.length === 1) {
          w.dataset.peWrap = '1';
          w.style.setProperty('display', 'inline-flex', 'important');
          w.style.setProperty('align-items', 'center', 'important');
          w.style.setProperty('width', 'auto', 'important');
          w.style.setProperty('overflow', 'visible', 'important');
        }
        span = document.createElement('span');
        span.className = 'pe-age';
        span.style.color = iconColor(a);
        a.insertAdjacentElement('afterend', span);
      }
      const txt = fmt(ms);
      if (span.textContent !== txt) span.textContent = txt;
    });
  }

  let last = 0, pending = false;
  function schedule() {
    const n = Date.now();
    if (n - last > 400) { last = n; scan(); return; }
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; last = Date.now(); scan(); }, 400);
  }

  function start() {
    if (document.body) new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(scan).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pe-age'] });
    // ровный таймер: срабатывает на границе каждой секунды, без накопления сдвига
    const tick = () => { scan(); setTimeout(tick, 1000 - (Date.now() % 1000) + 5); };
    tick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

