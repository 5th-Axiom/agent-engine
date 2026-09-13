import {
  mountChatWidget,
  createHttpChatTransport,
} from "/assets/agent-chat.mjs";
import {
  preserveDraft,
  chatMemory,
  chatHistoryMemory,
  chatTheme,
  rememberReading,
  restoreReading,
  loadReferenceResolver,
} from "/assets/chat-shared.js";

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
  tocObserver,
  readingPreparedForAI = false,
  leavingForAI = false;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
// SPA history and cross-mode returns restore their own positions.
history.scrollRestoration = "manual";
const aiModeLink = document.querySelector('[data-mode="ai"]');
const prepareReadingReturn = () => {
  rememberReading();
  readingPreparedForAI = true;
};
aiModeLink.addEventListener("pointerdown", prepareReadingReturn);
aiModeLink.addEventListener("keydown", (event) => {
  if (event.key === "Enter") prepareReadingReturn();
});
const footer = main.querySelector(".site-footer").outerHTML;
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
    ...chatTheme(),
    tokens: { panelWidth: 440, panelHeight: 720, breakpoint: 800 },
  });
}
$(".theme-button").addEventListener("click", () =>
  updateTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  ),
);

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
  const getRunSources = await loadReferenceResolver();
  chat = mountChatWidget({
    panelMode: "side",
    sendShortcut: "enter",
    transport: createHttpChatTransport({ baseURL: "/api/agent-chat" }),
    memory: chatMemory(),
    historyMemory: chatHistoryMemory(),
    settingsUrl: "/ai/settings/",
    theme: {
      ...chatTheme(),
      tokens: { panelWidth: 440, panelHeight: 720, breakpoint: 800 },
    },
    getRunSources,
    copy: {
      title: "文档助手",
      launcherLabel: "打开文档助手",
      welcomeTitle: "哪一步需要帮忙？",
      welcomeMessage:
        "我会优先查阅接入手册，帮你选择前端或后端 SDK、理解代码和使用规则。也可以随便聊聊。",
      placeholder: "例如：如何把聊天图标接入我的后台？",
      footnote: "项目问题优先查阅文档。勿发送密钥；提问会交给已配置的模型。",
    },
    suggestions: [
      "前端 SDK 怎么接入我的后台？",
      "后端 SDK 怎么创建会话并续聊？",
      "如何让助手回答产品使用规则？",
    ],
    onOpenChange: (open) => {
      $("#launcher-hint").hidden = open;
      document.body.dataset.chatOpen = String(open);
    },
  });
  preserveDraft(chat);
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
    const sections = (
      item.sections ?? [{ id: "", title: item.title, text: item.text }]
    )
      .map((section) => {
        const text = (section.title + " " + section.text).toLowerCase();
        return {
          ...section,
          score:
            tokens.reduce(
              (n, token) =>
                n +
                (text.includes(token) ? 1 : 0) +
                (section.title.toLowerCase().includes(token) ? 3 : 0),
              0,
            ) + (text.includes(query) ? 8 : 0),
        };
      })
      .sort((a, b) => b.score - a.score);
    const section = sections[0];
    a.href =
      item.url + (section?.id ? "#" + encodeURIComponent(section.id) : "");
    const group = document.createElement("small");
    group.textContent = item.group + (section?.id ? " · " + section.title : "");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const p = document.createElement("p");
    const body = section?.text || item.description;
    const match = body.toLowerCase().indexOf(query);
    const offsets = tokens
      .map((token) => body.toLowerCase().indexOf(token))
      .filter((n) => n >= 0);
    const offset = Math.max(
      0,
      (match >= 0 ? match : offsets.length ? Math.min(...offsets) : 0) - 60,
    );
    const excerpt =
      (offset ? "…" : "") +
      body.slice(offset, offset + 180).replace(/\s+/g, " ");
    const needle = [query, ...tokens].find((token) =>
      excerpt.toLowerCase().includes(token),
    );
    const hit = needle ? excerpt.toLowerCase().indexOf(needle) : -1;
    if (hit >= 0) {
      const mark = document.createElement("mark");
      mark.textContent = excerpt.slice(hit, hit + needle.length);
      p.append(
        document.createTextNode(excerpt.slice(0, hit)),
        mark,
        document.createTextNode(excerpt.slice(hit + needle.length)),
      );
    } else p.textContent = excerpt;
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

// Progressive enhancement: without JavaScript every framework example remains readable.
let selectFramework;
function revealFramework(hash) {
  try {
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    const panel = target?.closest("[data-framework-panel]");
    if (panel) selectFramework?.(panel.dataset.frameworkPanel, false);
  } catch {}
}
function enhanceArticle() {
  selectFramework = undefined;
  document.querySelectorAll(".nav-group").forEach((group) => {
    group.open = !!group.querySelector('[aria-current="page"]');
  });
  if (document.body.dataset.article !== "frontend") return;
  const prose = main.querySelector(".prose");
  const headings = [...prose.querySelectorAll(":scope > h2")];
  const names = ["最小接入：放上聊天图标", "React 中使用", "Vue 中使用"];
  const targets = names.map((name) =>
    headings.find((h) => h.textContent.replace(/#$/, "") === name),
  );
  if (targets.some((h) => !h)) return;
  const group = document.createElement("div");
  group.className = "framework-examples";
  targets[0].before(group);
  const steps = document.createElement("nav");
  steps.className = "setup-steps";
  steps.setAttribute("aria-label", "前端接入步骤");
  const list = document.createElement("ol");
  for (const [label, href] of [
    ["准备环境", "/docs/installation/"],
    ["挂载界面", "#" + targets[0].id],
    ["连接后端并验证对话", "/docs/frontend-server/"],
  ]) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    if (href.startsWith("#")) link.setAttribute("aria-current", "step");
    item.append(link);
    list.append(item);
  }
  steps.append(list);
  group.append(steps);
  const tabs = document.createElement("div");
  tabs.className = "framework-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "选择前端框架");
  group.append(tabs);
  const keys = ["javascript", "react", "vue"];
  const labels = ["JavaScript", "React", "Vue"];
  const panels = targets.map((heading, i) => {
    const panel = document.createElement("section");
    panel.dataset.frameworkPanel = keys[i];
    panel.id = "example-" + keys[i];
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "tab-" + keys[i]);
    panel.tabIndex = 0;
    let node = heading;
    while (node) {
      const next = node.nextElementSibling;
      panel.append(node);
      if (!next || next.tagName === "H2") break;
      node = next;
    }
    group.append(panel);
    return panel;
  });
  const buttons = keys.map((key, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "tab-" + key;
    tab.textContent = labels[i];
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panels[i].id);
    tab.addEventListener("click", () => selectFramework(key));
    tab.addEventListener("keydown", (event) => {
      const next =
        event.key === "ArrowRight"
          ? (i + 1) % 3
          : event.key === "ArrowLeft"
            ? (i + 2) % 3
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? 2
                : undefined;
      if (next !== undefined) {
        event.preventDefault();
        selectFramework(keys[next]);
        buttons[next].focus();
      }
    });
    tabs.append(tab);
    return tab;
  });
  selectFramework = (key, remember = true) => {
    const selected = keys.indexOf(key);
    if (selected < 0) return;
    panels.forEach((panel, i) => {
      panel.hidden = i !== selected;
      buttons[i].setAttribute("aria-selected", String(i === selected));
      buttons[i].tabIndex = i === selected ? 0 : -1;
    });
    if (remember)
      history.replaceState(
        history.state,
        "",
        "#" + encodeURIComponent(targets[selected].id),
      );
  };
  selectFramework("javascript", false);
  revealFramework(location.hash);
}
window.addEventListener("hashchange", () => revealFramework(location.hash));

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
  if (push) rememberReading();
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
      main.innerHTML = page.html + footer;
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
      enhanceArticle();
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
      `我正在阅读《${ask.dataset.ask}》（/docs/${document.body.dataset.article}/）。请结合我的项目接入场景，用适合初学者的步骤解释这篇文档怎么用，需要哪些配置？`,
    );
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
  if (url.origin === location.origin && url.pathname === "/ai/") {
    if (!readingPreparedForAI) rememberReading();
    leavingForAI = true;
    return;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith("/docs/"))
    return;
  if (searchDialog.open) searchDialog.close();
  if (navDialog.open) navDialog.close();
  if (offlineDialog.open) offlineDialog.close();
  if (url.pathname === location.pathname && url.hash) {
    revealFramework(url.hash);
    return;
  }
  e.preventDefault();
  await navigate(url);
});
window.addEventListener(
  "popstate",
  (e) => void navigate(new URL(location.href), false, e.state?.scrollY),
);
enhanceArticle();
refreshTOC();
restoreReading();
window.addEventListener("pagehide", (e) => {
  if (!leavingForAI) rememberReading();
  if (!e.persisted) chat?.destroy();
});

window.addEventListener("pageshow", (event) => {
  readingPreparedForAI = false;
  leavingForAI = false;
  if (event.persisted) restoreReading();
});
