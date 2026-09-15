import { createButton, element } from "../atoms/index.js";
import { defaultChatCopy, type ChatCopy } from "../copy.js";

/** Copy only the public message source, never surrounding process or audit text. */
export function createMessageCopy(copy: ChatCopy = defaultChatCopy) {
  const labels = { ...defaultChatCopy, ...copy };
  const root = element("div", "ae-message-actions");
  const status = element("span", "ae-visually-hidden");
  status.setAttribute("role", "status");
  let text = "";
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const button = createButton({
    label: labels.copyMessage,
    icon: "copy",
    variant: "quiet",
    onClick: () => {
      void write();
    },
  });
  const label = button.querySelector("span")!;
  const reset = () => {
    clearTimeout(timer);
    label.textContent = labels.copyMessage;
    status.textContent = "";
  };
  async function write() {
    if (!text || button.disabled || disposed) return;
    const captured = text;
    reset();
    button.disabled = true;
    let feedback: string;
    try {
      await navigator.clipboard.writeText(captured);
      feedback = labels.messageCopied;
    } catch {
      feedback = labels.messageCopyFailed;
    }
    if (disposed) return;
    button.disabled = false;
    // A newer streaming fragment must not appear to have been copied already.
    if (captured !== text) return;
    label.textContent = status.textContent = feedback;
    timer = setTimeout(reset, 2500);
  }
  root.append(button, status);
  root.hidden = true;
  return {
    element: root,
    update(value: string) {
      if (value !== text) reset();
      text = value;
      root.hidden = !value;
    },
    destroy() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
