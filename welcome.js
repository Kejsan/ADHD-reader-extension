const closeWelcomeButton = document.getElementById("closeWelcome");
const enableAnalyticsButton = document.getElementById("enableAnalytics");

async function dismissNotice() {
  await chrome.runtime.sendMessage({
    type: "DISMISS_INSTALL_NOTICE"
  });
}

closeWelcomeButton.addEventListener("click", async () => {
  await dismissNotice();
  window.close();
});

enableAnalyticsButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "SET_ANALYTICS_ENABLED",
    enabled: true
  });
  await dismissNotice();
  enableAnalyticsButton.textContent = "Analytics enabled";
  enableAnalyticsButton.disabled = true;
});
