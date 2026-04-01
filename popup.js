const STORAGE_KEY = "adhdFocusReaderSettings";
const defaultSettings = {
  enabled: false,
  intensity: 40,
  lineHeight: 1.6,
  letterSpacing: 0.02
};

const enabledInput = document.getElementById("enabled");
const intensityInput = document.getElementById("intensity");
const intensityValue = document.getElementById("intensityValue");
const lineHeightInput = document.getElementById("lineHeight");
const letterSpacingInput = document.getElementById("letterSpacing");
const applyButton = document.getElementById("apply");
const resetButton = document.getElementById("reset");

function populateForm(settings) {
  enabledInput.checked = settings.enabled;
  intensityInput.value = String(settings.intensity);
  lineHeightInput.value = String(settings.lineHeight);
  letterSpacingInput.value = String(settings.letterSpacing);
  intensityValue.textContent = `${settings.intensity}%`;
}

function getFormSettings() {
  return {
    enabled: enabledInput.checked,
    intensity: Number(intensityInput.value),
    lineHeight: Number(lineHeightInput.value),
    letterSpacing: Number(letterSpacingInput.value)
  };
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab?.id;
}

async function sendSettings(settings) {
  const tabId = await getActiveTabId();
  if (!tabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "APPLY_ADHD_READER_SETTINGS",
      payload: settings
    });
  } catch (_error) {
    // Some Chrome pages do not accept content scripts.
  }
}

async function persistAndApply(settings) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  await sendSettings(settings);
}

intensityInput.addEventListener("input", () => {
  intensityValue.textContent = `${intensityInput.value}%`;
});

applyButton.addEventListener("click", async () => {
  await persistAndApply(getFormSettings());
});

resetButton.addEventListener("click", async () => {
  populateForm(defaultSettings);
  await persistAndApply(defaultSettings);
});

chrome.storage.sync.get(STORAGE_KEY, (result) => {
  populateForm({
    ...defaultSettings,
    ...(result[STORAGE_KEY] || {})
  });
});
