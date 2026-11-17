(() => {
  "use strict";

  const STORAGE_KEY = "stash.extension.state.v1";
  const ARTICLE = 'article[data-testid="tweet"], article[role="article"]';
  const TEXT = '[data-testid="tweetText"]';
  const BIO = '[data-testid="UserDescription"]';
  const states = new WeakMap();
  const dirtyRoots = new Set();
  let scanFrame = 0;
  let observer = null;
  let enabled = false;
  let autoTranslate = false;
  let targetLanguage = "ru";

  function targetBadge() {
    return ({ ru: "RU", en: "EN", uk: "UK", es: "ES", zh: "ZH", pt: "PT", tr: "TR", ar: "AR" })[targetLanguage] || "RU";
  }

  function alreadyTargetLanguage(value) {
    if (targetLanguage === "ru" || targetLanguage === "uk") {
      let cyrillic = 0, latin = 0;
      for (const char of value.slice(0, 220)) {
        if (/[А-Яа-яЁёІіЇїЄєҐґ]/.test(char)) cyrillic++;
        else if (/[A-Za-z]/.test(char)) latin++;
      }
      return cyrillic > 3 && cyrillic > latin;
    }
    if (targetLanguage === "zh") return /[\u3400-\u9fff]/.test(value);
    if (targetLanguage === "ar") return /[\u0600-\u06ff]/.test(value);
    return false;
  }

  const makeButton = () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stash-x-translate-control";
    button.textContent = targetBadge();
    button.style.cssText = [
      "display:inline-flex","align-items:center","justify-content:center",
      "margin:6px 0 2px","padding:3px 9px","min-width:36px",
      "border:1px solid rgba(46,232,154,0.38)","border-radius:4px",
      "background:rgba(9,16,12,0.92)","color:#2ee89a",
      "box-shadow:0 2px 6px rgba(0,0,0,0.25)",
      "font:700 10px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace","letter-spacing:0.04em",
      "cursor:pointer","transition:border-color .14s,background .14s,color .14s"
    ].join(";");
    return button;
  };

  function protectedPayload(source) {
    const clone = source.cloneNode(true);
    const protectedValues = new Map();
    let index = 0;
    const token = () => "STASHKEEP" + String(index++).padStart(4, "0") + "END";

    clone.querySelectorAll("a[href]").forEach(anchor => {
      const key = token();
      protectedValues.set(key, anchor.cloneNode(true));
      anchor.replaceWith(document.createTextNode(key));
    });

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const value = node.nodeValue || "";
      const pattern = /(\$[A-Za-z][A-Za-z0-9_]{0,14}|@[A-Za-z0-9_]{1,15})/g;
      if (!pattern.test(value)) continue;
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let last = 0, match;
      while ((match = pattern.exec(value))) {
        if (match.index > last) fragment.append(document.createTextNode(value.slice(last, match.index)));
        const key = token();
        protectedValues.set(key, document.createTextNode(match[0]));
        fragment.append(document.createTextNode(key));
        last = match.index + match[0].length;
      }
      if (last < value.length) fragment.append(document.createTextNode(value.slice(last)));
      node.replaceWith(fragment);
    }

    const payload = typeof clone.innerText === "string" ? clone.innerText : clone.textContent || "";
    return { payload: payload.trim(), protectedValues };
  }

  function textWithBreaks(value) {
    const fragment = document.createDocumentFragment();
    const lines = value.split("\n");
    lines.forEach((line, index) => {
      if (index) fragment.append(document.createElement("br"));
      if (line) fragment.append(document.createTextNode(line));
    });
    return fragment;
  }

  function translatedFragment(value, protectedValues) {
    const fragment = document.createDocumentFragment();
    const keys = [...protectedValues.keys()];
    if (!keys.length) return textWithBreaks(value);
    const matcher = new RegExp("(" + keys.join("|") + ")", "g");
    let last = 0, match;
    while ((match = matcher.exec(value))) {
      if (match.index > last) fragment.append(textWithBreaks(value.slice(last, match.index)));
      const protectedNode = protectedValues.get(match[0]);
      if (protectedNode) fragment.append(protectedNode.cloneNode(true));
      last = match.index + match[0].length;
    }
    if (last < value.length) fragment.append(textWithBreaks(value.slice(last)));
    return fragment;
  }

  function setLabel(state, label, title = "") {
    state.button.textContent = label;
    state.button.title = title;
    state.button.disabled = label === "…";
    state.button.style.opacity = state.button.disabled ? ".65" : "1";
  }

  function restore(state) {
    if (!state.original || !state.element.isConnected) return;
    state.element.replaceChildren(...Array.from(state.original.childNodes, node => node.cloneNode(true)));
    state.isTranslated = false;
    state.renderedText = null;
    setLabel(state, targetBadge(), "Перевести публикацию");
  }

  async function translate(state) {
    if (state.loading || !state.element.isConnected) return;
    if (state.isTranslated) {
      const visibleText = (state.element.innerText || state.element.textContent || "").trim();
      if (visibleText === state.renderedText) {
        restore(state);
        return;
      }
      // X can recycle an article's text node for another post.
      state.isTranslated = false;
      state.renderedText = null;
      state.translated = null;
      state.protectedValues = null;
      state.original = null;
      state.sourceText = "";
      setLabel(state, targetBadge(), "Текст обновился; нажмите для перевода");
    }
    const currentText = (state.element.innerText || state.element.textContent || "").trim();
    if (state.translated && currentText !== state.sourceText) {
      state.translated = null;
      state.protectedValues = null;
      state.original = null;
    }
    if (state.translated && state.protectedValues) {
      state.element.replaceChildren(translatedFragment(state.translated, state.protectedValues));
      state.renderedText = (state.element.innerText || state.element.textContent || "").trim();
      state.isTranslated = true;
      setLabel(state, "ORIGINAL", "Показать оригинал");
      return;
    }

    const original = state.element.cloneNode(true);
    const sourceText = (state.element.innerText || state.element.textContent || "").trim();
    const prepared = protectedPayload(original);
    if (!prepared.payload || prepared.payload.length < 3) return;
    state.loading = true;
    setLabel(state, "…", "Перевод выполняется");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "STASH_TRANSLATE_TEXT",
        text: prepared.payload,
        to: targetLanguage
      });
      if (!enabled || !state.element.isConnected) return;
      const currentSource = (state.element.innerText || state.element.textContent || "").trim();
      if (currentSource !== sourceText) {
        setLabel(state, targetBadge(), "Пост изменился во время перевода; нажмите ещё раз");
        return;
      }
      if (!response?.ok || typeof response.text !== "string") {
        setLabel(state, "↻ " + targetBadge(), response?.error || "Не удалось перевести");
        return;
      }
      const expected = [...prepared.protectedValues.keys()];
      if (expected.some(key => !response.text.includes(key))) {
        setLabel(state, "↻ " + targetBadge(), "Переводчик изменил защищённые элементы; оригинал сохранён");
        return;
      }
      state.original = original;
      state.sourceText = sourceText;
      state.protectedValues = prepared.protectedValues;
      state.translated = response.text;
      state.element.replaceChildren(translatedFragment(response.text, prepared.protectedValues));
      state.renderedText = (state.element.innerText || state.element.textContent || "").trim();
      state.isTranslated = true;
      setLabel(state, "ORIGINAL", "Показать оригинал");
    } catch (error) {
      setLabel(state, "↻ " + targetBadge(), error?.message || "Ошибка перевода");
    } finally {
      state.loading = false;
      if (state.button.isConnected && state.button.textContent === "…") {
        setLabel(state, targetBadge(), "Перевести публикацию");
      }
    }
  }

  function attach(element) {
    if (!(element instanceof HTMLElement)) return;
    const text = (element.innerText || element.textContent || "").trim();
    if (text.length < 3) return;

    let state = states.get(element);
    if (state) {
      if (!state.button.isConnected && element.parentNode) element.insertAdjacentElement("afterend", state.button);
      const translatedContentChanged = state.isTranslated && text !== state.renderedText;
      const newSourceText = !state.isTranslated && state.lastAutoText !== text;
      if (autoTranslate && element.matches(TEXT) && !alreadyTargetLanguage(text) && !state.loading && (translatedContentChanged || newSourceText)) {
        state.autoAttempted = true;
        state.lastAutoText = text;
        translate(state);
      }
      return;
    }

    const button = makeButton();
    state = {
      element, button, original: null, sourceText: "", translated: null,
      protectedValues: null, isTranslated: false, renderedText: null, loading: false,
      autoAttempted: false, lastAutoText: ""
    };
    states.set(element, state);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      translate(state);
    });
    element.insertAdjacentElement("afterend", button);
    if (autoTranslate && element.matches(TEXT) && !alreadyTargetLanguage(text) && !state.autoAttempted) {
      state.autoAttempted = true;
      translate(state);
    }
  }

  function scan(root = document) {
    if (!enabled || !root) return;
    if (root instanceof Element) {
      if (root.matches(ARTICLE)) root.querySelectorAll(TEXT).forEach(attach);
      const parent = root.closest(ARTICLE);
      if (parent) parent.querySelectorAll(TEXT).forEach(attach);
    }
    root.querySelectorAll?.(ARTICLE).forEach(article => article.querySelectorAll(TEXT).forEach(attach));
    if (root.matches?.(TEXT) || root.matches?.(BIO)) attach(root);
    root.querySelectorAll?.(BIO).forEach(attach);
  }

  function applySettings(value) {
    const settings = value?.settings?.translator || {};
    enabled = value?.modules?.translator === true && settings.x !== false;
    autoTranslate = enabled && settings.autoX === true;
    targetLanguage = settings.targetLanguage || "ru";
    if (enabled) {
      scan(document);
      if (!observer && document.documentElement) { observer = createObserver(); observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true }); }
      return;
    }
    observer?.disconnect(); observer = null;
    dirtyRoots.clear();
    if (scanFrame) { cancelAnimationFrame(scanFrame); scanFrame = 0; }
    document.querySelectorAll(".stash-x-translate-control").forEach(button => {
      const previous = button.previousElementSibling;
      if (previous) {
        const state = states.get(previous);
        if (state?.isTranslated) restore(state);
      }
      button.remove();
    });
  }

  chrome.storage.local.get(STORAGE_KEY)
    .then(data => applySettings(data[STORAGE_KEY]))
    .catch(() => applySettings(null));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) applySettings(changes[STORAGE_KEY].newValue);
  });

  function addDirtyRoot(root) {
    if (!root) return;
    for (const old of dirtyRoots) if (old === root || old.contains?.(root)) return;
    for (const old of [...dirtyRoots]) if (root.contains?.(old)) dirtyRoots.delete(old);
    dirtyRoots.add(root);
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => { scanFrame = 0; if (!enabled) { dirtyRoots.clear(); return; } const roots=[...dirtyRoots]; dirtyRoots.clear(); roots.forEach(scan); });
  }

  function createObserver() {
    return new MutationObserver(records => {
    if (!enabled) return;
    for (const record of records) {
      if (record.type === "characterData") {
        const parent = record.target.parentElement;
        const target = parent?.closest(TEXT + ", " + BIO);
        if (target) addDirtyRoot(target);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || node.matches(".stash-x-translate-control") || node.closest(".stash-x-translate-control")) continue;
        const target=node.closest(TEXT + ", " + BIO);
        const article=node.matches(ARTICLE) ? node : node.closest(ARTICLE);
        if (target) addDirtyRoot(target); else if (article) addDirtyRoot(article); else if (node.querySelector?.(ARTICLE + ", " + TEXT + ", " + BIO)) addDirtyRoot(node);
      }
    }
  });
  }
})();
