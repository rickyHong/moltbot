import express from "express";

const app = express();
app.use(express.json({ limit: "40mb" }));

const tasks = new Map();

function getTask(taskId) {
  if (!tasks.has(taskId)) {
    tasks.set(taskId, {
      step: 1,
      history: [],
      done: false,
    });
  }
  return tasks.get(taskId);
}

function hasScreenshot(payload) {
  return typeof payload?.screenshot === "string" && payload.screenshot.startsWith("data:image/");
}

function hasCoordinate(payload) {
  return (
    Number.isFinite(payload?.action?.coordinate?.x) &&
    Number.isFinite(payload?.action?.coordinate?.y)
  );
}

function appendHistory(task, event, payload) {
  task.history.push({
    event,
    at: new Date().toISOString(),
    step: payload?.step ?? payload?.finalStep ?? null,
    action: payload?.action?.label ?? null,
  });
}

app.post("/task/action-preview", (req, res) => {
  const payload = req.body;
  const task = getTask(payload.taskId);
  appendHistory(task, "action-preview", payload);

  if (!payload?.action?.label) {
    return res.status(400).json({
      success: false,
      message: "Action label is required",
    });
  }

  return res.json({
    success: true,
    message: `Action preview stored for step ${payload.step}`,
    action: payload.action,
    hasScreenshot: hasScreenshot(payload),
  });
});

app.post("/task/check", (req, res) => {
  const payload = req.body;
  const task = getTask(payload.taskId);
  appendHistory(task, "check", payload);

  if (!hasScreenshot(payload) || !hasCoordinate(payload)) {
    return res.status(400).json({
      success: false,
      message: "Screenshot and action coordinate are required",
    });
  }

  if (payload?.action?.value === "Alt+Tab") {
    return res.json({
      success: false,
      message: "Mock fail rule: Alt+Tab is blocked in this demo",
      next: false,
    });
  }

  return res.json({
    success: true,
    message: `Step ${payload.step} check success`,
    next: true,
    includeInNext: {
      approvedAction: payload.action,
      approvedAt: new Date().toISOString(),
    },
  });
});

app.post("/task/next", (req, res) => {
  const payload = req.body;
  const task = getTask(payload.taskId);
  appendHistory(task, "next", payload);

  if (payload?.checkResponse?.success === false) {
    return res.status(400).json({
      success: false,
      message: "Cannot move next when check failed",
    });
  }

  task.step += 1;
  return res.json({
    success: true,
    message: `Moved to step ${task.step}`,
    step: task.step,
    previousStepPayload: payload,
  });
});

app.post("/task/done", (req, res) => {
  const payload = req.body;
  const task = getTask(payload.taskId);
  appendHistory(task, "done", payload);
  task.done = true;

  return res.json({
    success: true,
    message: `Task ${payload.taskId} finished`,
    finalStep: payload.finalStep,
    historyCount: task.history.length,
  });
});

const port = Number(process.env.MOCK_API_PORT || "8787");
app.listen(port, () => {
  console.log(`Mock API server running on http://127.0.0.1:${port}`);
});
