const DEFAULTS = {
  defaultMode: "article",
  defaultPersistence: "tab",
  intensity: 40,
  lineHeight: 1.6,
  letterSpacing: 0.02
};

const statusChip = document.getElementById("statusChip");
const statusText = document.getElementById("statusText");
const fallbackPanel = document.getElementById("fallbackPanel");
const clearSiteButton = document.getElementById("clearSite");
const applyButton = document.getElementById("apply");
const resetButton = document.getElementById("reset");
const useDetectedButton = document.getElementById("useDetected");
const pickManuallyButton = document.getElementById("pickManually");
const forcePageButton = document.getElementById("forcePage");
const intensityInput = document.getElementById("intensity");
const lineHeightInput = document.getElementById("lineHeight");
const letterSpacingInput = document.getElementById("letterSpacing");
const intensityValue = document.getElementById("intensityValue");
const lineHeightValue = document.getElementById("lineHeightValue");
const letterSpacingValue = document.getElementById("letterSpacingValue");
const analyticsEnabledInput = document.getElementById("analyticsEnabled");
const analyticsSummary = document.getElementById("analyticsSummary");
const analyticsStats = document.getElementById("analyticsStats");
const installNotice = document.getElementById("installNotice");
const statApplies = document.getElementById("statApplies");
const statSites = document.getElementById("statSites");
const statPages = document.getElementById("statPages");
const statArticleMode = document.getElementById("statArticleMode");
const statManualMode = document.getElementById("statManualMode");
const statPageMode = document.getElementById("statPageMode");
const tabReadButton = document.getElementById("tabRead");
const tabSettingsButton = document.getElementById("tabSettings");
const panelRead = document.getElementById("panelRead");
const panelSettings = document.getElementById("panelSettings");

let activeTab = null;
let effectiveState = null;
let latestAnalysis = null;
let analyticsState = null;

function getSelectedValue(name) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : null;
}

function setSelectedValue(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) {
    input.checked = true;
  }
}

function getSettingsFromForm() {
  return {
    intensity: Number(intensityInput.value),
    lineHeight: Number(lineHeightInput.value),
    letterSpacing: Number(letterSpacingInput.value)
  };
}

function setStatus(text, tone) {
  statusChip.textContent = tone === "good" ? "Ready" : tone === "warn" ? "Review" : "Idle";
  statusChip.className = `chip${tone ? ` ${tone}` : ""}`;
  statusText.textContent = text;
}

function populateForm(state) {
  const source = state || DEFAULTS;
  setSelectedValue("mode", source.mode || source.defaultMode || DEFAULTS.defaultMode);
  setSelectedValue(
    "persistence",
    source.persistence || source.defaultPersistence || DEFAULTS.defaultPersistence
  );
  intensityInput.value = String(source.settings?.intensity ?? source.intensity ?? DEFAULTS.intensity);
  lineHeightInput.value = String(source.settings?.lineHeight ?? source.lineHeight ?? DEFAULTS.lineHeight);
  letterSpacingInput.value = String(
    source.settings?.letterSpacing ?? source.letterSpacing ?? DEFAULTS.letterSpacing
  );
  syncValueLabels();
}

function syncValueLabels() {
  intensityValue.textContent = `${intensityInput.value}%`;
  lineHeightValue.textContent = Number(lineHeightInput.value).toFixed(1);
  letterSpacingValue.textContent = `${Number(letterSpacingInput.value).toFixed(2)}em`;
}

function renderAnalyticsSummary(summary) {
  analyticsState = summary || null;
  analyticsEnabledInput.checked = Boolean(summary?.enabled);

  if (!summary?.enabled) {
    analyticsSummary.textContent = "Analytics are off.";
    analyticsStats.classList.add("hidden");
    return;
  }

  analyticsSummary.textContent =
    `${summary.totals.applies} applies across ${summary.uniqueSites} sites and ${summary.uniquePages} pages.`;
  statApplies.textContent = String(summary.totals.applies);
  statSites.textContent = String(summary.uniqueSites);
  statPages.textContent = String(summary.uniquePages);
  statArticleMode.textContent = String(summary.modes.article);
  statManualMode.textContent = String(summary.modes.manual);
  statPageMode.textContent = String(summary.modes.page);
  analyticsStats.classList.remove("hidden");
}

function setActiveTab(tabName) {
  const isRead = tabName === "read";
  tabReadButton.classList.toggle("active", isRead);
  tabSettingsButton.classList.toggle("active", !isRead);
  panelRead.classList.toggle("hidden", !isRead);
  panelSettings.classList.toggle("hidden", isRead);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tab || null;
}

async function sendToContent(message) {
  if (!activeTab?.id) {
    return { ok: false, unsupported: true };
  }

  try {
    return await chrome.tabs.sendMessage(activeTab.id, message);
  } catch (_error) {
    await chrome.runtime.sendMessage({
      type: "TRACK_ANALYTICS_EVENT",
      payload: {
        event: "unsupported_page",
        url: activeTab?.url || ""
      }
    });
    return { ok: false, unsupported: true };
  }
}

async function fetchEffectiveState() {
  if (!activeTab?.id) {
    return null;
  }

  const response = await chrome.runtime.sendMessage({
    type: "GET_EFFECTIVE_STATE",
    tabId: activeTab.id,
    url: activeTab.url || ""
  });

  return response?.state || null;
}

function updateApplyButton() {
  const mode = getSelectedValue("mode");
  applyButton.textContent =
    mode === "manual" ? "Pick content" : mode === "page" ? "Apply to page" : "Apply to article";
}

function renderAnalysis(analysis, unsupported) {
  latestAnalysis = analysis || null;

  if (unsupported) {
    setStatus("This page does not allow content-script controls.", "warn");
    fallbackPanel.classList.add("hidden");
    return;
  }

  if (!analysis) {
    setStatus("Open a normal webpage to analyze content targeting.", "warn");
    fallbackPanel.classList.add("hidden");
    return;
  }

  if (analysis.status === "article_found") {
    setStatus(
      `${analysis.candidateSummary} Confidence ${Math.round(analysis.confidence * 100)}%.`,
      "good"
    );
    fallbackPanel.classList.add("hidden");
    return;
  }

  if (analysis.status === "low_confidence") {
    setStatus(
      `${analysis.candidateSummary} Manual selection is recommended for this page.`,
      "warn"
    );
    fallbackPanel.classList.remove("hidden");
    return;
  }

  setStatus("No strong article container was detected on this page.", "warn");
  fallbackPanel.classList.remove("hidden");
}

async function refreshUi() {
  activeTab = await getActiveTab();
  effectiveState = await fetchEffectiveState();
  populateForm(effectiveState || DEFAULTS);
  updateApplyButton();

  const analysisResponse = await sendToContent({ type: "GET_PAGE_ANALYSIS" });
  renderAnalysis(analysisResponse?.analysis, analysisResponse?.unsupported);

  if (effectiveState?.hasSitePreference) {
    clearSiteButton.classList.remove("hidden");
  } else {
    clearSiteButton.classList.add("hidden");
  }

  const analyticsResponse = await chrome.runtime.sendMessage({
    type: "GET_ANALYTICS_SUMMARY"
  });
  renderAnalyticsSummary(analyticsResponse?.summary || null);

  const installNoticeResponse = await chrome.runtime.sendMessage({
    type: "GET_INSTALL_NOTICE"
  });
  if (installNoticeResponse?.pending) {
    installNotice.classList.remove("hidden");
    await chrome.runtime.sendMessage({
      type: "DISMISS_INSTALL_NOTICE"
    });
  } else {
    installNotice.classList.add("hidden");
  }
}

async function persistAppliedState(mode, persistence, settings) {
  if (!activeTab?.id) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: "SAVE_READER_STATE",
    payload: {
      tabId: activeTab.id,
      url: activeTab.url || "",
      mode,
      persistence,
      settings
    }
  });
}

async function updateBadge(active) {
  if (!activeTab?.id) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: "UPDATE_BADGE",
    tabId: activeTab.id,
    active
  });
}

async function applyMode(mode, fallbackChoice) {
  const persistence = getSelectedValue("persistence");
  const settings = getSettingsFromForm();
  const response = await sendToContent({
    type: "APPLY_READER",
    payload: {
      mode,
      settings,
      fallbackChoice
    }
  });

  if (response?.needsChoice) {
    renderAnalysis(response.analysis, false);
    return;
  }

  if (!response?.ok) {
    if (response?.cancelled) {
      await chrome.runtime.sendMessage({
        type: "TRACK_ANALYTICS_EVENT",
        payload: {
          event: "manual_cancel",
          url: activeTab?.url || ""
        }
      });
    } else {
      setStatus(response?.reason || response?.error || "The reader could not be applied on this page.", "warn");
    }
    return;
  }

  await persistAppliedState(mode, persistence, settings);
  await chrome.runtime.sendMessage({
    type: "TRACK_ANALYTICS_EVENT",
    payload: {
      event: "apply",
      url: activeTab?.url || "",
      mode,
      persistence,
      analysisStatus: response.analysis?.status || latestAnalysis?.status || null
    }
  });
  await updateBadge(true);
  await refreshUi();
}

intensityInput.addEventListener("input", syncValueLabels);
lineHeightInput.addEventListener("input", syncValueLabels);
letterSpacingInput.addEventListener("input", syncValueLabels);

for (const input of document.querySelectorAll('input[name="mode"]')) {
  input.addEventListener("change", updateApplyButton);
}

tabReadButton.addEventListener("click", () => {
  setActiveTab("read");
});

tabSettingsButton.addEventListener("click", () => {
  setActiveTab("settings");
});

applyButton.addEventListener("click", async () => {
  await applyMode(getSelectedValue("mode"));
});

resetButton.addEventListener("click", async () => {
  const response = await sendToContent({ type: "RESET_READER" });
  if (response?.ok && activeTab?.id) {
    await chrome.runtime.sendMessage({
      type: "SET_TAB_OVERRIDE",
      payload: {
        tabId: activeTab.id,
        mode: getSelectedValue("mode"),
        settings: getSettingsFromForm(),
        enabled: false
      }
    });
    await chrome.runtime.sendMessage({
      type: "TRACK_ANALYTICS_EVENT",
      payload: {
        event: "reset",
        url: activeTab.url || ""
      }
    });
    await updateBadge(false);
  }
  await refreshUi();
});

clearSiteButton.addEventListener("click", async () => {
  if (effectiveState?.hostname) {
    await chrome.runtime.sendMessage({
      type: "CLEAR_SITE_PREFERENCE",
      hostname: effectiveState.hostname
    });
  }

  const response = await sendToContent({ type: "RESET_READER" });
  if (response?.ok) {
    await updateBadge(false);
  }
  await refreshUi();
});

analyticsEnabledInput.addEventListener("change", async () => {
  const response = await chrome.runtime.sendMessage({
    type: "SET_ANALYTICS_ENABLED",
    enabled: analyticsEnabledInput.checked
  });
  renderAnalyticsSummary(response?.summary || null);
});

useDetectedButton.addEventListener("click", async () => {
  await applyMode("article", "article");
});

pickManuallyButton.addEventListener("click", async () => {
  setSelectedValue("mode", "manual");
  updateApplyButton();
  await chrome.runtime.sendMessage({
    type: "TRACK_ANALYTICS_EVENT",
    payload: {
      event: "manual_start",
      url: activeTab?.url || ""
    }
  });
  await applyMode("manual");
});

forcePageButton.addEventListener("click", async () => {
  setSelectedValue("mode", "page");
  updateApplyButton();
  await applyMode("page");
});

refreshUi();
setActiveTab("read");
