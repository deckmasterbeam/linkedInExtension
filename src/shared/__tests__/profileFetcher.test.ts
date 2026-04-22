import { loadProfileFromStorage, saveProfileToStorage } from "../profileCache";
import type { ProfileData } from "../profileCache";
import { getCsrfToken, loadExtensionState } from "../helpers";
import { fetchProfileData } from "../profileFetcher";

jest.mock("../profileCache", () => ({
  loadProfileFromStorage: jest.fn(),
  saveProfileToStorage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../helpers", () => ({
  loadExtensionState: jest.fn().mockResolvedValue({ devMode: false }),
  getCsrfToken: jest.fn().mockReturnValue("fake-csrf-token"),
}));

const mockLoadFromStorage = loadProfileFromStorage as jest.MockedFunction<
  typeof loadProfileFromStorage
>;
const mockSaveToStorage = saveProfileToStorage as jest.MockedFunction<typeof saveProfileToStorage>;
const mockGetCsrfToken = getCsrfToken as jest.MockedFunction<typeof getCsrfToken>;
const mockLoadExtensionState = loadExtensionState as jest.MockedFunction<typeof loadExtensionState>;

beforeEach(() => {
  mockLoadFromStorage.mockReset();
  mockLoadFromStorage.mockResolvedValue(null); // default: both caches miss
  mockSaveToStorage.mockReset();
  mockSaveToStorage.mockResolvedValue(undefined);
  mockGetCsrfToken.mockReset();
  mockGetCsrfToken.mockReturnValue(null); // skip Voyager in HTML-focused tests
  mockLoadExtensionState.mockReset();
  mockLoadExtensionState.mockResolvedValue({
    devMode: false,
    popupsEnabled: true,
    highlighting: false,
    pendingInstallLogTime: null,
  });
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

    it("returns null subtitle when the name is in a heading but has no surrounding paragraphs", async () => {
      // Hits walkUpForParagraphs line 61: loop exhausts all ancestors, no <p> found.
      const url = "https://www.linkedin.com/in/no-paragraphs";
      mockFetchHtml(`
        <html>
          <head><title>No Paragraphs | LinkedIn</title></head>
          <body><div><h1>No Paragraphs</h1></div></body>
        </html>
      `);

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("No Paragraphs");
      expect(result.subtitle).toBeNull();
    });

    it("returns null subtitle when leaf candidates exist but have no surrounding paragraphs", async () => {
      // Hits walkUpForParagraphs line 61 (for each candidate) and extractViaLeafWalk line 115.
      const url = "https://www.linkedin.com/in/leaf-no-paragraphs";
      mockFetchHtml(`
        <html>
          <head><title>Leaf No Para | LinkedIn</title></head>
          <body><div><a>Leaf No Para</a></div></body>
        </html>
      `);

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("Leaf No Para");
      expect(result.subtitle).toBeNull();
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

    it("returns false when no rehydration script is present", async () => {
      const url = "https://www.linkedin.com/in/no-badge";
      mockFetchHtml(makeHeadingHtml({ name: "No Badge" }));

      const result = await fetchProfileData(url, null);

      expect(result.isConnection).toBe(false);
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

  // ── Voyager memberIdentity + HTML enrichment ───────────────────────────────

  describe("Voyager memberIdentity", () => {
    it("uses memberIdentity data and enriches missing fields from HTML", async () => {
      const url = "https://www.linkedin.com/in/voyager-enrich-user";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      const voyagerJson = {
        elements: [
          {
            firstName: "Voyager",
            lastName: "User",
            headline: "Voyager Headline",
            locationName: "Voyager City",
            isConnection: true,
            profilePicture: {
              vectorImage: {
                rootUrl: "https://media.licdn.com/dms/image/",
                artifacts: [
                  {
                    fileIdentifyingUrlPathSegment: "small.jpg",
                    width: 100,
                    height: 100,
                  },
                  {
                    fileIdentifyingUrlPathSegment: "large.jpg",
                    width: 400,
                    height: 400,
                  },
                ],
              },
            },
          },
        ],
      };

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(voyagerJson),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              makeHeadingHtml({
                name: "Voyager User",
                pronouns: "They/Them",
                subtitle: "HTML Subtitle",
                company: "HTML Company",
                location: "HTML City",
                networkDistance: "Distance2",
              }),
            ),
        });

      const result = await fetchProfileData(url, null);

      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain(
        "/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=voyager-enrich-user",
      );
      expect((globalThis.fetch as jest.Mock).mock.calls[1][0]).toBe(url);

      // Keep Voyager values where present
      expect(result.subtitle).toBe("Voyager Headline");
      expect(result.location).toBe("Voyager City");
      expect(result.isConnection).toBe(true);
      expect(result.imgSrc).toBe("https://media.licdn.com/dms/image/large.jpg");

      // Fill missing values from HTML
      expect(result.pronouns).toBe("They/Them");
      expect(result.company).toBe("HTML Company");
    });

    it("falls back to HTML when memberIdentity returns non-ok", async () => {
      const url = "https://www.linkedin.com/in/voyager-http-fail";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 410 })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "HTML Fallback" })),
        });

      const result = await fetchProfileData(url, null);

      expect(globalThis.fetch as jest.Mock).toHaveBeenCalledTimes(2);
      expect(result.name).toBe("HTML Fallback");
    });

    it("falls back to HTML when memberIdentity has no parseable profile", async () => {
      const url = "https://www.linkedin.com/in/voyager-unparseable";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ elements: [{ foo: "bar" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Unparseable Voyager" })),
        });

      const result = await fetchProfileData(url, null);

      expect(globalThis.fetch as jest.Mock).toHaveBeenCalledTimes(2);
      expect(result.name).toBe("Unparseable Voyager");
    });

    it("handles a null voyager JSON payload by falling back to HTML", async () => {
      const url = "https://www.linkedin.com/in/voyager-null-root";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(null),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Null Root Fallback" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("Null Root Fallback");
    });

    it("parses voyager data from the root data object", async () => {
      const url = "https://www.linkedin.com/in/voyager-root-data";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                firstName: "Root",
                lastName: "Data",
                headline: "From root data",
                locationName: "Root City",
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Root Data" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("Root Data");
      expect(result.subtitle).toBe("From root data");
      expect(result.location).toBe("Root City");
    });

    it("skips non-object entries in elements and parses the next valid record", async () => {
      const url = "https://www.linkedin.com/in/voyager-elements-non-object";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [null, { firstName: "Elem", lastName: "Valid" }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Elem Valid" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("Elem Valid");
    });

    it("falls back when profilePicture is missing", async () => {
      const url = "https://www.linkedin.com/in/voyager-no-picture";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [{ firstName: "No", lastName: "Picture" }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              makeHeadingHtml({
                name: "No Picture",
                profileImg:
                  "https://media.licdn.com/dms/image/profile-displayphoto-shrink_800_800/no-picture.jpg",
              }),
            ),
        });

      const result = await fetchProfileData(url, null);

      expect(result.imgSrc).toContain("no-picture.jpg");
    });

    it("falls back when vectorImage is missing", async () => {
      const url = "https://www.linkedin.com/in/voyager-no-vector";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [
                {
                  firstName: "No",
                  lastName: "Vector",
                  profilePicture: {},
                },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              makeHeadingHtml({
                name: "No Vector",
                profileImg:
                  "https://media.licdn.com/dms/image/profile-displayphoto-shrink_800_800/no-vector.jpg",
              }),
            ),
        });

      const result = await fetchProfileData(url, null);

      expect(result.imgSrc).toContain("no-vector.jpg");
    });

    it("falls back when vectorImage has no usable artifacts (empty artifacts path)", async () => {
      const url = "https://www.linkedin.com/in/voyager-empty-artifacts";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [
                {
                  firstName: "Empty",
                  lastName: "Artifacts",
                  profilePicture: {
                    vectorImage: {
                      rootUrl: "https://media.licdn.com/dms/image/",
                      artifacts: [],
                    },
                  },
                },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              makeHeadingHtml({
                name: "Empty Artifacts",
                profileImg:
                  "https://media.licdn.com/dms/image/profile-displayphoto-shrink_800_800/empty-artifacts.jpg",
              }),
            ),
        });

      const result = await fetchProfileData(url, null);

      expect(result.imgSrc).toContain("empty-artifacts.jpg");
    });

    it("skips invalid artifacts and continues until a valid artifact exists", async () => {
      const url = "https://www.linkedin.com/in/voyager-artifact-continue";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [
                {
                  firstName: "Artifact",
                  lastName: "Continue",
                  profilePicture: {
                    vectorImage: {
                      rootUrl: "https://media.licdn.com/dms/image/",
                      artifacts: [
                        null,
                        {},
                        { fileIdentifyingUrlPathSegment: "valid.jpg", width: 40, height: 40 },
                      ],
                    },
                  },
                },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Artifact Continue" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.imgSrc).toBe("https://media.licdn.com/dms/image/valid.jpg");
    });

    it("falls back when vectorImage lacks rootUrl even with artifacts", async () => {
      const url = "https://www.linkedin.com/in/voyager-no-root-url";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [
                {
                  firstName: "No",
                  lastName: "RootUrl",
                  profilePicture: {
                    vectorImage: {
                      artifacts: [
                        { fileIdentifyingUrlPathSegment: "x.jpg", width: 40, height: 40 },
                      ],
                    },
                  },
                },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              makeHeadingHtml({
                name: "No RootUrl",
                profileImg:
                  "https://media.licdn.com/dms/image/profile-displayphoto-shrink_800_800/no-root.jpg",
              }),
            ),
        });

      const result = await fetchProfileData(url, null);

      expect(result.imgSrc).toContain("no-root.jpg");
    });

    it("logs the failure branch in dev mode", async () => {
      const url = "https://www.linkedin.com/in/voyager-dev-fail";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");
      mockLoadExtensionState.mockResolvedValue({
        devMode: true,
        popupsEnabled: true,
        highlighting: false,
        pendingInstallLogTime: null,
      });
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Dev Fail" })),
        });

      await fetchProfileData(url, null);

      expect(logSpy).toHaveBeenCalledWith(
        "[LinkedIn Extension] Voyager memberIdentity failed: HTTP 500",
      );
      logSpy.mockRestore();
    });

    it("logs success in dev mode", async () => {
      const url = "https://www.linkedin.com/in/voyager-dev-success";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");
      mockLoadExtensionState.mockResolvedValue({
        devMode: true,
        popupsEnabled: true,
        highlighting: false,
        pendingInstallLogTime: null,
      });
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ elements: [{ firstName: "Dev", lastName: "Success" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Dev Success" })),
        });

      await fetchProfileData(url, null);

      expect(logSpy).toHaveBeenCalledWith("[LinkedIn Extension] Voyager memberIdentity succeeded");
      logSpy.mockRestore();
    });

    it("logs no-parse in dev mode", async () => {
      const url = "https://www.linkedin.com/in/voyager-dev-no-parse";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");
      mockLoadExtensionState.mockResolvedValue({
        devMode: true,
        popupsEnabled: true,
        highlighting: false,
        pendingInstallLogTime: null,
      });
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ elements: [{ foo: "bar" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Dev No Parse" })),
        });

      await fetchProfileData(url, null);

      expect(logSpy).toHaveBeenCalledWith(
        "[LinkedIn Extension] Voyager memberIdentity had no parseable profile",
      );
      logSpy.mockRestore();
    });

    it("falls back to HTML when memberIdentity fetch throws", async () => {
      const url = "https://www.linkedin.com/in/voyager-throws";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Thrown Fetch Fallback" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("Thrown Fetch Fallback");
    });

    it("continues from unparseable root data to a parseable elements entry", async () => {
      const url = "https://www.linkedin.com/in/voyager-root-unparseable-elements-parseable";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { foo: "bar" },
              elements: [{ firstName: "Element", lastName: "Parsed" }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Element Parsed" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("Element Parsed");
    });

    it("falls back when root data is unparseable and elements is not an array", async () => {
      const url = "https://www.linkedin.com/in/voyager-no-elements-array";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { foo: "bar" }, elements: "nope" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "No Elements Array" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.name).toBe("No Elements Array");
    });

    it("keeps the largest artifact when later artifacts are smaller", async () => {
      const url = "https://www.linkedin.com/in/voyager-largest-artifact-stays";
      mockGetCsrfToken.mockReturnValue("fake-csrf-token");

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [
                {
                  firstName: "Largest",
                  lastName: "Artifact",
                  profilePicture: {
                    vectorImage: {
                      rootUrl: "https://media.licdn.com/dms/image/",
                      artifacts: [
                        { fileIdentifyingUrlPathSegment: "big.jpg", width: 500, height: 500 },
                        { fileIdentifyingUrlPathSegment: "small.jpg", width: 40, height: 40 },
                      ],
                    },
                  },
                },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(makeHeadingHtml({ name: "Largest Artifact" })),
        });

      const result = await fetchProfileData(url, null);

      expect(result.imgSrc).toBe("https://media.licdn.com/dms/image/big.jpg");
    });
  });
});
