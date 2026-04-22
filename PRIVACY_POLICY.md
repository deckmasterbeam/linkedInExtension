# Privacy Policy

**LinkedIn Profile Pop-Ups** — Chrome Extension  
Last updated: April 21, 2026

---

## Overview

LinkedIn Profile Pop-Ups is a Chrome extension that displays profile cards when hovering over LinkedIn profile links. This policy describes what data the extension collects, how it is used, and your choices.

---

## Data Collected Locally (Never Transmitted)

The extension stores the following data in your browser's local storage (`chrome.storage.local`) only. This data never leaves your device unless you explicitly opt in to telemetry (see below).

- **Cached profile data** — Name, job title, company, location, pronouns, and profile photo URL for LinkedIn profiles you have hovered over. Cached for up to 7 days to reduce repeated network requests to LinkedIn.
- **Extension settings** — Your preferences (hover popups enabled, telemetry opt-in, developer mode).

---

## Optional Telemetry (Opt-In Only)

Telemetry is **disabled by default**. You must explicitly enable it via the "Telemetry" toggle in the extension popup.

When telemetry is enabled, the extension may send the following data to the developer's server (`linked-in-extension.vercel.app`) to measure how successfully the extension parses LinkedIn profile pages:

| Event | Data Sent |
|---|---|
| **Install** | Your LinkedIn username, install timestamp |
| **Profile hover** | Your LinkedIn username, the viewed profile's username, connection status (connected / not connected), timestamp |

This data is used solely to identify LinkedIn UI changes that break profile data extraction and to prioritize fixes.

---

## Data Retention and Sharing

- Telemetry data is stored on the developer's server only for as long as needed to diagnose parsing issues.
- **No user data is sold or transferred to third parties.**
- **No user data is used for purposes unrelated to the extension's core function.**
- **No user data is used to determine creditworthiness or for lending purposes.**

---

## Third-Party Services

When telemetry is enabled, data is sent to [Vercel](https://vercel.com), which hosts the developer's logging API. Vercel's own privacy policy applies to data in transit and at rest on their infrastructure.

The extension reads profile data directly from LinkedIn's website. It is not affiliated with or endorsed by LinkedIn.

---

## Your Choices

- You can disable telemetry at any time via the **Telemetry** toggle in the extension popup.
- You can clear all locally cached profile data by uninstalling the extension.

---

## Contact

For questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/joshbarnettDEV/linkedinExtension).
