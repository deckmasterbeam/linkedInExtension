const statusEl = document.getElementById("status") as HTMLParagraphElement;
const actionBtn = document.getElementById("action-btn") as HTMLButtonElement;
const popupBtn = document.getElementById("popup-btn") as HTMLButtonElement;
const devModeBtn = document.getElementById("dev-mode-btn") as HTMLButtonElement;
const devSection = document.getElementById("dev-section") as HTMLDivElement;

function setButtonState(enabled: boolean): void {
  actionBtn.textContent = enabled ? "Highlighting: ON" : "Highlighting: OFF";
  actionBtn.classList.toggle("btn--off", !enabled);
}

function setPopupButtonState(enabled: boolean): void {
  popupBtn.textContent = enabled ? "Popups: ON" : "Popups: OFF";
  popupBtn.classList.toggle("btn--off", !enabled);
}

function setDevModeUI(on: boolean): void {
  devModeBtn.textContent = on ? "Dev Mode: ON" : "Dev Mode: OFF";
  devModeBtn.classList.toggle("dev-on", on);
  devSection.style.display = on ? "flex" : "none";
}

async function checkCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.url?.includes("linkedin.com")) {
    statusEl.textContent = "Active on LinkedIn";
    statusEl.style.color = "#057642";
    actionBtn.disabled = false;
    popupBtn.disabled = false;
  } else {
    statusEl.textContent = "Navigate to LinkedIn to use this extension";
    statusEl.style.color = "#b24020";
    actionBtn.disabled = true;
    // popups button is still shown but disabled off-LinkedIn (no content script to message)
    popupBtn.disabled = true;
  }
}

actionBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return;

  actionBtn.disabled = true;
  const response = await chrome.tabs.sendMessage(tab.id, { action: "toggle" });
  setButtonState(response?.enabled ?? true);
  actionBtn.disabled = false;
});

popupBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) return;

  popupBtn.disabled = true;
  const response = await chrome.tabs.sendMessage(tab.id, { action: "togglePopups" });
  const next = response?.enabled ?? true;
  await chrome.storage.local.set({ popupsEnabled: next });
  setPopupButtonState(next);
  popupBtn.disabled = false;
});

devModeBtn.addEventListener("click", async () => {
  const { devMode } = await chrome.storage.local.get("devMode");
  const next = !devMode;
  await chrome.storage.local.set({ devMode: next });
  setDevModeUI(next);

  // Notify the active tab's content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "setDevMode", enabled: next }).catch(() => {});
  }
});

document.getElementById("view-cache-btn")!.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
});

// Init — load persisted state
async function init(): Promise<void> {
  const result = await chrome.storage.local.get(["devMode", "popupsEnabled"]);
  const { devMode } = result as { devMode?: boolean; popupsEnabled?: boolean };
  const popupsEnabled = (result as { devMode?: boolean; popupsEnabled?: boolean }).popupsEnabled;
  setDevModeUI(!!devMode);
  setButtonState(true);
  // Popups default to ON regardless of dev mode
  setPopupButtonState(popupsEnabled !== undefined ? popupsEnabled : true);
  await checkCurrentTab();
}

init();
