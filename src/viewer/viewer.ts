import "./viewer.css";
import {
  type StoredProfile,
  STORAGE_PREFIX,
} from "../content/profileCache";
import { renderProfileContent } from "../shared/profileCard";
import { resolveImageBuffer } from "../shared/imageCache";

const objectUrlCache = new Map<string, string>();

async function resolveImageForViewer(cdnUrl: string): Promise<string> {
  if (objectUrlCache.has(cdnUrl)) return objectUrlCache.get(cdnUrl)!;
  try {
    const buffer = await resolveImageBuffer(cdnUrl);
    if (!buffer) return cdnUrl;
    const url = URL.createObjectURL(new Blob([buffer]));
    objectUrlCache.set(cdnUrl, url);
    return url;
  } catch { return cdnUrl; }
}

async function loadAll(): Promise<{ profileUrl: string; profile: StoredProfile }[]> {
  const allItems = await chrome.storage.local.get(null);
  const results: { profileUrl: string; profile: StoredProfile }[] = [];

  for (const [key, value] of Object.entries(allItems)) {
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    try {
      const profileUrl = key.slice(STORAGE_PREFIX.length);
      results.push({ profileUrl, profile: value as StoredProfile });
    } catch {
      // malformed entry — skip
    }
  }

  // Sort newest first
  results.sort((a, b) => b.profile.cachedAt - a.profile.cachedAt);
  return results;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts));
}

async function renderCard(profileUrl: string, profile: StoredProfile): Promise<HTMLAnchorElement> {
  const { data, cachedAt } = profile;
  const card = document.createElement("a");
  card.className = "card";
  card.href = profileUrl;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  // Resolve blob URL before rendering so the image is ready immediately
  const resolvedData = data.imgSrc
    ? { ...data, imgSrc: await resolveImageForViewer(data.imgSrc) }
    : data;

  renderProfileContent(card, resolvedData);

  const cached = document.createElement("div");
  cached.className = "li-ext-cached";
  cached.textContent = `Cached ${formatDate(cachedAt)}`;
  card.appendChild(cached);

  return card;
}

async function init(): Promise<void> {
  const grid = document.getElementById("grid") as HTMLElement;
  const emptyMsg = document.getElementById("empty") as HTMLElement;

  const entries = await loadAll();

  console.log("Loaded profiles from storage:", entries);

  if (entries.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }

  for (const { profileUrl, profile } of entries) {
    grid.appendChild(await renderCard(profileUrl, profile));
  }
}

document.getElementById("clear-btn")!.addEventListener("click", async () => {
  if (!confirm("Clear all cached profile data?")) return;

  const allItems = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(allItems).filter((k) => k.startsWith(STORAGE_PREFIX));
  await chrome.storage.local.remove(keysToRemove);

  location.reload();
});

init();
