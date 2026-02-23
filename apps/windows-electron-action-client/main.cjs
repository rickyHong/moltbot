const path = require("node:path");
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const screenshot = require("screenshot-desktop");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:8787";
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || "15000");

const SHORTCUT_ACTIONS = [
  { label: "Ctrl + C", value: "Ctrl+C" },
  { label: "Ctrl + V", value: "Ctrl+V" },
  { label: "Ctrl + Z", value: "Ctrl+Z" },
  { label: "Alt + Tab", value: "Alt+Tab" },
  { label: "Win + D", value: "Meta+D" },
];

const MOUSE_ACTIONS = [
  { label: "Left Click", value: "left-click" },
  { label: "Double Click", value: "double-click" },
  { label: "Drag Start", value: "drag-start" },
  { label: "Drag End", value: "drag-end" },
];

const taskState = {
  taskId: `task-${Date.now()}`,
  step: 1,
  lastAction: null,
  lastScreenshot: null,
  lastCheckReply: null,
  history: [],
};

function addHistory(entry) {
  taskState.history.push(entry);
  if (taskState.history.length > 50) {
    taskState.history.shift();
  }
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.round(n);
}

function asJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

function toMenuActionPayload(kind, item, coordinate) {
  return {
    kind,
    label: item.label,
    value: item.value,
    coordinate: {
      x: toInt(coordinate.x),
      y: toInt(coordinate.y),
    },
    createdAt: new Date().toISOString(),
  };
}

function createActionMenuTemplate(webContents, coordinate) {
  const sendAction = (payload) => {
    webContents.send("menu-action-selected", payload);
  };

  return [
    {
      label: `Coordinate: (${toInt(coordinate.x)}, ${toInt(coordinate.y)})`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Create Action",
      submenu: [
        {
          label: "Shortcut Key",
          submenu: SHORTCUT_ACTIONS.map((item) => ({
            label: item.label,
            click: () =>
              sendAction(toMenuActionPayload("shortcut", item, coordinate)),
          })),
        },
        {
          label: "Mouse Action",
          submenu: MOUSE_ACTIONS.map((item) => ({
            label: item.label,
            click: () =>
              sendAction(toMenuActionPayload("mouse", item, coordinate)),
          })),
        },
      ],
    },
  ];
}

function fallbackScreenshotDataUrl(reason) {
  const safeReason = String(reason ?? "unknown").replace(/[<>&"]/g, "_");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#161b22"/><text x="32" y="72" fill="#f0f6fc" font-size="32" font-family="Segoe UI, Arial">Screenshot unavailable</text><text x="32" y="118" fill="#8b949e" font-size="22" font-family="Segoe UI, Arial">${safeReason}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function captureScreenshotDataUrl() {
  try {
    const image = await screenshot({ format: "png" });
    return {
      ok: true,
      dataUrl: `data:image/png;base64,${image.toString("base64")}`,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      dataUrl: fallbackScreenshotDataUrl(error?.message),
      error: error?.message ?? "Failed to capture screenshot",
    };
  }
}

function parseJsonOrText(rawText) {
  if (!rawText) {
    return {};
  }
  try {
    return JSON.parse(rawText);
  } catch {
    return { message: rawText };
  }
}

async function postJson(pathname, payload) {
  const url = new URL(pathname, API_BASE_URL).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const body = {
    taskId: taskState.taskId,
    sentAt: new Date().toISOString(),
    ...payload,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const data = parseJsonOrText(text);
    const success = response.ok && data.success !== false;
    return {
      success,
      status: response.status,
      url,
      requestBody: body,
      data,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      url,
      requestBody: body,
      data: {
        success: false,
        message: error?.message ?? "Failed to call API",
      },
      error: error?.message ?? "Failed to call API",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    title: "Action Task Client",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("moltbot.windows-action-client");
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("capture-screenshot", async () => {
  const screenshotResult = await captureScreenshotDataUrl();
  taskState.lastScreenshot = screenshotResult.dataUrl;
  return screenshotResult;
});

ipcMain.handle("open-action-menu", async (event, coordinate) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return { ok: false };
  }

  const menu = Menu.buildFromTemplate(
    createActionMenuTemplate(event.sender, coordinate ?? { x: 0, y: 0 }),
  );
  menu.popup({ window: win });
  return { ok: true };
});

ipcMain.handle("create-action", async (_event, actionPayload) => {
  const normalizedAction = {
    kind: actionPayload?.kind ?? "unknown",
    label: actionPayload?.label ?? "Unnamed Action",
    value: actionPayload?.value ?? "unknown",
    coordinate: {
      x: toInt(actionPayload?.coordinate?.x),
      y: toInt(actionPayload?.coordinate?.y),
    },
    createdAt: actionPayload?.createdAt ?? new Date().toISOString(),
  };

  taskState.lastAction = normalizedAction;

  // Action preview API is called before execution by design.
  const screenshotResult = await captureScreenshotDataUrl();
  taskState.lastScreenshot = screenshotResult.dataUrl;

  const apiCall = await postJson("/task/action-preview", {
    step: taskState.step,
    action: normalizedAction,
    screenshot: taskState.lastScreenshot,
    executionPhase: "before-execution",
  });

  const response = {
    step: taskState.step,
    action: normalizedAction,
    screenshot: taskState.lastScreenshot,
    screenshotError: screenshotResult.error,
    apiRequest: {
      endpoint: "/task/action-preview",
      url: apiCall.url,
      body: apiCall.requestBody,
    },
    apiResponse: apiCall,
  };

  addHistory({
    type: "action-preview",
    step: taskState.step,
    at: new Date().toISOString(),
    action: normalizedAction,
    success: apiCall.success,
  });

  return response;
});

ipcMain.handle("run-check", async () => {
  if (!taskState.lastAction) {
    return {
      success: false,
      message: "No action selected",
      apiRequest: null,
      apiResponse: null,
      step: taskState.step,
    };
  }

  const screenshotResult = await captureScreenshotDataUrl();
  taskState.lastScreenshot = screenshotResult.dataUrl;

  const apiCall = await postJson("/task/check", {
    step: taskState.step,
    action: taskState.lastAction,
    screenshot: taskState.lastScreenshot,
  });

  taskState.lastCheckReply = apiCall;

  addHistory({
    type: "check",
    step: taskState.step,
    at: new Date().toISOString(),
    success: apiCall.success,
  });

  return {
    success: apiCall.success,
    step: taskState.step,
    screenshot: taskState.lastScreenshot,
    screenshotError: screenshotResult.error,
    apiRequest: {
      endpoint: "/task/check",
      url: apiCall.url,
      body: apiCall.requestBody,
    },
    apiResponse: apiCall,
  };
});

ipcMain.handle("run-next", async () => {
  const previousStep = taskState.step;
  const apiCall = await postJson("/task/next", {
    step: previousStep,
    action: taskState.lastAction,
    checkResponse: taskState.lastCheckReply?.data ?? null,
    screenshot: taskState.lastScreenshot,
  });

  if (apiCall.success) {
    taskState.step += 1;
    taskState.lastAction = null;
    taskState.lastCheckReply = null;
  }

  addHistory({
    type: "next",
    step: previousStep,
    nextStep: taskState.step,
    at: new Date().toISOString(),
    success: apiCall.success,
  });

  return {
    success: apiCall.success,
    previousStep,
    step: taskState.step,
    apiRequest: {
      endpoint: "/task/next",
      url: apiCall.url,
      body: apiCall.requestBody,
    },
    apiResponse: apiCall,
  };
});

ipcMain.handle("run-done", async () => {
  const apiCall = await postJson("/task/done", {
    finalStep: taskState.step,
    action: taskState.lastAction,
    checkResponse: taskState.lastCheckReply?.data ?? null,
    history: taskState.history,
  });

  addHistory({
    type: "done",
    step: taskState.step,
    at: new Date().toISOString(),
    success: apiCall.success,
  });

  return {
    success: apiCall.success,
    step: taskState.step,
    apiRequest: {
      endpoint: "/task/done",
      url: apiCall.url,
      body: apiCall.requestBody,
    },
    apiResponse: apiCall,
  };
});

ipcMain.handle("get-state", async () => asJSON(taskState));
