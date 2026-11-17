import "./devglow/background.js";
import "./pump-twitter/background.js";
import "./translator/background.js";
import { DEFAULT_STATE, STORAGE_KEY, normalizeState } from "./core/state.js";

let creatingOffscreen;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL("lastath/offscreen.html");
  if (typeof chrome.runtime.getContexts === "function") {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [url]
    });
    if (contexts.length) return;
  } else if (chrome.offscreen?.hasDocument && await chrome.offscreen.hasDocument()) {
    return;
  }

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: "lastath/offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play the LastATH launch alert"
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_STATE });
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalizeState(data[STORAGE_KEY]) });
  }
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "STASH_GET_STATE") {
    chrome.storage.local.get(STORAGE_KEY)
      .then(data => reply({ ok: true, state: normalizeState(data[STORAGE_KEY]) }))
      .catch(error => reply({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "alh:play-alert") {
    (async () => {
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ type: "alh:offscreen-play" });
      reply({ ok: true });
    })().catch(error => reply({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "toggle-stretch") return;
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const state = normalizeState(data[STORAGE_KEY]);
    state.modules.stretch = !state.modules.stretch;
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch (error) {
    
  }
});
