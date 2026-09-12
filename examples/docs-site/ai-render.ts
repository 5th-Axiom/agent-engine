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
<div class="ai-context"><span class="ai-context-intro">文档、API、示例和公开源码，直接问。</span><span id="reading-trail" hidden><a href="/docs/welcome/"></a><button id="clear-reading" class="icon-button" aria-label="移除阅读位置">${icon("close")}</button></span><a href="/ai/capabilities/">能力与记忆 ${icon("arrow")}</a></div>
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

export function renderSettingsPage(available: boolean) {
  return `${head("会话配置")}<body class="settings-mode" data-chat-available="${available}"><header class="site-header"><a class="brand" href="/ai/">${icon("chat")}返回文档助手</a><button class="icon-button theme-button" aria-label="切换深色模式">${icon("sun")}</button></header><div class="settings-links"><a href="/ai/capabilities/#memory">管理长期记忆</a><a href="/ai/capabilities/#experiments">验证配置能力</a></div><main id="chat-settings">${available ? '<p class="settings-loading" role="status">正在打开会话配置…</p>' : '<p class="settings-loading">文档助手尚未连接。<a href="/docs/docs-site/">查看启动方法</a></p>'}</main><noscript><p>配置页面需要 JavaScript。</p></noscript><script type="module" src="/assets/settings.js"></script></body></html>`;
}

export function renderCapabilitiesPage(available: boolean) {
  return `${head("能力工作台").replace("</head>", '<link rel="stylesheet" href="/assets/capabilities.css"></head>')}<body class="capability-mode" data-chat-available="${available}">
<!-- THESIS: Inspect the SDK through working conversations and bounded experiments. OWN-WORLD: Existing white/slate surfaces, blue actions and native forms. STORY: Choose a capability, use it, inspect the recorded result. FIRST VIEWPORT: Heading and scope, four navigation links, capability rows with direct entry points. FORM: Extend the incumbent docs workbench, code-led. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. -->
<a class="skip" href="#cap-main">跳到工作台</a><header class="site-header"><a class="brand" href="/ai/">${icon("chat")}返回文档助手</a><a class="cap-help" href="/docs/docs-site/">接入说明</a><button class="icon-button theme-button" aria-label="切换深色模式">${icon("sun")}</button></header>
<main id="cap-main" class="cap-main" tabindex="-1"><h1>能力工作台</h1><p class="cap-intro">从真实对话到配置实验，查看 SDK 实际执行了什么。</p>
<nav class="cap-nav" aria-label="工作台"><a href="#overview" aria-current="page">已接入能力</a><a href="#memory">长期记忆</a><a href="#experiments">配置实验</a><a href="#debug">会话调试</a></nav>
<p id="cap-status" role="status">${available ? "正在读取已接入能力…" : "文档助手尚未连接。请按接入说明启动模型与数据库。"}</p>
<section id="overview" class="cap-panel" aria-label="已接入能力"><div id="cap-overview"></div></section>
<section id="memory" class="cap-panel" aria-labelledby="memory-heading" hidden><div class="cap-section-head"><h2 id="memory-heading">长期记忆</h2><button id="memory-refresh" class="button">刷新记忆</button></div><p class="cap-note">这里显示当前浏览器身份保存的偏好。写入前需在对话中确认，默认保留 30 天。关闭读取不会删除已保存内容，也不会抹去历史对话中的引用。</p><div id="memory-list"></div></section>
<section id="experiments" class="cap-panel" aria-labelledby="experiment-heading" hidden><h2 id="experiment-heading">配置实验</h2><p class="cap-note">使用确定性模型与合成数据，执行真实 SDK。每次运行使用独立内存存储，不调用外部模型；实验报告保存在本站存储中。这里验证配置与执行契约，供应商兼容性和进程崩溃恢复需单独验收。</p><div class="experiment-layout"><form id="experiment-form"><label for="experiment-select">选择验证场景</label><select id="experiment-select" required></select><p id="experiment-description"></p><label id="experiment-option" class="cap-check"><input id="experiment-enabled" type="checkbox" checked><span></span></label><button id="experiment-run" class="button primary" type="submit">运行实验</button><a id="experiment-doc" href="/docs/sdk/">查看接入方法</a></form><div id="experiment-result" aria-live="polite"><p class="cap-empty">选择一个场景，运行后会在这里显示检查结果、事件和配置。</p></div></div><details class="cap-details"><summary>最近的实验记录</summary><div id="experiment-history"></div></details></section>
<section id="debug" class="cap-panel" aria-labelledby="debug-heading" hidden><div class="cap-section-head"><h2 id="debug-heading">会话调试</h2><button id="debug-refresh" class="button">刷新会话</button></div><p class="cap-note">读取当前身份下的 SDK 调试快照：Run、步骤、工具操作、Usage 和事件。正在运行的会话请按需刷新。模型密钥与私有协议块不会展示。</p><label for="debug-select">选择会话</label><select id="debug-select"><option value="">请选择会话</option></select><div id="debug-result"></div></section>
</main><noscript><p>工作台需要 JavaScript。<a href="/docs/docs-site/">阅读接入说明</a></p></noscript><script type="module" src="/assets/capabilities.js"></script></body></html>`;
}
