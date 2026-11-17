import { MODULES, STORAGE_KEY, normalizeState } from "./core/state.js";

const list = document.querySelector("#module-list");
const count = document.querySelector("#active-count");
const status = document.querySelector("#status");

async function readState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(data[STORAGE_KEY]);
}

function render(state) {
  list.replaceChildren();
  let active = 0;
  for (const module of MODULES) {
    const enabled = module.implemented && state.modules[module.id] === true;
    if (enabled) active++;
    const row = document.createElement("div");
    row.className = enabled ? "module-row is-active" : "module-row";
    const copy = document.createElement("div");
    copy.className = "module-copy";
    const name = document.createElement("span");
    name.className = "module-name";
    name.textContent = module.name;
    const subtitle = document.createElement("span");
    subtitle.className = "module-sub";
    subtitle.textContent = module.implemented ? module.subtitle : "Ещё не подключён";
    copy.append(name, subtitle);
    const toggle = document.createElement("button");
    toggle.className = "switch";
    toggle.type = "button";
    toggle.disabled = !module.implemented;
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(enabled));
    toggle.setAttribute("aria-label", module.implemented ? `${module.name}: ${enabled ? "включён" : "выключен"}` : `${module.name}: ещё не подключён`);
    if (module.implemented) toggle.addEventListener("click", () => setModule(module.id, !enabled));
    row.append(copy, toggle);
    list.append(row);
  }
  count.textContent = `${active} / 7 ACTIVE`;
}

async function setModule(id, enabled) {
  status.textContent = "СОХРАНЕНИЕ…";
  try {
    const state = await readState();
    state.modules[id] = enabled;
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    status.textContent = "СОХРАНЕНО";
    setTimeout(() => { if (status.textContent === "СОХРАНЕНО") status.textContent = "LOCAL CONFIG"; }, 1400);
  } catch (error) {
    status.textContent = `ОШИБКА: ${error.message}`;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) render(normalizeState(changes[STORAGE_KEY].newValue));
});

document.querySelector("#open-settings").addEventListener("click", async () => {
  const button = document.querySelector("#open-settings");
  button.disabled = true;
  status.textContent = "ОТКРЫВАЮ НАСТРОЙКИ…";
  try {
    // Open the settings page explicitly in a new tab. This avoids relying on
    // Chrome's options-page routing from the popup context.
    await chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  } catch (error) {
    status.textContent = `НЕ УДАЛОСЬ ОТКРЫТЬ: ${error.message}`;
    button.disabled = false;
  }
});

readState().then(render).catch(error => {
  status.textContent = `НЕ УДАЛОСЬ ЗАГРУЗИТЬ: ${error.message}`;
});
