import { createSessionMemory } from "/assets/agent-chat.mjs";

export function chatMemory() {
  try {
    return createSessionMemory(localStorage, "docs-site:" + location.origin);
  } catch {
    return undefined;
  }
}
export function chatTheme() {
  const mode = document.documentElement.dataset.theme;
  return {
    mode,
    skin: "workbench",
    accent: mode === "dark" ? "#8ec5ff" : "#0758a0",
  };
}

const readingKey = "agent-docs:reading";
export function readingPosition() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(readingKey) ?? "null");
    if (
      saved &&
      typeof saved.title === "string" &&
      /^\/docs\/[a-z-]+\/(?:#[^\s]*)?$/.test(saved.url) &&
      Number.isFinite(saved.y) &&
      saved.y >= 0
    )
      return saved;
  } catch {}
  return undefined;
}
export function rememberReading() {
  const title = document.querySelector(".article-heading h1")?.textContent;
  if (!title) return;
  try {
    sessionStorage.setItem(
      readingKey,
      JSON.stringify({
        title,
        url: location.pathname + location.hash,
        y: window.scrollY,
      }),
    );
  } catch {}
}
export function clearReading() {
  try {
    sessionStorage.removeItem(readingKey);
  } catch {}
}
export function markReadingReturn() {
  const saved = readingPosition();
  if (saved) {
    try {
      sessionStorage.setItem("agent-docs:restore-reading", saved.url);
    } catch {}
  }
}
export function restoreReading() {
  try {
    const target = sessionStorage.getItem("agent-docs:restore-reading");
    sessionStorage.removeItem("agent-docs:restore-reading");
    const saved = readingPosition();
    if (
      saved &&
      target === saved.url &&
      target === location.pathname + location.hash
    ) {
      history.scrollRestoration = "manual";
      const restore = () =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.scrollTo(0, saved.y)),
        );
      if (document.readyState === "complete") restore();
      else window.addEventListener("load", restore, { once: true });
    }
  } catch {}
}

// Load allowlists once. Reference links belong to each completed reply and never
// turn arbitrary model strings into HTML or an unvalidated source URL.
export async function loadReferenceResolver() {
  const read = async (url, fallback) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      return response.ok ? await response.json() : fallback;
    } catch {
      return fallback;
    }
  };
  const [documents, snapshot] = await Promise.all([
    read("/api/search-index", []),
    read("/api/source-index", { revision: "", paths: [] }),
  ]);
  return (run) => {
    const links = new Map();
    for (const match of run.output.matchAll(
      /\/docs\/([a-z-]+)\/(?:#[\p{L}\p{N}%_-]+)?/gu,
    )) {
      const article = documents.find((a) => a.id === match[1]);
      if (article) links.set(match[0], article.title);
    }
    for (const match of run.output.matchAll(
      /\/sources\/([a-f0-9]{40,64})\/([\w./-]+)(?:#L(\d+))?/g,
    )) {
      if (match[1] === snapshot.revision && snapshot.paths.includes(match[2]))
        links.set(
          match[0],
          match[2].split("/").slice(-2).join("/") +
            (match[3] ? ":" + match[3] : ""),
        );
    }
    return [...links].map(([href, label]) => ({ href, label }));
  };
}
// Session ID persists in the SDK memory; unsent text stays in this tab only.
export function preserveDraft(chat) {
  const key = "agent-docs:draft";
  try {
    const draft = sessionStorage.getItem(key);
    if (draft) chat.controller.setDraft(draft);
  } catch {}
  const unsubscribe = chat.controller.subscribe((state) => {
    try {
      if (state.draft) sessionStorage.setItem(key, state.draft);
      else sessionStorage.removeItem(key);
    } catch {}
  });
  window.addEventListener("pagehide", (e) => {
    if (!e.persisted) unsubscribe();
  });
  // A BFCache page may hold a stale draft after the other mode was used.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      try {
        chat.controller.setDraft(sessionStorage.getItem(key) ?? "");
      } catch {}
    }
  });
}
