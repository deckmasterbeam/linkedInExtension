type ExtensionState = {
  devMode: boolean;
  popupsEnabled: boolean;
  highlighting: boolean;
};

export const loadExtensionState = async (): Promise<ExtensionState> => {
  const result = await chrome.storage.local.get(["devMode", "popupsEnabled", "highlighting"]);
  if (result.devMode === undefined) {
    chrome.storage.local.set({ devMode: false });
  }
  if (result.popupsEnabled === undefined) {
    chrome.storage.local.set({ popupsEnabled: true });
  }
  if (result.highlighting === undefined) {
    chrome.storage.local.set({ highlighting: false });
  }
  return {
    devMode: result.devMode ?? false,
    popupsEnabled: result.popupsEnabled ?? true,
    highlighting: result.highlighting ?? false,
  };
};
