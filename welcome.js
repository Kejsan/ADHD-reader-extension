const openPopupButton = document.getElementById("openPopup");
const disableAnalyticsButton = document.getElementById("disableAnalytics");

async function dismissNotice() {
  await chrome.runtime.sendMessage({
    type: "DISMISS_INSTALL_NOTICE"
  });
}

openPopupButton.addEventListener("click", async () => {
  await dismissNotice();
  window.close();
});

disableAnalyticsButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "SET_ANALYTICS_ENABLED",
    enabled: false
  });
  await dismissNotice();
  disableAnalyticsButton.textContent = "Analytics turned off";
  disableAnalyticsButton.disabled = true;
});
