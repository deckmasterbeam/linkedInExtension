// Content script — injected into linkedin.com pages
// Has access to the page DOM but runs in an isolated JS world.
import {
  type ProfileData,
  loadProfileFromStorage,
  saveProfileToStorage,
  resolveImage,
} from "./profileCache";
import { injectStyles, renderPopup, hidePopup } from "./hoverPopup";

const HIGHLIGHT_ATTR = "data-li-ext-highlighted";
let highlightEnabled = false; // off until dev mode confirmed
let popupsEnabled = false;   // independent of highlighting

// ── Profile fetching ──────────────────────────────────────────────────────────

// In-memory cache for the lifetime of the page
const profileCache = new Map<string, ProfileData>();

/** Strip query-string/hash so the same profile always maps to one cache key. */
function normalizeProfileUrl(href: string): string {
  try {
    const url = new URL(href);
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return href;
  }
}

/** Extract profile picture from the live page DOM surrounding the link. */
function extractImgFromDOM(link: HTMLAnchorElement): string | null {
  const card = link.closest("li") ?? link.closest('[data-view-name]') ?? link.parentElement;
  const img = card?.querySelector<HTMLImageElement>('img[src*="licdn"], img[src*="media.li"]') ?? null;
  return img?.src ?? null;
}

async function fetchProfileData(profileUrl: string, imgSrc: string | null): Promise<ProfileData> {
  // 1. In-memory cache (page lifetime)
  if (profileCache.has(profileUrl)) return profileCache.get(profileUrl)!;

  // 2. chrome.storage.local cache (7-day TTL)
  const stored = await loadProfileFromStorage(profileUrl);
  if (stored) {
    // Prefer the live DOM image if we have one — it may be fresher
    const data = imgSrc ? { ...stored, imgSrc } : stored;
    profileCache.set(profileUrl, data);
    return data;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(profileUrl, {
      credentials: "include",
      signal: controller.signal,
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    // ── Name ─────────────────────────────────────────────────────────────────
    // <title> is always "First Last | LinkedIn" on the new RSC app
    const name = doc.title.replace(/\s*\|\s*LinkedIn\s*$/, "").trim();

    // ── Headline and company ──────────────────────────────────────────────────
    // LinkedIn's RSC page has no JSON-LD or og: meta. The data is in the DOM
    // but with randomised class names. Strategy: find the <h2> whose text
    // exactly matches the person's name, then walk up the tree until we find
    // an ancestor that also contains <p> siblings — the first non-trivial <p>
    // is the headline, and the second contains "Company · School".
    let subtitle: string | null = null;
    let company: string | null = null;
    let location: string | null = null;

    const nameH2 = Array.from(doc.querySelectorAll("h2")).find(
      (el) => el.textContent?.trim() === name
    );

    if (nameH2) {
      let ancestor = nameH2.parentElement;
      for (let depth = 0; depth < 8 && ancestor; depth++, ancestor = ancestor.parentElement) {
        const ps = Array.from(ancestor.querySelectorAll("p")).filter((p) => {
          const t = p.textContent?.trim() ?? "";
          // Exclude the name itself, short strings, and connection degree indicators
          return t.length > 4 && t !== name && !/^·\s*(1st|2nd|3rd|\d+)$/.test(t);
        });
        if (ps.length > 0) {
          subtitle = ps[0].textContent?.trim() ?? null;
          if (ps[1]) {
            // Format is typically "Company · School" — keep only company
            const raw = ps[1].textContent?.trim() ?? "";
            company = raw.split(/\s+·\s+/)[0].trim() || null;
          }
          if (ps[2]) {
            location = ps[2].textContent?.trim() ?? null;
          }
          break;
        }
      }
    }

    const data: ProfileData = { name, imgSrc, subtitle, company, location };
    profileCache.set(profileUrl, data);
    await saveProfileToStorage(profileUrl, data);
    return data;

  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Hover popup ───────────────────────────────────────────────────────────────

// Track which profile is currently hovered so stale async responses are discarded
let currentHoverUrl: string | null = null;
let hoverTimer: number | undefined;

document.addEventListener("mouseover", (e) => {
  if (!popupsEnabled) return;
  const link = (e.target as Element).closest<HTMLAnchorElement>(
    `a[href^="https://www.linkedin.com/in/"]`
  );
  if (!link) return;

  clearTimeout(hoverTimer);
  const profileUrl = normalizeProfileUrl(link.href);
  currentHoverUrl = profileUrl;

  // Small delay avoids firing fetches while the user scrolls past links
  hoverTimer = window.setTimeout(async () => {
    const imgSrc = extractImgFromDOM(link);
    renderPopup({ name: "", imgSrc, subtitle: null, company: null, location: null }, link); // show image immediately

    try {
      const [resolvedImg, data] = await Promise.all([
        imgSrc ? resolveImage(imgSrc) : Promise.resolve(null),
        fetchProfileData(profileUrl, imgSrc),
      ]);
      if (currentHoverUrl !== profileUrl) return; // user already moved on
      renderPopup({ ...data, imgSrc: resolvedImg ?? data.imgSrc }, link);
    } catch {
      if (currentHoverUrl === profileUrl) hidePopup();
    }
  }, 350);
});

document.addEventListener("mouseout", (e) => {
  const left = (e.target as Element).closest<HTMLAnchorElement>(
    `a[href^="https://www.linkedin.com/in/"]`
  );
  if (left) {
    clearTimeout(hoverTimer);
    currentHoverUrl = null;
    hidePopup();
  }
});

// ── Highlighting ──────────────────────────────────────────────────────────────

function applyHighlight(): void {
  const els = document.querySelectorAll<HTMLAnchorElement>(
    `a[href^="https://www.linkedin.com/in/"]:not([${HIGHLIGHT_ATTR}])`
  );
  els.forEach((el) => {
    el.style.backgroundColor = "#cce5ff";
    el.style.borderRadius = "4px";
    el.style.padding = "1px 3px";
    el.setAttribute(HIGHLIGHT_ATTR, "1");
  });
}

function removeHighlight(): void {
  const els = document.querySelectorAll<HTMLAnchorElement>(
    `a[href^="https://www.linkedin.com/in/"][${HIGHLIGHT_ATTR}]`
  );
  els.forEach((el) => {
    el.style.backgroundColor = "";
    el.style.borderRadius = "";
    el.style.padding = "";
    el.removeAttribute(HIGHLIGHT_ATTR);
  });
  hidePopup();
}

// ── Init ──────────────────────────────────────────────────────────────────────

injectStyles();

const observer = new MutationObserver(() => {
  if (highlightEnabled) applyHighlight();
});

observer.observe(document.body, { childList: true, subtree: true });

/** Returns false when the extension has been reloaded and this context is stale. */
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// Read persisted state before applying highlight
if (isContextValid()) {
  chrome.storage.local.get(["devMode", "popupsEnabled"]).then((result) => {
    const { devMode, popupsEnabled: pe } = result as { devMode?: boolean; popupsEnabled?: boolean };
    if (devMode) {
      highlightEnabled = true;
      applyHighlight();
    }
    // Popups default to ON regardless of dev mode
    popupsEnabled = pe !== undefined ? pe : true;
  }).catch(() => {});
}

if (isContextValid()) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isContextValid()) return;
    if (message.action === "toggle") {
      highlightEnabled = !highlightEnabled;
      highlightEnabled ? applyHighlight() : removeHighlight();
      sendResponse({ enabled: highlightEnabled });
    } else if (message.action === "togglePopups") {
      popupsEnabled = !popupsEnabled;
      if (!popupsEnabled) hidePopup();
      sendResponse({ enabled: popupsEnabled });
    } else if (message.action === "setDevMode") {
      highlightEnabled = message.enabled;
      popupsEnabled = message.enabled;
      message.enabled ? applyHighlight() : removeHighlight();
    } else if (message.action === "setPopups") {
      popupsEnabled = message.enabled;
      if (!popupsEnabled) hidePopup();
    }
    return true;
  });
}