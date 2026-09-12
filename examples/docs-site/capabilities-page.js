const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
const link = (text, href) => {
  const a = node("a", text);
  a.href = href;
  return a;
};
const button = (text, fn) => {
  const b = node("button", text, "button");
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
};
const date = (value) => new Date(value).toLocaleString("zh-CN");
const details = (title, value) => {
  const d = node("details", undefined, "cap-details"),
    p = node(
      "pre",
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    );
  p.tabIndex = 0;
  d.append(node("summary", title), p);
  return d;
};
const status = $("cap-status"),
  aborts = new AbortController();
let catalog,
  selected = "overview",
  reportId,
  requestId,
  disposed = false,
  unauthenticated = false,
  identityGeneration = 0,
  debugGeneration = 0;
const deniedSessions = new Set();
function showError(error, suffix = "") {
  if (disposed || error.name === "AbortError") return;
  status.replaceChildren(
    explain(unauthenticated ? { code: "CHAT_UNAUTHENTICATED" } : error) +
      (unauthenticated ? "" : suffix),
  );
  if (unauthenticated)
    status.append(
      " ",
      button("重新连接", () => location.reload()),
    );
}
function forgetIdentity() {
  unauthenticated = true;
  identityGeneration++;
  debugGeneration++;
  catalog = reportId = requestId = undefined;
  deniedSessions.clear();
  for (const id of [
    "memory-list",
    "debug-result",
    "debug-select",
    "experiment-history",
    "experiment-result",
    "experiment-select",
    "cap-overview",
  ])
    $(id).replaceChildren();
  $("experiment-description").textContent = "";
  for (const control of document.querySelectorAll(
    ".cap-main button,.cap-main input,.cap-main select",
  ))
    control.disabled = true;
  showError({ code: "CHAT_UNAUTHENTICATED" });
}
function explain(error) {
  const messages = {
    CHAT_UNAUTHENTICATED:
      "浏览器身份已过期。请返回文档助手重新连接，再打开工作台。",
    ACCESS_DENIED:
      "无法读取这条记录。请确认它属于当前浏览器身份，然后刷新列表。",
    MEMORY_VERSION_CONFLICT: "记忆已被其他页面更新，请刷新后重试。",
    CONFIG_VERSION_CONFLICT: "记录已变化，请刷新后重试。",
    ENGINE_BUSY: "已有实验正在运行或已达到频率限制，请稍后重试。",
    RUN_ALREADY_ACTIVE: "会话仍在运行，请回到对话中完成或停止本轮。",
    HOST_RESTARTED: "实验期间服务重启，未确认执行结果。请重新运行。",
  };
  return messages[error.code] ?? "暂时无法完成操作，请重试。";
}
async function api(path = "", data) {
  if (unauthenticated)
    throw Object.assign(new Error(), { code: "CHAT_UNAUTHENTICATED" });
  const generation = identityGeneration;
  const r = await fetch("/api/docs-capabilities" + path, {
    method: data ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: aborts.signal,
    ...(data
      ? {
          headers: { "content-type": "application/json", "x-agent-chat": "1" },
          body: JSON.stringify(data),
        }
      : {}),
  });
  const body = await r.json();
  if (generation !== identityGeneration || unauthenticated)
    throw new DOMException("Stale identity response", "AbortError");
  if (!r.ok) {
    const e = Object.assign(new Error(), { code: body.error?.code });
    if (r.status === 401) forgetIdentity();
    else if (r.status === 403) {
      identityGeneration++;
      if (path.startsWith("/sessions")) {
        debugGeneration++;
        $("debug-result").replaceChildren();
        const id = /^\/sessions\/([a-f0-9-]{36})$/.exec(path)?.[1];
        if (id) {
          deniedSessions.add(id);
          for (const option of $("debug-select").options)
            if (option.value === id) option.remove();
          void sessions().catch(showError);
        } else $("debug-select").replaceChildren();
      } else if (path.startsWith("/experiments")) {
        reportId = undefined;
        $("experiment-history").replaceChildren();
        $("experiment-result").replaceChildren();
        if (/^\/experiments\//.test(path)) void history().catch(showError);
      } else if (path.startsWith("/memories"))
        $("memory-list").replaceChildren();
    }
    throw e;
  }
  return body;
}
const themeButton = document.querySelector(".theme-button");
function themeLabel() {
  themeButton.setAttribute(
    "aria-label",
    document.documentElement.dataset.theme === "dark"
      ? "切换浅色模式"
      : "切换深色模式",
  );
}
themeButton.addEventListener("click", () => {
  const mode =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem("agent-docs-theme", mode);
  } catch {}
  themeLabel();
});
themeLabel();
function row(title, description, href, id) {
  const r = node("div", undefined, "cap-row"),
    name = node("div");
  name.append(node("h3", title));
  if (id) name.append(node("code", id));
  r.append(name, node("p", description), link("接入方法", href));
  return r;
}
function group(title, rows) {
  const g = node("section", undefined, "cap-group");
  g.append(node("h2", title), ...rows);
  return g;
}
function overview() {
  const target = $("cap-overview");
  target.replaceChildren(
    group("对话与交互", [
      row(
        "对话、图片与过程",
        "模型与思考模式、图片输入、Skill 选择、工具过程、继续对话和取消运行。图片随所选模型能力启用。",
        "/docs/frontend/",
      ),
      row(
        "问题、表单与审批",
        "助手可以提出问题、收集接入表单。写入长期记忆时，先展示内容并等待你确认。",
        "/docs/docs-site/",
      ),
      row(
        "配置与会话调试",
        "从聊天右上角打开配置，按会话选择能力；在工作台查看 Run 与配置快照。",
        "/docs/debug/",
      ),
    ]),
    group(
      "工具",
      catalog.tools.map((t) =>
        row(
          t.label,
          t.description + " 执行方式：" + t.executor + "。",
          "/docs/tools/",
          t.name,
        ),
      ),
    ),
    group("Skill 与资料", [
      ...catalog.skills.map((s) =>
        row(
          s.name,
          s.description + " 加载方式：" + s.source + "。",
          "/docs/skills/",
          s.id,
        ),
      ),
      ...catalog.knowledge.map((k) =>
        row(
          k.name,
          "通过 SDK KnowledgeBase 检索，返回可追踪的来源标识。",
          "/docs/knowledge/",
          k.id,
        ),
      ),
      row(
        "跨会话偏好记忆",
        "按当前浏览器身份隔离；用户确认后保存。存储：" + catalog.storage + "。",
        "/docs/memory/",
      ),
    ]),
    group("配置与可靠性", [
      row(
        "配置实验",
        "结构化输出、引用、重试、备用模型、预算、上下文整理、配置冻结、事件和会话生命周期。",
        "/docs/docs-site/",
      ),
      row(
        "进程恢复与依赖校验",
        "标准启动器使用 PostgreSQL。崩溃恢复、依赖变化和协议恢复使用独立数据库的自动验收，避免中断正在使用的文档服务。",
        "/docs/rules/",
      ),
      row(
        "能力边界",
        "尚未实现的语音转写保持禁用。CLI、安装包和压缩包分发仍保留为待确定的产品形态。",
        "/docs/installation/",
      ),
    ]),
  );
}
async function memory() {
  const target = $("memory-list");
  target.replaceChildren(node("p", "正在读取记忆…", "cap-empty"));
  const { items } = await api("/memories");
  target.replaceChildren();
  if (!items.length)
    target.append(
      node(
        "p",
        "还没有保存记忆。可以回到对话中说“请记住我的接入偏好”，确认后会显示在这里。",
        "cap-empty",
      ),
    );
  for (const item of items) {
    const r = node("article", undefined, "cap-memory"),
      meta = node("div", undefined, "cap-memory-meta");
    r.append(node("p", item.content));
    meta.append(
      node(
        "span",
        "版本 " + item.version + " · " + date(item.expiresAt) + " 到期",
      ),
    );
    const remove = button("删除", () => {
      if (r.querySelector(".cap-confirm")) return;
      const confirmation = node("div", undefined, "cap-confirm");
      confirmation.append(
        node("p", "删除这条长期记忆？已存在于历史对话中的内容会保留。"),
      );
      const yes = button("确认删除", async () => {
        yes.disabled = true;
        try {
          await api("/memories/delete", { id: item.id, version: item.version });
          const index = [...target.children].indexOf(r);
          await memory();
          const remaining = target.querySelectorAll(".cap-memory button");
          (
            remaining[Math.min(index, remaining.length - 1)] ??
            $("memory-refresh")
          ).focus();
          status.textContent = "已删除这条长期记忆。";
        } catch (e) {
          showError(e);
          yes.disabled = unauthenticated;
        }
      });
      confirmation.append(
        yes,
        button("保留", () => {
          confirmation.remove();
          remove.focus();
        }),
      );
      r.append(confirmation);
      yes.focus();
    });
    meta.append(remove);
    r.append(meta);
    target.append(r);
  }
}
function configureExperiment() {
  const example = catalog.experiments.find(
    (e) => e.id === $("experiment-select").value,
  );
  $("experiment-description").textContent = example.description;
  $("experiment-option").hidden = !example.option;
  $("experiment-option").querySelector("span").textContent =
    example.option ?? "";
  $("experiment-enabled").checked = true;
  $("experiment-doc").href = "/docs/" + example.doc + "/";
  requestId = undefined;
}
function showReport(report) {
  const target = $("experiment-result");
  if (report.state === "running") {
    target.replaceChildren(
      node("h3", "正在执行实验…"),
      node("p", "正在收集 SDK 返回的事件与检查结果。"),
    );
    return;
  }
  if (report.state === "failed") {
    target.replaceChildren(
      node("h3", "实验未完成"),
      node("p", explain({ code: report.error })),
    );
    return;
  }
  const r = report.result;
  target.replaceChildren(
    node("h3", r.passed ? "检查通过" : "发现差异"),
    node(
      "p",
      (catalog.experiments.find((e) => e.id === r.id)?.title ?? r.id) +
        " · " +
        date(report.createdAt),
    ),
  );
  const list = node("ul", undefined, "cap-checks");
  for (const c of r.checks) {
    const li = node("li");
    li.dataset.passed = String(c.passed);
    li.append(
      node("strong", c.passed ? "符合" : "差异"),
      node("span", c.label),
    );
    list.append(li);
  }
  target.append(list);
  if (r.error)
    target.append(
      node(
        "p",
        "本次 Run 返回：" + r.error + "。请结合上方预期检查判断。",
        "cap-note",
      ),
    );
  target.append(
    details("检查数据", r.checks),
    details("本次输出", r.result),
    details(
      "执行事件（" + r.events.length + "）",
      r.events.map((e) => ({
        sequence: e.sequence,
        type: e.type,
        data: e.data,
      })),
    ),
    details("生效配置", r.config),
    details("调试快照", r.snapshot),
    details("Usage、Trace 与日志", r.telemetry),
  );
}
async function history() {
  const { items } = await api("/experiments");
  const target = $("experiment-history");
  target.replaceChildren();
  if (!items.length) target.append(node("p", "还没有实验记录。", "cap-empty"));
  for (const item of items) {
    const r = node("div", undefined, "cap-report-row"),
      text = node("div");
    text.append(
      node(
        "div",
        catalog.experiments.find((e) => e.id === item.input.id)?.title ??
          item.input.id,
      ),
      node(
        "p",
        date(item.createdAt) +
          " · " +
          (item.state === "running"
            ? "运行中"
            : item.state === "failed"
              ? "未完成"
              : item.passed
                ? "检查通过"
                : "发现差异"),
      ),
    );
    r.append(
      text,
      button("查看", async () => {
        try {
          await watch(item.id);
        } catch (e) {
          showError(e);
        }
      }),
    );
    target.append(r);
  }
}
async function watch(id) {
  reportId = id;
  for (let n = 0; n < 60; n++) {
    const report = await api("/experiments/" + id);
    if (reportId !== id || disposed) return;
    showReport(report);
    if (report.state !== "running") return;
    await new Promise((r) => setTimeout(r, 500));
  }
  status.textContent = "实验仍在执行，可从最近记录中再次查看。";
}
$("experiment-select").addEventListener("change", configureExperiment);
$("experiment-enabled").addEventListener("change", () => {
  requestId = undefined;
});
$("experiment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = $("experiment-run");
  b.disabled = true;
  $("experiment-select").disabled = true;
  $("experiment-enabled").disabled = true;
  status.textContent = "";
  requestId ??= crypto.randomUUID();
  try {
    const report = await api("/experiments", {
      id: $("experiment-select").value,
      enabled: $("experiment-enabled").checked,
      requestId,
    });
    await watch(report.id);
    requestId = undefined;
    await history();
  } catch (error) {
    showError(error, " 重试会使用同一请求标识，避免重复执行。");
  } finally {
    b.disabled = unauthenticated;
    $("experiment-select").disabled = unauthenticated;
    $("experiment-enabled").disabled = unauthenticated;
  }
});
async function sessions() {
  const generation = ++debugGeneration,
    choice =
      $("debug-select").value ||
      new URL(location.href).searchParams.get("session"),
    { items } = await api("/sessions");
  if (generation !== debugGeneration) return;
  const select = $("debug-select");
  select.replaceChildren(
    new Option(items.length ? "请选择会话" : "当前身份下没有会话", ""),
  );
  for (const item of items.filter((item) => !deniedSessions.has(item.id)))
    select.append(
      new Option(
        (item.archived ? "已归档 · " : "") +
          item.title +
          " · " +
          date(item.createdAt),
        item.id,
      ),
    );
  if (items.some((i) => i.id === choice && !deniedSessions.has(i.id))) {
    select.value = choice;
    await debug();
  } else
    $("debug-result").replaceChildren(
      node("p", "在这里选择一个会话，查看实际运行记录。", "cap-empty"),
    );
}
async function debug() {
  const sid = $("debug-select").value,
    generation = ++debugGeneration,
    target = $("debug-result");
  target.replaceChildren();
  if (!sid) return;
  target.append(node("p", "正在读取调试快照…"));
  const response = await api("/sessions/" + sid);
  if (generation !== debugGeneration) return;
  const snap = response.snapshot;
  target.replaceChildren();
  const summary = node("div", undefined, "cap-summary"),
    dl = node("dl");
  for (const [label, value] of [
    ["配置版本", snap.session.version],
    ["运行次数", snap.runs.length],
    ["状态", snap.session.archived ? "已归档" : "可用"],
  ]) {
    const item = node("div");
    item.append(node("dt", label), node("dd", String(value)));
    dl.append(item);
  }
  summary.append(dl, link("打开会话配置", "/ai/settings/?session=" + sid));
  target.append(
    summary,
    details("Run、步骤与用量", snap.runs),
    details("工具操作", snap.operations),
    details("事件记录", snap.events ?? snap.recentEvents),
    details("当前生效配置", response.configuration),
    details("完整调试快照", snap),
  );
  const actions = node("div", undefined, "cap-actions");
  const mutate = async (action, b) => {
    b.disabled = true;
    try {
      await api("/sessions/" + sid, { action });
      await sessions();
      (action === "delete"
        ? $("debug-select")
        : (target.querySelector(".cap-actions button") ?? $("debug-select"))
      ).focus();
      status.textContent =
        action === "delete" ? "已删除该会话。" : "已更新会话归档状态。";
    } catch (e) {
      showError(e);
      b.disabled = unauthenticated;
    }
  };
  const archive = button(snap.session.archived ? "取消归档" : "归档会话", () =>
    mutate(snap.session.archived ? "unarchive" : "archive", archive),
  );
  actions.append(
    archive,
    button("删除会话", (event) => {
      const trigger = event.currentTarget;
      if (target.querySelector(".cap-confirm")) return;
      const confirmation = node("div", undefined, "cap-confirm");
      confirmation.append(
        node(
          "p",
          "删除该会话和运行记录？长期记忆独立保存，可在“长期记忆”中管理。",
        ),
      );
      const yes = button("确认删除会话", () => mutate("delete", yes));
      confirmation.append(
        yes,
        button("保留会话", () => {
          confirmation.remove();
          trigger.focus();
        }),
      );
      target.append(confirmation);
      yes.focus();
    }),
  );
  target.append(actions);
}
$("debug-select").addEventListener("change", () =>
  debug().catch((e) => showError(e)),
);
$("debug-refresh").addEventListener("click", () =>
  sessions().catch((e) => showError(e)),
);
$("memory-refresh").addEventListener("click", () =>
  memory().catch((e) => showError(e)),
);
async function navigate() {
  const key = location.hash.slice(1);
  selected = ["overview", "memory", "experiments", "debug"].includes(key)
    ? key
    : "overview";
  for (const panel of document.querySelectorAll(".cap-panel"))
    panel.hidden = panel.id !== selected;
  for (const a of document.querySelectorAll(".cap-nav a")) {
    if (a.hash === "#" + selected) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  if (!catalog) return;
  status.textContent = "";
  try {
    if (selected === "memory") await memory();
    else if (selected === "experiments") await history();
    else if (selected === "debug") await sessions();
  } catch (e) {
    showError(e);
  }
}
window.addEventListener("hashchange", navigate);
if (document.body.dataset.chatAvailable === "true") {
  try {
    catalog = await api();
    overview();
    for (const e of catalog.experiments)
      $("experiment-select").append(new Option(e.title, e.id));
    configureExperiment();
    status.textContent = "";
    await navigate();
  } catch (e) {
    showError(e);
    if (!unauthenticated)
      status.append(
        " ",
        button("重新连接", () => location.reload()),
      );
  }
} else {
  for (const button of document.querySelectorAll(
    ".cap-main button,.cap-main select",
  ))
    button.disabled = true;
  await navigate();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    disposed = true;
    aborts.abort();
  }
});
