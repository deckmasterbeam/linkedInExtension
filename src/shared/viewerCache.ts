const VIEWER_CACHE_KEY = "li_ext_viewer";

interface ViewerCache {
  csrf: string;
  username: string;
}

/**
 * LinkedIn stores the CSRF token as the value of the JSESSIONID cookie.
 * The value may be bare or double-quoted.
 */
const getCsrfToken = (): string | null => {
  const match = document.cookie.match(/JSESSIONID=(?:"([^"]+)"|([^;]+))/);
  return match?.[1] ?? match?.[2] ?? null;
};

/**
 * Fetches the logged-in user's LinkedIn username via the Voyager /me API.
 * Runs same-origin (content script is on linkedin.com) so no CORS issues.
 * Returns null on any failure.
 */
const fetchLinkedInUsername = async (): Promise<string | null> => {
  const csrf = getCsrfToken();
  if (!csrf) {
    return null;
  }
  try {
    const res = await fetch("/voyager/api/me", {
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "csrf-token": csrf,
      },
      credentials: "include",
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const included = data?.included;
    if (!Array.isArray(included) || included.length === 0) {
      return null;
    }
    const profile = included[0] as Record<string, unknown>;
    return typeof profile?.publicIdentifier === "string" ? profile.publicIdentifier : null;
  } catch {
    return null;
  }
};

// In-memory promise deduplicates concurrent calls within the same page load.
let viewerUsernamePromise: Promise<string | null> | null = null;

/**
 * Returns the logged-in user's LinkedIn username.
 * Cached in localStorage keyed by CSRF token — if the account switches the
 * token changes and the cache is invalidated automatically.
 * The in-memory promise deduplicates concurrent calls within one page load.
 */
export const getViewerUsername = (): Promise<string | null> => {
  if (!viewerUsernamePromise) {
    viewerUsernamePromise = (async () => {
      const csrf = getCsrfToken();
      if (!csrf) {
        return null;
      }

      // Return the cached username if it belongs to the current session.
      try {
        const raw = localStorage.getItem(VIEWER_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as ViewerCache;
          if (cached.csrf === csrf) {
            return cached.username;
          }
        }
      } catch {
        // Ignore malformed cache entries.
      }

      const username = await fetchLinkedInUsername();
      if (username) {
        try {
          localStorage.setItem(VIEWER_CACHE_KEY, JSON.stringify({ csrf, username }));
        } catch {
          // Ignore storage errors (e.g. private browsing quota).
        }
      }
      return username;
    })();
  }
  return viewerUsernamePromise;
};
