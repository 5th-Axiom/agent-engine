import {
  type ChatRun,
  type ChatInputResolution,
  errorCode,
} from "@agent-runtime/chat-core";
import { element, createButton } from "../atoms/index.js";
import { explainChatError } from "../copy.js";
type Pending = NonNullable<NonNullable<ChatRun["process"]>["pending"]>;
/** A pending request keeps its native form nodes through polling updates. */
export function createPendingInput(
  resolve?: (input: ChatInputResolution) => Promise<void>,
) {
  const root = element("section", "ae-pending-input");
  let key = "",
    busy = false,
    destroyed = false;
  function update(p?: Pending) {
    root.hidden = !p;
    if (!p) {
      key = "";
      root.replaceChildren();
      return;
    }
    const next = JSON.stringify([
      p.id,
      p.kind,
      p.question,
      p.details,
      p.schema,
    ]);
    if (next === key) return;
    key = next;
    root.replaceChildren(
      element(
        "strong",
        "",
        p.kind === "permission" ? "等待确认" : "等待补充信息",
      ),
      element("p", "", p.question),
    );
    if (p.details) root.append(element("p", "ae-pending-preview", p.details));
    if (!p.id || !resolve) {
      root.append(
        element(
          "p",
          "ae-process-notice",
          "由接入方处理后继续；也可以停止本轮运行。",
        ),
      );
      return;
    }
    const form = element("form"),
      status = element("p", "ae-pending-status");
    status.setAttribute("role", "status");
    const controls: Array<
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | HTMLButtonElement
    > = [];
    const values: Array<[string, () => unknown]> = [];
    const schema =
      p.schema && typeof p.schema === "object" && !Array.isArray(p.schema)
        ? (p.schema as Record<string, any>)
        : {};
    const addField = (
      name: string,
      field: Record<string, any>,
      required: boolean,
    ) => {
      const label = element("label", "ae-pending-field"),
        title = element("span", "", String(field.title ?? name));
      let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (
        Array.isArray(field.enum) &&
        field.enum.every((v: unknown) => typeof v === "string")
      ) {
        const select = element("select");
        select.append(new Option("请选择", ""));
        for (const value of field.enum) select.append(new Option(value, value));
        input = select;
      } else if (field.type === "boolean") {
        const checkbox = element("input");
        checkbox.type = "checkbox";
        input = checkbox;
      } else if (field.type === "number" || field.type === "integer") {
        const number = element("input");
        number.type = "number";
        number.step = field.type === "integer" ? "1" : "any";
        if (typeof field.minimum === "number")
          number.min = String(field.minimum);
        if (typeof field.maximum === "number")
          number.max = String(field.maximum);
        input = number;
      } else {
        const textarea = element("textarea");
        textarea.rows = field.type === "string" ? 3 : 5;
        textarea.maxLength = Math.min(Number(field.maxLength) || 8000, 8000);
        if (typeof field.minLength === "number")
          textarea.minLength = field.minLength;
        input = textarea;
      }
      input.required = required && field.type !== "boolean";
      input.setAttribute("aria-label", String(field.title ?? name));
      label.append(title, input);
      form.append(label);
      controls.push(input);
      values.push([
        name,
        () =>
          input instanceof HTMLInputElement && input.type === "checkbox"
            ? input.checked
            : !required && input.value === ""
              ? undefined
              : field.type === "integer" || field.type === "number"
                ? Number(input.value)
                : field.type === "string" || Array.isArray(field.enum)
                  ? input.value
                  : JSON.parse(input.value),
      ]);
    };
    const objectFields =
      schema.type === "object" &&
      schema.properties &&
      Object.keys(schema.properties).length <= 20 &&
      Object.values(schema.properties).every(
        (v) =>
          v &&
          typeof v === "object" &&
          ["string", "boolean", "number", "integer"].includes((v as any).type),
      );
    if (p.kind !== "permission") {
      if (objectFields)
        for (const [name, field] of Object.entries(schema.properties))
          addField(
            name,
            field as any,
            schema.required?.includes(name) ?? false,
          );
      else
        addField(
          schema.type === "string" ? "你的回答" : "回答（JSON）",
          schema,
          true,
        );
    }
    const actions = element("div", "ae-pending-actions");
    const submit = createButton({
      label: p.kind === "permission" ? "允许这一次" : "提交并继续",
      variant: "primary",
    });
    submit.type = "submit";
    controls.push(submit);
    let decision: "allow_once" | "deny" = "allow_once";
    if (p.kind === "permission") {
      const deny = createButton({
        label: "不允许",
        onClick: () => {
          decision = "deny";
          form.requestSubmit();
        },
      });
      controls.push(deny);
      actions.append(deny);
    }
    actions.append(submit);
    form.append(actions, status);
    root.append(form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      if (Date.now() >= p.expiresAt) {
        status.textContent = "本次请求已过期，请停止本轮后重新提问。";
        return;
      }
      let input: ChatInputResolution;
      try {
        input =
          p.kind === "permission"
            ? { id: p.id!, kind: p.kind, decision }
            : {
                id: p.id!,
                kind: p.kind,
                answer: (objectFields
                  ? Object.fromEntries(
                      values
                        .map(([k, v]) => [k, v()])
                        .filter(([, v]) => v !== undefined),
                    )
                  : values[0]![1]()) as any,
              };
      } catch {
        status.textContent = "请填写有效的 JSON。";
        return;
      }
      busy = true;
      for (const c of controls) c.disabled = true;
      status.textContent = "正在提交…";
      try {
        await resolve(input);
        if (!destroyed && key === next)
          status.textContent = "已提交，等待助手继续。";
      } catch (error) {
        if (!destroyed && key === next) {
          status.textContent = explainChatError(errorCode(error));
          for (const c of controls) c.disabled = false;
        }
      } finally {
        busy = false;
        decision = "allow_once";
      }
    });
  }
  return {
    element: root,
    update,
    destroy() {
      destroyed = true;
      root.remove();
    },
  };
}
