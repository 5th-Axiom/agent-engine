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
    lastArrival = 0,
    cadence = 450,
    position = 0,
    speed = 0,
    active = false,
    initialized = false;
  const revealing = (value: boolean) => {
    if (target.dataset.revealing === String(value)) return;
    target.dataset.revealing = String(value);
    target.dispatchEvent(new Event("revealstatechange", { bubbles: true }));
  };
  const paint = (text: string) => {
    if (shown === text && initialized) return;
    shown = text;
    const follow =
      target.dataset.follow === "true" &&
      target.scrollHeight - target.scrollTop - target.clientHeight < 32;
    updateMarkdown(target, shown);
    if (follow) target.scrollTop = target.scrollHeight;
    target.dispatchEvent(new Event("contentresize", { bubbles: true }));
  };
  const flush = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    paint(goal);
    position = boundaries.length;
    revealing(false);
  };
  const tick = (now: number) => {
    frame = 0;
    if (motion.matches || document.hidden || now >= deadline) {
      flush();
      return;
    }
    // Fractional progress matters: forcing at least one character per frame
    // drains small batches too fast, followed by a pause until the next poll.
    position = Math.min(
      boundaries.length,
      position + (now - lastFrame) * speed,
    );
    const count = Math.floor(position);
    if (count > 0) paint(goal.slice(0, boundaries[count - 1]!));
    lastFrame = now;
    if (shown !== goal) frame = requestAnimationFrame(tick);
    else revealing(false);
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
        if (!streaming && wasActive && frame) {
          deadline = Math.min(deadline, performance.now() + 100);
          speed =
            (boundaries.length - position) /
            Math.max(1, deadline - performance.now());
        }
        return;
      }
      const append = text.startsWith(goal);
      goal = text;
      const now = performance.now();
      const gap = now - lastArrival;
      if (streaming && wasActive && append && lastArrival && gap < 2000)
        cadence = Math.max(80, Math.min(850, cadence * 0.3 + gap * 0.7));
      lastArrival = now;
      boundaries = [...segmenter.segment(goal)].map(
        (part) => part.index + part.segment.length,
      );
      if (
        !append ||
        (!initialized && !streaming) ||
        (!streaming && !wasActive) ||
        motion.matches ||
        document.hidden
      )
        flush();
      else {
        // Preserve fractional credit across frequent arrivals. The horizon
        // includes measured transport delay, with a hard bound for catch-up.
        const visible = boundaries.findIndex((value) => value > shown.length);
        position = Math.max(
          visible < 0 ? boundaries.length : visible,
          position,
        );
        const remaining = boundaries.length - position;
        const duration = streaming
          ? Math.min(900, cadence + 60, Math.max(40, remaining * 80))
          : 100;
        speed = remaining / duration;
        lastFrame = now;
        deadline = now + duration;
        if (!shown && boundaries.length) {
          paint(goal.slice(0, boundaries[0]));
          position = 1;
          speed = (boundaries.length - position) / duration;
        }
        revealing(true);
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
