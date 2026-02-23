const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("taskClient", {
  captureScreenshot: () => ipcRenderer.invoke("capture-screenshot"),
  openActionMenu: (coordinate) => ipcRenderer.invoke("open-action-menu", coordinate),
  createAction: (action) => ipcRenderer.invoke("create-action", action),
  runCheck: () => ipcRenderer.invoke("run-check"),
  runNext: () => ipcRenderer.invoke("run-next"),
  runDone: () => ipcRenderer.invoke("run-done"),
  getState: () => ipcRenderer.invoke("get-state"),
  onMenuActionSelected: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("menu-action-selected", listener);
    return () => ipcRenderer.removeListener("menu-action-selected", listener);
  },
});
