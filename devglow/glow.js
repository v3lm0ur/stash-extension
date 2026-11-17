// glow.js — MAIN world (подгружается из content.js)
// Подсвечивает строки монет, у которых дев (или его фандер) есть в трекере, и
// добавляет в шапку окна кошелька кнопку с палитрой цвета.

(() => {
  "use strict";
  if (window.__AXG_GLOW) return;
  window.__AXG_GLOW = true;

  // ── Состояние ────────────────────────────────────────────────────────────
  // walletMap: адрес в нижнем регистре -> { address, name, emoji, color }
  let walletMap = new Map();
  let settings = {
    enabled: false,
    intensity: 1,
    style: "glow",     // "glow" | "ring" | "tint"
    matchMode: "both", // "dev" | "funder" | "both"
    animate: false,
  };
  let popover = null;

  // Должна совпадать с popup.js, чтобы цвет на странице == цвет в попапе.
  const PALETTE = [
    "#ff0000", "#ff8000", "#ffff00", "#00ff00", "#00a000", "#00ffff",
    "#0000ff", "#8000ff", "#ff00ff", "#ff69b4", "#ffffff", "#ffd700",
  ];
  // Детерминированный цвет по умолчанию: свежесинхронизированный кошелёк виден
  // сразу, ещё до того как пользователь что-то выбрал.
  function defaultColor(addr) {
    let h = 0;
    for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function rgba(hex, a) {
    let h = String(hex).replace("#", "").trim();
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (h.length !== 6 || /[^0-9a-f]/i.test(h)) h = "22d3ee";
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  const emit = (name, detail) =>
    window.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(detail) }));

  function toast(text) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;" +
      "padding:10px 14px;border-radius:8px;background:#111;color:#f5f5f5;" +
      "border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.55);" +
      "font:13px -apple-system,'Segoe UI',Inter,sans-serif;";
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ── Конфиг (приходит из content.js) ──────────────────────────────────────
  window.addEventListener("axg:config", (e) => {
    let d = e.detail;
    if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = null; } }
    d = d || {};
    if (Array.isArray(d.wallets)) {
      const m = new Map();
      for (const w of d.wallets) {
        const addr = w?.trackedWalletAddress;
        if (typeof addr !== "string" || addr.length < 10) continue;
        m.set(addr.toLowerCase(), {
          address: addr,
          name: w.name || addr.slice(0, 5) + "…" + addr.slice(-4),
          emoji: w.emoji || "",
          color: (d.colors && d.colors[addr]) || defaultColor(addr),
        });
      }
      walletMap = m;
    }
    if (d.settings && typeof d.settings === "object") {
      settings = { ...settings, ...d.settings, enabled: d.enabled === true };
    } else { settings.enabled = d.enabled === true; }
    clearAll();
    scheduleScan();
    scheduleWidgets();
  });

  // Расширение перезагрузили, а вкладку нет — сохранения не дойдут.
  window.addEventListener("axg:stale", () => {
    toast("Dev Glow: расширение обновилось. Перезагрузи страницу (F5).");
  });

  window.dispatchEvent(new CustomEvent("axg:requestConfig"));

  // ── CSS ──────────────────────────────────────────────────────────────────
  const STYLE_CSS = `
    /* Зарегистрировано, чтобы анимировать: обычное custom property не анимируется. */
    @property --axg-mul {
      syntax: '<number>';
      inherits: false;
      initial-value: 1;
    }
    .axg-row {
      border-radius: var(--axg-radius, 10px);
      box-shadow:
        inset 0 0 0 1px var(--axg-ring),
        inset 0 0 calc(var(--axg-in-blur, 14px) * var(--axg-mul, 1)) var(--axg-inner),
        0 0 calc(var(--axg-out-blur, 16px) * var(--axg-mul, 1)) var(--axg-outer) !important;
      transition: box-shadow .18s ease;
    }
    /* Слоем-картинкой, чтобы у строки остался свой background-color. */
    .axg-row.axg-tint {
      background-image: linear-gradient(var(--axg-tint), var(--axg-tint));
    }
    .axg-row.axg-ring {
      box-shadow: inset 0 0 0 2px var(--axg-ring) !important;
    }
    .axg-row.axg-animate {
      animation: axg-pulse 2.4s ease-in-out infinite;
    }
    @keyframes axg-pulse {
      0%, 100% { --axg-mul: 1; }
      50%      { --axg-mul: 1.7; }
    }
  `;

  // CSS статичный: создаём один раз, а не переписываем при каждом скане
  // (перезапись textContent каждый раз заставляла браузер пересчитывать стили).
  function ensureStyle() {
    if (document.getElementById("axg-style")) return;
    const style = document.createElement("style");
    style.id = "axg-style";
    style.textContent = STYLE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Монета → дев ─────────────────────────────────────────────────────────
  function fiberOf(el) {
    const k = Object.keys(el).find(x => x.startsWith("__reactFiber$"));
    return k ? el[k] : null;
  }

  // Дев и его фандер читаются прямо из React-пропсов строки: Axiom кладёт
  // `devAddress` и `devWalletFunding.fundingWalletAddress` на несколько уровней
  // выше иконки шляпы повара, причём на разной глубине, поэтому собираем оба по
  // пути наверх. Обход Fiber дорогой, так что результат кэшируется на якорь и
  // сбрасывается, когда у якоря меняются текущие пропсы (виртуализированные
  // строки переиспользуются).
  const infoCache = new WeakMap();

  function getDevInfo(anchorEl) {
    const startFiber = fiberOf(anchorEl);
    if (!startFiber) return null;

    const firstProps = startFiber.memoizedProps;
    const cached = infoCache.get(anchorEl);
    if (cached && cached.fiber === startFiber && cached.firstProps === firstProps) {
      return cached.info;
    }

    let f = startFiber;
    let dev = null, funder = null;

    for (let i = 0; i < 60 && f && !(dev && funder); i++) {
      const props = f.memoizedProps;
      if (props && typeof props === "object") {
        if (!dev) {
          const d = props.devAddress || props.dev || props.deployerAddress || props.creatorAddress;
          if (typeof d === "string" && d.length > 20) dev = d;
        }
        if (!funder) {
          const fu = props.devWalletFunding?.fundingWalletAddress;
          if (typeof fu === "string" && fu.length > 20) funder = fu;
        }
      }
      f = f.return;
    }

    const info = (dev || funder) ? { dev, funder } : null;
    infoCache.set(anchorEl, { fiber: startFiber, firstProps, info });
    return info;
  }

  function matchWallet(info) {
    if (!info || !walletMap.size) return null;
    const mode = settings.matchMode;
    if (mode !== "funder" && info.dev) {
      const hit = walletMap.get(info.dev.toLowerCase());
      if (hit) return hit;
    }
    if (mode !== "dev" && info.funder) {
      const hit = walletMap.get(info.funder.toLowerCase());
      if (hit) return hit;
    }
    return null;
  }

  // ── Поиск строки ─────────────────────────────────────────────────────────
  // От иконки поднимаемся до самого внешнего элемента, который ещё одна строка.
  // В Pulse цепочка такая: иконка → … → текстовая колонка (h 96) → обёртки с
  // отступами (110 → 115 → 116) → элемент виртуального списка (116) → список
  // (3480). Обёртки растят блок чуть-чуть, поэтому резкий скачок высоты значит,
  // что мы вошли в контейнер списка и зашли на уровень выше нужного.
  const rowCache = new WeakMap();

  function findRow(anchorEl) {
    const cached = rowCache.get(anchorEl);
    if (cached && cached.isConnected && cached.contains(anchorEl)) return cached;

    let el = anchorEl;
    for (let i = 0; i < 14 && el && el !== document.body; i++) {
      if (el.offsetHeight >= 48) break;
      el = el.parentElement;
    }
    if (!el || el === document.body || el.offsetHeight < 48) return null;

    for (let i = 0; i < 8; i++) {
      let p = el.parentElement;
      // Обёртки с display:contents (например, role="gridcell" в Pulse) не имеют
      // своего бокса: offsetHeight = 0, а box-shadow на них не рисуется. Пропускаем.
      while (p && p !== document.body && getComputedStyle(p).display === "contents") {
        p = p.parentElement;
      }
      if (!p || p === document.body) break;
      if (p.offsetHeight > el.offsetHeight * 1.6 + 24) break;
      const oy = getComputedStyle(p).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      el = p;
    }
    rowCache.set(anchorEl, el);
    return el;
  }

  // ── Отрисовка ────────────────────────────────────────────────────────────
  const glowing = new Set();

  function applyGlow(row, wallet) {
    const k = settings.intensity || 1;
    const key = `${wallet.color}|${k}|${settings.style}|${settings.animate}|${wallet.emoji}|${wallet.name}`;
    if (row.dataset.axg === key) return;
    row.dataset.axg = key;

    const c = wallet.color;
    row.style.setProperty("--axg-ring", rgba(c, Math.min(0.9, 0.45 * k)));
    row.style.setProperty("--axg-inner", rgba(c, Math.min(0.8, 0.22 * k)));
    row.style.setProperty("--axg-outer", rgba(c, Math.min(0.9, 0.4 * k)));
    row.style.setProperty("--axg-in-blur", `${Math.round(14 * k)}px`);
    row.style.setProperty("--axg-out-blur", `${Math.round(16 * k)}px`);
    row.style.setProperty("--axg-tint", rgba(c, Math.min(0.3, 0.07 * k)));

    row.classList.add("axg-row");
    row.classList.toggle("axg-tint", settings.style === "tint");
    row.classList.toggle("axg-ring", settings.style === "ring");
    row.classList.toggle("axg-animate", !!settings.animate && settings.style !== "ring");
    row.title = `Tracked dev: ${wallet.emoji ? wallet.emoji + " " : ""}${wallet.name}`;
    glowing.add(row);
  }

  function removeGlow(row) {
    row.classList.remove("axg-row", "axg-ring", "axg-tint", "axg-animate");
    for (const p of ["--axg-ring", "--axg-inner", "--axg-outer", "--axg-in-blur", "--axg-out-blur", "--axg-tint"]) {
      row.style.removeProperty(p);
    }
    delete row.dataset.axg;
    if (row.title?.startsWith("Tracked dev:")) row.removeAttribute("title");
    glowing.delete(row);
  }

  function clearAll() {
    for (const row of [...glowing]) removeGlow(row);
  }

  // ── Сканер ───────────────────────────────────────────────────────────────
  // Держим живой набор якорей (иконок шляпы повара), а не ищем по всей странице
  // при каждом скане. Axiom виртуализирует и переиспользует строки, поэтому
  // новых иконок достаточно, чтобы заметить большинство изменений; скролл
  // запускает лёгкую проверку уже известных якорей.
  const anchors = new Set();

  // Основной якорь — иконка шляпы повара; запасной — сам элемент монеты в Pulse
  // (у монет без чипа с иконкой её нет). Дев читается из React-пропсов выше якоря.
  const ANCHOR_SEL = "i.icon-chef-hat, [data-pulse-token-address]";

  // Добавляет якоря из узла и его потомков; true, если что-то нашлось.
  function collectAnchors(root) {
    if (root.nodeType !== 1) return false;
    let found = false;
    if (root.matches(ANCHOR_SEL)) { anchors.add(root); found = true; }
    for (const el of root.querySelectorAll(ANCHOR_SEL)) { anchors.add(el); found = true; }
    return found;
  }

  function pruneAnchors() {
    for (const anchor of anchors) {
      if (!anchor.isConnected) anchors.delete(anchor);
    }
  }

  function scan() {
    if (!settings.enabled) { clearAll(); return; }
    ensureStyle();
    pruneAnchors();

    const seen = new Set();
    for (const anchor of anchors) {
      const wallet = matchWallet(getDevInfo(anchor));
      if (!wallet) continue;
      const row = findRow(anchor);
      if (!row) continue;
      seen.add(row);
      applyGlow(row, wallet);
    }

    // Строки переиспользуются: снимаем свечение с узлов, которые больше не подходят.
    for (const row of [...glowing]) {
      if (!seen.has(row) || !row.isConnected) removeGlow(row);
    }
  }

  // Скролл и мутации летят пачками; склеиваем их в один скан. Через setTimeout,
  // а не requestAnimationFrame: в фоновой вкладке rAF не срабатывает.
  let scanTimer = 0;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 80);
  }

  // ── Кнопка «Glow» в шапке окна кошелька ──────────────────────────────────
  // Показывает цвет дева и открывает мини-палитру. Имя и эмодзи берутся из шапки
  // (то, что сохранено в Wallet Tracker Axiom), адрес читается из React-пропсов
  // окна. Запись в storage делает content.js (axg:upsert / axg:remove).
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const HEX_RE = /^#[0-9a-f]{6}$/i;

  function addrFromFiber(el) {
    let f = fiberOf(el);
    for (let i = 0; i < 80 && f; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && typeof p === "object") {
        const v = p.walletAddress || p.trackedWalletAddress;
        if (typeof v === "string" && v.length >= 32 && v.length <= 44) return v;
      }
    }
    return null;
  }

  function readIdentity(header) {
    const input = header.querySelector('input[type="text"]');
    let name = (input && input.value || "").trim();
    if (!name && header.firstElementChild) {
      const lines = (header.firstElementChild.innerText || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
      name = lines.find(x => !/^[1-9A-HJ-NP-Za-km-z]{2,6}(\.{2,3}|…)[1-9A-HJ-NP-Za-km-z]{2,6}$/.test(x) && !/^\d+$/.test(x)) || "";
    }
    let emoji = "";
    for (const b of header.querySelectorAll("button")) {
      const t = (b.textContent || "").trim();
      if (t && t.length <= 8 && EMOJI_RE.test(t)) { emoji = t; break; }
    }
    return { name, emoji };
  }

  function buildWidget(header) {
    const wrap = document.createElement("span");
    wrap.className = "axg-widget";
    wrap.style.cssText = "display:inline-flex;align-items:center;flex-shrink:0;";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Dev Glow: цвет подсветки";
    btn.style.cssText =
      "display:flex;align-items:center;justify-content:center;width:24px;height:24px;" +
      "border:none;border-radius:4px;background:transparent;cursor:pointer;padding:0;" +
      "transition:background .15s;";
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(255,255,255,.08)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });

    const dot = document.createElement("span");
    dot.className = "axg-dot";
    dot.style.cssText = "display:block;width:12px;height:12px;border-radius:50%;box-sizing:border-box;";
    btn.appendChild(dot);
    wrap.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (popover && popover.owner === btn) { closePopover(); return; }
      openPopover(header, btn);
    });
    return wrap;
  }

  function paintWidget(header) {
    const w = header.querySelector(".axg-widget");
    if (!w) return;
    const addr = addrFromFiber(header);
    const hit = addr && walletMap.get(addr.toLowerCase());
    const dot = w.querySelector(".axg-dot");
    if (hit) {
      dot.style.background = hit.color;
      dot.style.border = "none";
      dot.style.boxShadow = `0 0 8px ${rgba(hit.color, 0.7)}`;
    } else {
      dot.style.background = "transparent";
      dot.style.border = "1.5px dashed rgba(255,255,255,.45)";
      dot.style.boxShadow = "none";
    }
  }

  // Шапку окна кошелька ищем по табам периода (30d / Max), а не по иконке
  // Solscan: Axiom дорисовывает её позже, и кнопка появлялась с задержкой.
  // Solscan нужен только как необязательная точка вставки.
  function injectWidgets() {
    if (!settings.enabled) {
      closePopover();
      document.querySelectorAll(".axg-widget").forEach(el => el.remove());
      return;
    }
    document.querySelectorAll('div[class*="h-[44px]"]').forEach(header => {
      const t = header.textContent || "";
      if (!t.includes("30d") || !t.includes("Max")) return; // не шапка окна кошелька
      if (!header.querySelector(".axg-widget")) {
        const right = header.lastElementChild;
        if (!right) return;
        const w = buildWidget(header);
        const solscan = right.querySelector('button[aria-label="Open in Solscan"]');
        const ref = solscan && solscan.closest("span.contents");
        if (ref && ref.parentElement === right) right.insertBefore(w, ref);
        else right.insertBefore(w, right.children[1] || null);
      }
      paintWidget(header);
    });
  }

  // Не чаще раза в 150 мс, как бы часто Axiom ни менял DOM.
  let widgetTimer = 0;
  function scheduleWidgets() {
    if (widgetTimer) return;
    widgetTimer = setTimeout(() => {
      widgetTimer = 0;
      try { injectWidgets(); } catch {}
    }, 150);
  }

  // ── Палитра ──────────────────────────────────────────────────────────────
  function closePopover() {
    if (popover) { popover.remove(); popover = null; }
  }
  document.addEventListener("mousedown", (e) => {
    if (popover && !popover.contains(e.target) && !e.target.closest(".axg-widget")) closePopover();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopover(); }, true);
  document.addEventListener("scroll", closePopover, true);
  window.addEventListener("resize", closePopover, { passive: true });

  function openPopover(header, btn) {
    closePopover();
    if (!header.isConnected || !btn.isConnected) return;

    const addr = addrFromFiber(header);
    const id = readIdentity(header);
    const hit = addr && walletMap.get(addr.toLowerCase());
    let cur = (hit && hit.color) || (addr ? defaultColor(addr) : PALETTE[0]);

    const pop = document.createElement("div");
    pop.owner = btn;
    const br = btn.getBoundingClientRect();
    const W = Math.min(240, window.innerWidth - 16);
    const estimatedHeight = hit ? 230 : 190;
    const left = Math.max(8, Math.min(br.right - W, window.innerWidth - W - 8));
    const below = br.bottom + 6;
    const top = below + estimatedHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, br.top - estimatedHeight - 6);
    pop.style.cssText =
      `position:fixed;z-index:2147483000;top:${top}px;left:${left}px;width:${W}px;max-height:calc(100vh - 16px);overflow:auto;` +
      "box-sizing:border-box;padding:13px;border-radius:8px;background:rgba(8,14,10,0.96);backdrop-filter:blur(10px);color:#f0f7f2;" +
      "border:1px solid rgba(46,232,154,0.35);box-shadow:0 12px 32px rgba(0,0,0,.55);" +
      "font:12px -apple-system,'Segoe UI',Inter,sans-serif;";

    const title = document.createElement("div");
    title.style.cssText = "font-size:13px;font-weight:600;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    title.textContent = `${id.emoji ? id.emoji + " " : ""}${id.name || (addr ? addr.slice(0, 5) + "…" + addr.slice(-4) : "Кошелёк")}`;
    pop.appendChild(title);

    if (!addr) {
      const err = document.createElement("div");
      err.style.cssText = "color:#f87171;line-height:1.4;";
      err.textContent = "Не удалось определить адрес кошелька.";
      pop.appendChild(err);
      document.body.appendChild(pop);
      popover = pop;
      return;
    }

    const hex = document.createElement("span");
    hex.style.cssText = "color:#7b8696;font-family:Consolas,monospace;font-size:11.5px;";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.style.cssText = "width:32px;height:28px;border:none;padding:0;background:none;cursor:pointer;";
    picker.addEventListener("input", () => { cur = picker.value; refresh(); });

    const dots = [];
    const refresh = () => {
      dots.forEach(d => {
        d.style.boxShadow = d.dataset.c.toLowerCase() === cur.toLowerCase()
          ? "0 0 0 2px #111, 0 0 0 3.5px #fff"
          : "0 0 0 1px rgba(255,255,255,.18)";
      });
      picker.value = cur;
      hex.textContent = cur;
    };

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:10px;";
    for (const c of PALETTE) {
      const d = document.createElement("button");
      d.type = "button";
      d.dataset.c = c;
      d.style.cssText = `width:28px;height:28px;border-radius:8px;border:none;padding:0;cursor:pointer;background:${c};justify-self:center;`;
      d.addEventListener("click", () => { cur = c; refresh(); });
      dots.push(d);
      grid.appendChild(d);
    }
    pop.appendChild(grid);

    const hint = document.createElement("span");
    hint.style.cssText = "margin-left:auto;color:#7b8696;font-size:11px;";
    hint.textContent = "свой цвет";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;";
    row.append(picker, hex, hint);
    pop.appendChild(row);

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = hit ? "Сохранить цвет" : "Добавить в список";
    save.style.cssText =
      "width:100%;height:32px;border:1px solid #2ee89a;border-radius:6px;cursor:pointer;" +
      "background:#2ee89a;color:#050806;font-weight:800;font-size:12px;";
    save.addEventListener("click", () => {
      if (!HEX_RE.test(cur)) return;
      emit("axg:upsert", { address: addr, name: id.name, emoji: id.emoji, color: cur });
      closePopover();
    });
    pop.appendChild(save);

    if (hit) {
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Удалить из списка";
      del.style.cssText =
        "width:100%;height:30px;margin-top:8px;border-radius:6px;cursor:pointer;" +
        "background:transparent;color:#f87171;font-weight:600;font-size:12px;" +
        "border:1px solid rgba(248,113,113,.35);";
      del.addEventListener("mouseenter", () => { del.style.background = "rgba(248,113,113,.1)"; });
      del.addEventListener("mouseleave", () => { del.style.background = "transparent"; });
      del.addEventListener("click", () => {
        emit("axg:remove", { address: addr });
        closePopover();
      });
      pop.appendChild(del);
    }

    document.body.appendChild(pop);
    popover = pop;
    refresh();
  }

  // ── Запуск ───────────────────────────────────────────────────────────────
  // Один наблюдатель на всё: новые якоря → скан строк; любые мутации → проверка
  // шапки (React перерисовывает её и стирает кнопку).
  new MutationObserver((mutations) => {
    let rescan = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (collectAnchors(node)) rescan = true;
      }
    }
    if (rescan) scheduleScan();
    scheduleWidgets();
  }).observe(document.body, { childList: true, subtree: true });

  // Страховка: Axiom перерисовал шапку без заметных мутаций или подменил данные
  // в уже существующих строках (новых иконок-якорей при этом нет).
  setInterval(() => { scheduleWidgets(); scheduleScan(); }, 2000);

  // Скролл шлёт десятки событий за кадр; scheduleScan склеивает их в один скан.
  window.addEventListener("scroll", scheduleScan, { capture: true, passive: true });

  collectAnchors(document.body);
  scan();
  scheduleWidgets();
})();

