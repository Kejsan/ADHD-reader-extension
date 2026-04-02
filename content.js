(() => {
  const READABLE_BLOCK_SELECTOR = [
    "p",
    "li",
    "blockquote",
    "figcaption",
    "caption",
    "td",
    "th",
    "dt",
    "dd",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6"
  ].join(",");
  const CANDIDATE_SELECTOR = [
    "article",
    "main",
    "[role='main']",
    "section",
    "div",
    "main article",
    ".article",
    ".post",
    ".entry-content",
    ".post-content",
    ".article-content",
    ".blog-post",
    ".story",
    ".content"
  ].join(",");
  const ROOT_CLASS = "adhd-focus-reader-active";
  const PROCESSED_ATTR = "data-adhd-focus-reader-processed";
  const PICKABLE_ATTR = "data-adhd-focus-reader-pickable";
  const ACTIVE_CONTAINER_ATTR = "data-adhd-focus-reader-container";
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
    "CANVAS",
    "NAV",
    "FOOTER",
    "ASIDE",
    "HEADER"
  ]);
  const BAD_SELECTOR = [
    "nav",
    "header",
    "footer",
    "aside",
    "[aria-label*='comment' i]",
    "[aria-label*='share' i]",
    "[aria-label*='reaction' i]",
    "[class*='comment' i]",
    "[class*='share' i]",
    "[class*='social' i]",
    "[class*='related' i]",
    "[class*='promo' i]",
    "[class*='advert' i]",
    "[class*='banner' i]",
    "[class*='cookie' i]",
    "[class*='sidebar' i]",
    "[class*='toolbar' i]",
    "[class*='feed' i]",
    "[class*='menu' i]"
  ].join(",");
  const CANDIDATE_HINT_PATTERN = /(article|post|entry|content|story|blog|main|reader)/i;
  const BAD_HINT_PATTERN = /(nav|menu|footer|header|aside|comment|share|social|related|promo|advert|banner|cookie|sidebar|toolbar|feed)/i;
  const wordPattern = /([\p{L}\p{N}][\p{L}\p{N}'-]*)/gu;

  const defaultSettings = {
    intensity: 40,
    lineHeight: 1.6,
    letterSpacing: 0.02
  };

  let currentSession = {
    mode: null,
    settings: { ...defaultSettings },
    activeContainerId: null
  };
  let processedBlocks = [];
  let originalBlockHtml = new Map();
  let activeObserver = null;
  let manualPicker = null;
  let analysisCache = null;
  let candidateSequence = 0;

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width >= 120 &&
      rect.height >= 24
    );
  }

  function hasBadAncestor(element) {
    if (!element) {
      return false;
    }

    return Boolean(element.closest(BAD_SELECTOR));
  }

  function isReadableBlock(element) {
    if (!element || !isVisible(element) || hasBadAncestor(element)) {
      return false;
    }

    if (EXCLUDED_TAGS.has(element.tagName)) {
      return false;
    }

    const text = element.innerText.replace(/\s+/g, " ").trim();
    const { minimumCharacters, minimumWords } = getReadableThresholds(element);

    if (text.length < minimumCharacters) {
      return false;
    }

    if (text.split(" ").length < minimumWords) {
      return false;
    }

    const linkTextLength = Array.from(element.querySelectorAll("a")).reduce(
      (total, link) => total + link.innerText.trim().length,
      0
    );
    if (text.length > 0 && linkTextLength / text.length > 0.6) {
      return false;
    }

    return true;
  }

  function getReadableBlocks(root) {
    const selectedBlocks = Array.from(root.querySelectorAll(READABLE_BLOCK_SELECTOR)).filter((element) => {
      if (!isReadableBlock(element)) {
        return false;
      }

      const text = element.innerText.replace(/\s+/g, " ").trim();
      if (/^[A-Z][A-Z\s\d\W]{1,40}$/.test(text)) {
        return false;
      }

      return true;
    });

    const fallbackBlocks = Array.from(root.querySelectorAll("div, section, article")).filter((element) => {
      if (!isVisible(element) || hasBadAncestor(element) || EXCLUDED_TAGS.has(element.tagName)) {
        return false;
      }

      const text = element.innerText.replace(/\s+/g, " ").trim();
      if (text.length < 120 || text.split(" ").length < 20) {
        return false;
      }

      if (element.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6").length > 0) {
        return false;
      }

      if (element.children.length > 12) {
        return false;
      }

      const linkDensity = getLinkDensity(element);
      return linkDensity < 0.35;
    });
    const combinedBlocks = dedupeNestedBlocks([...selectedBlocks, ...fallbackBlocks]);
    const rootTextLength = root.innerText.replace(/\s+/g, " ").trim().length;
    const coveredLength = combinedBlocks.reduce(
      (total, block) => total + block.innerText.replace(/\s+/g, " ").trim().length,
      0
    );

    if (rootTextLength > 0 && coveredLength / rootTextLength < 0.68) {
      const supplementalBlocks = getSupplementalProseBlocks(root, combinedBlocks);
      const structuredBlocks = getStructuredReadableBlocks(root, combinedBlocks);
      return dedupeNestedBlocks([...combinedBlocks, ...supplementalBlocks, ...structuredBlocks]);
    }

    return combinedBlocks;
  }

  function getReadableThresholds(element) {
    if (element.matches("h1, h2, h3, h4, h5, h6")) {
      return {
        minimumCharacters: 12,
        minimumWords: 2
      };
    }

    if (element.matches("li, figcaption, caption, dt, dd")) {
      return {
        minimumCharacters: 14,
        minimumWords: 2
      };
    }

    if (element.matches("td, th")) {
      return {
        minimumCharacters: 8,
        minimumWords: 1
      };
    }

    return {
      minimumCharacters: 40,
      minimumWords: 5
    };
  }

  function getSupplementalProseBlocks(root, existingBlocks) {
    return Array.from(root.querySelectorAll("div, section, article, td")).filter((element) => {
      if (!isVisible(element) || hasBadAncestor(element) || EXCLUDED_TAGS.has(element.tagName)) {
        return false;
      }

      if (existingBlocks.includes(element)) {
        return false;
      }

      if (existingBlocks.some((block) => block.contains(element) || element.contains(block))) {
        return false;
      }

      const text = element.innerText.replace(/\s+/g, " ").trim();
      if (text.length < 70 || text.split(" ").length < 10) {
        return false;
      }

      const readableDescendants = element.querySelectorAll(READABLE_BLOCK_SELECTOR).length;
      if (readableDescendants > 1) {
        return false;
      }

      const blockChildCount = element.querySelectorAll("div, section, article, table, ul, ol").length;
      if (blockChildCount > 4) {
        return false;
      }

      return getLinkDensity(element) < 0.35;
    });
  }

  function getStructuredReadableBlocks(root, existingBlocks) {
    return Array.from(root.querySelectorAll("ul, ol, table")).filter((element) => {
      if (!isVisible(element) || hasBadAncestor(element) || EXCLUDED_TAGS.has(element.tagName)) {
        return false;
      }

      if (existingBlocks.includes(element)) {
        return false;
      }

      const text = element.innerText.replace(/\s+/g, " ").trim();
      if (text.length < 40) {
        return false;
      }

      if (element.matches("ul, ol") && element.querySelectorAll("li").length < 2) {
        return false;
      }

      if (element.matches("table") && element.querySelectorAll("tr").length < 2) {
        return false;
      }

      const coveredLength = existingBlocks
        .filter((block) => element.contains(block))
        .reduce((total, block) => total + block.innerText.replace(/\s+/g, " ").trim().length, 0);

      return coveredLength / Math.max(text.length, 1) < 0.72;
    });
  }

  function dedupeNestedBlocks(blocks) {
    const sortedBlocks = [...new Set(blocks)].sort((left, right) => {
      const priorityDelta = getBlockPriority(right) - getBlockPriority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return (
        left.innerText.replace(/\s+/g, " ").trim().length -
        right.innerText.replace(/\s+/g, " ").trim().length
      );
    });
    const keptBlocks = [];

    for (const block of sortedBlocks) {
      const currentPriority = getBlockPriority(block);
      const currentLength = block.innerText.replace(/\s+/g, " ").trim().length;
      const shouldSkip = keptBlocks.some((kept) => {
        const keptPriority = getBlockPriority(kept);
        const keptLength = kept.innerText.replace(/\s+/g, " ").trim().length;

        if (kept.contains(block) && keptPriority >= currentPriority) {
          return true;
        }

        if (block.contains(kept) && currentPriority < keptPriority) {
          return true;
        }

        if (block.contains(kept) && currentPriority === keptPriority && currentLength >= keptLength) {
          return true;
        }

        return false;
      });

      if (!shouldSkip) {
        keptBlocks.push(block);
      }
    }

    return keptBlocks;
  }

  function getBlockPriority(element) {
    if (element.matches("h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, caption, td, th, dt, dd")) {
      return 3;
    }

    if (element.matches("ul, ol, table")) {
      return 2;
    }

    return 1;
  }

  function getTextDensity(element) {
    const textLength = element.innerText.replace(/\s+/g, " ").trim().length;
    const area = Math.max(element.getBoundingClientRect().width * element.getBoundingClientRect().height, 1);
    return textLength / area;
  }

  function getLinkDensity(element) {
    const textLength = Math.max(element.innerText.replace(/\s+/g, " ").trim().length, 1);
    const linkTextLength = Array.from(element.querySelectorAll("a")).reduce(
      (total, link) => total + link.innerText.trim().length,
      0
    );
    return linkTextLength / textLength;
  }

  function getCandidateMetadata(element) {
    const text = element.innerText.replace(/\s+/g, " ").trim();
    const paragraphCount = element.querySelectorAll("p").length;
    const headingCount = element.querySelectorAll("h1, h2, h3").length;
    const listCount = element.querySelectorAll("li").length;
    const rect = element.getBoundingClientRect();
    const classAndId = `${element.className || ""} ${element.id || ""}`;
    const semanticBonus =
      element.tagName === "ARTICLE" || element.tagName === "MAIN" || CANDIDATE_HINT_PATTERN.test(classAndId)
        ? 18
        : 0;
    const penalty = BAD_HINT_PATTERN.test(classAndId) ? 18 : 0;
    const feedPenalty = /linkedin|feed/.test(location.hostname + classAndId.toLowerCase()) ? 8 : 0;
    const density = getTextDensity(element);
    const linkDensity = getLinkDensity(element);
    const score =
      Math.min(text.length / 120, 35) +
      paragraphCount * 7 +
      Math.min(listCount * 2, 8) +
      headingCount * 5 +
      semanticBonus +
      density * 2200 -
      linkDensity * 40 -
      penalty -
      feedPenalty;

    return {
      element,
      score,
      textLength: text.length,
      paragraphCount,
      linkDensity,
      rect,
      confidence: 0
    };
  }

  function isCandidateElement(element) {
    if (!element || !isVisible(element) || hasBadAncestor(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 260 || rect.height < 180) {
      return false;
    }

    const textLength = element.innerText.replace(/\s+/g, " ").trim().length;
    if (textLength < 280) {
      return false;
    }

    if (element.querySelectorAll("p, li").length < 2) {
      return false;
    }

    if (element.children.length > 120) {
      return false;
    }

    return true;
  }

  function analyzePage() {
    const candidates = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR))
      .filter(isCandidateElement)
      .map(getCandidateMetadata)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    if (!candidates.length) {
      analysisCache = {
        status: "no_candidate",
        confidence: 0,
        candidateCount: 0,
        topCandidate: null,
        candidateSummary: "No strong reading container detected.",
        recommendedMode: "manual",
        appliedMode: currentSession.mode,
        activeContainerId: currentSession.activeContainerId
      };
      return analysisCache;
    }

    const top = candidates[0];
    top.confidence = Math.max(
      0,
      Math.min(
        1,
        0.25 +
          Math.min(top.paragraphCount / 8, 0.3) +
          Math.min(top.textLength / 2500, 0.25) +
          Math.max(0, 0.2 - top.linkDensity * 0.3) +
          (top.element.tagName === "ARTICLE" || top.element.tagName === "MAIN" ? 0.15 : 0)
      )
    );

    const status = top.confidence >= 0.58 ? "article_found" : "low_confidence";
    analysisCache = {
      status,
      confidence: Number(top.confidence.toFixed(2)),
      candidateCount: candidates.length,
      topCandidate: {
        tagName: top.element.tagName.toLowerCase(),
        className: String(top.element.className || "").trim().slice(0, 120),
        textLength: top.textLength,
        paragraphCount: top.paragraphCount
      },
      candidateSummary:
        status === "article_found"
          ? "Main reading content detected."
          : "This page looks app-like or mixed-content. Manual selection is safer.",
      recommendedMode: status === "article_found" ? "article" : "manual",
      appliedMode: currentSession.mode,
      activeContainerId: currentSession.activeContainerId
    };

    return analysisCache;
  }

  function ensureCandidateId(element) {
    if (!element.dataset.adhdFocusReaderCandidateId) {
      candidateSequence += 1;
      element.dataset.adhdFocusReaderCandidateId = `candidate-${candidateSequence}`;
    }

    return element.dataset.adhdFocusReaderCandidateId;
  }

  function transformTextNode(node, settings) {
    if (!node.parentElement) {
      return;
    }

    if (node.parentElement.closest(`.${"adhd-focus-reader-prefix"}`)) {
      return;
    }

    const originalText = node.nodeValue;
    if (!originalText || !originalText.trim()) {
      return;
    }

    wordPattern.lastIndex = 0;
    const matches = Array.from(originalText.matchAll(wordPattern));
    if (!matches.length) {
      return;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
      const word = match[0];
      const index = match.index ?? 0;
      if (index > cursor) {
        fragment.appendChild(document.createTextNode(originalText.slice(cursor, index)));
      }

      if (word.length < 3) {
        fragment.appendChild(document.createTextNode(word));
      } else {
        const prefixLength = Math.min(
          word.length - 1,
          Math.max(1, Math.ceil(word.length * (settings.intensity / 100)))
        );
        const prefix = word.slice(0, prefixLength);
        const suffix = word.slice(prefixLength);
        const prefixSpan = document.createElement("span");
        prefixSpan.className = "adhd-focus-reader-prefix";
        prefixSpan.textContent = prefix;
        fragment.appendChild(prefixSpan);
        if (suffix) {
          fragment.appendChild(document.createTextNode(suffix));
        }
      }

      cursor = index + word.length;
    }

    if (cursor < originalText.length) {
      fragment.appendChild(document.createTextNode(originalText.slice(cursor)));
    }

    node.replaceWith(fragment);
  }

  function transformBlock(block, settings) {
    if (block.getAttribute(PROCESSED_ATTR) === "true") {
      return;
    }

    const originalHtml = block.innerHTML;
    const sourceText = block.innerText.replace(/\s+/g, " ").trim();
    const { minimumCharacters } = getReadableThresholds(block);
    if (sourceText.length < minimumCharacters) {
      return;
    }

    originalBlockHtml.set(block, originalHtml);
    block.setAttribute(PROCESSED_ATTR, "true");
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      if (
        textNode.parentElement &&
        !EXCLUDED_TAGS.has(textNode.parentElement.tagName) &&
        !textNode.parentElement.closest("a, button, [role='button'], label, svg")
      ) {
        textNodes.push(textNode);
      }
    }

    for (const textNode of textNodes) {
      transformTextNode(textNode, settings);
    }

    processedBlocks.push(block);
  }

  function applyTypography(settings) {
    document.documentElement.classList.add(ROOT_CLASS);
    document.documentElement.style.setProperty("--adhd-reader-line-height", String(settings.lineHeight));
    document.documentElement.style.setProperty(
      "--adhd-reader-letter-spacing",
      `${Number(settings.letterSpacing).toFixed(2)}em`
    );
  }

  function clearTypography() {
    document.documentElement.classList.remove(ROOT_CLASS);
    document.documentElement.style.removeProperty("--adhd-reader-line-height");
    document.documentElement.style.removeProperty("--adhd-reader-letter-spacing");
  }

  function disconnectObserver() {
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }
  }

  function resetReader() {
    disconnectObserver();

    for (const block of processedBlocks) {
      if (!block.isConnected) {
        continue;
      }

      const originalHtml = originalBlockHtml.get(block);
      if (typeof originalHtml === "string") {
        block.innerHTML = originalHtml;
      }
      block.removeAttribute(PROCESSED_ATTR);
    }

    processedBlocks = [];
    originalBlockHtml = new Map();
    clearTypography();

    if (currentSession.activeContainerId) {
      const container = document.querySelector(`[${ACTIVE_CONTAINER_ATTR}='${currentSession.activeContainerId}']`);
      if (container) {
        container.removeAttribute(ACTIVE_CONTAINER_ATTR);
      }
    }

    currentSession = {
      mode: null,
      settings: { ...defaultSettings },
      activeContainerId: null
    };
  }

  function observeContainer(container, settings) {
    disconnectObserver();
    activeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches?.(READABLE_BLOCK_SELECTOR) && isReadableBlock(node)) {
            transformBlock(node, settings);
          }

          for (const block of getReadableBlocks(node)) {
            transformBlock(block, settings);
          }
        }
      }
    });

    activeObserver.observe(container, {
      childList: true,
      subtree: true
    });
  }

  function applyToBlocks(blocks, container, mode, settings) {
    resetReader();
    if (!blocks.length) {
      return {
        ok: false,
        reason: "No readable blocks found."
      };
    }

    const containerId = ensureCandidateId(container);
    container.setAttribute(ACTIVE_CONTAINER_ATTR, containerId);
    applyTypography(settings);

    for (const block of blocks) {
      transformBlock(block, settings);
    }

    currentSession = {
      mode,
      settings: { ...defaultSettings, ...settings },
      activeContainerId: containerId
    };

    observeContainer(container, currentSession.settings);

    return {
      ok: true,
      activeContainerId: containerId,
      processedCount: processedBlocks.length
    };
  }

  function applyArticleMode(settings, fallbackChoice) {
    const analysis = analyzePage();
    if (analysis.status === "no_candidate") {
      return {
        ok: false,
        needsChoice: true,
        analysis
      };
    }

    if (analysis.status === "low_confidence" && !fallbackChoice) {
      return {
        ok: false,
        needsChoice: true,
        analysis
      };
    }

    if (fallbackChoice === "page") {
      return applyWholePageMode(settings);
    }

    const top = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR))
      .filter(isCandidateElement)
      .map(getCandidateMetadata)
      .sort((left, right) => right.score - left.score)[0];

    if (!top) {
      return {
        ok: false,
        needsChoice: true,
        analysis
      };
    }

    const blocks = getReadableBlocks(top.element);
    if (!blocks.length && isReadableBlock(top.element)) {
      blocks.push(top.element);
    }
    const result = applyToBlocks(blocks, top.element, "article", settings);
    return {
      ...result,
      analysis: analyzePage()
    };
  }

  function applyWholePageMode(settings) {
    const blocks = getReadableBlocks(document.body).filter((block) => {
      const container = block.parentElement;
      return container && !hasBadAncestor(container);
    });
    const result = applyToBlocks(blocks, document.body, "page", settings);
    return {
      ...result,
      analysis: analyzePage()
    };
  }

  function getManualCandidateFromElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    let current = element;
    while (current && current !== document.body) {
      if (isCandidateElement(current) && !hasBadAncestor(current)) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function stopManualPicker() {
    if (!manualPicker) {
      return;
    }

    document.removeEventListener("mousemove", manualPicker.onMouseMove, true);
    document.removeEventListener("click", manualPicker.onClick, true);
    document.removeEventListener("keydown", manualPicker.onKeyDown, true);

    if (manualPicker.highlight && manualPicker.highlight.isConnected) {
      manualPicker.highlight.remove();
    }

    if (manualPicker.activeElement) {
      manualPicker.activeElement.removeAttribute(PICKABLE_ATTR);
    }

    manualPicker.resolve = null;
    manualPicker = null;
  }

  function updateHighlight(element, highlight) {
    const rect = element.getBoundingClientRect();
    highlight.style.top = `${Math.max(rect.top + window.scrollY - 4, 0)}px`;
    highlight.style.left = `${Math.max(rect.left + window.scrollX - 4, 0)}px`;
    highlight.style.width = `${rect.width + 8}px`;
    highlight.style.height = `${rect.height + 8}px`;
  }

  function startManualPicker(settings) {
    stopManualPicker();

    return new Promise((resolve) => {
      const highlight = document.createElement("div");
      highlight.className = "adhd-focus-reader-highlight";
      document.body.appendChild(highlight);

      manualPicker = {
        highlight,
        activeElement: null,
        resolve,
        onMouseMove(event) {
          const candidate = getManualCandidateFromElement(event.target);
          if (!candidate) {
            return;
          }

          if (manualPicker.activeElement && manualPicker.activeElement !== candidate) {
            manualPicker.activeElement.removeAttribute(PICKABLE_ATTR);
          }

          manualPicker.activeElement = candidate;
          candidate.setAttribute(PICKABLE_ATTR, "true");
          updateHighlight(candidate, highlight);
        },
        onClick(event) {
          const candidate = getManualCandidateFromElement(event.target);
          if (!candidate) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const blocks = getReadableBlocks(candidate);
          const result = applyToBlocks(blocks, candidate, "manual", settings);
          stopManualPicker();
          resolve({
            ...result,
            analysis: analyzePage()
          });
        },
        onKeyDown(event) {
          if (event.key !== "Escape") {
            return;
          }

          event.preventDefault();
          stopManualPicker();
          resolve({
            ok: false,
            cancelled: true,
            reason: "Manual selection cancelled."
          });
        }
      };

      document.addEventListener("mousemove", manualPicker.onMouseMove, true);
      document.addEventListener("click", manualPicker.onClick, true);
      document.addEventListener("keydown", manualPicker.onKeyDown, true);
    });
  }

  async function applyReader({ mode, settings, fallbackChoice }) {
    if (!document.body) {
      return {
        ok: false,
        reason: "Document body is not ready."
      };
    }

    const resolvedSettings = { ...defaultSettings, ...settings };

    if (mode === "manual") {
      return startManualPicker(resolvedSettings);
    }

    if (mode === "page") {
      return applyWholePageMode(resolvedSettings);
    }

    return applyArticleMode(resolvedSettings, fallbackChoice);
  }

  async function bootstrap() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_EFFECTIVE_STATE"
      });

      if (!response?.ok || !response.state?.active) {
        analyzePage();
        return;
      }

      await applyReader({
        mode: response.state.mode,
        settings: response.state.settings,
        fallbackChoice: response.state.mode === "article" ? "manual" : undefined
      });
    } catch (_error) {
      analyzePage();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const run = async () => {
      if (message?.type === "GET_PAGE_ANALYSIS") {
        return {
          ok: true,
          analysis: analyzePage(),
          currentSession
        };
      }

      if (message?.type === "APPLY_READER") {
        return await applyReader(message.payload);
      }

      if (message?.type === "START_MANUAL_PICK") {
        return await startManualPicker(message.payload?.settings || defaultSettings);
      }

      if (message?.type === "RESET_READER") {
        resetReader();
        analyzePage();
        return {
          ok: true,
          analysis: analysisCache,
          currentSession
        };
      }

      return { ok: false };
    };

    run()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });

  bootstrap();
})();
