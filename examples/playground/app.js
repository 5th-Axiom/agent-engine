const $ = (id) => document.getElementById(id);
const state = {
  config: null,
  sessionId: null,
  view: null,
  sending: false,
  canceling: false,
  pending: null,
  pollFailed: false,
};
const labels = {
  queued: "排队中",
  running: "生成中",
  recovering: "恢复中",
  awaiting_input: "等待输入",
  awaiting_tool_resolution: "等待核验",
  completed: "已完成",
  failed: "执行失败",
  cancelled: "已停止",
};
const opLabels = {
  planned: "等待调用",
  dispatching: "调用中",
  succeeded: "已完成",
  failed: "调用失败",
  not_executed: "未执行",
  outcome_unknown: "结果待核验",
};
const messages = {
  RUN_ORDER_UNAVAILABLE:
    "旧会话的受理顺序记录已不可用，请新建对话；仍可打开 Debug 查看保留的元数据。",
  MODEL_AUTH_FAILED: "模型鉴权失败，请在本地凭据文件中更新密钥并重启服务。",
  MODEL_OUTPUT_LIMIT:
    "输出达到模型上限。本次运行未完成，可在新消息中要求更简短的回答。",
  MODEL_TIMEOUT: "模型响应超时，可以重新发送消息。",
  MODEL_RATE_LIMITED: "模型服务限流，请稍后重新发送。",
  SESSION_BUSY: "当前会话还有运行中的任务，请等待或停止生成。",
  DATA_RETENTION_EXPIRED: "这段会话已超过保留期，请新建对话。",
  LOCAL_SESSION_REQUIRED: "本地服务已重启，请刷新页面重新连接。",
  INVALID_INPUT: "消息不能为空，且最多为 8000 个字符。",
  LOCAL_ORIGIN_REQUIRED: "请通过启动命令显示的本地地址访问页面。",
  MODEL_PROVIDER_ERROR: "模型服务暂时不可用，可以稍后再试。",
  MODEL_PROTOCOL_ERROR: "模型响应格式不符合预期，可打开 Debug 查看记录。",
  NETWORK_ERROR: "连接中断。请确认本地服务仍在运行后重新连接。",
};
const isActive = (r) =>
  r && !["completed", "failed", "cancelled"].includes(r.state);
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
async function api(path, value) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(15000),
      ...(value === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-agent-playground": "1",
            },
            body: JSON.stringify(value),
          }),
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.code || "LOCAL_SERVER_ERROR");
  return data;
}
function feedback(error, reconnect = false) {
  $("feedback").hidden = false;
  $("feedback-text").textContent =
    `${messages[error.message] || "操作未完成，请重试或查看 Debug。"} (${error.message})`;
  $("reconnect").hidden = !reconnect;
}
function clearFeedback() {
  $("feedback").hidden = true;
}
function updateControls() {
  const active = !!state.view?.activeRun || state.sending;
  $("send").disabled =
    !state.config || active || !$("prompt").value.trim() || state.pollFailed;
  $("send").textContent = state.sending ? "提交中…" : "发送消息";
  $("cancel").hidden = !state.view?.activeRun;
  $("cancel").disabled =
    state.canceling || !!state.view?.runs.at(-1)?.cancelRequested;
  $("cancel").textContent = $("cancel").disabled ? "正在停止…" : "停止生成";
  $("model").disabled = !state.config || !!state.sessionId || state.sending;
  $("scenario").disabled = !!state.sessionId || state.sending;
  $("new-session").disabled = !state.config || state.sending;
  $("prompt").disabled = !state.config;
  $("session-lock").hidden = !state.sessionId;
  $("input-count").textContent = $("prompt").value.length;
}
function profileHint() {
  const profile = state.config?.profiles.find((p) => p.id === $("model").value);
  $("model-hint").textContent = profile
    ? `${profile.model} · ${profile.thinking ? "思考模式" : "普通模式"} · 最多 ${profile.maxOutputTokens} 输出 Token`
    : "模型配置不可用。";
  $("scenario-hint").textContent =
    $("scenario").value === "tool"
      ? "模型可调用只读演示库存工具。结果为合成数据。"
      : "直接与所选模型对话。";
}
async function loadSessions() {
  const sessions = await api("/api/sessions");
  $("history-empty").hidden = sessions.length > 0;
  $("sessions").replaceChildren(
    ...sessions.map((s) => {
      const button = node("button", s.title);
      button.type = "button";
      button.setAttribute("aria-current", String(s.id === state.sessionId));
      button.append(
        node("small", `${s.profile}${s.active ? " · 运行中" : ""}`),
      );
      button.addEventListener("click", () => openSession(s.id).catch(feedback));
      const li = node("li");
      li.append(button);
      return li;
    }),
  );
}
function setURL(id) {
  if (id) sessionStorage.setItem("agent-playground-session", id);
  else sessionStorage.removeItem("agent-playground-session");
  history.replaceState(
    null,
    "",
    id ? `/?session=${encodeURIComponent(id)}` : "/",
  );
}
function resetView() {
  state.view = null;
  renderView();
  $("conversation-title").textContent = "新对话";
  $("conversation-meta").textContent = "选择模型，开始一次测试。";
  $("session-debug").hidden = true;
  $("detail-debug").href = "/debug/";
}
async function openSession(id) {
  if (state.sending) return;
  state.sessionId = id;
  state.pending = null;
  resetView();
  updateControls();
  setURL(id);
  clearFeedback();
  await refresh();
  await loadSessions();
  $("messages").scrollTop = $("messages").scrollHeight;
  if (matchMedia("(max-width: 850px)").matches) $("settings").open = false;
}
function renderView() {
  const view = state.view;
  const runs = view?.runs || [];
  $("welcome").hidden = runs.length > 0;
  const scroll = $("messages");
  const atEnd =
    scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 90;
  const signature = JSON.stringify(
    runs.map(({ id, input, output, draft, state, error, cancelRequested }) => ({
      id,
      input,
      output,
      draft,
      state,
      error,
      cancelRequested,
    })),
  );
  if ($("turns").dataset.signature !== signature) {
    $("turns").dataset.signature = signature;
    $("turns").replaceChildren(
      ...runs.map((r) => {
        const turn = node("article", undefined, "turn");
        const user = node("div", undefined, "user-message");
        user.append(
          node("p", "你", "message-label"),
          node("p", r.input, "message-text"),
        );
        const assistant = node("div", undefined, "assistant-message");
        assistant.append(node("p", "Agent", "message-label"));
        const output = node("div", r.output || r.draft, "message-text");
        output.dataset.role = "answer";
        assistant.append(output);
        const status = r.error
          ? `${messages[r.error.code] || "执行失败，可打开 Debug 查看原因。"} (${r.error.code})`
          : r.cancelRequested && isActive(r)
            ? "正在等待取消确认…"
            : isActive(r)
              ? r.draft
                ? "生成中 · 当前内容尚未提交"
                : "等待模型输出…"
              : labels[r.state];
        assistant.append(
          node("p", status, `turn-status${r.error ? " error" : ""}`),
        );
        turn.append(user, assistant);
        return turn;
      }),
    );
    if (atEnd) scroll.scrollTop = scroll.scrollHeight;
  }
  const latest = runs.at(-1);
  $("run-state").textContent = latest
    ? latest.cancelRequested && isActive(latest)
      ? "正在停止…"
      : labels[latest.state]
    : "尚未开始";
  $("run-id").hidden = !latest;
  $("run-id").textContent = latest?.id || "";
  $("attempt-count").textContent = latest?.attempts ?? "—";
  $("step-count").textContent = latest?.steps ?? "—";
  for (const key of ["input", "output", "total"])
    $("usage-" + key).textContent =
      latest?.usage.knownTotals[key]?.toLocaleString() ?? "—";
  $("usage-note").textContent = !latest?.attempts
    ? "运行后显示供应商报告的用量。"
    : latest.usage.complete
      ? "Token 总量已确认。迟到用量仍会更新。"
      : "用量尚不完整；未报告的字段显示为 —。";
  const costs = Object.entries(latest?.usage.costByCurrency || {});
  $("cost-note").textContent = costs.length
    ? costs
        .map(
          ([currency, value]) =>
            `估算 ${value.estimated} ${currency}${value.complete ? "" : "（不完整）"}`,
        )
        .join("；")
    : "费用未配置，不显示估算。";
  const operations = latest?.operations || [];
  $("tool-empty").hidden = operations.length > 0;
  $("operations").replaceChildren(
    ...operations.map((op) => {
      const li = node("li");
      li.append(
        node("code", op.name),
        node(
          "span",
          `${opLabels[op.state] || op.state}${op.validation === "valid" ? " · 结果校验通过" : ""}`,
        ),
      );
      return li;
    }),
  );
  if (view) {
    $("model").value = view.profile;
    $("scenario").value = view.scenario;
    $("conversation-title").textContent =
      view.scenario === "tool" ? "工具调用测试" : "自由对话";
    $("conversation-meta").textContent =
      `${view.model} · ${view.totalRuns} 次运行${view.totalRuns > 50 ? " · 展示最近 50 次" : ""}`;
    $("session-debug").href = view.debugURL;
    $("session-debug").hidden = false;
    $("detail-debug").href = view.debugURL;
  }
  profileHint();
  updateControls();
}
let refreshSequence = 0;
async function refresh() {
  const ticket = ++refreshSequence;
  if (!state.sessionId) return;
  const id = state.sessionId;
  const view = await api(`/api/sessions/${id}`);
  if (id !== state.sessionId || ticket !== refreshSequence) return;
  const wasActive = state.view?.activeRun;
  if (state.pollFailed) clearFeedback();
  state.view = view;
  state.pollFailed = false;
  $("connection").textContent = "本地已连接";
  renderView();
  if (wasActive && !view.activeRun) await loadSessions();
}
async function send(event) {
  event.preventDefault();
  if ($("send").disabled) return;
  const input = $("prompt").value.trim();
  if (!state.pending || state.pending.input !== input)
    state.pending = {
      input,
      requestId: crypto.randomUUID(),
      createId: crypto.randomUUID(),
    };
  const pending = state.pending;
  state.sending = true;
  updateControls();
  clearFeedback();
  try {
    if (!state.sessionId) {
      const result = await api("/api/sessions", {
        requestId: pending.createId,
        profile: $("model").value,
        scenario: $("scenario").value,
      });
      state.sessionId = result.id;
      setURL(result.id);
    }
    await api(`/api/sessions/${state.sessionId}/runs`, {
      requestId: pending.requestId,
      input,
    });
    state.pending = null;
    $("prompt").value = "";
    await refresh();
    await loadSessions();
    $("messages").scrollTop = $("messages").scrollHeight;
    if (matchMedia("(max-width: 850px)").matches) $("settings").open = false;
  } catch (error) {
    feedback(error, error.message === "NETWORK_ERROR");
  } finally {
    state.sending = false;
    updateControls();
    $("prompt").focus();
  }
}
$("composer").addEventListener("submit", send);
$("prompt").addEventListener("input", updateControls);
$("prompt").addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.isComposing &&
    (event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault();
    $("composer").requestSubmit();
  }
});
$("model").addEventListener("change", profileHint);
$("scenario").addEventListener("change", profileHint);
$("new-session").addEventListener("click", () => {
  state.sessionId = null;
  state.pending = null;
  state.pollFailed = false;
  setURL(null);
  resetView();
  clearFeedback();
  updateControls();
  loadSessions().catch(feedback);
  $("prompt").focus();
});
$("cancel").addEventListener("click", async () => {
  const runId = state.view?.activeRun;
  if (!runId || state.canceling) return;
  state.canceling = true;
  updateControls();
  try {
    await api(`/api/sessions/${state.sessionId}/cancel`, { runId });
    await refresh();
  } catch (error) {
    feedback(error);
  } finally {
    state.canceling = false;
    updateControls();
  }
});
$("reconnect").addEventListener("click", () => location.reload());
document.querySelectorAll("[data-example]").forEach((button) =>
  button.addEventListener("click", () => {
    $("prompt").value = button.dataset.example;
    updateControls();
    $("prompt").focus();
  }),
);
document.querySelector("[data-tool-example]").addEventListener("click", () => {
  if (!state.sessionId) $("scenario").value = "tool";
  $("prompt").value = "请查询 DEMO-1 的库存，并告诉我还有多少件。";
  profileHint();
  updateControls();
  $("prompt").focus();
});
if (matchMedia("(max-width: 850px)").matches) $("settings").open = false;
async function poll() {
  try {
    if (state.sessionId && !state.sending) await refresh();
  } catch (error) {
    state.pollFailed = true;
    $("connection").textContent = "连接中断";
    feedback(error, true);
    updateControls();
  } finally {
    setTimeout(poll, state.view?.activeRun ? 450 : 2500);
  }
}
async function init() {
  try {
    state.config = await api("/api/config");
    $("model").replaceChildren(
      ...state.config.profiles.map((p) => {
        const option = node("option", p.id);
        option.value = p.id;
        return option;
      }),
    );
    $("model").value = state.config.defaultProfile;
    $("connection").textContent = "本地已连接";
    profileHint();
    updateControls();
    await loadSessions();
    const id =
      new URL(location.href).searchParams.get("session") ||
      sessionStorage.getItem("agent-playground-session");
    if (id && /^[a-f0-9-]{36}$/.test(id)) await openSession(id);
  } catch (error) {
    $("connection").textContent = "连接失败";
    feedback(error, true);
  }
  poll();
}
init();
