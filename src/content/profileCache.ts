export interface ProfileData {
  name: string;
  imgSrc: string | null;
  subtitle: string | null;
  company: string | null;
  location: string | null;
}

export const STORAGE_PREFIX = "li-ext:profile:";
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface StoredProfile {
  data: ProfileData;
  cachedAt: number; // Date.now()
}

// ── Profile text cache (chrome.storage.local) ─────────────────────────────────
// chrome.storage.local is accessible from both content scripts and extension
// pages (e.g. the viewer), unlike localStorage which is origin-scoped.

export async function loadProfileFromStorage(profileUrl: string): Promise<ProfileData | null> {
  try {
    const key = STORAGE_PREFIX + profileUrl;
    const result = await chrome.storage.local.get(key);
    const stored: StoredProfile | undefined = result[key];
    if (!stored) return null;
    if (Date.now() - stored.cachedAt > PROFILE_TTL_MS) {
      chrome.storage.local.remove(key);
      return null;
    }
    return stored.data;
  } catch {
    return null;
  }
}

export async function saveProfileToStorage(profileUrl: string, data: ProfileData): Promise<void> {
  try {
    const stored: StoredProfile = { data, cachedAt: Date.now() };
    await chrome.storage.local.set({ [STORAGE_PREFIX + profileUrl]: stored });
  } catch {
    // Storage may be full — fail silently
  }
}

// ── Image cache (via background service worker) ───────────────────────────────
// Images are stored in extension-origin IndexedDB by the background service
// worker, which is accessible from both here (via messaging) and the viewer page
// (directly, same origin).

/** In-memory map so we only call createObjectURL once per session per URL. */
const objectUrlCache = new Map<string, string>();

/** Returns a blob: object URL for the image, fetching and caching via background. */
export async function resolveImage(url: string): Promise<string> {
  if (objectUrlCache.has(url)) return objectUrlCache.get(url)!;

  try {
    const response: { base64: string } | { error: string } =
      await chrome.runtime.sendMessage({ type: "resolveImage", url });
    if ("base64" in response && typeof response.base64 === "string") {
      const binary = atob(response.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const objectUrl = URL.createObjectURL(new Blob([bytes]));
      objectUrlCache.set(url, objectUrl);
      return objectUrl;
    }
  } catch { /* extension context invalidated or background unavailable */ }

  return url; // fallback to CDN URL
}
