// Background service worker (Manifest V3)
// Runs persistently as a service worker — no DOM access here.

import { resolveImageBuffer } from "../shared/imageCache";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[LinkedIn Extension] Installed");
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

  sendResponse({ ok: true });
});
