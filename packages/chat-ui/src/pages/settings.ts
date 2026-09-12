import {
  ChatError,
  equalChatPreferences,
  errorCode,
  type ChatPreferences,
  type ChatSettings,
  type ChatTransport,
} from "@agent-runtime/chat-core";
import {
  createButton,
  createIcon,
  element,
  type ChatIcon,
} from "../atoms/index.js";
import { applyChatTheme, type ChatThemeOptions } from "../tokens/index.js";
import { installChatStyles } from "../styles.js";
import { explainChatError } from "../copy.js";

export interface ChatSettingsPageOptions {
  transport: ChatTransport;
  sessionId: string;
  theme?: ChatThemeOptions;
  styleNonce?: string;
  /** Documentation URLs for capabilities that the host has not connected. */
  helpLinks?: Partial<
    Record<"tools" | "skills" | "knowledge" | "memory", string>
  >;
}
export function mountChatSettingsPage(
  target: HTMLElement,
  options: ChatSettingsPageOptions,
) {
  const host = element("div");
  host.style.height = "100%";
  host.dataset.agentChat = "";
  host.dataset.presentation = "settings";
  const shadow = host.attachShadow({ mode: "open" });
  installChatStyles(shadow, options.styleNonce);
  const theme = applyChatTheme(host, options.theme);
  target.append(host);
  const lifetime = new AbortController();
  const root = element("section", "ae-settings");
  root.setAttribute("aria-label", "会话配置");
  const header = element("header", "ae-settings-header");
  const subtitle = element("p", "ae-settings-subtitle", "正在读取当前会话…");
  header.append(element("h1", "", "会话配置"), subtitle);
  const banner = element("p", "ae-settings-banner");
  banner.hidden = true;
  const notice = element("div", "ae-settings-notice");
  notice.setAttribute("role", "status");
  const reload = createButton({
    label: "重新载入配置",
    onClick: () => {
      void load();
    },
  });
  reload.hidden = true;
  const layout = element("div", "ae-settings-layout");
  const nav = element("nav", "ae-settings-nav");
  nav.setAttribute("aria-label", "配置分类");
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-orientation", "vertical");
  const main = element("div", "ae-settings-content");
  const panels = new Map<string, HTMLElement>(),
    tabs = new Map<string, HTMLButtonElement>();
  let currentTab = "tools",
    data: ChatSettings | undefined,
    draft: ChatPreferences | undefined,
    busy = false,
    loading = false,
    unavailable = false,
    dirty = false;
  const footer = element("footer", "ae-settings-footer");
  const saveState = element("span", "ae-settings-save-state", "读取后即可调整");
  saveState.setAttribute("role", "status");
  const reset = createButton({
    label: "恢复助手默认",
    onClick: () => {
      if (!data || busy) return;
      draft = structuredClone(data.defaults);
      render();
      sync();
    },
  });
  const save = createButton({
    label: "保存配置",
    variant: "primary",
    onClick: () => {
      void persist();
    },
  });
  footer.append(saveState, reset, save);
  layout.append(nav, main);
  root.append(header, banner, notice, reload, layout, footer);
  shadow.append(root);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnload);
  const names: Array<[string, string, ChatIcon]> = [
    ["tools", "工具", "tool"],
    ["skills", "Skill", "skill"],
    ["memory", "知识与记忆", "memory"],
    ["response", "回答与上下文", "chat"],
  ];
  const activate = (id: string, focus = false) => {
    currentTab = id;
    for (const [key, tab] of tabs) {
      tab.setAttribute("aria-selected", String(key === id));
      tab.tabIndex = key === id ? 0 : -1;
      panels.get(key)!.hidden = key !== id;
    }
    if (focus) tabs.get(id)?.focus();
  };
  for (const [id, label, icon] of names) {
    const tab = createButton({
      label,
      icon,
      variant: "quiet",
      onClick: () => activate(id),
    });
    tab.setAttribute("role", "tab");
    tab.id = "settings-tab-" + id;
    const panel = element("section", "ae-settings-panel");
    panel.id = "settings-panel-" + id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("keydown", (event) => {
      const index = names.findIndex((n) => n[0] === id);
      let next = index;
      if (event.key === "ArrowDown" || event.key === "ArrowRight")
        next = (index + 1) % names.length;
      else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
        next = (index + names.length - 1) % names.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = names.length - 1;
      else return;
      event.preventDefault();
      activate(names[next]![0], true);
    });
    tabs.set(id, tab);
    panels.set(id, panel);
    nav.append(tab);
    main.append(panel);
  }
  activate(currentTab);
  function sync() {
    dirty = !!data && !!draft && !equalChatPreferences(draft, data.preferences);
    save.disabled = busy || !dirty || !data?.editable;
    reset.disabled = busy || !data?.editable;
    save.querySelector("span")!.textContent = busy
      ? loading
        ? "正在读取…"
        : "正在保存…"
      : "保存配置";
    saveState.textContent = busy
      ? loading
        ? "正在读取配置"
        : "正在确认保存结果"
      : unavailable
        ? "旧配置已不可用"
        : dirty
          ? "有未保存的修改"
          : data
            ? "所有修改已保存"
            : "读取后即可调整";
    root.setAttribute("aria-busy", String(busy));
    for (const input of main.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("input,select"))
      input.disabled =
        busy || !data?.editable || input.dataset.locked === "true";
  }
  function accessUnavailable(error: unknown) {
    return (
      (error instanceof ChatError && [401, 403].includes(error.status ?? 0)) ||
      [
        "CHAT_UNAUTHENTICATED",
        "ACCESS_DENIED",
        "CHAT_SETTINGS_DISABLED",
        "CHAT_ASSISTANT_UNAVAILABLE",
      ].includes(errorCode(error))
    );
  }
  function invalidateAccess(error: unknown) {
    if (!accessUnavailable(error)) return;
    data = undefined;
    draft = undefined;
    unavailable = true;
    layout.hidden = true;
    banner.hidden = true;
    subtitle.textContent = "当前无法访问此会话配置";
    for (const panel of panels.values()) panel.replaceChildren();
  }
  function toggle(
    title: string,
    description: string,
    checked: boolean,
    locked: boolean,
    change: (value: boolean) => void,
  ) {
    const row = element("label", "ae-settings-row");
    const copy = element("span", "ae-settings-row-copy");
    copy.append(
      element("strong", "", title),
      element("span", "ae-settings-description", description),
    );
    const input = element("input", "ae-settings-switch");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.setAttribute("aria-label", title);
    input.checked = checked;
    input.dataset.locked = String(locked);
    input.addEventListener("change", () => {
      change(input.checked);
      notice.replaceChildren();
      sync();
    });
    row.append(copy, input);
    return row;
  }
  function section(id: string, title: string, description: string) {
    const panel = panels.get(id)!;
    panel.replaceChildren(
      element("h2", "", title),
      element("p", "ae-settings-description ae-settings-intro", description),
    );
    return panel;
  }
  function help(
    panel: HTMLElement,
    kind: keyof NonNullable<ChatSettingsPageOptions["helpLinks"]>,
  ) {
    const href = options.helpLinks?.[kind];
    if (!href) return;
    try {
      const url = new URL(href, location.href);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password)
        return;
      const link = element("a", "ae-settings-help", "查看接入文档");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      panel.append(link);
    } catch {}
  }
  function search(panel: HTMLElement, list: HTMLElement, placeholder: string) {
    const label = element("label", "ae-settings-search");
    label.append(element("span", "ae-visually-hidden", placeholder));
    const input = element("input");
    input.type = "search";
    input.placeholder = placeholder;
    label.append(createIcon("search"), input);
    const empty = element(
      "p",
      "ae-settings-description",
      "没有匹配的项目，试试其他名称。",
    );
    empty.hidden = true;
    input.addEventListener("input", () => {
      const value = input.value.trim().toLocaleLowerCase();
      let shown = 0;
      for (const row of list.children) {
        const el = row as HTMLElement;
        el.hidden = !el.textContent?.toLocaleLowerCase().includes(value);
        if (!el.hidden) shown++;
      }
      empty.hidden = shown !== 0;
    });
    panel.append(label, list, empty);
  }
  const setIds = (
    key: "enabledTools" | "enabledSkills" | "enabledKnowledgeBases",
    id: string,
    value: boolean,
  ) => {
    if (!draft) return;
    draft[key] = value
      ? [...draft[key], id]
      : draft[key].filter((v) => v !== id);
  };
  function render() {
    if (!data || !draft) return;
    subtitle.textContent = `${data.assistantLabel} · 仅当前会话 · 配置 v${data.configVersion}`;
    banner.hidden = !data.active;
    banner.textContent = "本轮正在运行。保存用于后续发言，本轮继续使用原配置。";
    const tools = section(
      "tools",
      "工具",
      `已接入 ${data.tools.length} 个工具。启用后由助手按需调用，执行权限由服务端决定。`,
    );
    if (!data.tools.length) {
      tools.append(
        element(
          "p",
          "ae-settings-empty",
          "还没有接入工具。添加工具后，可以在这里逐项启用。",
        ),
      );
      help(tools, "tools");
    } else {
      const list = element("div", "ae-settings-list");
      for (const tool of data.tools) {
        const locked = tool.permission === "deny";
        list.append(
          toggle(
            tool.label ?? tool.name,
            [
              tool.description,
              tool.sideEffect === "write" ? "可写操作" : "只读操作",
              locked
                ? "宿主禁止使用"
                : tool.permission === "require-approval"
                  ? "调用时需确认"
                  : undefined,
            ]
              .filter(Boolean)
              .join(" · "),
            draft.enabledTools.includes(tool.name),
            locked,
            (v) => setIds("enabledTools", tool.name, v),
          ),
        );
      }
      search(tools, list, "搜索工具名称或介绍");
    }
    const skills = section(
      "skills",
      "Skill",
      `已接入 ${data.skills.length} 个 Skill。启用后，助手可按需加载，也可在输入框中单独选择。`,
    );
    if (!data.skills.length) {
      skills.append(
        element(
          "p",
          "ae-settings-empty",
          "尚未接入 Skill。先在服务端声明技能，再来选择要启用的项目。",
        ),
      );
      help(skills, "skills");
    } else {
      const list = element("div", "ae-settings-list");
      for (const skill of data.skills)
        list.append(
          toggle(
            skill.label,
            [
              skill.description,
              `允许使用 ${skill.allowedTools.length} 个已声明工具；工具开关仍生效`,
            ]
              .filter(Boolean)
              .join(" · "),
            draft.enabledSkills.includes(skill.id),
            false,
            (v) => setIds("enabledSkills", skill.id, v),
          ),
        );
      search(skills, list, "搜索 Skill 名称或介绍");
    }
    const memory = section(
      "memory",
      "知识与记忆",
      "知识库提供参考资料；跨会话记忆用于读取或保存此前积累的信息。它们与当前聊天记录分开管理。",
    );
    memory.append(element("h3", "", "知识库"));
    if (!data.knowledgeBases.length) {
      memory.append(
        element(
          "p",
          "ae-settings-empty",
          "尚未接入知识库。通过工具搜索文档的能力，可在“工具”中调整。",
        ),
      );
      help(memory, "knowledge");
    }
    for (const kb of data.knowledgeBases)
      memory.append(
        toggle(
          kb.label,
          kb.description ?? "允许助手查询此知识库。",
          draft.enabledKnowledgeBases.includes(kb.id),
          false,
          (v) => setIds("enabledKnowledgeBases", kb.id, v),
        ),
      );
    memory.append(element("h3", "", "跨会话记忆"));
    if (!data.memoryStores.length) {
      memory.append(
        toggle(
          "读取历史记忆",
          "未接入记忆存储，暂时无法读取跨会话信息。",
          false,
          true,
          () => {},
        ),
        toggle(
          "保存新的记忆",
          "未接入记忆存储，暂时无法保存长期记忆。",
          false,
          true,
          () => {},
        ),
      );
      help(memory, "memory");
    }
    for (const store of data.memoryStores) {
      const p = draft.memory.find((m) => m.id === store.id)!;
      memory.append(
        element("h4", "ae-settings-store", store.label),
        toggle(
          "读取历史记忆 · " + store.label,
          store.canRead
            ? "在后续发言中读取该存储。关闭不会删除已有记忆或已进入对话的信息。"
            : "此存储未开放读取。",
          p.read,
          !store.canRead,
          (v) => (p.read = v),
        ),
        toggle(
          "保存新的记忆 · " + store.label,
          store.canWrite
            ? "允许助手提出记忆写入；仍须通过服务端写入策略。"
            : "此存储未开放写入。",
          p.write,
          !store.canWrite,
          (v) => (p.write = v),
        ),
      );
    }
    memory.append(
      element(
        "p",
        "ae-settings-note",
        "当前会话的聊天记录仍会用于续聊。关闭记忆读取不会清空聊天记录；需要全新上下文时，请新建对话。",
      ),
    );
    const response = section(
      "response",
      "回答与上下文",
      "选择默认模型，以及助手如何展示和整理回复。模型地址、密钥与运行预算由服务端管理。",
    );
    const modelLabel = element("label", "ae-settings-model");
    modelLabel.append(element("strong", "", "默认模型"));
    const select = element("select");
    select.setAttribute("aria-label", "默认模型");
    for (const m of data.models) {
      const opt = element(
        "option",
        "",
        m.label +
          (m.thinking ? " · 思考" : "") +
          (m.supportsImages ? " · 图片" : ""),
      );
      opt.value = m.id;
      select.append(opt);
    }
    select.value = draft.modelId;
    select.addEventListener("change", () => {
      draft!.modelId = select.value;
      sync();
    });
    modelLabel.append(
      select,
      element(
        "span",
        "ae-settings-description",
        "输入框的单轮模型选择优先；已有历史仍受模型兼容性约束。",
      ),
    );
    response.append(modelLabel);
    response.append(
      toggle(
        "展示思考内容",
        data.canShowThinking
          ? "展示模型实际返回的公开思考或摘要，不改变模型的思考能力。关闭后不再记录新的思考正文。"
          : "宿主未开放可展示的思考内容。",
        draft.showThinking,
        !data.canShowThinking,
        (v) => (draft!.showThinking = v),
      ),
      toggle(
        "自动整理上下文",
        data.canCompactContext
          ? "对话较长时按既定策略整理上下文，保留原始聊天记录。关闭后可能更早达到模型输入上限。"
          : "整理策略由宿主管理，未开放切换。",
        draft.compactContext,
        !data.canCompactContext,
        (v) => (draft!.compactContext = v),
      ),
    );
    activate(currentTab);
    sync();
  }
  async function load() {
    if (busy) return;
    busy = true;
    loading = true;
    sync();
    notice.textContent = "正在读取配置…";
    reload.hidden = true;
    try {
      if (!options.transport.readSettings)
        throw new ChatError("CHAT_SETTINGS_DISABLED");
      const next = await options.transport.readSettings(
        options.sessionId,
        lifetime.signal,
      );
      if (lifetime.signal.aborted) return;
      if (next.sessionId !== options.sessionId)
        throw new ChatError("CHAT_INVALID_RESPONSE");
      data = next;
      draft = structuredClone(next.preferences);
      unavailable = false;
      layout.hidden = false;
      render();
      notice.replaceChildren();
      if (!next.editable) notice.textContent = "当前会话已归档，配置仅供查看。";
    } catch (error) {
      if (lifetime.signal.aborted) return;
      invalidateAccess(error);
      notice.textContent = explainChatError(errorCode(error));
      reload.hidden = false;
      if (!data) subtitle.textContent = "配置暂时无法读取";
    } finally {
      if (!lifetime.signal.aborted) {
        busy = false;
        loading = false;
        sync();
      }
    }
  }
  async function persist() {
    if (!data || !draft || busy || !dirty || !data.editable) return;
    const input = {
      ifVersion: data.configVersion,
      preferences: structuredClone(draft),
    };
    busy = true;
    sync();
    notice.textContent = "";
    try {
      if (!options.transport.updateSettings)
        throw new ChatError("CHAT_SETTINGS_DISABLED");
      let next: ChatSettings;
      try {
        next = await options.transport.updateSettings(
          options.sessionId,
          input,
          lifetime.signal,
        );
      } catch (error) {
        if (lifetime.signal.aborted) throw error;
        if (accessUnavailable(error)) throw error;
        const latest = await options.transport
          .readSettings?.(options.sessionId, lifetime.signal)
          .catch((readError) => {
            if (accessUnavailable(readError)) throw readError;
            return undefined;
          });
        if (
          latest &&
          latest.configVersion > input.ifVersion &&
          equalChatPreferences(latest.preferences, input.preferences)
        )
          next = latest;
        else throw error;
      }
      if (lifetime.signal.aborted) return;
      if (next.sessionId !== options.sessionId)
        throw new ChatError("CHAT_INVALID_RESPONSE");
      data = next;
      draft = structuredClone(next.preferences);
      render();
      notice.textContent = "配置已保存，后续发言将使用这些设置。";
      reload.hidden = true;
    } catch (error) {
      if (lifetime.signal.aborted) return;
      invalidateAccess(error);
      notice.textContent = explainChatError(errorCode(error));
      reload.hidden = false;
    } finally {
      if (!lifetime.signal.aborted) {
        busy = false;
        sync();
      }
    }
  }
  const ready = load();
  return {
    element: host,
    ready,
    updateTheme: theme.update,
    destroy() {
      lifetime.abort();
      window.removeEventListener("beforeunload", beforeUnload);
      theme.destroy();
      host.remove();
    },
  };
}
