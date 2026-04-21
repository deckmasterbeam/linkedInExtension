import type { ProfileData } from "../shared/profileCache";
import { renderProfileContent } from "../shared/profileCard";

export const injectStyles = (): void => {
  if (document.getElementById("li-ext-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "li-ext-styles";
  style.textContent = `
    #li-ext-popup {
      position: fixed;
      z-index: 99999;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
      padding: 18px 16px 14px;
      width: 240px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border-top: 4px solid #0a66c2;
    }
    #li-ext-popup.visible { display: flex; }
    .li-ext-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #0a66c2;
    }
    .li-ext-avatar-placeholder {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #cce5ff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      color: #0a66c2;
      font-weight: 700;
    }
    .li-ext-name {
      font-weight: 700;
      font-size: 15px;
      color: #1d1d1d;
      text-align: center;
    }
    .li-ext-pronouns {
      font-size: 11px;
      color: #888;
      text-align: center;
      margin-top: -2px;
    }
    .li-ext-subtitle {
      font-size: 12px;
      color: #555;
      text-align: center;
      line-height: 1.4;
    }
    .li-ext-company {
      font-size: 12px;
      font-weight: 600;
      color: #0a66c2;
      text-align: center;
    }
    .li-ext-location {
      font-size: 11px;
      color: #888;
      text-align: center;
    }
    .li-ext-connection {
      font-size: 11px;
      font-weight: 600;
      border-radius: 12px;
      padding: 2px 10px;
      margin-top: 2px;
    }
    .li-ext-connection--yes {
      background: #e6f4ea;
      color: #057642;
    }
    .li-ext-connection--no {
      background: #f0f0f0;
      color: #888;
    }
    .li-ext-loading {
      font-size: 12px;
      color: #999;
    }
  `;
  document.head.appendChild(style);
};

const getOrCreatePopup = (): HTMLDivElement => {
  let popup = document.getElementById("li-ext-popup") as HTMLDivElement | null;
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "li-ext-popup";
    document.body.appendChild(popup);
  }
  return popup;
};

const positionPopup = (popup: HTMLDivElement, link: HTMLAnchorElement): void => {
  const rect = link.getBoundingClientRect();
  const popupW = 240;
  const popupH = 220;

  let top = rect.top - popupH - 10;
  if (top < 8) {
    top = rect.bottom + 10;
  }

  let left = rect.left + rect.width / 2 - popupW / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
};

export const renderPopup = (data: ProfileData | null, link: HTMLAnchorElement): void => {
  const popup = getOrCreatePopup();
  while (popup.firstChild) popup.removeChild(popup.firstChild);

  if (!data) {
    const loading = document.createElement("span");
    loading.className = "li-ext-loading";
    loading.textContent = "Loading...";
    popup.appendChild(loading);
  } else {
    renderProfileContent(popup, data);
  }

  positionPopup(popup, link);
  popup.classList.add("visible");
};

export const hidePopup = (): void => {
  document.getElementById("li-ext-popup")?.classList.remove("visible");
};
