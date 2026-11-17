(() => {
  "use strict";

  const STORAGE_KEY = "stash.extension.state.v1";
  const POPUP_SELECTOR = '.pointer-events-auto.fixed, [data-radix-popper-content-wrapper], [role="tooltip"]';
  const TWEET_TEXT_SELECTOR = 'span[class*="text-[18px]"]';
  const BUTTON_CLASS = "stash-axiom-translate-control";
  const MIN_TEXT_LENGTH = 12;
  const states = new WeakMap();
  let enabled = false;
  let autoTranslate = false;
  let targetLanguage = "ru";
  let scanQueued = false;

  function targetBadge() {
    return ({ ru: "RU", en: "EN", uk: "UK", es: "ES", zh: "ZH", pt: "PT", tr: "TR", ar: "AR" })[targetLanguage] || "RU";
  }

  function textOf(element) {
    return (element?.innerText || element?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  function isRussian(value) {
    let cyrillic = 0;
    let latin = 0;
    for (const char of value.slice(0, 180)) {
      if (/[А-Яа-яЁё]/.test(char)) cyrillic++;
      else if (/[A-Za-z]/.test(char)) latin++;
    }
    return cyrillic > 3 && cyrillic > latin;
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

  function isMetaText(value) {
    const text = value.trim();
    return (
      text.length < MIN_TEXT_LENGTH ||
      text.length > 5000 ||
      /^@[A-Za-z0-9_]{1,20}$/.test(text) ||
      /^Joined\s/i.test(text) ||
      /^Replying to\b/i.test(text) ||
      /^(Hide|Show)\s+Translation$/i.test(text) ||
      /^\d+[smhd]$/i.test(text) ||
      /^\d{1,2}:\d{2}(\s*[AP]M)?$/i.test(text) ||
      /^\d[\d,.]*[KMB]?\s*(followers|following)$/i.test(text) ||
      /^(like|reply|repost|share)$/i.test(text)
    );
  }

  // The X preview lives in Axiom's profile popover, not in the token-list row.
  // Require profile-specific context before looking for any tweet text.
  function isProfilePopup(root) {
    if (!(root instanceof HTMLElement) || !root.isConnected) return false;
    const value = textOf(root);
    if (value.length < 35 || value.length > 18000) return false;
    const hasHandle = /@[A-Za-z0-9_]{1,20}/.test(value);
    const hasProfileMeta =
      /\d[\d,.]*\s*[KMB]?\s*followers/i.test(value) ||
      /\bJoined\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(value);
    return hasHandle && hasProfileMeta;
  }

  function extractStructuredText(element) {
    let output = "";
    function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          output += child.textContent || "";
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = child.tagName;
        if (tag === "BR") {
          output += "\n";
          continue;
        }
        if (tag === "A") {
          output += child.textContent || "";
          continue;
        }
        const before = output.length;
        walk(child);
        const display = getComputedStyle(child).display;
        if (["block", "flex", "grid", "list-item"].includes(display) && output.length > before) {
          output += "\n";
        }
      }
    }
    walk(element);
    return output
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function findJoinedAnchor(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (/^Joined\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test((node.textContent || "").trim())) {
        return node.parentElement;
      }
    }
    return null;
  }

  function validTweetText(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element.closest("a, button, [role=button], [contenteditable=true], ." + BUTTON_CLASS)) return false;
    if (element.closest(".stash-axiom-translation-ui")) return false;
    const value = textOf(element);
    if (isMetaText(value) || (targetLanguage === "ru" && isRussian(value))) return false;
    if (/^[\d\s.,:%$]+$/.test(value)) return false;
    return true;
  }

  function findTweetTextElements(root) {
    const found = [];
    const seen = new Set();

    // Current reference implementation: tweet bodies are 18px spans in the
    // Axiom profile popup. This avoids scanning arbitrary token-card content.
    for (const element of root.querySelectorAll(TWEET_TEXT_SELECTOR)) {
      if (!validTweetText(element)) continue;
      const value = textOf(element);
      const key = value.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(element);
    }
    if (found.length) return found;

    // Narrow fallback from the supplied Axiom reference: only inspect text
    // preceding the profile's Joined marker, and only inside a verified popup.
    const anchor = findJoinedAnchor(root);
    if (!anchor) return found;
    const candidates = root.querySelectorAll("span, p, div");
    for (const element of candidates) {
      if (!validTweetText(element)) continue;
      if (!(element.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
      const ownText = textOf(element);
      if (ownText.length > 2000) continue;
      const containsLargerBlock = [...element.children].some(child =>
        ["DIV", "P", "SECTION", "ARTICLE"].includes(child.tagName) &&
        textOf(child).length > 10
      );
      if (containsLargerBlock) continue;
      if ([...found].some(item => item.contains(element) || element.contains(item))) continue;
      const key = ownText.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(element);
    }
    return found;
  }

  function makeButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = targetBadge();
    button.title = "Перевести публикацию";
    return button;
  }

  function protectedPayload(element) {
    const clone = element.cloneNode(true);
    const protectedValues = new Map();
    let index = 0;
    const makeToken = () => "STASHKEEP" + String(index++).padStart(4, "0") + "END";

    clone.querySelectorAll("a[href]").forEach(anchor => {
      const token = makeToken();
      protectedValues.set(token, { type: "node", node: anchor.cloneNode(true) });
      anchor.replaceWith(document.createTextNode(token));
    });

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const value = node.nodeValue || "";
      const pattern = /(\$[A-Za-z][A-Za-z0-9_]{0,14}|@[A-Za-z0-9_]{1,20})/g;
      if (!pattern.test(value)) continue;
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let last = 0;
      let match;
      while ((match = pattern.exec(value))) {
        if (match.index > last) fragment.append(document.createTextNode(value.slice(last, match.index)));
        const token = makeToken();
        protectedValues.set(token, { type: "text", value: match[0] });
        fragment.append(document.createTextNode(token));
        last = match.index + match[0].length;
      }
      if (last < value.length) fragment.append(document.createTextNode(value.slice(last)));
      node.replaceWith(fragment);
    }

    return {
      text: extractStructuredText(clone),
      protectedValues
    };
  }

  function translatedFragment(value, protectedValues) {
    const fragment = document.createDocumentFragment();
    const keys = [...protectedValues.keys()];
    const matcher = keys.length ? new RegExp("(" + keys.join("|") + ")", "g") : null;

    function appendText(text) {
      const lines = text.split("\n");
      lines.forEach((line, index) => {
        if (index) fragment.append(document.createElement("br"));
        if (line) fragment.append(document.createTextNode(line));
      });
    }

    if (!matcher) {
      appendText(value);
      return fragment;
    }

    let last = 0;
    let match;
    while ((match = matcher.exec(value))) {
      if (match.index > last) appendText(value.slice(last, match.index));
      const item = protectedValues.get(match[0]);
      if (item?.type === "node") fragment.append(item.node.cloneNode(true));
      else if (item?.type === "text") fragment.append(document.createTextNode(item.value));
      last = match.index + match[0].length;
    }
    if (last < value.length) appendText(value.slice(last));
    return fragment;
  }

  function setButton(state, label, title) {
    state.button.textContent = label;
    state.button.title = title;
    state.button.disabled = label === "…";
  }

  function restore(state) {
    if (!state.originalNodes || !state.element.isConnected) return;
    state.element.replaceChildren(...state.originalNodes);
    state.translated = false;
    state.renderedText = "";
    setButton(state, targetBadge(), "Перевести публикацию");
  }

  async function toggleTranslation(state) {
    if (!enabled || state.loading || !state.element.isConnected) return;

    if (state.translated) {
      if (textOf(state.element) === state.renderedText) {
        restore(state);
        return;
      }
      // Axiom may recycle popup nodes for another author's posts.
      state.translated = false;
      state.originalNodes = null;
      state.translation = null;
      state.sourceText = "";
    }

    const sourceText = textOf(state.element);
    if (state.translation && sourceText === state.sourceText) {
      state.element.replaceChildren(translatedFragment(state.translation, state.protectedValues));
      state.renderedText = textOf(state.element);
      state.translated = true;
      setButton(state, "ORIGINAL", "Показать оригинал");
      return;
    }

    const prepared = protectedPayload(state.element);
    if (!prepared.text || prepared.text.length < MIN_TEXT_LENGTH) return;
    const originalNodes = Array.from(state.element.childNodes);

    state.loading = true;
    setButton(state, "…", "Перевод выполняется");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "STASH_TRANSLATE_TEXT",
        text: prepared.text,
        to: targetLanguage
      });
      if (!enabled || !state.element.isConnected) return;
      if (textOf(state.element) !== sourceText) {
        setButton(state, targetBadge(), "Текст твита изменился; нажмите ещё раз");
        return;
      }
      if (!response?.ok || typeof response.text !== "string") {
        setButton(state, targetBadge(), "Не удалось перевести: " + (response?.error || "повторить"));
        return;
      }
      if ([...prepared.protectedValues.keys()].some(token => !response.text.includes(token))) {
        setButton(state, targetBadge(), "Не удалось сохранить ссылки и тикеры — повторить");
        return;
      }

      state.originalNodes = originalNodes;
      state.sourceText = sourceText;
      state.protectedValues = prepared.protectedValues;
      state.translation = response.text;
      state.element.replaceChildren(translatedFragment(response.text, prepared.protectedValues));
      state.renderedText = textOf(state.element);
      state.translated = true;
      setButton(state, "ORIGINAL", "Показать оригинал");
    } catch {
      setButton(state, targetBadge(), "Ошибка перевода — повторить");
    } finally {
      state.loading = false;
      if (state.button.isConnected && state.button.textContent === "…") {
        setButton(state, targetBadge(), "Перевести публикацию");
      }
    }
  }

  function attach(element) {
    if (!validTweetText(element)) return;
    const existing = states.get(element);
    if (existing) {
      if (!existing.button.isConnected && element.parentNode) {
        element.insertAdjacentElement("beforebegin", existing.button);
      }
      return;
    }

    const button = makeButton();
    const state = {
      element,
      button,
      loading: false,
      translated: false,
      originalNodes: null,
      sourceText: "",
      translation: null,
      protectedValues: null,
      renderedText: "",
      autoAttempted: false,
      lastAutoText: ""
    };
    states.set(element, state);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggleTranslation(state);
    });
    element.insertAdjacentElement("beforebegin", button);
  }

  function handlePopup(root) {
    if (!enabled || !isProfilePopup(root)) return;
    for (const element of findTweetTextElements(root)) {
      attach(element);
      const state = states.get(element);
      const currentText = textOf(element);
      const translatedContentChanged = state?.translated && currentText !== state.renderedText;
      const newSourceText = state && !state.translated && state.lastAutoText !== currentText;
      if (autoTranslate && state && !alreadyTargetLanguage(currentText) && !state.loading && (translatedContentChanged || newSourceText)) {
        state.autoAttempted = true;
        state.lastAutoText = currentText;
        toggleTranslation(state);
      }
    }
  }

  function scan() {
    if (!enabled) return;
    // Scan only popup candidates; never walk the token list looking for X links.
    document.querySelectorAll(POPUP_SELECTOR).forEach(handlePopup);
  }

  function queueScan() {
    if (!enabled || scanQueued) return;
    scanQueued = true;
    queueMicrotask(() => {
      scanQueued = false;
      scan();
    });
  }

  function applySettings(value) {
    const settings = value?.settings?.translator || {};
    enabled = value?.modules?.translator === true && settings.axiom !== false;
    autoTranslate = enabled && settings.autoAxiom === true;
    targetLanguage = settings.targetLanguage || "ru";
    if (enabled) {
      scan();
      return;
    }
    document.querySelectorAll("." + BUTTON_CLASS).forEach(button => {
      const element = button.nextElementSibling;
      const state = element && states.get(element);
      if (state?.translated) restore(state);
      button.remove();
    });
  }

  chrome.storage.local.get(STORAGE_KEY)
    .then(data => applySettings(data[STORAGE_KEY]))
    .catch(() => applySettings(null));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      applySettings(changes[STORAGE_KEY].newValue);
    }
  });

  const observer = new MutationObserver(records => {
    if (!enabled) return;
    for (const record of records) {
      if (record.type === "characterData") {
        queueScan();
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) queueScan();
      }
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }
})();
