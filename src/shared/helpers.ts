type ExtensionState = {
  devMode: boolean;
  popupsEnabled: boolean;
  highlighting: boolean;
  profileViewLogging: boolean;
  pendingInstallLogTime: string | null;
};

export const loadExtensionState = async (): Promise<ExtensionState> => {
  const result = await chrome.storage.local.get([
    "devMode",
    "popupsEnabled",
    "highlighting",
    "profileViewLogging",
    "pendingInstallLogTime",
  ]);
  if (result.devMode === undefined) {
    chrome.storage.local.set({ devMode: false });
  }
  if (result.popupsEnabled === undefined) {
    chrome.storage.local.set({ popupsEnabled: true });
  }
  if (result.highlighting === undefined) {
    chrome.storage.local.set({ highlighting: false });
  }
  if (result.profileViewLogging === undefined) {
    chrome.storage.local.set({ profileViewLogging: false });
  }
  return {
    devMode: result.devMode ?? false,
    popupsEnabled: result.popupsEnabled ?? true,
    highlighting: result.highlighting ?? false,
    profileViewLogging: result.profileViewLogging ?? false,
    pendingInstallLogTime: result.pendingInstallLogTime ?? null,
  };
};

/** Returns the canonical profile root URL (https://www.linkedin.com/in/username)
 *  only when the href points to a plain profile page with no sub-paths, overlays,
 *  or query strings. Accepts both absolute URLs and relative paths of the form
 *  /in/<username>. Returns null for anything else (edit forms, overlays, etc.). */
export const normalizeProfileUrl = (href: string): string | null => {
  try {
    const url = new URL(href);
    if (url.hostname !== "www.linkedin.com") {
      return null;
    }
    if (url.search) {
      return null;
    }
    const match = url.pathname.match(/^(\/in\/[^/]+)(?:\/[a-z]{2})?\/?$/);
    if (!match) {
      return null;
    }
    return url.origin + match[1];
  } catch {
    // Relative path — e.g. /in/username
    const match = href.match(/^(\/in\/[^/?#]+)(?:\/[a-z]{2})?\/?$/);
    return match ? `https://www.linkedin.com${match[1]}` : null;
  }
};

// TODO: cut??
/**
 * Known LinkedIn UI action strings that appear as the visible text of profile
 * links but do not represent a person — e.g. upsell buttons in the header.
 * Add new entries here as more cases are discovered.
 */
const SUPPRESSED_LINK_TEXT_RE = /\b(retry\s+premium|try\s+premium|get\s+premium|upgrade)\b/i;

// TODO: cut??
/**
 * aria-label patterns that identify LinkedIn UI links that are not person links —
 * e.g. the notifications bell or the premium badge on a profile.
 */
const SUPPRESSED_ARIA_LABEL_RE = /^(manage notifications about |.+ is a premium member$)/i;

/** Returns true when the link's visible text or aria-label matches a known LinkedIn
 *  UI action, or when the link points to the profile page currently being viewed.
 *  Pass `currentPageProfileUrl` (from `normalizeProfileUrl(location.href)`) to
 *  enable the self-page check. */
export const isSuppressedLink = (
  link: HTMLAnchorElement,
  currentPageProfileUrl: string | null = null,
): boolean => {
  if (SUPPRESSED_LINK_TEXT_RE.test(link.innerText.trim())) {
    return true;
  }
  const ariaLabel = link.getAttribute("aria-label")?.trim() ?? "";
  if (ariaLabel.length > 0 && SUPPRESSED_ARIA_LABEL_RE.test(ariaLabel)) {
    return true;
  }
  if (currentPageProfileUrl !== null) {
    const linkProfileUrl = normalizeProfileUrl(link.href);
    if (linkProfileUrl === currentPageProfileUrl) {
      return true;
    }
  }
  return false;
};

/** Reads CSRF token from the LinkedIn JSESSIONID cookie. */
export const getCsrfToken = (): string | null => {
  const match = document.cookie.match(/JSESSIONID=(?:"([^"]+)"|([^;]+))/);
  return match?.[1] ?? match?.[2] ?? null;
};
