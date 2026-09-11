import type { ChatState, ChatTool } from "@agent-runtime/chat-core";
import { element } from "../atoms/index.js";
import { defaultChatCopy, runLabels, type ChatCopy } from "../copy.js";

export type SessionPanel = "session" | "tools";
/** Public view data only; no configuration fetches or executor details. */
export function createSessionDetails(copy: ChatCopy = defaultChatCopy) {
  const root = element("div", "ae-session-details");
  root.tabIndex = 0;
  root.setAttribute("role", "region");
  let previous = "";
  function toolList(tools: ChatTool[] | undefined) {
    if (!tools) return element("p", "ae-status", "当前服务未提供工具清单。");
    if (!tools.length) return element("p", "ae-status", "此配置没有接入工具。");
    const list = element("ul", "ae-tool-list");
    for (const tool of tools) {
      const item = element("li", "ae-tool-item");
      const heading = element("div", "ae-tool-heading");
      heading.append(
        element("h4", "", tool.label ?? tool.name),
        element(
          "span",
          "ae-tool-kind",
          tool.permission === "deny"
            ? "已禁用"
            : tool.permission === "require-approval"
              ? "需审批"
              : tool.sideEffect === "read"
                ? "只读"
                : "可写",
        ),
      );
      item.append(heading);
      if (tool.label) item.append(element("code", "ae-tool-name", tool.name));
      if (tool.description) item.append(element("p", "", tool.description));
      list.append(item);
    }
    return list;
  }
  return {
    element: root,
    update(state: ChatState, panel: SessionPanel) {
      root.setAttribute(
        "aria-label",
        panel === "session" ? copy.sessionDetails : copy.tools,
      );
      const session = state.session;
      const assistant = state.config?.assistants.find(
        (a) => a.id === (session?.assistantId ?? state.assistantId),
      );
      const tools = session ? session.tools : assistant?.tools;
      const run = session?.runs.at(-1);
      const key = JSON.stringify([
        panel,
        session?.id,
        session?.title,
        session?.createdAt,
        session?.configVersion,
        session?.activeRun,
        session?.totalRuns,
        run?.state,
        tools,
        session?.activeTools,
        session?.activeConfigVersion,
        assistant?.label,
      ]);
      if (previous === key) return;
      previous = key;
      const scrollTop = root.scrollTop;
      root.replaceChildren();
      if (panel === "session") {
        if (!session)
          root.append(
            element(
              "p",
              "ae-detail-note",
              "尚未创建会话。发送第一条消息后，会话会出现在左侧列表中。",
            ),
          );
        const rows: [string, string][] = [
          ["会话标题", session?.title ?? "新对话"],
          [
            copy.assistant,
            assistant?.label ?? session?.assistantId ?? "尚未选择",
          ],
          [
            "状态",
            session?.activeRun
              ? (runLabels[
                  session.runs.find((r) => r.id === session.activeRun)?.state ??
                    "running"
                ] ?? "正在执行")
              : session
                ? "可继续对话"
                : "等待首条消息",
          ],
          ["会话 ID", session?.id ?? "发送后生成"],
          [
            "创建时间",
            session?.createdAt === undefined
              ? "暂未提供"
              : new Date(session.createdAt).toLocaleString("zh-CN", {
                  hour12: false,
                }),
          ],
          ["对话轮数", session ? String(session.totalRuns) : "0"],
          [
            "配置版本",
            session?.configVersion === undefined
              ? "暂未提供"
              : "v" + session.configVersion,
          ],
          [copy.tools, tools ? String(tools.length) + " 个" : "暂未提供"],
        ];
        const list = element("dl", "ae-session-fields");
        for (const [label, value] of rows)
          list.append(
            element("dt", "", label),
            element("dd", label === "会话 ID" ? "ae-session-id" : "", value),
          );
        root.append(list);
      } else {
        root.append(
          element(
            "p",
            "ae-detail-note",
            session
              ? "当前会话的工具配置。实际调用仍以服务端权限为准。"
              : "新会话将使用以下工具；发送后以该会话的配置为准。",
          ),
          toolList(tools),
        );
        if (
          session?.activeTools &&
          JSON.stringify(session.activeTools) !== JSON.stringify(tools)
        ) {
          root.append(
            element("h3", "ae-detail-subtitle", "本轮回答的工具"),
            element(
              "p",
              "ae-detail-note",
              `本轮沿用配置 v${session.activeConfigVersion ?? "—"}；上方配置将在后续发言中使用。`,
            ),
            toolList(session.activeTools),
          );
        }
      }
      root.scrollTop = scrollTop;
    },
  };
}
