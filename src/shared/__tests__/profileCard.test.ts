import { renderProfileContent } from "../profileCard";
import type { ProfileData } from "../profileCache";

const baseData: ProfileData = {
  name: "Jane Doe",
  imgSrc: null,
  pronouns: null,
  subtitle: null,
  company: null,
  location: null,
  isConnection: null,
};

const render = (data: Partial<ProfileData>): HTMLElement => {
  const container = document.createElement("div");
  renderProfileContent(container, { ...baseData, ...data });
  return container;
};

describe("renderProfileContent", () => {
  describe("avatar", () => {
    it("renders an <img> with the correct src and alt when imgSrc is provided", () => {
      const container = render({ imgSrc: "https://cdn.li/photo.jpg" });
      const img = container.querySelector<HTMLImageElement>("img.li-ext-avatar");
      expect(img).not.toBeNull();
      expect(img!.src).toBe("https://cdn.li/photo.jpg");
      expect(img!.alt).toBe("Jane Doe");
    });

    it("renders a placeholder with the first letter of the name when imgSrc is null", () => {
      const container = render({ imgSrc: null });
      const placeholder = container.querySelector(".li-ext-avatar-placeholder");
      expect(placeholder).not.toBeNull();
      expect(placeholder!.textContent).toBe("J");
    });

    it("does not render a placeholder when both imgSrc and name are absent", () => {
      const container = render({ imgSrc: null, name: "" });
      expect(container.querySelector(".li-ext-avatar-placeholder")).toBeNull();
      expect(container.querySelector("img.li-ext-avatar")).toBeNull();
    });
  });

  describe("name", () => {
    it("renders the name", () => {
      const container = render({});
      expect(container.querySelector(".li-ext-name")?.textContent).toBe("Jane Doe");
    });

    it("does not render a name element when name is empty", () => {
      const container = render({ name: "" });
      expect(container.querySelector(".li-ext-name")).toBeNull();
    });
  });

  describe("pronouns", () => {
    it("renders pronouns when provided", () => {
      const container = render({ pronouns: "She/Her" });
      expect(container.querySelector(".li-ext-pronouns")?.textContent).toBe("She/Her");
    });

    it("does not render a pronouns element when pronouns is null", () => {
      const container = render({ pronouns: null });
      expect(container.querySelector(".li-ext-pronouns")).toBeNull();
    });
  });

  describe("subtitle", () => {
    it("renders the subtitle when provided", () => {
      const container = render({ subtitle: "Software Engineer" });
      expect(container.querySelector(".li-ext-subtitle")?.textContent).toBe("Software Engineer");
    });

    it("does not render a subtitle element when subtitle is null", () => {
      const container = render({ subtitle: null });
      expect(container.querySelector(".li-ext-subtitle")).toBeNull();
    });
  });

  describe("company", () => {
    it("renders the company when provided", () => {
      const container = render({ company: "Acme Corp" });
      expect(container.querySelector(".li-ext-company")?.textContent).toBe("Acme Corp");
    });

    it("does not render a company element when company is null", () => {
      const container = render({ company: null });
      expect(container.querySelector(".li-ext-company")).toBeNull();
    });
  });

  describe("location", () => {
    it("renders the location when provided", () => {
      const container = render({ location: "San Francisco, CA" });
      expect(container.querySelector(".li-ext-location")?.textContent).toBe("San Francisco, CA");
    });

    it("does not render a location element when location is null", () => {
      const container = render({ location: null });
      expect(container.querySelector(".li-ext-location")).toBeNull();
    });
  });

  describe("connection badge", () => {
    it("renders a 'Connected' badge with the --yes modifier when isConnection is true", () => {
      const container = render({ isConnection: true });
      const badge = container.querySelector(".li-ext-connection");
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe("Connected");
      expect(badge!.classList.contains("li-ext-connection--yes")).toBe(true);
      expect(badge!.classList.contains("li-ext-connection--no")).toBe(false);
    });

    it("renders a 'Not connected' badge with the --no modifier when isConnection is false", () => {
      const container = render({ isConnection: false });
      const badge = container.querySelector(".li-ext-connection");
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe("Not connected");
      expect(badge!.classList.contains("li-ext-connection--no")).toBe(true);
      expect(badge!.classList.contains("li-ext-connection--yes")).toBe(false);
    });

    it("does not render a connection badge when isConnection is null", () => {
      const container = render({ isConnection: null });
      expect(container.querySelector(".li-ext-connection")).toBeNull();
    });
  });

  describe("full profile", () => {
    it("renders all fields together without interference", () => {
      const container = render({
        name: "Alex Chen",
        imgSrc: "https://cdn.li/alex.jpg",
        pronouns: "They/Them",
        subtitle: "Designer",
        company: "Design Co",
        location: "Austin, TX",
        isConnection: true,
      });

      expect(container.querySelector<HTMLImageElement>("img.li-ext-avatar")?.src).toBe(
        "https://cdn.li/alex.jpg",
      );
      expect(container.querySelector(".li-ext-name")?.textContent).toBe("Alex Chen");
      expect(container.querySelector(".li-ext-pronouns")?.textContent).toBe("They/Them");
      expect(container.querySelector(".li-ext-subtitle")?.textContent).toBe("Designer");
      expect(container.querySelector(".li-ext-company")?.textContent).toBe("Design Co");
      expect(container.querySelector(".li-ext-location")?.textContent).toBe("Austin, TX");
      expect(container.querySelector(".li-ext-connection")?.textContent).toBe("Connected");
    });
  });
});
