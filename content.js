(() => {
  const STORAGE_KEY = "adhdFocusReaderSettings";
  const PROCESSED_ATTR = "data-adhd-focus-reader-processed";
  const ORIGINAL_ATTR = "data-adhd-focus-reader-original";
  const ROOT_CLASS = "adhd-focus-reader-active";
  const EXCLUDED_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "BUTTON",
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "VAR",
    "SVG",
    "CANVAS"
  ]);

  const defaultSettings = {
    enabled: false,
    intensity: 40,
    lineHeight: 1.6,
    letterSpacing: 0.02
  };

  let currentSettings = { ...defaultSettings };
  let observer = null;
  const wordPattern = /([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu;

  function isHidden(element) {
    const style = window.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  }

  function shouldSkipTextNode(node) {
    if (!node || !node.parentElement) {
      return true;
    }

    const parent = node.parentElement;

    if (parent.closest(`[${PROCESSED_ATTR}]`)) {
      return true;
    }

    if (EXCLUDED_TAGS.has(parent.tagName) || isHidden(parent)) {
      return true;
    }

    if (parent.isContentEditable || parent.closest("[contenteditable='true']")) {
      return true;
    }

    return !node.nodeValue || !node.nodeValue.trim();
  }

  function emphasizeWord(word, intensity) {
    if (word.length < 3) {
      return word;
    }

    const prefixLength = Math.min(
      word.length - 1,
      Math.max(1, Math.ceil(word.length * (intensity / 100)))
    );
    const prefix = word.slice(0, prefixLength);
    const suffix = word.slice(prefixLength);

    return `<span class="adhd-focus-reader-word"><span class="adhd-focus-reader-prefix">${prefix}</span>${suffix}</span>`;
  }

  function transformTextNode(node, intensity) {
    if (shouldSkipTextNode(node)) {
      return;
    }

    const originalText = node.nodeValue;
    const transformedText = originalText.replace(wordPattern, (word) =>
      emphasizeWord(word, intensity)
    );

    if (transformedText === originalText) {
      return;
    }

    const wrapper = document.createElement("span");
    wrapper.setAttribute(PROCESSED_ATTR, "true");
    wrapper.setAttribute(ORIGINAL_ATTR, originalText);
    wrapper.setAttribute("aria-label", originalText);
    wrapper.innerHTML = transformedText;
    node.parentNode.replaceChild(wrapper, node);
  }

  function walkTextNodes(root, intensity) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
      transformTextNode(node, intensity);
    }
  }

  function restoreOriginalText() {
    const processedNodes = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
    for (const node of processedNodes) {
      const originalText = node.getAttribute(ORIGINAL_ATTR) || node.textContent || "";
      node.replaceWith(document.createTextNode(originalText));
    }
  }

  function applyTypography(settings) {
    document.documentElement.classList.toggle(ROOT_CLASS, settings.enabled);
    document.documentElement.style.setProperty(
      "--adhd-reader-line-height",
      String(settings.lineHeight)
    );
    document.documentElement.style.setProperty(
      "--adhd-reader-letter-spacing",
      `${Number(settings.letterSpacing).toFixed(2)}em`
    );
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function observeNewContent() {
    disconnectObserver();

    observer = new MutationObserver((mutations) => {
      if (!currentSettings.enabled) {
        return;
      }

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            transformTextNode(node, currentSettings.intensity);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkTextNodes(node, currentSettings.intensity);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function applySettings(settings) {
    if (!document.body) {
      return;
    }

    currentSettings = { ...defaultSettings, ...settings };
    applyTypography(currentSettings);
    restoreOriginalText();

    if (!currentSettings.enabled) {
      disconnectObserver();
      return;
    }

    walkTextNodes(document.body, currentSettings.intensity);
    observeNewContent();
  }

  function loadSettings() {
    chrome.storage.sync.get(STORAGE_KEY, (result) => {
      applySettings(result[STORAGE_KEY] || defaultSettings);
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "APPLY_ADHD_READER_SETTINGS") {
      return false;
    }

    applySettings(message.payload || defaultSettings);
    sendResponse({ ok: true });
    return true;
  });

  loadSettings();
})();
