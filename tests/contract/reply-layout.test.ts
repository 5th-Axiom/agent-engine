import { expect, it } from "vitest";
import {
  planReply,
  type ReplyUnit,
} from "../../packages/chat-ui/src/components/reply-layout.js";
const activity = (id: string): ReplyUnit => ({ id, kind: "activity" });
const body = (id: string, text: string): ReplyUnit => ({
  id,
  kind: "body",
  text,
});
it("keeps live text in sequence and folds only a completed consecutive process group before subsequent text", () => {
  const units = [body("intro", "start"), activity("think"), activity("read")];
  expect(planReply(units, false).map((s) => s.folded)).toEqual([false, false]);
  const next = planReply([...units, body("answer", "answer")], false);
  expect(next.map((s) => s.units.map((u) => u.id))).toEqual([
    ["intro"],
    ["think", "read"],
    ["answer"],
  ]);
  expect(next.map((s) => s.folded)).toEqual([false, true, false]);
  expect(
    planReply([activity("one"), body("a", "answer")], false)[0]?.variant,
  ).toBeUndefined();
});
it("keeps the longest and final text visible with process sections at their boundaries", () => {
  const units = [
    activity("think"),
    body("intro", "hello"),
    activity("read"),
    body("explanation", "the detailed explanation"),
    activity("more"),
    body("aside", "aside"),
    body("final", "done"),
    activity("tail"),
  ];
  const sections = planReply(units, true);
  expect(
    sections.filter((s) => !s.folded).flatMap((s) => s.units.map((u) => u.id)),
  ).toEqual(["explanation", "final"]);
  expect(sections[0]?.units.map((u) => u.id)).toEqual([
    "think",
    "intro",
    "read",
    "tail",
  ]);
  expect(
    sections.find((s) => s.variant === "process")?.units.map((u) => u.id),
  ).toEqual(["more", "aside"]);
  expect(
    sections
      .flatMap((s) => s.units)
      .map((u) => u.id)
      .sort(),
  ).toEqual(units.map((u) => u.id).sort());
});
it("keeps tied body anchors and actionable notices visible; no-answer turns remain inspectable", () => {
  const notice: ReplyUnit = { id: "failure", kind: "notice" };
  const units = [
    body("a", "long"),
    activity("x"),
    body("b", "same"),
    notice,
    body("c", "end"),
  ];
  expect(
    planReply(units, true)
      .filter((s) => !s.folded)
      .flatMap((s) => s.units.map((u) => u.id)),
  ).toEqual(["a", "b", "failure", "c"]);
  expect(
    planReply([activity("think"), notice], true).some((s) => s.folded),
  ).toBe(false);
});
