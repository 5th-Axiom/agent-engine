import {
  mountChatWidget,
  createHttpChatTransport,
  createSessionMemory,
} from "/assets/agent-chat.mjs";

const $ = (s) => document.querySelector(s);
const searchDialog = $("#search-dialog"),
  searchInput = $("#search-input"),
  results = $("#search-results"),
  searchStatus = $("#search-status");
const navDialog = $("#mobile-nav"),
  offlineDialog = $("#offline-dialog"),
  main = $("#main");
let searchIndex = [],
  indexPromise,
  activeResult = -1,
  chat,
  viewSequence = 0,
  toastTimer,
  tocObserver;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const footer = main.querySelector(".site-footer").outerHTML;
const sources = new Map();
const available = document.body.dataset.chatAvailable === "true";
const tell = (message) => {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2800);
};

function loadIndex() {
  if (!indexPromise)
    indexPromise = fetch("/api/search-index")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => (searchIndex = data))
      .catch((error) => {
        indexPromise = undefined;
        throw error;
      });
  return indexPromise;
}
function updateTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("agent-docs-theme", theme);
  } catch {}
  $(".theme-button").setAttribute(
    "aria-label",
    theme === "dark" ? "切换浅色模式" : "切换深色模式",
  );
  chat?.updateTheme({
    mode: theme,
    skin: "workbench",
    accent: theme === "dark" ? "#8ec5ff" : "#0758a0",
  });
}
$(".theme-button").addEventListener("click", () =>
  updateTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  ),
);

function renderSources() {
  const section = $("#assistant-sources");
  if (!section) return;
  section.replaceChildren();
  section.hidden = sources.size === 0;
  if (!sources.size) return;
  const h = document.createElement("h2");
  h.textContent = "助手提到的文档";
  section.append(h);
  for (const [url, title] of sources) {
    const a = document.createElement("a");
    a.href = url;
    a.textContent = title;
    section.append(a);
  }
}
function openChat(question) {
  if (chat) {
    chat.open();
    if (question) {
      if (chat.controller.snapshot.draft.trim()) {
        tell("已保留你正在编辑的问题。");
      } else chat.controller.setDraft(question);
    }
  } else offlineDialog.showModal();
}
if (available) {
  let memory;
  try {
    memory = createSessionMemory(localStorage, "docs-site:" + location.origin);
  } catch {}
  chat = mountChatWidget({
    transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
    memory,
    theme: {
      mode: document.documentElement.dataset.theme,
      skin: "workbench",
      accent: "#0758a0",
      tokens: { panelWidth: 440, panelHeight: 680 },
    },
    copy: {
      title: "文档助手",
      launcherLabel: "打开文档助手",
      welcomeTitle: "哪一步需要帮忙？",
      welcomeMessage:
        "我会优先查阅项目文档，帮你完成安装、配置和接入。也可以和我随便聊聊。",
      placeholder: "例如：我该把 API Key 放在哪里？",
      footnote: "项目问题优先查阅文档。勿发送密钥；提问会交给已配置的模型。",
    },
    suggestions: [
      "第一次怎么在本地运行？",
      "API Key 应该放在哪里？",
      "怎么把聊天图标接入我的后台？",
    ],
    onOpenChange: (open) => {
      $("#launcher-hint").hidden = open;
    },
    onStateChange: (state) => {
      sources.clear();
      const run = state.session?.runs.at(-1);
      if (run?.state === "completed")
        for (const match of run.output.matchAll(/\/docs\/([a-z-]+)\//g)) {
          const a = searchIndex.find((a) => a.id === match[1]);
          if (a) sources.set(a.url, a.title);
        }
      renderSources();
    },
  });
  chat.ready.catch(() => tell("助手连接未完成，仍可阅读和搜索文档。"));
} else {
  $("#offline-launcher").hidden = false;
  $("#launcher-hint").textContent = "文档助手 · 待连接";
  $("#offline-launcher").addEventListener("click", () => openChat());
}
updateTheme(document.documentElement.dataset.theme);
loadIndex().catch(() => {});

function setResult(n) {
  const links = [...results.querySelectorAll("a")];
  activeResult = Math.max(0, Math.min(n, links.length - 1));
  links.forEach((a, i) => (a.dataset.selected = String(i === activeResult)));
  links[activeResult]?.scrollIntoView({ block: "nearest" });
}
function search() {
  const query = searchInput.value.trim().toLowerCase().slice(0, 240);
  results.replaceChildren();
  activeResult = -1;
  if (!query) {
    searchStatus.textContent = "输入关键词，例如“密钥”“接入”“Debug”。";
    return;
  }
  const words = query.match(/[a-z0-9_.-]+|[\p{Script=Han}]+/gu) ?? [];
  const tokens = [
    ...new Set(
      words.flatMap((w) =>
        /\p{Script=Han}/u.test(w) && w.length > 2
          ? [
              w,
              ...Array.from({ length: w.length - 1 }, (_, i) =>
                w.slice(i, i + 2),
              ),
            ]
          : [w],
      ),
    ),
  ];
  const found = searchIndex
    .map((a) => {
      const label = (a.title + " " + a.keywords).toLowerCase(),
        body = a.text.toLowerCase();
      return {
        ...a,
        score:
          tokens.reduce(
            (n, t) =>
              n + (label.includes(t) ? 7 : 0) + (body.includes(t) ? 1 : 0),
            0,
          ) + (label.includes(query) ? 12 : 0),
      };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  searchStatus.textContent = found.length
    ? `找到 ${found.length} 篇相关文档`
    : "没有找到匹配文档。试试更短的词，或问问文档助手。";
  for (const item of found) {
    const a = document.createElement("a");
    a.href = item.url;
    const group = document.createElement("small");
    group.textContent = item.group;
    const title = document.createElement("strong");
    title.textContent = item.title;
    const p = document.createElement("p");
    p.textContent = item.description;
    a.append(group, title, p);
    results.append(a);
  }
  if (found.length) setResult(0);
}
async function openSearch() {
  if (chat?.isOpen) chat.close();
  searchDialog.showModal();
  searchInput.focus();
  searchStatus.textContent = "正在加载文档索引…";
  try {
    await loadIndex();
    search();
  } catch {
    searchStatus.textContent =
      "文档索引加载失败，请关闭后重新打开。仍可通过左侧目录阅读。";
  }
}
document
  .querySelectorAll("[data-search]")
  .forEach((b) => b.addEventListener("click", openSearch));
searchInput.addEventListener("input", search);
searchInput.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    setResult(activeResult + (e.key === "ArrowDown" ? 1 : -1));
  }
  if (e.key === "Enter") {
    e.preventDefault();
    results.querySelectorAll("a")[activeResult]?.click();
  }
});
$("[data-close-search]").addEventListener("click", () => searchDialog.close());
$(".mobile-menu").addEventListener("click", () => navDialog.showModal());
$("[data-close-menu]").addEventListener("click", () => navDialog.close());
$("[data-close-offline]").addEventListener("click", () =>
  offlineDialog.close(),
);
for (const dialog of [searchDialog, navDialog, offlineDialog])
  dialog.addEventListener("click", (e) => {
    const rect = dialog.getBoundingClientRect();
    if (
      e.target === dialog &&
      (e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom)
    )
      dialog.close();
  });
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (searchDialog.open) searchDialog.close();
    else void openSearch();
  }
});

function refreshTOC() {
  tocObserver?.disconnect();
  tocObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          for (const link of $("#toc").querySelectorAll("a"))
            link.setAttribute(
              "aria-current",
              String(
                decodeURIComponent(link.hash.slice(1)) === entry.target.id,
              ),
            );
        }
    },
    { rootMargin: "-90px 0px -65% 0px", threshold: 0 },
  );
  main.querySelectorAll(".prose h2").forEach((h) => tocObserver.observe(h));
}
function scrollToLocation(focus = false) {
  let target;
  try {
    target = location.hash
      ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
      : undefined;
  } catch {}
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
  if (focus) main.querySelector("h1")?.focus({ preventScroll: true });
}
async function navigate(url, push = true, restoreY) {
  if (push)
    history.replaceState({ scrollY: window.scrollY }, "", location.href);
  const seq = ++viewSequence;
  try {
    const id = /^\/docs\/([a-z-]+)\/?$/.exec(url.pathname)?.[1];
    if (!id) {
      location.href = url.href;
      return;
    }
    const response = await fetch("/api/articles/" + id);
    if (!response.ok) throw Error();
    const page = await response.json();
    if (seq !== viewSequence) return;
    const apply = () => {
      if (push) history.pushState({}, "", url.pathname + url.hash);
      main.innerHTML =
        page.html +
        '<section id="assistant-sources" hidden aria-label="助手提到的文档"></section>' +
        footer;
      $("#toc").replaceChildren();
      for (const heading of page.toc.filter((h) => h.level === 2)) {
        const a = document.createElement("a");
        a.href = "#" + encodeURIComponent(heading.id);
        a.textContent = heading.text;
        $("#toc").append(a);
      }
      document.body.dataset.article = id;
      document.title = page.title + " · Agent Engine 文档";
      document.querySelector("meta[name=description]").content =
        page.description;
      document.querySelectorAll(".nav-group a").forEach((a) => {
        if (a.pathname === url.pathname) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
      renderSources();
      refreshTOC();
      scrollToLocation(true);
      if (!url.hash && Number.isFinite(restoreY)) window.scrollTo(0, restoreY);
    };
    if (document.startViewTransition && !reduced.matches)
      await document.startViewTransition(apply).finished;
    else apply();
  } catch {
    if (seq === viewSequence) location.href = url.href;
  }
}
document.addEventListener("click", async (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const copy = target.closest(".copy-code");
  if (copy) {
    try {
      await navigator.clipboard.writeText(
        copy.closest(".code-block").querySelector("code").textContent,
      );
      copy.textContent = "已复制";
      tell("代码已复制。");
      setTimeout(() => (copy.textContent = "复制"), 1800);
    } catch {
      tell("无法自动复制，请选中代码后手动复制。");
    }
    return;
  }
  const ask = target.closest(".ask-article");
  if (ask) {
    openChat(
      `我正在阅读《${ask.dataset.ask}》（/docs/${document.body.dataset.article}/）。请用适合初学者的步骤解释，我应该先做什么？`,
    );
    return;
  }
  if (target.closest("[data-open-chat]")) {
    openChat();
    return;
  }
  const a = target.closest("a");
  if (
    !a ||
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey ||
    a.target ||
    a.hasAttribute("download")
  )
    return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/docs/"))
    return;
  if (searchDialog.open) searchDialog.close();
  if (navDialog.open) navDialog.close();
  if (offlineDialog.open) offlineDialog.close();
  if (url.pathname === location.pathname && url.hash) return;
  e.preventDefault();
  await navigate(url);
});
window.addEventListener(
  "popstate",
  (e) => void navigate(new URL(location.href), false, e.state?.scrollY),
);
refreshTOC();
window.addEventListener("pagehide", (e) => {
  if (!e.persisted) chat?.destroy();
});
