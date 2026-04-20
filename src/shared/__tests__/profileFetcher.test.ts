import { fetchProfileData } from "../profileFetcher";
import { loadProfileFromStorage, saveProfileToStorage } from "../profileCache";
import type { ProfileData } from "../profileCache";

jest.mock("../profileCache", () => ({
  loadProfileFromStorage: jest.fn(),
  saveProfileToStorage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../helpers", () => ({
  loadExtensionState: jest.fn().mockResolvedValue({ devMode: false }),
}));

const mockLoadFromStorage = loadProfileFromStorage as jest.MockedFunction<
  typeof loadProfileFromStorage
>;
const mockSaveToStorage = saveProfileToStorage as jest.MockedFunction<typeof saveProfileToStorage>;

beforeEach(() => {
  mockLoadFromStorage.mockReset();
  mockLoadFromStorage.mockResolvedValue(null); // default: both caches miss
  mockSaveToStorage.mockReset();
  mockSaveToStorage.mockResolvedValue(undefined);
  globalThis.fetch = jest.fn();
});

const mockFetchHtml = (html: string): void => {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    text: () => Promise.resolve(html),
  });
};

// ── HTML fixtures ─────────────────────────────────────────────────────────────

/**
 * Produces a minimal LinkedIn profile page that uses the primary (heading) strategy.
 * The h1 and paragraphs share a common parent so walkUpForParagraphs finds them.
 */
/**
 * Produces a minimal rehydration <script> tag with a profile_network_distance
 * state key so extractConnectionDegree can read it.
 * distanceValue should be "Distance1", "Distance2", etc.
 */
const makeRehydrationScript = (distanceValue: string): string =>
  `<script>window.__como_rehydration__ = ["profile_network_distance_TEST_ID\\"` +
  `,\\"stringValue\\":\\"${distanceValue}\\""];</script>`;

const makeHeadingHtml = ({
  name,
  subtitle = "Software Engineer",
  company = "Acme Corp",
  location = "San Francisco, CA",
  pronouns,
  degree,
  networkDistance,
  profileImg,
}: {
  name: string;
  subtitle?: string;
  company?: string;
  location?: string;
  pronouns?: string;
  degree?: string;
  networkDistance?: string;
  profileImg?: string;
}) => `
<html>
  <head><title>${name} | LinkedIn</title></head>
  <body>
    ${networkDistance ? makeRehydrationScript(networkDistance) : ""}
    <div>
      ${profileImg ? `<img src="${profileImg}" alt="">` : ""}
      <h1>${name}</h1>
      ${pronouns ? `<p>${pronouns}</p>` : ""}
      <p>${subtitle}</p>
      <p>${company}</p>
      <p>${location}</p>
      ${degree ? `<span>${degree}</span>` : ""}
    </div>
  </body>
</html>`;

/**
 * Produces a page where the name appears in a leaf <a> element rather than a
 * heading — forces the fallback (leaf-walk) extraction strategy.
 */
const makeLeafHtml = ({
  name,
  subtitle = "Product Manager",
  company = "Startup Inc",
  location = "New York, NY",
}: {
  name: string;
  subtitle?: string;
  company?: string;
  location?: string;
}) => `
<html>
  <head><title>${name} | LinkedIn</title></head>
  <body>
    <div>
      <a>${name}</a>
      <p>${subtitle}</p>
      <p>${company}</p>
      <p>${location}</p>
    </div>
  </body>
</html>`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchProfileData", () => {
  // ── Cache levels ────────────────────────────────────────────────────────────

  describe("caching", () => {
    it("returns data from the in-memory cache on the second call, skipping storage and fetch", async () => {
      const url = "https://www.linkedin.com/in/inmemory-user";
      mockFetchHtml(makeHeadingHtml({ name: "In Memory User" }));

      await fetchProfileData(url, null);
      await fetchProfileData(url, null);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(mockLoadFromStorage).toHaveBeenCalledTimes(1); // only checked on the first call
    });

    it("returns data from the storage cache when available, skipping fetch", async () => {
      const url = "https://www.linkedin.com/in/storage-user";
      const stored: ProfileData = {
        name: "Storage User",
        imgSrc: null,
        pronouns: null,
        subtitle: "Engineer",
        company: "Corp",
        location: "NYC",
        isConnection: true,
      };
      mockLoadFromStorage.mockResolvedValueOnce(stored);

      const result = await fetchProfileData(url, null);

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result).toMatchObject(stored);
    });

    it("prefers the live imgSrc over the stored one when a live image is available", async () => {
      const url = "https://www.linkedin.com/in/storage-img-user";
      const stored: ProfileData = {
        name: "Storage Img User",
        imgSrc: "https://cdn.li/old.jpg",
        pronouns: null,
        subtitle: "Engineer",
        company: "Corp",
        location: "NYC",
        isConnection: null,
      };
      mockLoadFromStorage.mockResolvedValueOnce(stored);

      const result = await fetchProfileData(url, "https://cdn.li/fresh.jpg");

      expect(result.imgSrc).toBe("https://cdn.li/fresh.jpg");
    });

    it("fetches from the network when both caches miss, then saves to storage", async () => {
      const url = "https://www.linkedin.com/in/network-user";
      mockFetchHtml(makeHeadingHtml({ name: "Network User" }));

      const result = await fetchProfileData(url, null);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ credentials: "include" }),
      );
      expect(mockSaveToStorage).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ name: "Network User" }),
      );
      expect(result.name).toBe("Network User");
    });

    it("throws when the network response is not ok", async () => {
      const url = "https://www.linkedin.com/in/error-user";
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(fetchProfileData(url, null)).rejects.toThrow("HTTP 404");
    });
  });

  // ── HTML extraction: heading walk (primary strategy) ────────────────────────

  describe("HTML extraction — heading walk (primary strategy)", () => {
    it("extracts the name from the page title", async () => {
      const url = "https://www.linkedin.com/in/heading-name";
      mockFetchHtml(makeHeadingHtml({ name: "Jane Doe" }));

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("Jane Doe");
    });

    it("extracts subtitle, company, and location from paragraphs near the heading", async () => {
      const url = "https://www.linkedin.com/in/heading-fields";
      mockFetchHtml(
        makeHeadingHtml({
          name: "Jane Doe",
          subtitle: "Software Engineer at Acme",
          company: "Acme Corp",
          location: "San Francisco, CA",
        }),
      );

      const result = await fetchProfileData(url, null);

      expect(result.subtitle).toBe("Software Engineer at Acme");
      expect(result.company).toBe("Acme Corp");
      expect(result.location).toBe("San Francisco, CA");
    });

    it("extracts pronouns from a paragraph matching the pronoun pattern", async () => {
      const url = "https://www.linkedin.com/in/heading-pronouns";
      mockFetchHtml(makeHeadingHtml({ name: "Alex Chen", pronouns: "He/Him" }));

      const result = await fetchProfileData(url, null);

      expect(result.pronouns).toBe("He/Him");
    });

    it("does not count the pronoun paragraph as the subtitle", async () => {
      const url = "https://www.linkedin.com/in/heading-pronouns-subtitle";
      mockFetchHtml(
        makeHeadingHtml({
          name: "Alex Chen",
          pronouns: "She/Her",
          subtitle: "Designer",
          company: "Design Co",
          location: "Austin, TX",
        }),
      );

      const result = await fetchProfileData(url, null);

      expect(result.subtitle).toBe("Designer");
    });
  });

  // ── HTML extraction: leaf walk (fallback strategy) ──────────────────────────

  describe("HTML extraction — leaf walk (fallback strategy)", () => {
    it("extracts data when the name appears in a leaf element instead of a heading", async () => {
      const url = "https://www.linkedin.com/in/leaf-user";
      mockFetchHtml(
        makeLeafHtml({
          name: "John Smith",
          subtitle: "Product Manager",
          company: "Startup Inc",
          location: "New York, NY",
        }),
      );

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("John Smith");
      expect(result.subtitle).toBe("Product Manager");
      expect(result.company).toBe("Startup Inc");
      expect(result.location).toBe("New York, NY");
    });
  });

  // ── HTML extraction: profile image ──────────────────────────────────────────

  describe("HTML extraction — profile image", () => {
    const FETCHED_IMG =
      "https://media.licdn.com/dms/image/profile-displayphoto-shrink_800_800/photo.jpg";
    const DOM_IMG =
      "https://media.licdn.com/dms/image/profile-displayphoto-shrink_100_100/photo.jpg";

    it("uses the profile-displayphoto image from the fetched page when present", async () => {
      const url = "https://www.linkedin.com/in/img-from-page";
      mockFetchHtml(makeHeadingHtml({ name: "Jane Doe", profileImg: FETCHED_IMG }));

      const result = await fetchProfileData(url, DOM_IMG);

      expect(result.imgSrc).toBe(FETCHED_IMG);
    });

    it("falls back to the DOM imgSrc when the fetched page has no profile photo", async () => {
      const url = "https://www.linkedin.com/in/img-fallback";
      mockFetchHtml(makeHeadingHtml({ name: "Jane Doe" }));

      const result = await fetchProfileData(url, DOM_IMG);

      expect(result.imgSrc).toBe(DOM_IMG);
    });

    it("stores the fetched-page image in the cache", async () => {
      const url = "https://www.linkedin.com/in/img-stored";
      mockFetchHtml(makeHeadingHtml({ name: "Jane Doe", profileImg: FETCHED_IMG }));

      await fetchProfileData(url, DOM_IMG);

      expect(mockSaveToStorage).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ imgSrc: FETCHED_IMG }),
      );
    });
  });

  // ── HTML extraction: connection degree ──────────────────────────────────────

  describe("HTML extraction — connection degree", () => {
    it("returns true when the rehydration script has Distance1", async () => {
      const url = "https://www.linkedin.com/in/first-degree";
      mockFetchHtml(makeHeadingHtml({ name: "First Degree", networkDistance: "Distance1" }));

      const result = await fetchProfileData(url, null);

      expect(result.isConnection).toBe(true);
    });

    it("returns false when the rehydration script has Distance2", async () => {
      const url = "https://www.linkedin.com/in/second-degree";
      mockFetchHtml(makeHeadingHtml({ name: "Second Degree", networkDistance: "Distance2" }));

      const result = await fetchProfileData(url, null);

      expect(result.isConnection).toBe(false);
    });

    it("returns false when the rehydration script has Distance3", async () => {
      const url = "https://www.linkedin.com/in/third-degree";
      mockFetchHtml(makeHeadingHtml({ name: "Third Degree", networkDistance: "Distance3" }));

      const result = await fetchProfileData(url, null);

      expect(result.isConnection).toBe(false);
    });

    it("returns null when no rehydration script is present", async () => {
      const url = "https://www.linkedin.com/in/no-badge";
      mockFetchHtml(makeHeadingHtml({ name: "No Badge" }));

      const result = await fetchProfileData(url, null);

      expect(result.isConnection).toBeNull();
    });

    it("does not mistake a DOM degree badge for a subtitle paragraph", async () => {
      const url = "https://www.linkedin.com/in/degree-not-subtitle";
      mockFetchHtml(
        makeHeadingHtml({
          name: "Sam Rivera",
          subtitle: "Data Scientist",
          degree: "· 1st",
        }),
      );

      const result = await fetchProfileData(url, null);

      expect(result.subtitle).toBe("Data Scientist");
    });

    it("ignores DOM degree badges from other profiles on the page", async () => {
      const url = "https://www.linkedin.com/in/other-profiles-noise";
      // Page has DOM badges from other profiles but the rehydration script says Distance2
      mockFetchHtml(
        makeHeadingHtml({
          name: "Jane Smith",
          degree: "· 1st", // belongs to another profile in the sidebar
          networkDistance: "Distance2",
        }),
      );

      const result = await fetchProfileData(url, null);

      expect(result.isConnection).toBe(false);
    });
  });
});
