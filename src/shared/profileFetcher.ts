import { getCsrfToken, loadExtensionState } from "./helpers";
import { type ProfileData, loadProfileFromStorage, saveProfileToStorage } from "./profileCache";

// In-memory cache for the lifetime of the page
const profileCache = new Map<string, ProfileData>();

// -- Paragraph filter predicates ------------------------------------------------

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
 * Returns true when a paragraph's text is meaningful profile data -
 * i.e. not the person's name, not a degree badge, not pronouns, not noise.
 */
const isMeaningfulP = (t: string, name: string): boolean =>
  t.length > 4 && t !== name && !DEGREE_RE.test(t) && !PRONOUN_RE.test(t) && !NOISE_RE.test(t);

// -- Shared extraction logic ----------------------------------------------------

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

// -- Extraction strategies ------------------------------------------------------

/**
 * Primary strategy: find any heading (h1-h4) whose text exactly matches the
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
  const segment = content.slice(
    content.indexOf("profile_network_distance_"),
    content.indexOf("profile_network_distance_") + 500,
  );
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

// -- Image extraction -----------------------------------------------------------

/**
 * Extracts the profile photo URL from a fetched profile page document.
 * LinkedIn SSR pages contain an <img src="...profile-displayphoto..."> for
 * the subject's photo. Returns null if not found.
 */
const extractImgFromDoc = (doc: Document): string | null => {
  const img = doc.querySelector<HTMLImageElement>('img[src*="profile-displayphoto"]');
  return img?.src ?? null;
};

// -- Voyager profile fetch (primary) -------------------------------------------

/** Extracts vanity name from a profile URL, e.g. /in/jane-doe -> jane-doe. */
const extractVanityName = (profileUrl: string): string | null => {
  const match = profileUrl.match(/(?:https:\/\/www\.linkedin\.com)?\/in\/([^/?#]+)/);
  return match?.[1] ?? null;
};

const VOYAGER_ACCEPT = "application/vnd.linkedin.normalized+json+2.1";

const buildMemberIdentityUrl = (vanityName: string): string => {
  const encodedMemberIdentity = encodeURIComponent(vanityName);
  return `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodedMemberIdentity}`;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

const getString = (obj: Record<string, unknown>, key: string): string | null => {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const getBoolean = (obj: Record<string, unknown>, key: string): boolean | null => {
  const value = obj[key];
  return typeof value === "boolean" ? value : null;
};

const pickLargestArtifactPath = (artifacts: unknown): string | null => {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return null;
  }
  let bestPath: string | null = null;
  let bestPixels = -1;
  for (const item of artifacts) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const fileIdentifyingUrlPathSegment = getString(record, "fileIdentifyingUrlPathSegment");
    if (!fileIdentifyingUrlPathSegment) {
      continue;
    }
    const width = typeof record.width === "number" ? record.width : 0;
    const height = typeof record.height === "number" ? record.height : 0;
    const pixels = width * height;
    if (pixels >= bestPixels) {
      bestPixels = pixels;
      bestPath = fileIdentifyingUrlPathSegment;
    }
  }
  return bestPath;
};

const getVoyagerImage = (record: Record<string, unknown>): string | null => {
  const profilePicture = asRecord(record.profilePicture) ?? asRecord(record.picture);
  if (!profilePicture) {
    return null;
  }

  const displayImage = asRecord(profilePicture["displayImage~"]);
  const vectorImage = asRecord(displayImage?.vectorImage ?? profilePicture.vectorImage);
  if (!vectorImage) {
    return null;
  }

  const rootUrl = getString(vectorImage, "rootUrl");
  const artifactPath = pickLargestArtifactPath(vectorImage.artifacts);
  if (!rootUrl || !artifactPath) {
    return null;
  }

  return rootUrl + artifactPath;
};

const needsHtmlEnrichment = (data: ProfileData): boolean => {
  return (
    data.pronouns === null ||
    data.company === null ||
    data.location === null ||
    data.isConnection === null ||
    data.imgSrc === null
  );
};

const mergeProfileData = (primary: ProfileData, fallback: ProfileData): ProfileData => {
  return {
    name: primary.name || fallback.name,
    imgSrc: primary.imgSrc ?? fallback.imgSrc,
    pronouns: primary.pronouns ?? fallback.pronouns,
    subtitle: primary.subtitle ?? fallback.subtitle,
    company: primary.company ?? fallback.company,
    location: primary.location ?? fallback.location,
    isConnection: primary.isConnection ?? fallback.isConnection,
  };
};

const profileFromRecord = (
  record: Record<string, unknown>,
  imgSrc: string | null,
): ProfileData | null => {
  const firstName = getString(record, "firstName");
  const lastName = getString(record, "lastName");

  if (firstName || lastName) {
    const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    return {
      name,
      imgSrc: imgSrc ?? getVoyagerImage(record),
      pronouns: null,
      subtitle: getString(record, "headline"),
      company: null,
      location: getString(record, "locationName"),
      isConnection: getBoolean(record, "isConnection"),
    };
  }

  return null;
};

const parseVoyagerProfile = (json: unknown, imgSrc: string | null): ProfileData | null => {
  const root = asRecord(json);
  if (!root) {
    return null;
  }

  const rootData = asRecord(root.data);
  if (rootData) {
    const parsed = profileFromRecord(rootData, imgSrc);
    if (parsed) {
      return parsed;
    }
  }

  const elements = root.elements;
  if (Array.isArray(elements)) {
    for (const item of elements) {
      const record = asRecord(item);
      if (!record) {
        continue;
      }
      const parsed = profileFromRecord(record, imgSrc);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
};

const fetchViaVoyager = async (
  profileUrl: string,
  imgSrc: string | null,
  devMode: boolean,
): Promise<ProfileData | null> => {
  const vanityName = extractVanityName(profileUrl);
  const csrf = getCsrfToken();
  if (!vanityName || !csrf) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const memberIdentityUrl = buildMemberIdentityUrl(vanityName);
    const response = await fetch(memberIdentityUrl, {
      headers: {
        accept: VOYAGER_ACCEPT,
        "csrf-token": csrf,
      },
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const parsed = parseVoyagerProfile(await response.json(), imgSrc);
    if (parsed) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

// -- HTML parse fallback --------------------------------------------------------

const fetchViaHtmlParsing = async (
  profileUrl: string,
  imgSrc: string | null,
  devMode: boolean,
): Promise<ProfileData> => {
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

    // Name is always in <title> as "First Last | LinkedIn"
    const name = doc.title.replace(/\s*\|\s*LinkedIn\s*$/, "").trim();

    // Try primary extraction (heading walk), then fall back to leaf-element walk
    const paragraphData = extractViaHeadingWalk(doc, name) ?? extractViaLeafWalk(doc, name);

    return {
      name,
      imgSrc: extractImgFromDoc(doc) ?? imgSrc,
      pronouns: paragraphData?.pronouns ?? null,
      subtitle: paragraphData?.subtitle ?? null,
      company: paragraphData?.company ?? null,
      location: paragraphData?.location ?? null,
      isConnection: extractConnectionDegree(doc),
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

// -- Main export ----------------------------------------------------------------

export const fetchProfileData = async (
  profileUrl: string,
  imgSrc: string | null,
): Promise<ProfileData> => {
  const { devMode } = await loadExtensionState();

  // 1. In-memory cache (page lifetime)
  if (profileCache.has(profileUrl)) {
    return profileCache.get(profileUrl)!;
  }

  // 2. chrome.storage.local cache (7-day TTL)
  const stored = await loadProfileFromStorage(profileUrl);
  if (stored) {
    // Prefer the live DOM image if we have one - it may be fresher
    const data = imgSrc ? { ...stored, imgSrc } : stored;
    profileCache.set(profileUrl, data);
    return data;
  }

  // 3. Preferred path: Voyager JSON API
  const voyagerData = await fetchViaVoyager(profileUrl, imgSrc, devMode);
  if (voyagerData) {
    const finalData = needsHtmlEnrichment(voyagerData)
      ? mergeProfileData(
          voyagerData,
          await fetchViaHtmlParsing(profileUrl, voyagerData.imgSrc, devMode),
        )
      : voyagerData;

    profileCache.set(profileUrl, finalData);
    await saveProfileToStorage(profileUrl, finalData);
    return finalData;
  }

  // 4. Fallback path: parse profile HTML
  const htmlData = await fetchViaHtmlParsing(profileUrl, imgSrc, devMode);
  profileCache.set(profileUrl, htmlData);
  await saveProfileToStorage(profileUrl, htmlData);
  return htmlData;
};
