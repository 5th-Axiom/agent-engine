import { updateMarkdown } from "./markdown.js";

/** A short, bounded reveal of received text. Never fabricates tokens or replays settled history. */
export function createStreamingMarkdown(target: HTMLElement) {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let goal = "",
    shown = "",
    boundaries: number[] = [],
    frame = 0;
  let deadline = 0,
    lastFrame = 0,
    active = false,
    initialized = false;
  const paint = (text: string) => {
    if (shown === text && initialized) return;
    shown = text;
    const follow =
      target.scrollHeight - target.scrollTop - target.clientHeight < 32;
    updateMarkdown(target, shown);
    if (follow && target.dataset.follow === "true")
      target.scrollTop = target.scrollHeight;
    target.dispatchEvent(new Event("contentresize", { bubbles: true }));
  };
  const flush = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    paint(goal);
    target.dataset.revealing = "false";
  };
  const tick = (now: number) => {
    frame = 0;
    if (motion.matches || document.hidden || now >= deadline) {
      flush();
      return;
    }
    if (now - lastFrame >= 28) {
      const progress = Math.min(
        1,
        (now - lastFrame) / Math.max(28, deadline - lastFrame),
      );
      const limit =
        shown.length +
        Math.max(1, Math.ceil((goal.length - shown.length) * progress));
      const boundary =
        boundaries.find((value) => value >= limit) ?? goal.length;
      paint(goal.slice(0, boundary));
      lastFrame = now;
    }
    if (shown !== goal) frame = requestAnimationFrame(tick);
    else target.dataset.revealing = "false";
  };
  const preferences = () => {
    if (motion.matches || document.hidden) flush();
  };
  motion.addEventListener("change", preferences);
  document.addEventListener("visibilitychange", preferences);
  return {
    update(text: string, streaming: boolean) {
      const wasActive = active;
      active = streaming;
      target.dataset.streaming = String(streaming);
      if (text === goal && initialized) {
        if (!streaming && wasActive && frame)
          deadline = Math.min(deadline, performance.now() + 100);
        return;
      }
      const append = text.startsWith(goal);
      goal = text;
      if (
        !append ||
        (!initialized && !streaming) ||
        (!streaming && !wasActive) ||
        motion.matches ||
        document.hidden
      )
        flush();
      else {
        boundaries = [...segmenter.segment(goal)].map(
          (part) => part.index + part.segment.length,
        );
        lastFrame = performance.now();
        deadline = lastFrame + (streaming ? 220 : 100);
        target.dataset.revealing = "true";
        if (!frame) frame = requestAnimationFrame(tick);
      }
      initialized = true;
    },
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      motion.removeEventListener("change", preferences);
      document.removeEventListener("visibilitychange", preferences);
    },
  };
}
