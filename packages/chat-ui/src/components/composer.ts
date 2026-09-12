import {
  chatBusy,
  composerCatalog,
  selectedChatModel,
  type ChatState,
} from "@agent-runtime/chat-core";
import {
  createButton,
  createTextInput,
  createIcon,
  element,
} from "../atoms/index.js";
import { defaultChatCopy, explainChatError, type ChatCopy } from "../copy.js";
export function createComposer(options: {
  sendShortcut?: "enter" | "mod-enter";
  onModel?: (id: string) => void;
  onSkill?: (id?: string) => void;
  onDraft: (value: string) => void;
  onImages?: (files: File[]) => void;
  onRemoveImage?: (id: string) => void;
  onRetryImage?: (id: string) => void;
  onSend: () => void;
  onCancel: () => void;
  copy?: ChatCopy;
}) {
  const copy = options.copy ?? defaultChatCopy;
  const root = element("form", "ae-composer");
  const field = createTextInput(copy.placeholder);
  const surface = element("div", "ae-composer-surface");
  const footer = element("div", "ae-composer-footer");
  const count = element("p", "ae-input-count");
  const actions = element("div", "ae-composer-actions");
  const controls = element("div", "ae-composer-controls");
  let latest: ChatState | undefined;
  let expanded = false;
  let shortcut = options.sendShortcut ?? "mod-enter";
  const model = element("select", "ae-composer-select ae-model-select");
  model.setAttribute("aria-label", "选择模型");
  model.addEventListener("change", () => {
    options.onModel?.(model.value);
    if (latest) model.value = selectedChatModel(latest)?.id ?? "";
  });
  const skill = element("select", "ae-composer-select ae-skill-select");
  skill.setAttribute("aria-label", "选择技能");
  skill.addEventListener("change", () =>
    options.onSkill?.(skill.value || undefined),
  );
  const microphone = createButton({
    label: "语音输入：未接入语音识别服务",
    icon: "microphone",
    iconOnly: true,
  });
  microphone.disabled = true;
  const voiceHint = element("span", "ae-disabled-control");
  voiceHint.tabIndex = 0;
  voiceHint.setAttribute("role", "note");
  voiceHint.setAttribute("aria-label", "语音输入不可用：未接入语音识别服务");
  voiceHint.title = "未接入语音识别服务";
  voiceHint.append(microphone);
  const resize = () => {
    const top = field.input.scrollTop;
    field.input.style.height = "auto";
    const limit = Math.max(
      72,
      Math.min(
        expanded ? 480 : 180,
        (window.visualViewport?.height ?? innerHeight) *
          (expanded ? 0.5 : 0.25),
      ),
    );
    field.input.style.height = `${Math.min(limit, Math.max(expanded ? limit : 72, field.input.scrollHeight))}px`;
    field.input.scrollTop = top;
  };
  const expand = createButton({
    label: "展开输入框",
    icon: "expand",
    iconOnly: true,
    onClick: () => {
      expanded = !expanded;
      root.dataset.expanded = String(expanded);
      expand.setAttribute("aria-expanded", String(expanded));
      expand.setAttribute("aria-label", expanded ? "收起输入框" : "展开输入框");
      expand.title = expanded ? "收起输入框（Esc）" : "展开输入框";
      resize();
      field.input.focus({ preventScroll: true });
    },
  });
  expand.setAttribute("aria-expanded", "false");
  const settings = element("details", "ae-composer-settings");
  const settingsSummary = element("summary", "ae-button ae-icon-button");
  settingsSummary.setAttribute("aria-label", "输入设置");
  settingsSummary.title = "输入设置";
  // Use the same authored icon vocabulary as every other toolbar control.
  settingsSummary.append(createIcon("settings"));
  const settingsBody = element(
    "label",
    "ae-composer-settings-body",
    "发送快捷键",
  );
  const shortcutSelect = element("select", "ae-composer-select");
  shortcutSelect.setAttribute("aria-label", "发送快捷键");
  for (const [value, label] of [
    ["enter", "Enter 发送"],
    ["mod-enter", "Ctrl / ⌘ + Enter 发送"],
  ]) {
    const option = element("option", "", label);
    option.value = value!;
    shortcutSelect.append(option);
  }
  shortcutSelect.value = shortcut;
  shortcutSelect.addEventListener("change", () => {
    shortcut = shortcutSelect.value as typeof shortcut;
    if (latest) updateCount(latest);
  });
  settingsBody.append(shortcutSelect);
  settings.append(settingsSummary, settingsBody);
  const send = createButton({
    label: copy.send,
    icon: "send",
    variant: "primary",
  });
  send.type = "submit";
  const cancel = createButton({
    label: copy.cancel,
    icon: "stop",
    onClick: options.onCancel,
  });
  actions.append(voiceHint, expand, settings, cancel, send);
  footer.append(controls, actions);
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/png,image/jpeg,image/webp,image/gif";
  picker.multiple = true;
  picker.hidden = true;
  const attach = createButton({
    label: "添加图片",
    icon: "image",
    iconOnly: true,
    onClick: () => picker.click(),
  });
  controls.append(attach, model, skill);
  picker.addEventListener("change", () => {
    options.onImages?.([...(picker.files ?? [])]);
    picker.value = "";
  });
  const images = element("div", "ae-draft-images");
  images.setAttribute("aria-label", "待发送图片");
  root.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.files ?? [])].filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length && !attach.hidden && !attach.disabled) {
      if (!event.clipboardData?.getData("text/plain")) event.preventDefault();
      options.onImages?.(files);
    }
  });
  root.addEventListener("dragover", (event) => {
    if (!attach.hidden && !attach.disabled) event.preventDefault();
  });
  root.addEventListener("drop", (event) => {
    if (!attach.hidden && !attach.disabled) {
      event.preventDefault();
      options.onImages?.([...(event.dataTransfer?.files ?? [])]);
    }
  });
  const note = element("p", "ae-footnote", copy.footnote);
  surface.append(images, field.element, picker, footer, count);
  root.append(surface, note);
  let composing = false;
  let settledAt = -Infinity;
  field.input.addEventListener("compositionstart", () => (composing = true));
  field.input.addEventListener("compositionend", () => {
    composing = false;
    settledAt = performance.now();
    options.onDraft(field.input.value);
  });
  field.input.addEventListener("input", () => {
    options.onDraft(field.input.value);
    resize();
  });
  field.input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (settings.open) {
        event.preventDefault();
        event.stopPropagation();
        settings.open = false;
        settingsSummary.focus();
      } else if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        expand.click();
      }
      return;
    }
    if (
      event.key === "ArrowUp" &&
      !field.input.value &&
      !composing &&
      !event.isComposing &&
      !field.input.readOnly
    ) {
      const previous = latest?.session?.runs.at(-1)?.input;
      if (previous) {
        event.preventDefault();
        options.onDraft(previous);
        field.input.setSelectionRange(previous.length, previous.length);
      }
      return;
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.altKey &&
      (event.ctrlKey || event.metaKey || shortcut === "enter") &&
      !event.isComposing &&
      !composing &&
      event.keyCode !== 229 &&
      performance.now() - settledAt > 80
    ) {
      event.preventDefault();
      if (!send.disabled) root.requestSubmit();
    }
  });
  settings.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      settings.open = false;
      settingsSummary.focus();
    }
  });
  const outside = (event: PointerEvent) => {
    if (!event.composedPath().includes(settings)) settings.open = false;
  };
  document.addEventListener("pointerdown", outside);
  let width = 0;
  const observer = new ResizeObserver((entries) => {
    const next = entries[0]?.contentRect.width ?? 0;
    if (next !== width) {
      width = next;
      resize();
    }
  });
  observer.observe(field.element);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  const updateCount = (state: ChatState) => {
    count.replaceChildren(
      state.draft.length >= 7200
        ? document.createTextNode(`${state.draft.length} / 8000`)
        : element(
            "span",
            "ae-keyboard-hint",
            shortcut === "enter"
              ? "Enter 发送 · Shift + Enter 换行"
              : "⌘ / Ctrl + Enter 发送 · Enter 换行",
          ),
    );
  };
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!send.disabled && !composing) options.onSend();
  });
  return {
    element: root,
    input: field.input,
    destroy: () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    },
    focus: () => field.input.focus({ preventScroll: true }),
    update: (state: ChatState) => {
      const changedDraft = latest?.draft !== state.draft;
      latest = state;
      const catalog = composerCatalog(state),
        selected = selectedChatModel(state);
      const modelSignature = JSON.stringify(catalog.models ?? []);
      if (model.dataset.signature !== modelSignature) {
        model.dataset.signature = modelSignature;
        model.replaceChildren(
          ...(catalog.models ?? []).map((value) => {
            const option = element(
              "option",
              "",
              value.label +
                (value.thinking ? " · 思考" : "") +
                (value.supportsImages ? " · 图片" : ""),
            );
            option.value = value.id;
            return option;
          }),
        );
      }
      model.hidden = !catalog.models?.length;
      model.disabled = state.pending || state.sending || !options.onModel;
      model.value = selected?.id ?? "";
      model.title = selected
        ? `${selected.label}${selected.thinking ? "，深度思考已启用" : ""}${selected.supportsImages ? "，支持图片" : "，仅支持文字"}；应用于下一条消息`
        : "请选择可用模型";
      const skillSignature = JSON.stringify(catalog.skills ?? []);
      if (skill.dataset.signature !== skillSignature) {
        skill.dataset.signature = skillSignature;
        const automatic = element("option", "", "自动技能");
        automatic.value = "";
        skill.replaceChildren(
          automatic,
          ...(catalog.skills ?? []).map((value) => {
            const option = element("option", "", value.label);
            option.value = value.id;
            return option;
          }),
        );
      }
      skill.hidden = !catalog.skills?.length;
      skill.disabled = state.pending || state.sending || !options.onSkill;
      skill.value = state.skillId ?? "";
      expand.disabled = !state.config;
      attach.hidden = !state.config?.images || !options.onImages;
      const supportsImages =
        selected?.supportsImages ??
        state.session?.supportsImages ??
        state.config?.assistants.find((a) => a.id === state.assistantId)
          ?.supportsImages ??
        true;
      attach.title = supportsImages
        ? "选择、粘贴或拖拽图片"
        : "当前模型仅支持文字，换用视觉模型后可添加图片";
      attach.disabled =
        !supportsImages ||
        state.sending ||
        state.pending ||
        (state.images?.length ?? 0) >=
          (state.config?.images?.maxPerMessage ?? 8);
      const signature =
        JSON.stringify(state.images ?? []) +
        String(state.pending || state.sending);
      if (images.dataset.signature !== signature) {
        images.dataset.signature = signature;
        images.replaceChildren(
          ...(state.images ?? []).map((image) => {
            const item = element("figure", "ae-draft-image");
            const preview = document.createElement("img");
            preview.src = image.preview;
            preview.alt = image.name;
            const caption = element(
              "figcaption",
              "",
              image.status === "uploading"
                ? "正在上传…"
                : image.status === "failed"
                  ? explainChatError(image.error ?? "IMAGE_UNAVAILABLE")
                  : image.name,
            );
            const remove = createButton({
              label: "移除图片",
              onClick: () => options.onRemoveImage?.(image.id),
            });
            remove.disabled = state.pending || state.sending;
            item.append(preview, caption, remove);
            if (image.status === "failed")
              item.append(
                createButton({
                  label: "重试上传",
                  onClick: () => options.onRetryImage?.(image.id),
                }),
              );
            return item;
          }),
        );
      }
      images.hidden = !state.images?.length;
      if (field.input.value !== state.draft && !composing)
        field.input.value = state.draft;
      field.input.disabled = !state.config;
      field.input.readOnly = state.sending || state.pending;
      updateCount(state);
      if (changedDraft) resize();
      send.disabled =
        chatBusy(state) ||
        state.pending ||
        !state.config ||
        (!!catalog.models && !selected) ||
        (!!state.images?.length && !supportsImages) ||
        (!state.draft.trim() && !state.images?.length) ||
        !!state.images?.some((image) => image.status !== "ready");
      send.querySelector("span")!.textContent = state.sending
        ? copy.sending
        : copy.send;
      cancel.hidden = !state.session?.runs.some(
        (r) => !["completed", "failed", "cancelled"].includes(r.state),
      );
      cancel.disabled =
        state.cancelling ||
        state.session?.runs.some(
          (r) =>
            r.cancelRequested &&
            !["completed", "failed", "cancelled"].includes(r.state),
        ) === true;
      cancel.querySelector("span")!.textContent = cancel.disabled
        ? copy.cancelling
        : copy.cancel;
    },
  };
}
