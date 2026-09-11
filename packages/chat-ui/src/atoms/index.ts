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
  chat: "M5 5h14v10H9l-4 4V5Z M9 9h6 M9 12h4",
  close: "m6 6 12 12 M18 6 6 18",
  send: "m4 4 17 8-17 8 3-8-3-8Z M7 12h14",
  stop: "M7 7h10v10H7z",
  plus: "M12 5v14 M5 12h14",
  history: "M4 10a8 8 0 1 1 1 8 M4 4v6h6 M12 7v5l3 2",
  down: "m6 9 6 6 6-6",
  tool: "m14 5 5 5-9 9-5-5 9-9Z M5 14l-2 7 7-2 M14 5l2-2 5 5-2 2",
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
