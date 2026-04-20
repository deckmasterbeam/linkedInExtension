import { normalizeProfileUrl, isSuppressedLink } from "../helpers";

const randomUsername = "randomUser123";

describe("normalizeProfileUrl", () => {
  // ── Should return the canonical URL ────────────────────────────────────────

  it("accepts a plain profile URL", () => {
    expect(normalizeProfileUrl(`https://www.linkedin.com/in/${randomUsername}`)).toBe(
      `https://www.linkedin.com/in/${randomUsername}`,
    );
  });

  it("accepts a plain profile URL with a trailing slash", () => {
    expect(normalizeProfileUrl(`https://www.linkedin.com/in/${randomUsername}/`)).toBe(
      `https://www.linkedin.com/in/${randomUsername}`,
    );
  });

  it("rejects a URL with a query string", () => {
    // Query strings indicate a non-plain profile link and should be excluded
    expect(
      normalizeProfileUrl(`https://www.linkedin.com/in/${randomUsername}?trk=sometracker`),
    ).toBeNull();
  });

  it("strips a hash fragment from an otherwise-valid profile URL", () => {
    expect(normalizeProfileUrl(`https://www.linkedin.com/in/${randomUsername}#experience`)).toBe(
      `https://www.linkedin.com/in/${randomUsername}`,
    );
  });

  // ── Should return null ──────────────────────────────────────────────────────

  it("rejects an overlay sub-path", () => {
    expect(
      normalizeProfileUrl(`https://www.linkedin.com/in/${randomUsername}/overlay/contact-info/`),
    ).toBeNull();
  });

  it("rejects an edit form sub-path", () => {
    expect(
      normalizeProfileUrl(
        `https://www.linkedin.com/in/${randomUsername}/edit/forms/recommendation/request/?profileUrn=urn%3Ali%3Afsd_profile%3AACoAAA`,
      ),
    ).toBeNull();
  });

  it("rejects a details sub-path", () => {
    expect(
      normalizeProfileUrl(`https://www.linkedin.com/in/${randomUsername}/details/experience/`),
    ).toBeNull();
  });

  it("reject the retry premium format link", () => {
    expect(
      normalizeProfileUrl(
        `https://www.linkedin.com/in/${randomUsername}/?lipi=urn%3Ali%3Apage%3Ad_flagship3_profile_view_base%3BkyZoIAr8TsWWg4sOjgRR6Q%3D%3D`,
      ),
    ).toBeNull();
  });

  it("rejects a non-profile LinkedIn URL", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/feed/")).toBeNull();
  });

  it("rejects a company page URL", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/company/microsoft/")).toBeNull();
  });

  it("rejects a completely different domain", () => {
    expect(normalizeProfileUrl(`https://example.com/in/${randomUsername}`)).toBeNull();
  });

  it("rejects a malformed/non-URL string", () => {
    expect(normalizeProfileUrl("not-a-url")).toBeNull();
  });

  it("accepts a relative /in/<username> path", () => {
    expect(normalizeProfileUrl("/in/janedoe")).toBe("https://www.linkedin.com/in/janedoe");
  });

  it("accepts a relative /in/<username>/ path with trailing slash", () => {
    expect(normalizeProfileUrl("/in/janedoe/")).toBe("https://www.linkedin.com/in/janedoe");
  });

  it("rejects a relative path with a sub-path", () => {
    expect(normalizeProfileUrl("/in/janedoe/details/experience/")).toBeNull();
  });

  it("rejects a relative path with a query string", () => {
    expect(normalizeProfileUrl("/in/janedoe?foo=bar")).toBeNull();
  });

  it("accepts an absolute URL with a 2-letter language code sub-path", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/bfreydier/en/")).toBe(
      "https://www.linkedin.com/in/bfreydier",
    );
  });

  it("accepts a 2-letter language code sub-path without trailing slash", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/bfreydier/fr")).toBe(
      "https://www.linkedin.com/in/bfreydier",
    );
  });

  it("rejects a sub-path longer than 2 letters (not a language code)", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/bfreydier/details/")).toBeNull();
  });
});

// ── isSuppressedLink ──────────────────────────────────────────────────────────

const makeLink = (text: string, ariaLabel?: string): HTMLAnchorElement => {
  const a = document.createElement("a");
  a.href = "https://www.linkedin.com/in/someone";
  a.innerText = text;
  if (ariaLabel !== undefined) {
    a.setAttribute("aria-label", ariaLabel);
  }
  return a;
};

describe("isSuppressedLink", () => {
  describe("visible text suppression", () => {
    it("suppresses a link whose text is 'Retry Premium'", () => {
      expect(isSuppressedLink(makeLink("Retry Premium"))).toBe(true);
    });

    it("suppresses 'retry premium' case-insensitively", () => {
      expect(isSuppressedLink(makeLink("RETRY PREMIUM"))).toBe(true);
    });

    it("suppresses 'Try Premium'", () => {
      expect(isSuppressedLink(makeLink("Try Premium"))).toBe(true);
    });

    it("suppresses 'Get Premium'", () => {
      expect(isSuppressedLink(makeLink("Get Premium"))).toBe(true);
    });

    it("suppresses 'Upgrade'", () => {
      expect(isSuppressedLink(makeLink("Upgrade"))).toBe(true);
    });

    it("does not suppress a link with a person's name", () => {
      expect(isSuppressedLink(makeLink("Jane Doe"))).toBe(false);
    });

    it("does not suppress a link with no text content (avatar link)", () => {
      expect(isSuppressedLink(makeLink(""))).toBe(false);
    });
  });

  describe("aria-label suppression", () => {
    it("suppresses a notifications link: 'Manage notifications about Jane Doe'", () => {
      expect(isSuppressedLink(makeLink("", "Manage notifications about Jane Doe"))).toBe(true);
    });

    it("suppresses the notifications aria-label case-insensitively", () => {
      expect(isSuppressedLink(makeLink("", "manage notifications about Jane Doe"))).toBe(true);
    });

    it("suppresses a premium badge link: 'Jane Doe is a Premium member'", () => {
      expect(isSuppressedLink(makeLink("", "Jane Doe is a Premium member"))).toBe(true);
    });

    it("suppresses the premium member aria-label case-insensitively", () => {
      expect(isSuppressedLink(makeLink("", "JANE DOE IS A PREMIUM MEMBER"))).toBe(true);
    });

    it("does not suppress a plain profile name aria-label", () => {
      expect(isSuppressedLink(makeLink("", "Jane Doe"))).toBe(false);
    });

    it("does not suppress when no aria-label is present", () => {
      expect(isSuppressedLink(makeLink("Jane Doe"))).toBe(false);
    });
  });

  describe("current page self-suppression", () => {
    const profileUrl = "https://www.linkedin.com/in/janedoe";

    it("suppresses a link that matches the current page profile URL", () => {
      const link = makeLink("Jane Doe");
      link.href = profileUrl;
      expect(isSuppressedLink(link, profileUrl)).toBe(true);
    });

    it("does not suppress a link to a different profile even when currentPageProfileUrl is set", () => {
      const link = makeLink("John Smith");
      link.href = "https://www.linkedin.com/in/johnsmith";
      expect(isSuppressedLink(link, profileUrl)).toBe(false);
    });

    it("does not suppress any link when currentPageProfileUrl is null (non-profile page)", () => {
      const link = makeLink("Jane Doe");
      link.href = profileUrl;
      expect(isSuppressedLink(link, null)).toBe(false);
    });

    it("does not suppress any link when currentPageProfileUrl is omitted", () => {
      const link = makeLink("Jane Doe");
      link.href = profileUrl;
      expect(isSuppressedLink(link)).toBe(false);
    });
  });
});
