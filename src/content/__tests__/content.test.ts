jest.mock("../../shared/profileCache", () => ({
  resolveImage: jest.fn(),
}));

jest.mock("../../shared/profileFetcher", () => ({
  fetchProfileData: jest.fn(),
}));

jest.mock("../hoverPopup", () => ({
  injectStyles: jest.fn(),
  renderPopup: jest.fn(),
  hidePopup: jest.fn(),
}));

jest.mock("../../shared/helpers", () => ({
  loadExtensionState: jest.fn(),
  normalizeProfileUrl: jest.fn(),
  isSuppressedLink: jest.fn(),
}));

jest.mock("../../shared/viewerCache", () => ({
  getViewerUsername: jest.fn(),
}));

type ExtensionState = {
  devMode: boolean;
  popupsEnabled: boolean;
  highlighting: boolean;
  telemetryLogging: boolean;
  pendingInstallLogTime: string | null;
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const makeProfileUrl = (username: string): string => `https://www.linkedin.com/in/${username}`;

const createLink = (username: string): HTMLAnchorElement => {
  const link = document.createElement("a");
  link.href = makeProfileUrl(username);
  link.textContent = username;
  document.body.appendChild(link);
  return link;
};

const invokeDocumentListener = async (
  listener: EventListenerOrEventListenerObject | undefined,
  event: Event,
): Promise<void> => {
  if (!listener) {
    throw new Error("Expected document listener");
  }
  if (typeof listener === "function") {
    await listener(event);
    return;
  }
  listener.handleEvent(event);
};

const makeMouseEvent = (type: string, target: EventTarget): MouseEvent => {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "target", { value: target });
  return event;
};

const loadContentModule = async (
  stateOverrides: Partial<ExtensionState> = {},
  setupDom?: () => void,
) => {
  jest.resetModules();
  jest.useFakeTimers();
  document.body.innerHTML = "";
  setupDom?.();

  const currentState: ExtensionState = {
    devMode: false,
    popupsEnabled: true,
    highlighting: false,
    telemetryLogging: false,
    pendingInstallLogTime: null,
    ...stateOverrides,
  };

  const setMock = jest.fn().mockResolvedValue(undefined);
  const sendMessageMock = jest.fn().mockResolvedValue({ ok: false });
  const addListenerMock = jest.fn();
  const documentListeners: Record<string, EventListenerOrEventListenerObject> = {};
  const addDocumentListenerMock = jest.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      documentListeners[type] = listener;
    },
  );
  const observeMock = jest.fn();
  let mutationCallback: MutationCallback | null = null;

  class MockMutationObserver {
    constructor(callback: MutationCallback) {
      mutationCallback = callback;
    }

    observe = observeMock;

    disconnect = jest.fn();

    takeRecords = (): MutationRecord[] => [];
  }

  globalThis.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;
  document.addEventListener = addDocumentListenerMock as typeof document.addEventListener;
  globalThis.chrome = {
    runtime: {
      id: "test-extension-id",
      sendMessage: sendMessageMock,
      onMessage: { addListener: addListenerMock },
    },
    storage: {
      local: {
        set: setMock,
      },
    },
  } as unknown as typeof chrome;

  const helpers = await import("../../shared/helpers");
  const viewerCache = await import("../../shared/viewerCache");
  const hoverPopup = await import("../hoverPopup");
  const profileFetcher = await import("../../shared/profileFetcher");
  const profileCache = await import("../../shared/profileCache");

  const loadExtensionStateMock = jest.mocked(helpers.loadExtensionState);
  const normalizeProfileUrlMock = jest.mocked(helpers.normalizeProfileUrl);
  const isSuppressedLinkMock = jest.mocked(helpers.isSuppressedLink);
  const getViewerUsernameMock = jest.mocked(viewerCache.getViewerUsername);
  const renderPopupMock = jest.mocked(hoverPopup.renderPopup);
  const hidePopupMock = jest.mocked(hoverPopup.hidePopup);
  const injectStylesMock = jest.mocked(hoverPopup.injectStyles);
  const fetchProfileDataMock = jest.mocked(profileFetcher.fetchProfileData);
  const resolveImageMock = jest.mocked(profileCache.resolveImage);

  loadExtensionStateMock.mockImplementation(async () => currentState);
  normalizeProfileUrlMock.mockImplementation((href: string) => {
    const match = href.match(/linkedin\.com\/in\/([^/?#]+)/) ?? href.match(/^\/in\/([^/?#]+)/);
    return match ? `https://www.linkedin.com/in/${match[1]}` : null;
  });
  isSuppressedLinkMock.mockReturnValue(false);
  getViewerUsernameMock.mockResolvedValue(null);
  fetchProfileDataMock.mockResolvedValue({
    name: "Jane Doe",
    imgSrc: null,
    pronouns: null,
    subtitle: null,
    company: null,
    location: null,
    isConnection: true,
  });
  resolveImageMock.mockResolvedValue(null as unknown as string);

  const content = await import("../content");
  await flushPromises();

  return {
    content,
    currentState,
    setMock,
    sendMessageMock,
    addListenerMock,
    documentListeners,
    observeMock,
    mutationCallback,
    normalizeProfileUrlMock,
    isSuppressedLinkMock,
    getViewerUsernameMock,
    renderPopupMock,
    hidePopupMock,
    injectStylesMock,
    fetchProfileDataMock,
    resolveImageMock,
  };
};

describe("content.ts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sends the install log message when telemetry is opted in", async () => {
    const setup = await loadContentModule({
      pendingInstallLogTime: "2026-04-21T12:00:00.000Z",
      telemetryLogging: true,
    });
    setup.getViewerUsernameMock.mockResolvedValue("janedoe");
    setup.sendMessageMock.mockResolvedValue({ ok: true });

    await setup.content.maybeLogInstall();

    expect(setup.sendMessageMock).toHaveBeenCalledWith({
      type: "logInstall",
      username: "janedoe",
      installedAt: "2026-04-21T12:00:00.000Z",
    });
  });

  it("skips the install log message when telemetry is not opted in", async () => {
    const setup = await loadContentModule({
      pendingInstallLogTime: "2026-04-21T12:00:00.000Z",
      telemetryLogging: false,
    });
    setup.getViewerUsernameMock.mockResolvedValue("janedoe");

    await setup.content.maybeLogInstall();

    expect(setup.sendMessageMock).not.toHaveBeenCalled();
  });

  it("leaves pendingInstallLogTime unchanged when the API submission fails", async () => {
    const setup = await loadContentModule({
      pendingInstallLogTime: "2026-04-21T12:00:00.000Z",
      telemetryLogging: true,
    });
    setup.getViewerUsernameMock.mockResolvedValue("janedoe");
    setup.sendMessageMock.mockResolvedValue({ ok: false });

    await setup.content.maybeLogInstall();

    expect(setup.sendMessageMock).toHaveBeenCalledWith({
      type: "logInstall",
      username: "janedoe",
      installedAt: "2026-04-21T12:00:00.000Z",
    });
    expect(setup.setMock).not.toHaveBeenCalledWith({ pendingInstallLogTime: "completed" });
  });

  it("returns early when there is no pending install log timestamp or username", async () => {
    const noTimestamp = await loadContentModule();
    await noTimestamp.content.maybeLogInstall();
    expect(noTimestamp.sendMessageMock).not.toHaveBeenCalled();

    const noUsername = await loadContentModule({
      pendingInstallLogTime: "2026-04-21T12:00:00.000Z",
    });
    noUsername.getViewerUsernameMock.mockResolvedValue(null);
    await noUsername.content.maybeLogInstall();
    expect(noUsername.sendMessageMock).not.toHaveBeenCalled();
  });

  it("applies highlight styles only to valid profile links", async () => {
    const setup = await loadContentModule();
    const validLink = createLink("janedoe");
    const invalidLink = document.createElement("a");
    invalidLink.href = "https://www.linkedin.com/feed/";
    document.body.appendChild(invalidLink);

    setup.normalizeProfileUrlMock.mockImplementation((href: string) => {
      if (href.includes("/in/janedoe")) {
        return makeProfileUrl("janedoe");
      }
      return null;
    });

    setup.content.applyHighlight();

    expect(validLink.style.backgroundColor).toBe("rgb(204, 229, 255)");
    expect(validLink.getAttribute("data-li-ext-highlighted")).toBe("1");
    expect(invalidLink.getAttribute("data-li-ext-highlighted")).toBeNull();
  });

  it("skips suppressed links during highlighting", async () => {
    const setup = await loadContentModule();
    const link = createLink("janedoe");
    setup.isSuppressedLinkMock.mockReturnValue(true);

    setup.content.applyHighlight();

    expect(link.getAttribute("data-li-ext-highlighted")).toBeNull();
  });

  it("re-evaluates current page profile URL after history navigation", async () => {
    const setup = await loadContentModule();
    createLink("janedoe");

    setup.normalizeProfileUrlMock.mockImplementation((href: string) => {
      if (href === location.href) {
        const match = new URL(href).pathname.match(/^\/in\/([^/?#]+)/);
        return match ? makeProfileUrl(match[1]) : null;
      }
      const linkMatch =
        href.match(/linkedin\.com\/in\/([^/?#]+)/) ?? href.match(/^\/in\/([^/?#]+)/);
      return linkMatch ? makeProfileUrl(linkMatch[1]) : null;
    });

    setup.isSuppressedLinkMock.mockReturnValue(false);

    history.pushState({}, "", "/in/janedoe");
    setup.content.applyHighlight();
    const firstCurrentPageArg =
      setup.isSuppressedLinkMock.mock.calls[setup.isSuppressedLinkMock.mock.calls.length - 1]?.[1];

    history.pushState({}, "", "/in/johnsmith");
    setup.content.applyHighlight();
    const secondCurrentPageArg =
      setup.isSuppressedLinkMock.mock.calls[setup.isSuppressedLinkMock.mock.calls.length - 1]?.[1];

    expect(firstCurrentPageArg).toBe(makeProfileUrl("janedoe"));
    expect(secondCurrentPageArg).toBe(makeProfileUrl("johnsmith"));
  });

  it("removes highlight styles and hides the popup", async () => {
    const setup = await loadContentModule();
    const link = createLink("janedoe");
    link.style.backgroundColor = "rgb(204, 229, 255)";
    link.style.borderRadius = "4px";
    link.style.padding = "1px 3px";
    link.setAttribute("data-li-ext-highlighted", "1");

    setup.content.removeHighlight();

    expect(link.style.backgroundColor).toBe("");
    expect(link.style.borderRadius).toBe("");
    expect(link.style.padding).toBe("");
    expect(link.hasAttribute("data-li-ext-highlighted")).toBe(false);
    expect(setup.hidePopupMock).toHaveBeenCalled();
  });

  it("renders popup content and logs a profile view on hover", async () => {
    const setup = await loadContentModule({ telemetryLogging: true });
    const card = document.createElement("li");
    const img = document.createElement("img");
    img.src = "https://media.licdn.com/dms/image/test";
    const link = document.createElement("a");
    link.href = makeProfileUrl("janedoe");
    link.textContent = "janedoe";
    card.appendChild(img);
    card.appendChild(link);
    document.body.appendChild(card);
    const target = document.createElement("span");
    link.appendChild(target);

    setup.getViewerUsernameMock.mockResolvedValue("viewer1");
    setup.resolveImageMock.mockResolvedValue("resolved-image");
    setup.fetchProfileDataMock.mockResolvedValue({
      name: "Jane Doe",
      imgSrc: null,
      pronouns: null,
      subtitle: "Engineer",
      company: "Acme",
      location: "Seattle",
      isConnection: true,
    });

    await invokeDocumentListener(
      setup.documentListeners.mouseover,
      makeMouseEvent("mouseover", target),
    );
    await flushPromises();
    await jest.advanceTimersByTimeAsync(350);
    await flushPromises();

    expect(setup.renderPopupMock).toHaveBeenNthCalledWith(
      1,
      {
        name: "",
        imgSrc: "https://media.licdn.com/dms/image/test",
        pronouns: null,
        subtitle: null,
        company: null,
        location: null,
        isConnection: null,
      },
      link,
    );
    expect(setup.renderPopupMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "Jane Doe",
        imgSrc: "resolved-image",
        isConnection: true,
      }),
      link,
    );
    expect(setup.sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "logProfileView",
        viewerUsername: "viewer1",
        viewedUsername: "janedoe",
        isConnected: true,
      }),
    );
  });

  it("does not log a profile view when telemetry logging is disabled", async () => {
    const setup = await loadContentModule({ telemetryLogging: false });
    const card = document.createElement("li");
    const img = document.createElement("img");
    img.src = "https://media.licdn.com/dms/image/test";
    const link = document.createElement("a");
    link.href = makeProfileUrl("janedoe");
    link.textContent = "janedoe";
    card.appendChild(img);
    card.appendChild(link);
    document.body.appendChild(card);

    setup.getViewerUsernameMock.mockResolvedValue("viewer1");
    setup.resolveImageMock.mockResolvedValue("resolved-image");
    setup.fetchProfileDataMock.mockResolvedValue({
      name: "Jane Doe",
      imgSrc: null,
      pronouns: null,
      subtitle: null,
      company: null,
      location: null,
      isConnection: true,
    });

    await invokeDocumentListener(
      setup.documentListeners.mouseover,
      makeMouseEvent("mouseover", link),
    );
    await flushPromises();
    await jest.advanceTimersByTimeAsync(350);
    await flushPromises();

    expect(setup.renderPopupMock).toHaveBeenCalled();
    expect(setup.sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "logProfileView" }),
    );
  });

  it("does not fetch hover data when popups are disabled, the target is not a link, or the link is suppressed", async () => {
    const disabled = await loadContentModule({ popupsEnabled: false });
    await invokeDocumentListener(
      disabled.documentListeners.mouseover,
      makeMouseEvent("mouseover", document.body),
    );
    await flushPromises();
    expect(disabled.fetchProfileDataMock).not.toHaveBeenCalled();

    const noLink = await loadContentModule();
    await invokeDocumentListener(
      noLink.documentListeners.mouseover,
      makeMouseEvent("mouseover", document.body),
    );
    await flushPromises();
    expect(noLink.fetchProfileDataMock).not.toHaveBeenCalled();

    const suppressed = await loadContentModule();
    suppressed.isSuppressedLinkMock.mockReturnValue(true);
    const suppressedLink = createLink("janedoe");
    await invokeDocumentListener(
      suppressed.documentListeners.mouseover,
      makeMouseEvent("mouseover", suppressedLink),
    );
    await flushPromises();
    expect(suppressed.fetchProfileDataMock).not.toHaveBeenCalled();
  });

  it("hides the popup when hover fetch fails", async () => {
    const setup = await loadContentModule();
    const link = createLink("janedoe");
    setup.fetchProfileDataMock.mockRejectedValue(new Error("fetch failed"));

    await invokeDocumentListener(
      setup.documentListeners.mouseover,
      makeMouseEvent("mouseover", link),
    );
    await flushPromises();
    await jest.advanceTimersByTimeAsync(350);
    await flushPromises();

    expect(setup.hidePopupMock).toHaveBeenCalled();
  });

  it("skips profile view logging when connection state or usernames are unavailable", async () => {
    const setup = await loadContentModule();
    const link = createLink("janedoe");
    setup.getViewerUsernameMock.mockResolvedValue(null);
    setup.fetchProfileDataMock.mockResolvedValue({
      name: "Jane Doe",
      imgSrc: null,
      pronouns: null,
      subtitle: null,
      company: null,
      location: null,
      isConnection: null,
    });

    await invokeDocumentListener(
      setup.documentListeners.mouseover,
      makeMouseEvent("mouseover", link),
    );
    await flushPromises();
    await jest.advanceTimersByTimeAsync(350);
    await flushPromises();

    expect(setup.sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "logProfileView" }),
    );
  });

  it("clears hover state and hides the popup on mouseout from a profile link", async () => {
    const setup = await loadContentModule();
    const link = createLink("janedoe");

    await invokeDocumentListener(
      setup.documentListeners.mouseout,
      makeMouseEvent("mouseout", link),
    );

    expect(setup.hidePopupMock).toHaveBeenCalled();
  });

  it("runs the mutation observer callback and reapplies highlight when highlighting is enabled", async () => {
    const setup = await loadContentModule({ highlighting: true });
    const link = createLink("janedoe");

    expect(setup.observeMock).toHaveBeenCalledWith(document.body, {
      childList: true,
      subtree: true,
    });
    if (!setup.mutationCallback) {
      throw new Error("Expected mutation observer callback");
    }
    const mutationCallback = setup.mutationCallback as MutationCallback;
    await mutationCallback([], {} as MutationObserver);

    expect(link.getAttribute("data-li-ext-highlighted")).toBe("1");
  });

  it("applies highlight on init when devMode and highlighting are enabled", async () => {
    const setup = await loadContentModule({ devMode: true, highlighting: true }, () => {
      createLink("janedoe");
    });

    const highlightedLink = document.querySelector("a") as HTMLAnchorElement;
    expect(highlightedLink.getAttribute("data-li-ext-highlighted")).toBe("1");
    expect(setup.injectStylesMock).toHaveBeenCalled();
  });

  it("handles runtime messages for highlight, popups, and dev mode", async () => {
    const setup = await loadContentModule();
    const link = createLink("janedoe");
    link.setAttribute("data-li-ext-highlighted", "1");
    link.style.backgroundColor = "rgb(204, 229, 255)";
    link.style.borderRadius = "4px";
    link.style.padding = "1px 3px";

    const listener = setup.addListenerMock.mock.calls[0][0] as (
      message: { action: string; enabled: boolean },
      sender: unknown,
      sendResponse: (value: unknown) => void,
    ) => Promise<boolean | void>;
    const sendResponse = jest.fn();

    await listener({ action: "setHighlight", enabled: true }, {}, sendResponse);
    await listener({ action: "setPopups", enabled: false }, {}, sendResponse);
    await listener({ action: "toggleDevMode", enabled: false }, {}, sendResponse);

    expect(setup.setMock).toHaveBeenCalledWith({ highlighting: true });
    expect(setup.setMock).toHaveBeenCalledWith({ popupsEnabled: false });
    expect(setup.setMock).toHaveBeenCalledWith({ devMode: false });
    expect(setup.hidePopupMock).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ enabled: true });
    expect(sendResponse).toHaveBeenCalledWith({ enabled: false });
  });

  it("ignores runtime messages when the extension context is stale", async () => {
    const setup = await loadContentModule();
    delete (globalThis.chrome.runtime as { id?: string }).id;
    const listener = setup.addListenerMock.mock.calls[0][0] as (
      message: { action: string; enabled: boolean },
      sender: unknown,
      sendResponse: (value: unknown) => void,
    ) => Promise<boolean | void>;
    const sendResponse = jest.fn();

    await listener({ action: "setHighlight", enabled: true }, {}, sendResponse);

    expect(setup.setMock).not.toHaveBeenCalledWith({ highlighting: true });
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
