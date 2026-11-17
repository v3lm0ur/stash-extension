// Axiom Stretch — исправление координат (работает в контексте самой страницы).
//
// Проблема: страница растянута через transform: scale(x, y) на <html>.
// Браузер отдаёт сайту координаты в "экранных" (растянутых) пикселях,
// а вёрстка живёт в "нерастянутых". Из-за этого тултипы, попапы,
// выпадающие меню и клики по canvas смещаются.
//
// Решение: переводим всё, что браузер отдаёт сайту, в нерастянутые
// координаты (делим на масштаб), а то, что сайт передаёт браузеру
// (elementFromPoint), — обратно (умножаем).

(() => {
  if (window.__axStretchPatched) return;
  window.__axStretchPatched = true;

  const root = document.documentElement;
  let SX = 1, SY = 1;

  function readScale() {
    const on = root.getAttribute("data-ax-on") === "1";
    SX = on ? parseFloat(root.getAttribute("data-ax-sx")) || 1 : 1;
    SY = on ? parseFloat(root.getAttribute("data-ax-sy")) || 1 : 1;
  }
  readScale();
  new MutationObserver(readScale).observe(root, {
    attributes: true,
    attributeFilter: ["data-ax-on", "data-ax-sx", "data-ax-sy"],
  });

  const active = () => SX !== 1 || SY !== 1;

  const toLocalRect = (r) =>
    new DOMRect(r.x / SX, r.y / SY, r.width / SX, r.height / SY);

  // Хелпер: подменить getter у прототипа, сохранив оригинал
  function wrapGetter(proto, prop, fn) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.get) return;
    const orig = d.get;
    Object.defineProperty(proto, prop, {
      ...d,
      get() {
        return fn.call(this, orig.call(this));
      },
    });
  }

  // Растягивается только <body>. Окна других расширений content.js выносит
  // прямо в <html> — они в обычном масштабе, их координаты не трогаем.
  function unscaled(node) {
    const body = document.body;
    if (!body || !node || node === root || node === body || node === document || node === window) return false;
    if (!(node instanceof Node) || !node.isConnected) return false;
    for (let n = node; n; n = n.parentNode || n.host) {
      if (n === body) return false;
    }
    return true;
  }
  const rangeNode = (r) => r.commonAncestorContainer;

  // ---------- Размеры и позиции элементов ----------
  for (const proto of [Element.prototype, Range.prototype]) {
    const nodeOf = proto === Range.prototype ? rangeNode : (el) => el;

    const origBCR = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function () {
      const r = origBCR.call(this);
      return active() && !unscaled(nodeOf(this)) ? toLocalRect(r) : r;
    };

    const origRects = proto.getClientRects;
    proto.getClientRects = function () {
      const list = origRects.call(this);
      if (!active() || unscaled(nodeOf(this))) return list;
      const arr = Array.from(list, toLocalRect);
      arr.item = (i) => arr[i] ?? null;
      return arr;
    };
  }

  // ---------- События мыши / указателя ----------
  // Масштабируем только настоящие события браузера (isTrusted),
  // чтобы не ломать события, которые сайт создаёт сам,
  // и не трогаем события над окнами других расширений.
  const scaleEvent = (e) => e.isTrusted && active() && !unscaled(e.target);
  const MP = MouseEvent.prototype;
  for (const p of ["clientX", "pageX", "x", "movementX"]) {
    wrapGetter(MP, p, function (v) {
      return scaleEvent(this) ? v / SX : v;
    });
  }
  for (const p of ["clientY", "pageY", "y", "movementY"]) {
    wrapGetter(MP, p, function (v) {
      return scaleEvent(this) ? v / SY : v;
    });
  }

  // Touch (на всякий случай — тачпады/планшеты)
  if (window.Touch) {
    const TP = Touch.prototype;
    for (const p of ["clientX", "pageX"]) wrapGetter(TP, p, (v) => (active() ? v / SX : v));
    for (const p of ["clientY", "pageY"]) wrapGetter(TP, p, (v) => (active() ? v / SY : v));
  }

  // ---------- Поиск элемента по точке ----------
  const origEFP = Document.prototype.elementFromPoint;
  Document.prototype.elementFromPoint = function (x, y) {
    return origEFP.call(this, x * SX, y * SY);
  };
  const origEsFP = Document.prototype.elementsFromPoint;
  Document.prototype.elementsFromPoint = function (x, y) {
    return origEsFP.call(this, x * SX, y * SY);
  };
  if (Document.prototype.caretRangeFromPoint) {
    const orig = Document.prototype.caretRangeFromPoint;
    Document.prototype.caretRangeFromPoint = function (x, y) {
      return orig.call(this, x * SX, y * SY);
    };
  }

  // ---------- Размер окна ----------
  // Сайт должен "думать", что окно 1920 px (или сколько выбрано).
  wrapGetter(Window.prototype, "innerWidth", (v) => (active() ? v / SX : v));
  wrapGetter(Window.prototype, "innerHeight", (v) => (active() ? v / SY : v));
  if (window.VisualViewport) {
    wrapGetter(VisualViewport.prototype, "width", (v) => (active() ? v / SX : v));
    wrapGetter(VisualViewport.prototype, "height", (v) => (active() ? v / SY : v));
  }
  wrapGetter(Element.prototype, "clientWidth", function (v) {
    return this === document.documentElement && active() ? v / SX : v;
  });
  wrapGetter(Element.prototype, "clientHeight", function (v) {
    return this === document.documentElement && active() ? v / SY : v;
  });

  // ---------- SVG (графики на d3 и т.п.) ----------
  if (window.SVGGraphicsElement) {
    const origCTM = SVGGraphicsElement.prototype.getScreenCTM;
    SVGGraphicsElement.prototype.getScreenCTM = function () {
      const m = origCTM.call(this);
      if (!m || !active()) return m;
      return new DOMMatrix().scale(1 / SX, 1 / SY).multiply(m);
    };
  }

  // ---------- IntersectionObserver (ленивые списки) ----------
  if (window.IntersectionObserverEntry) {
    const IP = IntersectionObserverEntry.prototype;
    for (const p of ["boundingClientRect", "intersectionRect", "rootBounds"]) {
      wrapGetter(IP, p, (r) => (r && active() ? toLocalRect(r) : r));
    }
  }

  // ---------- Чёткость canvas ----------
  // Растянутый canvas мылится. Говорим ему рисовать с большим запасом пикселей.
  wrapGetter(Window.prototype, "devicePixelRatio", (v) =>
    active() && root.getAttribute("data-ax-sharp") === "1" ? v * Math.max(SX, SY) : v
  );
})();

