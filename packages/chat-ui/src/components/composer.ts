import { chatBusy, type ChatState } from "@agent-runtime/chat-core";
import { createButton, createTextInput, element } from "../atoms/index.js";
import { defaultChatCopy, type ChatCopy } from "../copy.js";
export function createComposer(options: {
  onDraft: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  copy?: ChatCopy;
}) {
  const copy = options.copy ?? defaultChatCopy;
  const root = element("form", "ae-composer");
  const field = createTextInput(copy.placeholder);
  const footer = element("div", "ae-composer-footer");
  const count = element("p", "ae-input-count");
  const actions = element("div", "ae-composer-actions");
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
  actions.append(cancel, send);
  footer.append(count, actions);
  const note = element("p", "ae-footnote", copy.footnote);
  root.append(field.element, footer, note);
  let composing = false;
  field.input.addEventListener("compositionstart", () => (composing = true));
  field.input.addEventListener("compositionend", () => {
    composing = false;
    options.onDraft(field.input.value);
  });
  field.input.addEventListener("input", () =>
    options.onDraft(field.input.value),
  );
  field.input.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.isComposing &&
      !composing
    ) {
      event.preventDefault();
      if (!send.disabled) root.requestSubmit();
    }
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!send.disabled && !composing) options.onSend();
  });
  return {
    element: root,
    input: field.input,
    focus: () => field.input.focus({ preventScroll: true }),
    update: (state: ChatState) => {
      if (field.input.value !== state.draft && !composing)
        field.input.value = state.draft;
      field.input.disabled = state.sending || state.pending || !state.config;
      count.replaceChildren(
        document.createTextNode(`${state.draft.length} / 8000`),
        element("span", "ae-keyboard-hint", " · ⌘ / Ctrl + Enter"),
      );
      send.disabled =
        chatBusy(state) ||
        state.pending ||
        !state.config ||
        !state.draft.trim();
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
