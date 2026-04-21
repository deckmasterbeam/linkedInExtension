// Background service worker (Manifest V3)
// Runs persistently as a service worker — no DOM access here.

import { loadExtensionState } from "../shared/helpers";
import { resolveImageBuffer } from "../shared/imageCache";

chrome.runtime.onInstalled.addListener(async () => {
  const { devMode, pendingInstallLogTime } = await loadExtensionState();
  if (devMode) {
    console.log("[LinkedIn Extension] Installation log status on startup:", pendingInstallLogTime);
  }

  if (pendingInstallLogTime === "completed") {
    return;
  } else {
    // Store a pending flag so the content script can supply the LinkedIn
    // username on the next page load, then the background posts to the log API.
    chrome.storage.local.set({ pendingInstallLogTime: new Date().toISOString() });
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
  const { devMode } = await loadExtensionState();
  if (devMode) {
    console.log("[LinkedIn Extension] Received message in background:", message);
  }

  if (message.type === "resolveImage" && typeof message.url === "string") {
    resolveImageBuffer(message.url).then((buffer) => {
      if (buffer) {
        // sendResponse uses JSON serialization — ArrayBuffer must be base64-encoded
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        sendResponse({ ok: true, base64: btoa(binary) });
      } else {
        sendResponse({ ok: false, error: "failed" });
      }
    });
    return true; // keep message channel open for async response
  }

  if (
    message.type === "logInstall" &&
    typeof message.username === "string" &&
    typeof message.installedAt === "string"
  ) {
    if (devMode) {
      console.log("[LinkedIn Extension] Received install log message:", {
        username: message.username,
        installedAt: message.installedAt,
        against: `${__API_BASE_URL__}/api/log-info`,
      });
    }
    fetch(`${__API_BASE_URL__}/api/log-info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-install-key": __INSTALL_LOG_API_KEY__,
      },
      body: JSON.stringify({
        type: "install",
        username: message.username,
        installedAt: message.installedAt,
      }),
    })
      .then((r) => sendResponse({ ok: r.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true; // async
  }

  if (
    message.type === "logProfileView" &&
    typeof message.viewerUsername === "string" &&
    typeof message.viewedUsername === "string" &&
    typeof message.isConnected === "boolean" &&
    typeof message.viewedAt === "string"
  ) {
    fetch(`${__API_BASE_URL__}/api/log-info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-install-key": __INSTALL_LOG_API_KEY__,
      },
      body: JSON.stringify({
        type: "profileView",
        viewerUsername: message.viewerUsername,
        viewedUsername: message.viewedUsername,
        isConnected: message.isConnected,
        viewedAt: message.viewedAt,
      }),
    })
      .then((r) => sendResponse({ ok: r.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true; // async
  }

  sendResponse({ ok: false, error: "Unhandled message" });
});
