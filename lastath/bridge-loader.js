(() => {
  "use strict";
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("lastath/page-bridge.js");
  script.async = false;
  script.dataset.alhBridgeLoader = "0.3.7";
  script.addEventListener("load", () => script.remove(), { once: true });
  script.addEventListener("error", () => {
    document.documentElement.dataset.alhBridgeLoadError = "true";
    script.remove();
  }, { once: true });
  (document.head || document.documentElement).append(script);
})();

