export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
const paths = {
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  microphone:
    "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Z M6 10v2a6 6 0 0 0 12 0v-2 M12 18v4 M8 22h8",
  expand: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5",
  settings: "M4 7h16 M4 17h16 M9 4v6 M15 14v6",
  image: "M3 4h18v16H3z M7 8h.01 M3 16l6-5 4 4 3-3 5 5",
  chat: "M5 5h14v10H9l-4 4V5Z M9 9h6 M9 12h4",
  close: "m6 6 12 12 M18 6 6 18",
  send: "m4 4 17 8-17 8 3-8-3-8Z M7 12h14",
  stop: "M7 7h10v10H7z",
  plus: "M12 5v14 M5 12h14",
  copy: "M9 9h11v12H9z M5 15H3V3h11v2",
  history: "M4 10a8 8 0 1 1 1 8 M4 4v6h6 M12 7v5l3 2",
  sidebar: "M4 4h16v16H4z M10 4v16 M6.5 8h1 M6.5 12h1",
  info: "M12 11v6 M12 7v.1 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  down: "m6 9 6 6 6-6",
  tool: "m14 5 5 5-9 9-5-5 9-9Z M5 14l-2 7 7-2 M14 5l2-2 5 5-2 2",
  search: "M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14 M15 15l6 6",
  skill: "m12 3 8 4v10l-8 4-8-4V7l8-4Z M4 7l8 4 8-4 M12 11v10",
  thinking: "M9 18h6 M10 21h4 M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2Z",
  memory:
    "M5 5c0-3 14-3 14 0s-14 3-14 0v14c0 3 14 3 14 0V5 M5 12c0 3 14 3 14 0",
} as const;
export type ChatIcon = keyof typeof paths;
export function createIcon(name: ChatIcon): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  svg.classList.add("ae-icon");
  return svg;
}
export interface ButtonOptions {
  label: string;
  icon?: ChatIcon;
  iconOnly?: boolean;
  variant?: "primary" | "secondary" | "quiet";
  onClick?: () => void;
}
export function createButton(options: ButtonOptions): HTMLButtonElement {
  const button = element(
    "button",
    "ae-button ae-button-" + (options.variant ?? "secondary"),
  );
  button.type = "button";
  if (options.icon) button.append(createIcon(options.icon));
  if (options.iconOnly) {
    button.classList.add("ae-icon-button");
    button.setAttribute("aria-label", options.label);
    button.title = options.label;
  } else button.append(element("span", "", options.label));
  if (options.onClick) button.addEventListener("click", options.onClick);
  return button;
}
export function createTextInput(label: string): {
  element: HTMLLabelElement;
  input: HTMLTextAreaElement;
} {
  const wrapper = element("label", "ae-input-label");
  wrapper.append(element("span", "ae-visually-hidden", label));
  const input = element("textarea", "ae-input");
  input.rows = 2;
  input.maxLength = 8000;
  input.placeholder = label;
  wrapper.append(input);
  return { element: wrapper, input };
}
export function createStatus(text = ""): HTMLParagraphElement {
  const status = element("p", "ae-status", text);
  status.setAttribute("role", "status");
  return status;
}
