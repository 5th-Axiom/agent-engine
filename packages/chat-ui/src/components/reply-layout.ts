/** Presentation rules over public, ordered content. No model or transport state. */
export interface ReplyUnit {
  id: string;
  kind: "body" | "activity" | "notice";
  text?: string;
}
export interface ReplySection {
  id: string;
  folded: boolean;
  units: ReplyUnit[];
  variant?: "summary" | "completed" | "process";
}
export function planReply(
  units: ReplyUnit[],
  finished: boolean,
): ReplySection[] {
  if (!finished) {
    const result: ReplySection[] = [];
    for (let i = 0; i < units.length;) {
      const first = units[i]!;
      if (first.kind !== "activity") {
        result.push({ id: first.id, folded: false, units: [first] });
        i++;
        continue;
      }
      let end = i + 1;
      while (units[end]?.kind === "activity") end++;
      const group = units.slice(i, end);
      result.push({
        id: "group:" + first.id,
        units: group,
        folded:
          group.length >= 2 && units.slice(end).some((u) => u.kind === "body"),
        ...(group.length >= 2 ? { variant: "summary" as const } : {}),
      });
      i = end;
    }
    return result;
  }
  const bodies = units.filter((u) => u.kind === "body" && u.text?.trim());
  if (!bodies.length) return planReply(units, false);
  const longest = Math.max(...bodies.map((u) => u.text!.trim().length));
  const anchors = new Set(
    bodies
      .filter((u) => u === bodies.at(-1) || u.text!.trim().length === longest)
      .map((u) => u.id),
  );
  const completed: ReplySection = {
    id: "completed",
    folded: true,
    variant: "completed",
    units: [],
  };
  const result: ReplySection[] = [completed];
  let passed = 0;
  let between: ReplySection | undefined;
  for (const unit of units) {
    if (anchors.has(unit.id) || unit.kind === "notice") {
      result.push({ id: unit.id, folded: false, units: [unit] });
      if (anchors.has(unit.id)) {
        passed++;
        between = undefined;
      }
    } else if (passed === 0 || passed === anchors.size)
      completed.units.push(unit);
    else {
      if (!between) {
        between = {
          id: "between:" + unit.id,
          folded: true,
          variant: "process",
          units: [],
        };
        result.push(between);
      }
      between.units.push(unit);
    }
  }
  return result.filter((section) => section.units.length);
}
