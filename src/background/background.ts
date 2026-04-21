// Background service worker (Manifest V3)
// Runs persistently as a service worker — no DOM access here.

import { resolveImageBuffer } from "../shared/imageCache";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Store a pending flag so the content script can supply the LinkedIn
    // username on the next page load, then the background posts to the log API.
    chrome.storage.local.set({ pendingInstallLog: { installedAt: new Date().toISOString() } });
  } else if (details.reason === "update") {
    console.log("[LinkedIn Extension] Updated to", chrome.runtime.getManifest().version);
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "resolveImage" && typeof message.url === "string") {
    resolveImageBuffer(message.url).then((buffer) => {
      if (buffer) {
        // sendResponse uses JSON serialization — ArrayBuffer must be base64-encoded
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        sendResponse({ base64: btoa(binary) });
      } else {
        sendResponse({ error: "failed" });
      }
    });
    return true; // keep message channel open for async response
  }

  if (
    message.type === "logInstall" &&
    typeof message.username === "string" &&
    typeof message.installedAt === "string"
  ) {
    fetch(`${__API_BASE_URL__}/api/log-install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-install-key": __INSTALL_LOG_API_KEY__,
      },
      body: JSON.stringify({ username: message.username, installedAt: message.installedAt }),
    })
      .then((r) => sendResponse({ ok: r.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true; // async
  }

  sendResponse({ ok: true });
});
