import { STORAGE_KEY, normalizeState } from "../core/state.js";

const CACHE_LIMIT = 300;
const MAX_TEXT_LENGTH = 20000;
const REQUEST_TIMEOUT = 20000;
const cache = new Map();
const pending = new Map();

const LANGUAGES = {
  ru: "Russian", en: "English", uk: "Ukrainian", es: "Spanish",
  zh: "Chinese", pt: "Portuguese", tr: "Turkish", ar: "Arabic"
};

const PROVIDERS = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    build(key, model, system, text) {
      return {
        url: this.url,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key,
          "HTTP-Referer": "https://t.me/v3lm0ur",
          "X-Title": "STASH Extension"
        },
        body: { model, max_tokens: 2048, messages: [
          { role: "system", content: system }, { role: "user", content: text }
        ] }
      };
    },
    extract(data) { return data?.choices?.[0]?.message?.content || ""; }
  },
  gemini: {
    build(key, model, system, text) {
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models/" +
          encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key),
        headers: { "Content-Type": "application/json" },
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.25 }
        }
      };
    },
    extract(data) {
      return (data?.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("");
    }
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    build(key, model, system, text) {
      return {
        url: this.url,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: { model, max_tokens: 2048, system, messages: [{ role: "user", content: text }] }
      };
    },
    extract(data) { return (data?.content || []).filter(x => x.type === "text").map(x => x.text).join("\n"); }
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    build(key, model, system, text) {
      return {
        url: this.url,
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: { model, max_tokens: 2048, temperature: 0.25, messages: [
          { role: "system", content: system }, { role: "user", content: text }
        ] }
      };
    },
    extract(data) { return data?.choices?.[0]?.message?.content || ""; }
  }
};

function splitText(text, limit = 4800) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut >= limit * 0.45) cut += 1;
    else {
      cut = rest.lastIndexOf(" ", limit);
      if (cut >= limit * 0.45) cut += 1;
      else cut = limit;
    }

    // Keep protected placeholders intact across provider request chunks.
    const tokenPattern = /STASHKEEP\d{4}END/g;
    let match;
    while ((match = tokenPattern.exec(rest))) {
      const start = match.index, end = start + match[0].length;
      if (start < cut && end > cut) {
        cut = start >= limit * 0.45 ? start : end;
        break;
      }
    }
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, credentials: "omit" });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    if (!response.ok) {
      const detail = data?.error?.message || data?.message || data?.error || ("HTTP " + response.status);
      throw new Error(String(detail).slice(0, 260));
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Превышено время ожидания API");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function quickTranslate(text, target) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
    encodeURIComponent(target) + "&dt=t&q=" + encodeURIComponent(text);
  const data = await fetchJson(url, { method: "GET", headers: { accept: "application/json" } });
  if (!Array.isArray(data?.[0])) throw new Error("Некорректный ответ Google Translate");
  const result = data[0].map(part => part?.[0] || "").join("");
  if (!result.trim()) throw new Error("Google Translate вернул пустой ответ");
  return result;
}

function systemPrompt(language) {
  return [
    "You are a professional translator specializing in Solana memecoins, crypto trading, Web3 and Crypto Twitter.",
    "Translate the supplied post into " + (LANGUAGES[language] || "Russian") + ".",
    "Preserve the author's tone, humor, slang and intent. Do not summarize, explain, add commentary or answer the post.",
    "Keep $TICKERS, @usernames, URLs, hashtags, wallet addresses and CA strings exactly unchanged.",
    "Preserve line breaks, paragraph boundaries, emojis, punctuation and list structure.",
    "Crypto slang should be translated by meaning in context. Keep common community terms such as fren, ser, degen, alpha, ape, rug, WAGMI and NGMI when a natural translation would lose their meaning.",
    "Return only the translated post. Do not wrap it in quotes or markdown fences. Preserve any STASHKEEP0000END-style placeholders exactly."
  ].join("\n");
}

async function aiTranslate(text, settings, target) {
  const providerName = settings.provider;
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error("Неизвестный AI-провайдер");
  const apiKey = settings.apiKeys?.[providerName]?.trim();
  if (!apiKey) throw new Error("Добавь API-ключ для " + providerName + " в настройках Translator");
  const model = settings.models?.[providerName]?.trim();
  if (!model) throw new Error("Укажи модель для выбранного API-провайдера");
  const request = provider.build(apiKey, model, systemPrompt(target), text);
  const data = await fetchJson(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body)
  });
  const translated = String(provider.extract(data) || "").trim();
  if (!translated) throw new Error("Провайдер вернул пустой перевод");
  return translated;
}

async function readSettings() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(data[STORAGE_KEY]).settings.translator;
}

async function translate(message) {
  const source = typeof message.text === "string" ? message.text : "";
  if (!source.trim()) return { ok: false, error: "Пустой текст" };
  if (source.length > MAX_TEXT_LENGTH) return { ok: false, error: "Текст слишком длинный (лимит 20 000 символов)" };

  const settings = message.settings && typeof message.settings === "object"
    ? { ...(await readSettings()), ...message.settings }
    : await readSettings();
  const target = LANGUAGES[message.to] ? message.to : (settings.targetLanguage || "ru");
  const method = settings.method === "ai" ? "ai" : "fast";
  const provider = method === "ai" ? settings.provider : "google";
  const model = method === "ai" ? settings.models?.[provider] : "gtx";
  const key = [method, provider, model, target, source].join("|");

  if (cache.has(key)) return { ok: true, text: cache.get(key), cached: true };
  if (pending.has(key)) return pending.get(key);

  const job = (async () => {
    try {
      const chunks = method === "ai" ? null : splitText(source, 3000);
      const result = method === "ai"
        ? await aiTranslate(source, settings, target)
        : (await Promise.all(chunks.map(chunk => quickTranslate(chunk, target)))).join("");
      cache.set(key, result);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      return { ok: true, text: result, cached: false };
    } catch (error) {
      return { ok: false, error: String(error?.message || "Ошибка перевода").slice(0, 300) };
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, job);
  return job;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "STASH_TRANSLATE_TEXT") return false;
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "unauthorized" });
    return false;
  }
  translate(message).then(sendResponse).catch(error => sendResponse({
    ok: false, error: String(error?.message || "translation_failed")
  }));
  return true;
});
