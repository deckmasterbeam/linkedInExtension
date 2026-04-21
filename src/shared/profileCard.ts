import type { ProfileData } from "./profileCache";

/**
 * Appends profile content elements (avatar, name, subtitle, company, location)
 * to `container` using shared `li-ext-*` CSS classes.
 * Both the hover popup and the viewer card use this.
 */
export const renderProfileContent = (container: HTMLElement, data: ProfileData): void => {
  if (data.imgSrc) {
    const img = document.createElement("img");
    img.src = data.imgSrc;
    img.alt = data.name;
    img.className = "li-ext-avatar";
    container.appendChild(img);
  } else if (data.name) {
    const placeholder = document.createElement("div");
    placeholder.className = "li-ext-avatar-placeholder";
    placeholder.textContent = data.name.charAt(0).toUpperCase();
    container.appendChild(placeholder);
  }

  if (data.name) {
    const el = document.createElement("div");
    el.className = "li-ext-name";
    el.textContent = data.name;
    container.appendChild(el);
  }
  if (data.pronouns) {
    const el = document.createElement("div");
    el.className = "li-ext-pronouns";
    el.textContent = data.pronouns;
    container.appendChild(el);
  }
  if (data.subtitle) {
    const el = document.createElement("div");
    el.className = "li-ext-subtitle";
    el.textContent = data.subtitle;
    container.appendChild(el);
  }
  if (data.company) {
    const el = document.createElement("div");
    el.className = "li-ext-company";
    el.textContent = data.company;
    container.appendChild(el);
  }
  if (data.location) {
    const el = document.createElement("div");
    el.className = "li-ext-location";
    el.textContent = data.location;
    container.appendChild(el);
  }
  if (data.isConnection !== null) {
    const el = document.createElement("div");
    el.className = data.isConnection
      ? "li-ext-connection li-ext-connection--yes"
      : "li-ext-connection li-ext-connection--no";
    el.textContent = data.isConnection ? "Connected" : "Not connected";
    container.appendChild(el);
  }
};
