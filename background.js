const USER_DEFAULTS_KEY = "userDefaults";
const SITE_PREFERENCES_KEY = "sitePreferences";
const TAB_STATES_KEY = "tabStates";
const ANALYTICS_SETTINGS_KEY = "analyticsSettings";
const ANALYTICS_STATE_KEY = "analyticsState";
const ANALYTICS_ENDPOINT = "";
const INSTALL_NOTICE_KEY = "installNoticePending";

const DEFAULTS = {
  defaultMode: "article",
  defaultPersistence: "tab",
  analyticsEnabled: true,
  intensity: 40,
  lineHeight: 1.6,
  letterSpacing: 0.02
};

const DEFAULT_ANALYTICS_STATE = {
  installId: "",
  salt: "",
  totals: {
    applies: 0,
    resets: 0,
    manualStarts: 0,
    manualCancels: 0,
    unsupportedPages: 0
  },
  modes: {
    article: 0,
    manual: 0,
    page: 0
  },
  persistence: {
    tab: 0,
    site: 0
  },
  uniqueHostHashes: [],
  uniquePageHashes: [],
  queue: []
};

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (_error) {
    return "";
  }
}

async function getSyncState() {
  const result = await chrome.storage.sync.get([
    USER_DEFAULTS_KEY,
    SITE_PREFERENCES_KEY,
    ANALYTICS_SETTINGS_KEY
  ]);
  return {
    userDefaults: { ...DEFAULTS, ...(result[USER_DEFAULTS_KEY] || {}) },
    sitePreferences: result[SITE_PREFERENCES_KEY] || {},
    analyticsSettings: {
      enabled:
        result[ANALYTICS_SETTINGS_KEY]?.enabled ??
        result[USER_DEFAULTS_KEY]?.analyticsEnabled ??
        DEFAULTS.analyticsEnabled
    }
  };
}

async function getSessionState() {
  const result = await chrome.storage.session.get(TAB_STATES_KEY);
  return result[TAB_STATES_KEY] || {};
}

async function setTabStates(tabStates) {
  await chrome.storage.session.set({ [TAB_STATES_KEY]: tabStates });
}

function buildResolvedState({ userDefaults, sitePreferences, tabStates, tabId, url }) {
  const hostname = getHostname(url);
  const tabState = String(tabId) in tabStates ? tabStates[String(tabId)] : null;
  const sitePreference = hostname && hostname in sitePreferences ? sitePreferences[hostname] : null;
  const source = tabState ? "tab" : sitePreference ? "site" : "defaults";
  const base = {
    mode: userDefaults.defaultMode,
    settings: {
      intensity: userDefaults.intensity,
      lineHeight: userDefaults.lineHeight,
      letterSpacing: userDefaults.letterSpacing
    },
    analyticsEnabled: userDefaults.analyticsEnabled,
    persistence: userDefaults.defaultPersistence,
    active: false
  };
  const selected = tabState || sitePreference || null;

  if (!selected) {
    return {
      hostname,
      source,
      ...base,
      hasSitePreference: Boolean(sitePreference)
    };
  }

  return {
    hostname,
    source,
    mode: selected.mode,
    settings: { ...base.settings, ...(selected.settings || {}) },
    analyticsEnabled: userDefaults.analyticsEnabled,
    persistence: tabState ? "tab" : "site",
    active: Boolean(selected.enabled),
    hasSitePreference: Boolean(sitePreference)
  };
}

async function getAnalyticsState() {
  const result = await chrome.storage.local.get(ANALYTICS_STATE_KEY);
  const stored = result[ANALYTICS_STATE_KEY] || {};
  const installId = stored.installId || crypto.randomUUID();
  const salt = stored.salt || crypto.randomUUID();
  const state = {
    ...DEFAULT_ANALYTICS_STATE,
    ...stored,
    installId,
    salt,
    totals: {
      ...DEFAULT_ANALYTICS_STATE.totals,
      ...(stored.totals || {})
    },
    modes: {
      ...DEFAULT_ANALYTICS_STATE.modes,
      ...(stored.modes || {})
    },
    persistence: {
      ...DEFAULT_ANALYTICS_STATE.persistence,
      ...(stored.persistence || {})
    },
    uniqueHostHashes: stored.uniqueHostHashes || [],
    uniquePageHashes: stored.uniquePageHashes || [],
    queue: stored.queue || []
  };

  if (!stored.installId || !stored.salt) {
    await chrome.storage.local.set({ [ANALYTICS_STATE_KEY]: state });
  }

  return state;
}

async function hashWithSalt(value, salt) {
  const buffer = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((chunk) => chunk.toString(16).padStart(2, "0"))
    .join("");
}

async function getAnalyticsSummary() {
  const [syncState, analyticsState] = await Promise.all([getSyncState(), getAnalyticsState()]);
  return {
    enabled: Boolean(syncState.analyticsSettings.enabled),
    totals: analyticsState.totals,
    modes: analyticsState.modes,
    persistence: analyticsState.persistence,
    uniqueSites: analyticsState.uniqueHostHashes.length,
    uniquePages: analyticsState.uniquePageHashes.length,
    queuedBatches: analyticsState.queue.length
  };
}

async function flushAnalyticsIfConfigured(state) {
  if (!ANALYTICS_ENDPOINT || !state.queue.length) {
    return state;
  }

  try {
    const response = await fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        installId: state.installId,
        batches: state.queue
      })
    });

    if (!response.ok) {
      return state;
    }

    const nextState = {
      ...state,
      queue: []
    };
    await chrome.storage.local.set({ [ANALYTICS_STATE_KEY]: nextState });
    return nextState;
  } catch (_error) {
    return state;
  }
}

async function trackAnalyticsEvent(payload) {
  const syncState = await getSyncState();
  if (!syncState.analyticsSettings.enabled) {
    return { ok: true, enabled: false };
  }

  const analyticsState = await getAnalyticsState();
  const nextState = structuredClone(analyticsState);
  const url = payload.url || "";
  const hostname = getHostname(url);
  let path = "";

  try {
    path = new URL(url).pathname || "";
  } catch (_error) {
    path = "";
  }

  if (payload.event === "apply") {
    nextState.totals.applies += 1;
    if (payload.mode in nextState.modes) {
      nextState.modes[payload.mode] += 1;
    }
    if (payload.persistence in nextState.persistence) {
      nextState.persistence[payload.persistence] += 1;
    }
  }

  if (payload.event === "reset") {
    nextState.totals.resets += 1;
  }

  if (payload.event === "manual_start") {
    nextState.totals.manualStarts += 1;
  }

  if (payload.event === "manual_cancel") {
    nextState.totals.manualCancels += 1;
  }

  if (payload.event === "unsupported_page") {
    nextState.totals.unsupportedPages += 1;
  }

  if (hostname) {
    const hostHash = await hashWithSalt(hostname, nextState.salt);
    if (!nextState.uniqueHostHashes.includes(hostHash)) {
      nextState.uniqueHostHashes.push(hostHash);
    }
  }

  if (hostname || path) {
    const pageHash = await hashWithSalt(`${hostname}${path}`, nextState.salt);
    if (!nextState.uniquePageHashes.includes(pageHash)) {
      nextState.uniquePageHashes.push(pageHash);
    }
  }

  nextState.queue = [
    ...nextState.queue,
    {
      timestamp: Date.now(),
      event: payload.event,
      mode: payload.mode || null,
      persistence: payload.persistence || null,
      analysisStatus: payload.analysisStatus || null
    }
  ].slice(-100);

  await chrome.storage.local.set({ [ANALYTICS_STATE_KEY]: nextState });
  await flushAnalyticsIfConfigured(nextState);

  return {
    ok: true,
    enabled: true,
    summary: await getAnalyticsSummary()
  };
}

async function setAnalyticsEnabled(enabled) {
  const syncState = await getSyncState();
  await Promise.all([
    chrome.storage.sync.set({
      [ANALYTICS_SETTINGS_KEY]: { enabled: Boolean(enabled) }
    }),
    chrome.storage.sync.set({
      [USER_DEFAULTS_KEY]: {
        ...syncState.userDefaults,
        analyticsEnabled: Boolean(enabled)
      }
    })
  ]);

  return getAnalyticsSummary();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const syncState = await getSyncState();
  const nextDefaults = {
    ...syncState.userDefaults,
    analyticsEnabled: true
  };

  await Promise.all([
    chrome.storage.sync.set({
      [USER_DEFAULTS_KEY]: nextDefaults,
      [ANALYTICS_SETTINGS_KEY]: { enabled: true }
    }),
    chrome.storage.local.set({
      [INSTALL_NOTICE_KEY]: true
    })
  ]);

  if (details.reason === "install") {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("welcome.html")
    });
  }
});

async function getResolvedState(tabId, url) {
  const [syncState, tabStates] = await Promise.all([getSyncState(), getSessionState()]);
  return buildResolvedState({
    ...syncState,
    tabStates,
    tabId,
    url
  });
}

async function saveReaderState({ tabId, url, persistence, mode, settings }) {
  const hostname = getHostname(url);
  const [syncState, tabStates] = await Promise.all([getSyncState(), getSessionState()]);
  const sitePreferences = { ...syncState.sitePreferences };
  const nextTabStates = { ...tabStates };

  await chrome.storage.sync.set({
    [USER_DEFAULTS_KEY]: {
      ...syncState.userDefaults,
      defaultMode: mode,
      defaultPersistence: persistence,
      analyticsEnabled: syncState.analyticsSettings.enabled,
      ...settings
    }
  });

  if (persistence === "site" && hostname) {
    sitePreferences[hostname] = {
      enabled: true,
      mode,
      settings
    };
    delete nextTabStates[String(tabId)];
    await Promise.all([
      chrome.storage.sync.set({ [SITE_PREFERENCES_KEY]: sitePreferences }),
      setTabStates(nextTabStates)
    ]);
  } else {
    nextTabStates[String(tabId)] = {
      enabled: true,
      mode,
      settings
    };
    await setTabStates(nextTabStates);
  }

  return getResolvedState(tabId, url);
}

async function clearTabState(tabId) {
  const tabStates = await getSessionState();
  if (String(tabId) in tabStates) {
    delete tabStates[String(tabId)];
    await setTabStates(tabStates);
  }
}

async function setTabOverride({ tabId, mode, settings, enabled }) {
  const tabStates = await getSessionState();
  tabStates[String(tabId)] = {
    enabled,
    mode,
    settings
  };
  await setTabStates(tabStates);
}

async function clearSitePreference(hostname) {
  if (!hostname) {
    return;
  }

  const syncState = await getSyncState();
  if (hostname in syncState.sitePreferences) {
    delete syncState.sitePreferences[hostname];
    await chrome.storage.sync.set({ [SITE_PREFERENCES_KEY]: syncState.sitePreferences });
  }
}

async function updateBadge(tabId, active) {
  await chrome.action.setBadgeText({
    tabId,
    text: active ? "ON" : ""
  });
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: "#c65d2e"
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (message?.type === "GET_EFFECTIVE_STATE") {
      const tabId = message.tabId ?? sender.tab?.id;
      const url = message.url ?? sender.tab?.url ?? "";
      if (typeof tabId !== "number") {
        return { ok: false };
      }

      return {
        ok: true,
        state: await getResolvedState(tabId, url)
      };
    }

    if (message?.type === "SAVE_READER_STATE") {
      const nextState = await saveReaderState(message.payload);
      await updateBadge(message.payload.tabId, true);
      return {
        ok: true,
        state: nextState
      };
    }

    if (message?.type === "CLEAR_TAB_STATE") {
      await clearTabState(message.tabId);
      await updateBadge(message.tabId, false);
      return { ok: true };
    }

    if (message?.type === "CLEAR_SITE_PREFERENCE") {
      await clearSitePreference(message.hostname);
      return { ok: true };
    }

    if (message?.type === "SET_TAB_OVERRIDE") {
      await setTabOverride(message.payload);
      await updateBadge(message.payload.tabId, Boolean(message.payload.enabled));
      return { ok: true };
    }

    if (message?.type === "UPDATE_BADGE") {
      await updateBadge(message.tabId, message.active);
      return { ok: true };
    }

    if (message?.type === "GET_ANALYTICS_SUMMARY") {
      return {
        ok: true,
        summary: await getAnalyticsSummary()
      };
    }

    if (message?.type === "SET_ANALYTICS_ENABLED") {
      return {
        ok: true,
        summary: await setAnalyticsEnabled(message.enabled)
      };
    }

    if (message?.type === "TRACK_ANALYTICS_EVENT") {
      return await trackAnalyticsEvent(message.payload);
    }

    if (message?.type === "GET_INSTALL_NOTICE") {
      const result = await chrome.storage.local.get(INSTALL_NOTICE_KEY);
      return {
        ok: true,
        pending: Boolean(result[INSTALL_NOTICE_KEY])
      };
    }

    if (message?.type === "DISMISS_INSTALL_NOTICE") {
      await chrome.storage.local.set({ [INSTALL_NOTICE_KEY]: false });
      return { ok: true };
    }

    return { ok: false };
  };

  run()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "start-manual-selection") {
    return;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    return;
  }

  const resolved = await getResolvedState(tab.id, tab.url || "");

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "START_MANUAL_PICK",
      payload: {
        mode: "manual",
        settings: resolved.settings
      }
    });
  } catch (_error) {
    // Unsupported pages simply ignore the shortcut.
  }
});
