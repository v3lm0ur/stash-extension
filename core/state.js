export const STORAGE_KEY = "stash.extension.state.v1";

export const LASTATH_DEFAULTS = Object.freeze({
  x: 38,
  y: 9,
  minAth: 40000,
  minFees: 0,
  highlightAth: false,
  athColor: "#edf2ee",
  highlightFees: false,
  feesColor: "#d7ded9",
  showInColumns: { newPairs: true, finalStretch: true, migrated: true }
});

export const MODULES = [
  { id: "lastath", name: "LastATH", subtitle: "Launch History", target: "Axiom", implemented: true },
  { id: "migration", name: "Migration Percent", subtitle: "Migration Rate", target: "Axiom", implemented: true },
  { id: "stretch", name: "Axiom Stretch", subtitle: "Interface Scaling", target: "Axiom", implemented: true },
  { id: "usernames", name: "Usernames", subtitle: "X Accounts & Communities", target: "Axiom", implemented: true },
  { id: "devglow", name: "Dev Glow", subtitle: "Developer Highlight", target: "Axiom", implemented: true },
  { id: "pumpTwitter", name: "Pump & Twitter", subtitle: "Pump.fun Description & Tweet Age", target: "Axiom", implemented: true },
  { id: "translator", name: "Translator", subtitle: "Axiom & X/Twitter posts", target: "Axiom / X", implemented: true }
];

export const MIGRATION_DEFAULTS = Object.freeze({
  platform: "axiom", scale: 1.4, offsetX: 0, offsetY: 0,
  borderColor: "#d7ded9", percentColor: "#edf2ee", fractionColor: "#aebbb2",
  borderWidth: 2, percentSize: 9.5, fractionSize: 6.5,
  profiles: [
    { enabled: true, threshold: 10, mode: "colorAbove", borderColor: "#d6b85a", percentColor: "#d6b85a", fractionColor: "#edf2ee" },
    { enabled: true, threshold: 25, mode: "colorAbove", borderColor: "#d97870", percentColor: "#d97870", fractionColor: "#edf2ee" },
    { enabled: true, threshold: 50, mode: "colorAbove", borderColor: "#78b88d", percentColor: "#78b88d", fractionColor: "#edf2ee" }
  ]
});

export const USERNAMES_DEFAULTS = Object.freeze({
  platform: "axiom", textColor: "#e6e6e6", badgeBgColor: "#1b1b1f", logFontSize: 12,
  badgePadding: 3, badgeOffsetX: 0, badgeOffsetY: 0,
  showAccounts: true, showTweets: true, showCommunities: true
});

export const DEVGLOW_DEFAULTS = Object.freeze({ intensity: 1, style: "glow", matchMode: "both", animate: false });

export const PUMP_TWITTER_DEFAULTS = Object.freeze({ showDescription: true, showAge: true, showTranslator: true, minAge: 0 });

export const TRANSLATOR_DEFAULTS = Object.freeze({
  axiom: true, x: true, method: "fast", provider: "openrouter",
  apiKeys: {},
  models: {
    openrouter: "openrouter/auto",
    gemini: "gemini-3.8-flash",
    anthropic: "claude-sonnet-5-5",
    groq: "openai/gpt-oss-120b"
  },
  targetLanguage: "ru", autoAxiom: false, autoX: false
});

export const STRETCH_DEFAULTS = Object.freeze({
  scaleX: 1.3333, scaleY: 1, sharp: true, autofit: true, foreign: true, monitor: "auto"
});

export const DEFAULT_STATE = {
  schemaVersion: 4,
  modules: Object.fromEntries(MODULES.map(module => [module.id, false])),
  settings: { translator: { ...TRANSLATOR_DEFAULTS }, lastath: { ...LASTATH_DEFAULTS }, migration: structuredClone(MIGRATION_DEFAULTS), stretch: { ...STRETCH_DEFAULTS }, usernames: { ...USERNAMES_DEFAULTS }, devglow: { ...DEVGLOW_DEFAULTS }, pumpTwitter: { ...PUMP_TWITTER_DEFAULTS } }
};

export function normalizeLastAth(value) {
  const source = value && typeof value === "object" ? value : {};
  const number = (input, min, max, fallback) =>
    Number.isFinite(Number(input)) ? Math.min(max, Math.max(min, Number(input))) : fallback;
  const color = (input, fallback) =>
    typeof input === "string" && /^#[0-9a-f]{6}$/i.test(input) ? input : fallback;
  const bool = (input, fallback) => typeof input === "boolean" ? input : fallback;

  return {
    x: number(source.x, 0, 90, 38),
    y: number(source.y, -20, 100, 9),
    minAth: number(source.minAth, 0, 1e9, 40000),
    minFees: number(source.minFees, 0, 1e9, 0),
    highlightAth: bool(source.highlightAth, false),
    athColor: color(source.athColor, "#edf2ee") === "#ffd166" ? "#edf2ee" : color(source.athColor, "#edf2ee"),
    highlightFees: bool(source.highlightFees, false),
    feesColor: color(source.feesColor, "#d7ded9") === "#78e8c7" ? "#d7ded9" : color(source.feesColor, "#d7ded9"),
    showInColumns: {
      newPairs: bool(source.showInColumns?.newPairs, true),
      finalStretch: bool(source.showInColumns?.finalStretch, true),
      migrated: bool(source.showInColumns?.migrated, true)
    }
  };
}

export function normalizeState(value) {
  const state = structuredClone(DEFAULT_STATE);
  if (!value || typeof value !== "object" || Array.isArray(value)) return state;
  state.schemaVersion = 4;

  if (value.modules && typeof value.modules === "object") {
    for (const module of MODULES) {
      if (typeof value.modules[module.id] === "boolean") {
        state.modules[module.id] = value.modules[module.id];
      }
    }
  }


  if (value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)) {
    state.settings = { ...state.settings, ...value.settings };
    state.settings.lastath = normalizeLastAth(value.settings.lastath);
    const n = (v, min, max, fallback) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
    const color = (v, fallback) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    const s = value.settings.stretch && typeof value.settings.stretch === "object" ? value.settings.stretch : {};
    const validMonitor = typeof s.monitor === "string" && (s.monitor === "auto" || s.monitor.split("x").length === 2 && s.monitor.split("x").every(part => /^\d{3,5}$/.test(part))) ? s.monitor : "auto";
    state.settings.stretch = {
      scaleX: n(s.scaleX, .5, 3, STRETCH_DEFAULTS.scaleX),
      scaleY: n(s.scaleY, .5, 3, STRETCH_DEFAULTS.scaleY),
      sharp: typeof s.sharp === "boolean" ? s.sharp : STRETCH_DEFAULTS.sharp,
      autofit: typeof s.autofit === "boolean" ? s.autofit : STRETCH_DEFAULTS.autofit,
      foreign: typeof s.foreign === "boolean" ? s.foreign : STRETCH_DEFAULTS.foreign,
      monitor: validMonitor
    };
    const pt = value.settings.pumpTwitter && typeof value.settings.pumpTwitter === "object" ? value.settings.pumpTwitter : {};
    state.settings.pumpTwitter = {
      showDescription: typeof pt.showDescription === "boolean" ? pt.showDescription : PUMP_TWITTER_DEFAULTS.showDescription,
      showAge: typeof pt.showAge === "boolean" ? pt.showAge : PUMP_TWITTER_DEFAULTS.showAge,
      showTranslator: typeof pt.showTranslator === "boolean" ? pt.showTranslator : PUMP_TWITTER_DEFAULTS.showTranslator,
      minAge: n(pt.minAge, 0, 86400, PUMP_TWITTER_DEFAULTS.minAge)
    };
    const tr = value.settings.translator && typeof value.settings.translator === "object" ? value.settings.translator : {};
    const providers = ["openrouter", "gemini", "anthropic", "groq"];
    const apiKeys = {};
    const models = {};
    for (const provider of providers) {
      const key = tr.apiKeys?.[provider];
      apiKeys[provider] = typeof key === "string" ? key.slice(0, 500) : "";
      const model = tr.models?.[provider];
      models[provider] = typeof model === "string" && model.trim() ? model.trim().slice(0, 160) : TRANSLATOR_DEFAULTS.models[provider];
    }
    state.settings.translator = {
      axiom: typeof tr.axiom === "boolean" ? tr.axiom : TRANSLATOR_DEFAULTS.axiom,
      x: typeof tr.x === "boolean" ? tr.x : TRANSLATOR_DEFAULTS.x,
      method: ["fast", "ai"].includes(tr.method) ? tr.method : TRANSLATOR_DEFAULTS.method,
      provider: providers.includes(tr.provider) ? tr.provider : TRANSLATOR_DEFAULTS.provider,
      apiKeys, models,
      targetLanguage: ["ru","en","uk","es","zh","pt","tr","ar"].includes(tr.targetLanguage) ? tr.targetLanguage : "ru",
      autoAxiom: typeof tr.autoAxiom === "boolean" ? tr.autoAxiom : false,
      autoX: typeof tr.autoX === "boolean" ? tr.autoX : false
    };
    const dg = value.settings.devglow && typeof value.settings.devglow === "object" ? value.settings.devglow : {};
    state.settings.devglow = {
      intensity: n(dg.intensity, 0.3, 2, DEVGLOW_DEFAULTS.intensity),
      style: ["glow", "ring", "tint"].includes(dg.style) ? dg.style : DEVGLOW_DEFAULTS.style,
      matchMode: ["both", "dev", "funder"].includes(dg.matchMode) ? dg.matchMode : DEVGLOW_DEFAULTS.matchMode,
      animate: typeof dg.animate === "boolean" ? dg.animate : DEVGLOW_DEFAULTS.animate
    };
    const u = value.settings.usernames && typeof value.settings.usernames === "object" ? value.settings.usernames : {};
    state.settings.usernames = {
      platform: "axiom",
      textColor: color(u.textColor, USERNAMES_DEFAULTS.textColor),
      badgeBgColor: color(u.badgeBgColor, USERNAMES_DEFAULTS.badgeBgColor),
      logFontSize: n(u.logFontSize, 8, 20, USERNAMES_DEFAULTS.logFontSize),
      badgePadding: n(u.badgePadding, 0, 12, USERNAMES_DEFAULTS.badgePadding),
      badgeOffsetX: n(u.badgeOffsetX, -100, 100, USERNAMES_DEFAULTS.badgeOffsetX),
      badgeOffsetY: n(u.badgeOffsetY, -100, 100, USERNAMES_DEFAULTS.badgeOffsetY),
      showAccounts: typeof u.showAccounts === "boolean" ? u.showAccounts : true,
      showTweets: typeof u.showTweets === "boolean" ? u.showTweets : true,
      showCommunities: typeof u.showCommunities === "boolean" ? u.showCommunities : true
    };
    const m = value.settings.migration && typeof value.settings.migration === "object" ? value.settings.migration : {};
    const base = MIGRATION_DEFAULTS;
    state.settings.migration = {
      platform: "axiom",
      scale: n(m.scale, .5, 2, base.scale), offsetX: n(m.offsetX, -100, 100, 0), offsetY: n(m.offsetY, -100, 100, 0),
      borderColor: color(m.borderColor, base.borderColor), percentColor: color(m.percentColor, base.percentColor), fractionColor: color(m.fractionColor, base.fractionColor),
      borderWidth: n(m.borderWidth, .5, 8, base.borderWidth), percentSize: n(m.percentSize, 5, 20, base.percentSize), fractionSize: n(m.fractionSize, 4, 16, base.fractionSize),
      profiles: Array.isArray(m.profiles) ? m.profiles.slice(0, 8).map((p, i) => ({
        enabled: typeof p?.enabled === "boolean" ? p.enabled : true, threshold: n(p?.threshold, 0, 100, [10,25,50][i] ?? 10),
        mode: "colorAbove", borderColor: color(p?.borderColor, base.profiles[0].borderColor),
        percentColor: color(p?.percentColor, base.profiles[0].percentColor), fractionColor: color(p?.fractionColor, base.profiles[0].fractionColor)
      })) : structuredClone(base.profiles)
    };
  }

  return state;
}
