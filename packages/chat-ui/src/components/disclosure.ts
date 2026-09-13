import { createIcon, element } from "../atoms/index.js";

/** Native keyboard semantics with bounded, interruptible size transitions. */
export function createDisclosure(className: string, headerClass: string) {
  const elementNode = element("details", className);
  const header = element("summary", headerClass);
  const label = element("span");
  const shell = element("div", "ae-disclosure-shell");
  const body = element("div", "ae-disclosure-body");
  header.append(label, createIcon("down"));
  shell.append(body);
  elementNode.append(header, shell);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let animation: Animation | undefined;
  let open = false;
  let initialized = false;
  let preference: boolean | undefined;
  const finish = () => {
    animation?.cancel();
    animation = undefined;
    elementNode.open = open;
    shell.style.height = "";
    shell.style.overflow = "";
  };
  const setOpen = (next: boolean, animate = true) => {
    if (initialized && open === next) return;
    const wasInitialized = initialized;
    initialized = true;
    const from = elementNode.open ? shell.getBoundingClientRect().height : 0;
    open = next;
    animation?.cancel();
    animation = undefined;
    elementNode.dataset.expanded = String(open);
    header.setAttribute("aria-expanded", String(open));
    shell.setAttribute("aria-hidden", String(!open));
    if (
      !open &&
      body.contains(
        elementNode.getRootNode() instanceof ShadowRoot
          ? (elementNode.getRootNode() as ShadowRoot).activeElement
          : document.activeElement,
      )
    )
      header.focus({ preventScroll: true });
    body.inert = !open;
    if (
      !animate ||
      !wasInitialized ||
      motion.matches ||
      document.hidden ||
      !elementNode.isConnected ||
      !elementNode.getClientRects().length
    ) {
      finish();
      return;
    }
    elementNode.open = true;
    shell.style.overflow = "hidden";
    const to = open ? body.getBoundingClientRect().height : 0;
    if (Math.abs(to - from) < 1) {
      finish();
      return;
    }
    animation = shell.animate(
      [{ height: from + "px" }, { height: to + "px" }],
      {
        duration: open ? 240 : 190,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "both",
      },
    );
    animation.onfinish = finish;
  };
  header.addEventListener("click", (event) => {
    event.preventDefault();
    preference = !open;
    elementNode.dispatchEvent(new Event("disclosurechange", { bubbles: true }));
    setOpen(preference);
  });
  const reduce = () => {
    if (motion.matches || document.hidden) finish();
  };
  motion.addEventListener("change", reduce);
  document.addEventListener("visibilitychange", reduce);
  return {
    element: elementNode,
    header,
    label,
    body,
    get userOpen() {
      return preference;
    },
    get open() {
      return open;
    },
    setOpen,
    destroy() {
      animation?.cancel();
      motion.removeEventListener("change", reduce);
      document.removeEventListener("visibilitychange", reduce);
    },
  };
}
