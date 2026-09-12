import { escapeHTML, icon } from "./render.js";
import type { SourceFile } from "./knowledge.js";

export function modeNavigation(mode: "ai" | "docs") {
  return `<nav class="mode-switch" aria-label="文档模式"><a data-mode="ai" href="/ai/" ${mode === "ai" ? 'aria-current="page"' : ""}>${icon("chat")}询问文档</a><a data-mode="docs" href="/docs/welcome/" ${mode === "docs" ? 'aria-current="page"' : ""}>${icon("book")}阅读文档</a></nav>`;
}
function head(title: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>${escapeHTML(title)} · Agent Engine</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/style.css"><link rel="stylesheet" href="/assets/ai.css"><script src="/assets/theme.js"></script></head>`;
}
export function renderAiPage(available: boolean) {
  return `${head("文档助手")}<body class="ai-mode" data-chat-available="${available}">
<!-- Extends the existing blue workbench. The SDK conversation is the main workspace; mode links stay visible, sources remain inspectable. -->
<a class="skip" href="#ai-main">跳到对话</a>
<header class="site-header"><a class="brand" href="/" aria-label="Agent Engine 首页"><span class="brand-mark">${icon("command")}</span><strong>Agent Engine</strong></a>${modeNavigation("ai")}<button class="icon-button theme-button" aria-label="切换深色模式">${icon("sun")}</button></header>
<main id="ai-main" class="ai-main" tabindex="-1"><h1 class="sr-only">Agent Engine 文档助手</h1>
<div class="ai-context"><span class="ai-context-intro">文档、API、示例和公开源码，直接问。</span><span id="reading-trail" hidden><a href="/docs/welcome/"></a><button id="clear-reading" class="icon-button" aria-label="移除阅读位置">${icon("close")}</button></span><a href="/docs/welcome/">了解产品与接入方式 ${icon("arrow")}</a></div>
${available ? '<div id="ai-chat" aria-label="文档助手对话"></div><p id="ai-load-status" role="status">正在连接文档助手…</p>' : `<section class="ai-offline"><span class="offline-mark">${icon("chat")}</span><h2>文档助手尚未连接</h2><p>本站正在仅阅读模式运行。你可以先阅读和搜索文档，连接模型与数据库后再来聊天。</p><div class="start-actions"><a class="button primary" href="/docs/welcome/">阅读文档 ${icon("arrow")}</a><a class="button" href="/docs/docs-site/">查看启动方法</a></div></section>`}
</main><noscript><p class="no-script">AI 对话需要 JavaScript。<a href="/docs/welcome/">继续阅读传统文档</a></p></noscript><script type="module" src="/assets/ai.js"></script></body></html>`;
}
export function renderSourcePage(file: SourceFile, revision: string) {
  return `${head(file.path)}<body class="source-mode"><header class="site-header"><a class="brand" href="/ai/">${icon("arrow")}返回 AI 助手</a>${modeNavigation("ai")}</header><main class="source-main"><h1>${escapeHTML(file.path)}</h1><p>已提交源码 · <code>${escapeHTML(revision)}</code> · 本次启动快照，不含未提交改动。</p><pre class="source-code" tabindex="0" aria-label="带行号的源码"><code>${file.text
    .split("\n")
    .map(
      (line, i) =>
        `<span id="L${i + 1}"><a href="#L${i + 1}" aria-label="第 ${i + 1} 行">${i + 1}</a>${escapeHTML(line)}</span>`,
    )
    .join("\n")}</code></pre></main></body></html>`;
}
