import { Marked } from "marked";
import { articlePath, type Article } from "./content.js";

export const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const aliases: Record<string, string> = {
  "README.md": "welcome",
  "getting-started.md": "quickstart",
  "local-playground.md": "playground",
  "local-model-configuration.md": "local-models",
  "frontend-sdk.md": "frontend",
  "sdk-quickstart.md": "sdk",
  "sdk-usage.md": "api",
  "troubleshooting.md": "troubleshooting",
};
export const icons: Record<string, string> = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z"/><path d="M13 7a3 3 0 0 1 3-3h4v14h-3a4 4 0 0 0-4 3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chat: '<path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3z"/><path d="M8 8h8m-8 5h5"/>',
  command:
    '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
};
export const icon = (name: string) =>
  `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.book}</svg>`;

export function renderArticle(article: Article, articles: Article[]) {
  const toc: { id: string; text: string; level: number }[] = [];
  const seen = new Map<string, number>();
  const slug = (s: string) =>
    s
      .replace(/<[^>]*>/g, "")
      .replace(/[*`]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "section";
  const parser = new Marked({
    gfm: true,
    renderer: {
      html({ text }) {
        return escapeHTML(text);
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const base = slug(text),
          n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const id = base + (n ? `-${n}` : "");
        toc.push({ id, text: text.replace(/<[^>]+>/g, ""), level: depth });
        return `<h${depth} id="${escapeHTML(id)}">${text}<a class="heading-anchor" href="#${encodeURIComponent(id)}" aria-label="链接到：${escapeHTML(text.replace(/<[^>]+>/g, ""))}">#</a></h${depth}>`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        const [path, hash] = href.split("#");
        const mapped = aliases[path!.replace(/^\.\//, "")];
        if (mapped) href = articlePath(mapped) + (hash ? "#" + hash : "");
        if (/^https?:\/\//i.test(href))
          return `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${text}<span class="sr-only">（新标签页）</span></a>`;
        if (
          href.startsWith("#") ||
          articles.some((a) => href.split("#")[0] === articlePath(a.id))
        )
          return `<a href="${escapeHTML(href)}">${text}</a>`;
        return `<span title="请在项目源码中查看此文件">${text}</span>`;
      },
      image({ text }) {
        return escapeHTML(text);
      },
      code({ text, lang }) {
        return `<div class="code-block"><div class="code-header"><span>${escapeHTML(lang ?? "文本")}</span><button class="copy-code" type="button" aria-label="复制代码">复制</button></div><pre tabindex="0"><code>${escapeHTML(text)}</code></pre></div>`;
      },
    },
  });
  // Keep marked's table renderer; wrap after rendering to avoid recursive renderer calls.
  parser.use({
    renderer: {
      table(token) {
        const row = (cells: typeof token.header, tag: string) =>
          `<tr>${cells.map((c) => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`).join("")}</tr>`;
        return `<div class="table-scroll" tabindex="0" role="region" aria-label="数据表"><table><thead>${row(token.header, "th")}</thead><tbody>${token.rows.map((r) => row(r, "td")).join("")}</tbody></table></div>`;
      },
    },
  });
  const body = parser.parse(article.markdown) as string;
  const index = articles.indexOf(article),
    previous = articles[index - 1],
    next = articles[index + 1];
  const isHome = article.id === "welcome";
  const html = `<div class="breadcrumb"><a href="/docs/welcome/">文档</a><span>/</span><span>${escapeHTML(article.group)}</span></div>
  <div class="article-heading"><h1 tabindex="-1">${escapeHTML(article.title)}</h1><button type="button" class="button ask-article" data-ask="${escapeHTML(article.title)}">${icon("chat")}询问本文</button></div>
  <p class="lead">${escapeHTML(article.description)}</p>
  ${isHome ? `<div class="start-actions"><a class="button primary" href="/docs/frontend/">前端 SDK 接入 ${icon("arrow")}</a><a class="button" href="/docs/sdk/">后端 SDK 接入 ${icon("arrow")}</a></div><div class="process" aria-label="前端接入的调用链路"><span>${icon("chat")}前端 SDK</span><i></i><span>${icon("command")}你的后端</span><i></i><span>${icon("book")}模型与工具</span></div>` : ""}
  ${article.source ? '<p class="source-note">与项目源码手册同步。示例中的 /path/to/agent-engine 请替换为你的项目路径。</p>' : ""}
  <div class="prose">${body}</div>
  <section class="article-help"><div><h2>这一步还不太明白？</h2><p>带着当前文章问一句，继续往下走。</p></div><button class="button ask-article" data-ask="${escapeHTML(article.title)}">${icon("chat")}让助手解释</button></section>
  <nav class="page-turn" aria-label="相邻文章">${previous ? `<a href="${articlePath(previous.id)}"><span>上一篇</span><strong>${escapeHTML(previous.title)}</strong></a>` : "<span></span>"}${next ? `<a href="${articlePath(next.id)}"><span>接下来</span><strong>${escapeHTML(next.title)} ${icon("arrow")}</strong></a>` : "<span></span>"}</nav>`;
  return {
    html,
    toc,
    title: article.title,
    description: article.description,
    id: article.id,
  };
}

export function navigation(articles: Article[], current: string) {
  return [...new Set(articles.map((a) => a.group))]
    .map(
      (group) =>
        `<section class="nav-group"><h2>${escapeHTML(group)}</h2>${articles
          .filter((a) => a.group === group)
          .map(
            (a) =>
              `<a href="${articlePath(a.id)}" ${a.id === current ? 'aria-current="page"' : ""}>${escapeHTML(a.title)}</a>`,
          )
          .join("")}</section>`,
    )
    .join("");
}
export function renderPage(
  article: Article,
  articles: Article[],
  available: boolean,
) {
  const page = renderArticle(article, articles);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="description" content="${escapeHTML(article.description)}"><meta name="color-scheme" content="light dark"><title>${escapeHTML(article.title)} · Agent Engine 文档</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/style.css"><script src="/assets/theme.js"></script></head><body data-article="${article.id}" data-chat-available="${available}">
<!-- THESIS: A Chinese integration manual with two entry routes: ready-made frontend SDK or direct backend SDK.
OWN-WORLD: White #ffffff, navy #172b42, blue #0758a0, ruled workbench surfaces, system reading font.
STORY: Choose a route, install only the needed packages, connect to your application, then configure and extend it. Local demos are appendices.
FIRST VIEWPORT: 64px header, 240px fixed chapter rail, readable main column and 180px contents rail. Two explicit SDK integration actions beneath the heading. Persistent SDK launcher. Signature: ask this article preserves reading position and fills an editable question. Motion: short reading-view crossfade, reduced-motion respected.
FORM: Guided manual with chapter navigation, third structural candidate; seed 46dd2b9c. User requested direct code-led delivery; implementation choice delegated.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
<a class="skip" href="#main">跳到正文</a>
<header class="site-header"><a class="brand" href="/docs/welcome/" aria-label="Agent Engine 文档首页"><span class="brand-mark">${icon("command")}</span><strong>Agent Engine</strong><span class="brand-divider"></span><span class="brand-docs">文档</span></a><div class="header-actions"><button class="search-button" data-search>${icon("search")}<span>搜索文档…</span><kbd>⌘ K</kbd></button><button class="icon-button theme-button" aria-label="切换深色模式">${icon("sun")}</button><button class="icon-button mobile-menu" aria-label="打开文档目录">${icon("menu")}</button></div></header>
<div class="layout"><aside class="sidebar"><nav aria-label="文档导航">${navigation(articles, article.id)}</nav><div class="sidebar-foot"><span class="version-dot"></span>0.1.0-dev · 本地文档</div></aside>
<main id="main" tabindex="-1">${page.html}<section id="assistant-sources" hidden aria-label="助手提到的文档"></section><footer class="site-footer">Agent Engine 文档<span>从接入到使用，有例可循。</span></footer></main>
<aside class="contents"><h2>本文内容</h2><nav id="toc" aria-label="本文目录">${page.toc
    .filter((t) => t.level === 2)
    .map(
      (t) => `<a href="#${encodeURIComponent(t.id)}">${escapeHTML(t.text)}</a>`,
    )
    .join(
      "",
    )}</nav><div class="reading-tip">${icon("chat")}<p>卡在某一步？<br>右下角助手随时帮你。</p><button class="text-action" data-open-chat>问一个问题 ${icon("arrow")}</button></div></aside></div>
<dialog id="search-dialog" aria-label="搜索文档"><div class="search-input-row">${icon("search")}<input id="search-input" type="search" placeholder="搜索问题、功能或错误码" aria-label="搜索文档内容" autocomplete="off"><button class="icon-button" data-close-search aria-label="关闭搜索">${icon("close")}</button></div><p id="search-status" role="status">输入关键词，例如“前端接入”“创建会话”“Debug”。</p><nav id="search-results" aria-label="搜索结果"></nav><div class="search-footer">↑ ↓ 选择 · Enter 打开<span>站内搜索不消耗模型额度</span></div></dialog>
<dialog id="mobile-nav" aria-label="文档目录"><header><strong>文档目录</strong><button class="icon-button" data-close-menu aria-label="关闭文档目录">${icon("close")}</button></header><nav aria-label="移动文档导航">${navigation(articles, article.id)}</nav></dialog>
<dialog id="offline-dialog" aria-labelledby="offline-title"><button class="icon-button" data-close-offline aria-label="关闭助手说明">${icon("close")}</button><h2 id="offline-title">文档助手尚未连接</h2><p>本站正在仅阅读模式运行。你可以继续搜索和阅读文档；准备好模型与数据库后，重新启动即可聊天。</p><a class="button primary" href="/docs/docs-site/">查看启动方法 ${icon("arrow")}</a></dialog>
<button id="offline-launcher" class="offline-launcher" aria-label="打开文档助手" hidden>${icon("chat")}</button><span class="launcher-hint" id="launcher-hint">问问文档助手</span><div id="toast" role="status" class="toast" hidden></div>
<noscript><p class="no-script">正文与链接可以正常阅读。搜索和聊天需要启用 JavaScript。</p></noscript><script type="module" src="/assets/app.js"></script></body></html>`;
}
