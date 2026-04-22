import "./extensionWindow.css";
import { loadExtensionState } from "../shared/helpers";

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const mainSection = document.getElementById("main-section") as HTMLDivElement;
const highlightSection = document.getElementById("highlight-section") as HTMLDivElement;
const viewCacheSection = document.getElementById("view-cache-section") as HTMLDivElement;
const devModeRow = document.getElementById("dev-mode-row") as HTMLLabelElement;

const popupToggle = document.getElementById("popup-toggle") as HTMLInputElement;
const highlightToggle = document.getElementById("highlight-toggle") as HTMLInputElement;
const telemetryLoggingToggle = document.getElementById("logging-toggle") as HTMLInputElement;
const devModeToggle = document.getElementById("dev-mode-toggle") as HTMLInputElement;

const setDevModeUI = async (): Promise<void> => {
  const { devMode, popupsEnabled, highlighting, telemetryLogging } = await loadExtensionState();
  devModeToggle.checked = devMode;
  highlightSection.style.display = devMode ? "flex" : "none";
  viewCacheSection.style.display = devMode ? "flex" : "none";
  popupToggle.checked = popupsEnabled;
  highlightToggle.checked = highlighting;
  telemetryLoggingToggle.checked = telemetryLogging;
};

const checkCurrentTab = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.url?.includes("linkedin.com")) {
    statusEl.textContent = "Active on LinkedIn";
    statusEl.style.color = "#057642";
    mainSection.style.display = "flex";
    devModeRow.style.display = "flex";
    popupToggle.disabled = false;
    highlightToggle.disabled = false;
  } else {
    statusEl.textContent = "Navigate to LinkedIn to use this extension";
    statusEl.style.color = "#b24020";
    mainSection.style.display = "none";
    devModeRow.style.display = "none";
  }
};

const sendToActiveTab = async (message: object): Promise<{ enabled?: boolean } | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) {
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    return null;
  }
};

popupToggle.addEventListener("change", async () => {
  const next = popupToggle.checked;
  await chrome.storage.local.set({ popupsEnabled: next });
  const response = await sendToActiveTab({ action: "setPopups", enabled: next });
  popupToggle.checked = response?.enabled ?? next;
});

highlightToggle.addEventListener("change", async () => {
  const next = highlightToggle.checked;
  await chrome.storage.local.set({ highlighting: next });
  const response = await sendToActiveTab({ action: "setHighlight", enabled: next });
  highlightToggle.checked = response?.enabled ?? next;
});

telemetryLoggingToggle.addEventListener("change", async () => {
  const next = telemetryLoggingToggle.checked;
  await chrome.storage.local.set({ telemetryLogging: next });
});

devModeToggle.addEventListener("change", async () => {
  const next = devModeToggle.checked;
  await chrome.storage.local.set({ devMode: next });
  await sendToActiveTab({ action: "toggleDevMode", enabled: next });
  setDevModeUI();
});

document.getElementById("view-cache-btn")!.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
});

const init = async (): Promise<void> => {
  setDevModeUI();
  await checkCurrentTab();
};

init();
