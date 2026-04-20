import { type ProfileData, loadProfileFromStorage, saveProfileToStorage } from "./profileCache";
import { loadExtensionState } from "./helpers";

// In-memory cache for the lifetime of the page
const profileCache = new Map<string, ProfileData>();

// ── Paragraph filter predicates ───────────────────────────────────────────────

/** Matches LinkedIn connection-degree indicators like "· 1st", "· 2nd". */
const DEGREE_RE = /^[·•]\s*(1st|2nd|3rd|\d+th?)$/u;

/**
 * Matches pronoun strings like "He/Him", "She/Her", "They/Them".
 * Pattern: one or more slash-separated capitalised words, total length < 20.
 */
const PRONOUN_RE = /^[A-Za-z][a-z]*(?:\/[A-Za-z][a-z]*){1,2}$/;

/** Short noise strings that carry no profile information. */
const NOISE_RE = /^(contact info|·|•)$/iu;

/**
 * Returns true when a paragraph's text is meaningful profile data —
 * i.e. not the person's name, not a degree badge, not pronouns, not noise.
 */
const isMeaningfulP = (t: string, name: string): boolean =>
  t.length > 4 && t !== name && !DEGREE_RE.test(t) && !PRONOUN_RE.test(t) && !NOISE_RE.test(t);

// ── Shared extraction logic ───────────────────────────────────────────────────

type ParagraphData = {
  pronouns: string | null;
  subtitle: string | null;
  company: string | null;
  location: string | null;
};

/**
 * Walks up the DOM from a seed element, looking for an ancestor that
 * contains meaningful <p> children. Returns the first three such paragraphs
 * as subtitle / company / location, or null if nothing is found within
 * the depth limit.
 */
const walkUpForParagraphs = (startEl: Element, name: string): ParagraphData | null => {
  let ancestor = startEl.parentElement;
  for (let depth = 0; depth < 10 && ancestor; depth++, ancestor = ancestor.parentElement) {
    const allPs = Array.from(ancestor.querySelectorAll("p"));
    const pronounsEl = allPs.find((p) => PRONOUN_RE.test(p.textContent?.trim() ?? ""));
    const ps = allPs.filter((p) => {
      const t = p.textContent?.trim() ?? "";
      return isMeaningfulP(t, name);
    });
    if (ps.length > 0) {
      return {
        pronouns: pronounsEl?.textContent?.trim() ?? null,
        subtitle: ps[0].textContent?.trim() ?? null,
        company: ps[1]?.textContent?.trim() ?? null,
        location: ps[2]?.textContent?.trim() ?? null,
      };
    }
  }
  return null;
};

// ── Extraction strategies ─────────────────────────────────────────────────────

/**
 * Primary strategy: find any heading (h1–h4) whose text exactly matches the
 * person's name, then walk up to find surrounding paragraph data.
 */
const extractViaHeadingWalk = (doc: Document, name: string): ParagraphData | null => {
  const nameEl = Array.from(doc.querySelectorAll("h1, h2, h3, h4")).find(
    (el) => el.textContent?.trim() === name,
  );
  if (!nameEl) {
    return null;
  }
  return walkUpForParagraphs(nameEl, name);
};

/**
 * Returns true when the fetched profile page shows a 1st-degree connection
 * badge, false for 2nd/3rd/out-of-network, or false when no badge is found.
 *
 * Strategy: LinkedIn's SSR rehydration script encodes the profile's network
 * distance as a state key "profile_network_distance_{id}" with stringValue
 * "Distance1" (1st), "Distance2" (2nd), etc. DOM badge scanning is unreliable
 * because the page also renders badges for other people shown on the page.
 */
const extractConnectionDegree = (doc: Document): boolean | null => {
  const scripts = Array.from(doc.querySelectorAll("script:not([src])"));
  const rehydration = scripts.find((s) => s.textContent?.includes("profile_network_distance_"));
  if (!rehydration) {
    return false;
  }
  const content = rehydration.textContent ?? "";
  const keyIdx = content.indexOf("profile_network_distance_");
  if (keyIdx < 0) {
    return false;
  }
  const segment = content.slice(keyIdx, keyIdx + 500);
  const match = segment.match(/\\"stringValue\\":\\"(Distance\d+)\\"/);
  return match ? match[1] === "Distance1" : false;
};

const extractViaLeafWalk = (doc: Document, name: string): ParagraphData | null => {
  const candidates = Array.from(doc.querySelectorAll("a, span, strong")).filter(
    (el) => el.children.length === 0 && el.textContent?.trim() === name,
  );
  for (const el of candidates) {
    const result = walkUpForParagraphs(el, name);
    if (result?.subtitle) {
      return result;
    }
  }
  return null;
};

// ── Image extraction ────────────────────────────────────────────────────────

/**
 * Extracts the profile photo URL from a fetched profile page document.
 * LinkedIn SSR pages contain an <img src="...profile-displayphoto..."> for
 * the subject's photo. Returns null if not found.
 */
const extractImgFromDoc = (doc: Document): string | null => {
  const img = doc.querySelector<HTMLImageElement>('img[src*="profile-displayphoto"]');
  return img?.src ?? null;
};

// ── Main export ───────────────────────────────────────────────────────────────

export const fetchProfileData = async (
  profileUrl: string,
  imgSrc: string | null,
): Promise<ProfileData> => {
  // 1. In-memory cache (page lifetime)
  if (profileCache.has(profileUrl)) {
    return profileCache.get(profileUrl)!;
  }

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

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const { devMode } = await loadExtensionState();
    if (devMode) {
      console.log("[li-ext] profile HTML:", html);
    }

    // Name is always in <title> as "First Last | LinkedIn"
    const name = doc.title.replace(/\s*\|\s*LinkedIn\s*$/, "").trim();

    // Try primary extraction (heading walk), then fall back to leaf-element walk
    const paragraphData = extractViaHeadingWalk(doc, name) ?? extractViaLeafWalk(doc, name);

    const data: ProfileData = {
      name,
      imgSrc: extractImgFromDoc(doc) ?? imgSrc,
      pronouns: paragraphData?.pronouns ?? null,
      subtitle: paragraphData?.subtitle ?? null,
      company: paragraphData?.company ?? null,
      location: paragraphData?.location ?? null,
      isConnection: extractConnectionDegree(doc),
    };

    profileCache.set(profileUrl, data);
    await saveProfileToStorage(profileUrl, data);
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
};
