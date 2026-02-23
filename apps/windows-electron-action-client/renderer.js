const screenshotImage = document.getElementById("screenshotImage");
const screenshotMeta = document.getElementById("screenshotMeta");
const requestMessage = document.getElementById("apiRequestMessage");
const responseMessage = document.getElementById("apiResponseMessage");
const stepValue = document.getElementById("stepValue");
const actionValue = document.getElementById("actionValue");
const statusValue = document.getElementById("statusValue");
const logValue = document.getElementById("logValue");

const checkButton = document.getElementById("checkButton");
const nextButton = document.getElementById("nextButton");
const doneButton = document.getElementById("doneButton");
const screenshotPanel = document.getElementById("screenshotPanel");

const uiState = {
  step: 1,
  action: null,
  busy: false,
};

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function appendLog(message) {
  const now = new Date().toLocaleTimeString("en-US", { hour12: false });
  const current = logValue.textContent.trim();
  const line = `[${now}] ${message}`;
  logValue.textContent = current ? `${current}\n${line}` : line;
  logValue.scrollTop = logValue.scrollHeight;
}

function setStatus(text) {
  statusValue.textContent = text;
}

function setStep(step) {
  uiState.step = step;
  stepValue.textContent = String(step);
}

function setActionLabel(action) {
  if (!action) {
    actionValue.textContent = "none";
    return;
  }
  const coord = `(${action.coordinate.x}, ${action.coordinate.y})`;
  actionValue.textContent = `${action.kind} | ${action.label} | ${coord}`;
}

function setRequestResponse(request, response) {
  requestMessage.textContent = request ? pretty(request) : "{}";
  responseMessage.textContent = response ? pretty(response) : "{}";
}

function setButtons({ check, next, done }) {
  checkButton.disabled = !check;
  nextButton.disabled = !next;
  doneButton.disabled = !done;
}

function disableAllButtons() {
  setButtons({ check: false, next: false, done: false });
}

function setBusy(isBusy) {
  uiState.busy = isBusy;
  if (isBusy) {
    checkButton.dataset.label = checkButton.textContent;
    nextButton.dataset.label = nextButton.textContent;
    doneButton.dataset.label = doneButton.textContent;
    checkButton.textContent = "Working...";
    nextButton.textContent = "Working...";
    doneButton.textContent = "Working...";
  } else {
    checkButton.textContent = "Check";
    nextButton.textContent = "Next";
    doneButton.textContent = "Done";
  }
}

function updateScreenshot(result) {
  if (!result) {
    return;
  }
  if (result.dataUrl) {
    screenshotImage.src = result.dataUrl;
  } else if (result.screenshot) {
    screenshotImage.src = result.screenshot;
  }
  if (result.error || result.screenshotError) {
    screenshotMeta.textContent = `Capture fallback: ${result.error ?? result.screenshotError}`;
  } else {
    screenshotMeta.textContent = `Captured at ${new Date().toLocaleTimeString("en-US", {
      hour12: false,
    })}`;
  }
}

async function handleActionCreated(action) {
  if (uiState.busy) {
    return;
  }

  try {
    setBusy(true);
    const createResult = await window.taskClient.createAction(action);
    uiState.action = createResult.action;
    setActionLabel(uiState.action);
    updateScreenshot({ screenshot: createResult.screenshot, screenshotError: createResult.screenshotError });
    setRequestResponse(createResult.apiRequest, createResult.apiResponse);

    // Once an action is created, Check is enabled.
    setButtons({ check: true, next: false, done: true });
    setStatus("Action created. Click Check to validate this step.");
    appendLog(`Action created (${action.label}) and preview API called before execution.`);
  } catch (error) {
    setStatus("Failed to create action.");
    appendLog(`Create action error: ${error?.message ?? error}`);
  } finally {
    setBusy(false);
  }
}

async function handleCheckClick() {
  if (uiState.busy) {
    return;
  }
  if (!uiState.action) {
    setStatus("Select an action first.");
    appendLog("Check blocked: no selected action.");
    return;
  }

  try {
    setBusy(true);
    const checkResult = await window.taskClient.runCheck();
    setRequestResponse(checkResult.apiRequest, checkResult.apiResponse);
    updateScreenshot({
      screenshot: checkResult.screenshot,
      screenshotError: checkResult.screenshotError,
    });

    if (checkResult.success) {
      // On success, only Next becomes active.
      setButtons({ check: false, next: true, done: true });
      setStatus("Check success. Click Next to continue.");
      appendLog(`Check success on step ${uiState.step}.`);
    } else {
      disableAllButtons();
      setStatus("Check failed. All buttons are now disabled.");
      appendLog(`Check failed on step ${uiState.step}.`);
    }
  } catch (error) {
    disableAllButtons();
    setStatus("Check failed due to runtime error.");
    appendLog(`Check runtime error: ${error?.message ?? error}`);
  } finally {
    setBusy(false);
  }
}

async function handleNextClick() {
  if (uiState.busy) {
    return;
  }

  try {
    setBusy(true);
    const nextResult = await window.taskClient.runNext();
    setRequestResponse(nextResult.apiRequest, nextResult.apiResponse);

    if (nextResult.success) {
      setStep(nextResult.step);
      uiState.action = null;
      setActionLabel(null);
      setButtons({ check: false, next: false, done: true });
      setStatus("Step moved forward. Create the next action.");
      appendLog(`Moved from step ${nextResult.previousStep} to step ${nextResult.step}.`);
    } else {
      disableAllButtons();
      setStatus("Next failed. All buttons are now disabled.");
      appendLog("Next failed and controls were locked.");
    }
  } catch (error) {
    disableAllButtons();
    setStatus("Next failed due to runtime error.");
    appendLog(`Next runtime error: ${error?.message ?? error}`);
  } finally {
    setBusy(false);
  }
}

async function handleDoneClick() {
  if (uiState.busy) {
    return;
  }

  try {
    setBusy(true);
    const doneResult = await window.taskClient.runDone();
    setRequestResponse(doneResult.apiRequest, doneResult.apiResponse);
    disableAllButtons();

    if (doneResult.success) {
      setStatus("Task finished.");
      appendLog(`Done API called successfully at step ${doneResult.step}.`);
    } else {
      setStatus("Done API call failed. Task controls remain locked.");
      appendLog("Done API failed.");
    }
  } catch (error) {
    disableAllButtons();
    setStatus("Done failed due to runtime error.");
    appendLog(`Done runtime error: ${error?.message ?? error}`);
  } finally {
    setBusy(false);
  }
}

async function bootstrap() {
  setButtons({ check: false, next: false, done: true });
  setStatus("Loading initial state...");

  const state = await window.taskClient.getState();
  setStep(state.step ?? 1);
  setActionLabel(null);

  const capture = await window.taskClient.captureScreenshot();
  updateScreenshot(capture);
  setStatus("Ready. Right-click on screenshot to create an action.");
  appendLog("App initialized.");

  window.taskClient.onMenuActionSelected((action) => {
    handleActionCreated(action);
  });
}

screenshotPanel.addEventListener("contextmenu", async (event) => {
  event.preventDefault();
  if (uiState.busy) {
    return;
  }
  await window.taskClient.openActionMenu({
    x: event.clientX,
    y: event.clientY,
  });
});

checkButton.addEventListener("click", handleCheckClick);
nextButton.addEventListener("click", handleNextClick);
doneButton.addEventListener("click", handleDoneClick);

bootstrap();
