// Content script — injected into linkedin.com pages
// Has access to the page DOM but runs in an isolated JS world.
import { type ProfileData, resolveImage } from "../shared/profileCache";
import { fetchProfileData } from "../shared/profileFetcher";
import { injectStyles, renderPopup, hidePopup } from "./hoverPopup";
import { loadExtensionState, normalizeProfileUrl, isSuppressedLink } from "../shared/helpers";

const HIGHLIGHT_ATTR = "data-li-ext-highlighted";
const PROFILE_LINK_SELECTOR = `a[href^="https://www.linkedin.com/in/"], a[href^="/in/"]`;

/** The canonical URL of the profile page currently being viewed, or null if
 *  this is not a profile page. Used to skip popups on self-referencing links. */
const currentPageProfileUrl = normalizeProfileUrl(location.href);

/** Extract profile picture from the live page DOM surrounding the link. */
const extractImgFromDOM = (link: HTMLAnchorElement): string | null => {
  const card = link.closest("li") ?? link.closest("[data-view-name]") ?? link.parentElement;
  const img =
    card?.querySelector<HTMLImageElement>('img[src*="licdn"], img[src*="media.li"]') ?? null;
  return img?.src ?? null;
};

// ── Hover popup ───────────────────────────────────────────────────────────────

// Track which profile is currently hovered so stale async responses are discarded
let currentHoverUrl: string | null = null;
let hoverTimer: number | undefined;

document.addEventListener("mouseover", async (e) => {
  const { popupsEnabled } = await loadExtensionState();
  if (!popupsEnabled) {
    return;
  }
  const link = (e.target as Element).closest<HTMLAnchorElement>(PROFILE_LINK_SELECTOR);
  if (!link) {
    return;
  }

  clearTimeout(hoverTimer);
  const profileUrl = normalizeProfileUrl(link.href);
  if (!profileUrl || isSuppressedLink(link, currentPageProfileUrl)) {
    return;
  }
  currentHoverUrl = profileUrl;

  // Small delay avoids firing fetches while the user scrolls past links
  hoverTimer = window.setTimeout(async () => {
    const imgSrc = extractImgFromDOM(link);
    renderPopup(
      {
        name: "",
        imgSrc,
        pronouns: null,
        subtitle: null,
        company: null,
        location: null,
        isConnection: null,
      },
      link,
    ); // show image immediately

    try {
      const [resolvedImg, data] = await Promise.all([
        imgSrc ? resolveImage(imgSrc) : Promise.resolve(null),
        fetchProfileData(profileUrl, imgSrc),
      ]);
      if (currentHoverUrl !== profileUrl) {
        return; // user already moved on
      }
      renderPopup({ ...data, imgSrc: data.imgSrc ?? resolvedImg }, link);
    } catch {
      if (currentHoverUrl === profileUrl) {
        hidePopup();
      }
    }
  }, 350);
});

document.addEventListener("mouseout", (e) => {
  const left = (e.target as Element).closest<HTMLAnchorElement>(PROFILE_LINK_SELECTOR);
  if (left && normalizeProfileUrl(left.href)) {
    clearTimeout(hoverTimer);
    currentHoverUrl = null;
    hidePopup();
  }
});

// ── Highlighting ──────────────────────────────────────────────────────────────

export const applyHighlight = (): void => {
  const els = document.querySelectorAll<HTMLAnchorElement>(
    `${PROFILE_LINK_SELECTOR}:not([${HIGHLIGHT_ATTR}])`,
  );
  els.forEach((el) => {
    const profileUrl = normalizeProfileUrl(el.href);
    if (!profileUrl || isSuppressedLink(el, currentPageProfileUrl)) {
      return;
    }
    el.style.backgroundColor = "#cce5ff";
    el.style.borderRadius = "4px";
    el.style.padding = "1px 3px";
    el.setAttribute(HIGHLIGHT_ATTR, "1");
  });
};

export const removeHighlight = (): void => {
  const els = document.querySelectorAll<HTMLAnchorElement>(
    `${PROFILE_LINK_SELECTOR}[${HIGHLIGHT_ATTR}]`,
  );
  els.forEach((el) => {
    el.style.backgroundColor = "";
    el.style.borderRadius = "";
    el.style.padding = "";
    el.removeAttribute(HIGHLIGHT_ATTR);
  });
  hidePopup();
};

// ── Init ──────────────────────────────────────────────────────────────────────

injectStyles();

const observer = new MutationObserver(async () => {
  const { highlighting } = await loadExtensionState();
  if (highlighting) {
    applyHighlight();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

/** Returns false when the extension has been reloaded and this context is stale. */
const isContextValid = (): boolean => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

// Read persisted state before applying highlight
if (isContextValid()) {
  loadExtensionState().then(({ devMode, highlighting, popupsEnabled }) => {
    if (devMode && highlighting) {
      applyHighlight();
    }
  });
}

if (isContextValid()) {
  chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
    if (!isContextValid()) {
      return;
    }
    if (message.action === "setHighlight") {
      await chrome.storage.local.set({ highlighting: message.enabled });
      message.enabled ? applyHighlight() : removeHighlight();
      sendResponse({ enabled: message.enabled });
    } else if (message.action === "setPopups") {
      await chrome.storage.local.set({ popupsEnabled: message.enabled });
      if (!message.enabled) {
        hidePopup();
      }
      sendResponse({ enabled: message.enabled });
    } else if (message.action === "toggleDevMode") {
      await chrome.storage.local.set({ devMode: message.enabled });
      if (!message.enabled) {
        removeHighlight();
      }
      sendResponse({ enabled: message.enabled });
    }
    return true;
  });
}
