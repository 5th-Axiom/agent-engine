import { readFile } from "node:fs/promises";

export interface Article {
  id: string;
  title: string;
  group: string;
  description: string;
  keywords: string;
  markdown: string;
  source?: string;
}
const pages: {
  id: string;
  title: string;
  group: string;
  description: string;
  keywords: string;
  file?: string;
}[] = [
  {
    id: "welcome",
    title: "将 Agent 接入你的产品",
    group: "接入指南",
    description: "使用现成聊天界面，或直接调用后端能力。选择适合你的接入方式。",
    keywords: "总览 选择 前端 后端 接入 SDK 架构",
  },
  {
    id: "installation",
    title: "安装与包的选择",
    group: "接入指南",
    description: "按前端、后端或全栈项目选择依赖，准备当前开发版安装包。",
    keywords: "安装 npm pnpm tgz 包 版本",
  },
  {
    id: "frontend",
    title: "前端 SDK：接入聊天界面",
    group: "前端 SDK",
    description: "在已有网站挂上聊天图标，或放进页面；从最小示例开始。",
    keywords: "前端 SDK 接入 React Vue icon IM 嵌入 mountChatWidget",
  },
  {
    id: "frontend-server",
    title: "连接后端与用户登录",
    group: "前端 SDK",
    description: "让聊天请求进入你的 Node 服务，并使用已有的登录和权限体系。",
    keywords:
      "前端 后端 接口 服务端 鉴权 Cookie Token Origin createChatHandler",
  },
  {
    id: "frontend-customize",
    title: "主题、组件与对话管理",
    group: "前端 SDK",
    description: "换肤、改品牌色、响应式布局，以及历史、退出和自定义组件。",
    keywords: "前端 颜色 皮肤 token 响应式 生命周期 历史 组件",
  },
  {
    id: "sdk",
    title: "后端 SDK：创建与调用 Agent",
    group: "后端 SDK",
    description:
      "在自己的 Node 项目中初始化引擎，创建会话，发送消息并获取回答。",
    keywords:
      "后端 SDK 接入 createAgentEngine createSession run Node Typescript",
  },
  {
    id: "models",
    title: "模型配置与密钥管理",
    group: "后端 SDK",
    description: "模型参数留在配置中，API Key 从服务端统一解析。",
    keywords: "模型 配置 密钥 API Key secretRef env token",
  },
  {
    id: "sessions",
    title: "会话、消息与配置更新",
    group: "后端 SDK",
    description: "保存 sessionId 继续对话，区分新消息和重试，按版本更新配置。",
    keywords: "会话 session 消息 run requestId 续聊 历史 幂等 配置",
  },
  {
    id: "tools",
    title: "接入自己的业务工具",
    group: "后端 SDK",
    description: "把查询库存等业务方法交给 Agent：先定义契约，再绑定实现。",
    keywords: "工具 tool binding defineTool 查询 库存 业务 权限",
  },
  {
    id: "capabilities",
    title: "技能、知识库与记忆",
    group: "后端 SDK",
    description: "为助手补充工作步骤、可检索资料和跨会话记忆。",
    keywords: "skill 技能 knowledge 知识库 memory 记忆 文档规则",
  },
  {
    id: "events",
    title: "运行状态、事件与用量",
    group: "后端 SDK",
    description: "让自己的页面展示执行进度、停止操作、错误和模型用量。",
    keywords: "事件 subscribe 流式 状态 停止 cancel token usage 用量",
  },
  {
    id: "debug",
    title: "接入 Debug 调试页",
    group: "后端 SDK",
    description: "给开发者挂载只读执行记录，定位模型、工具和权限问题。",
    keywords: "Debug 调试 错误 日志 startDebugServer",
  },
  {
    id: "api",
    title: "SDK 接口与执行约定",
    group: "参考",
    description: "查询精确参数与恢复、权限和用量规则；正文直接同步源码手册。",
    keywords: "API 参数 执行 retry fallback 接口",
    file: "../../docs/sdk-usage.md",
  },
  {
    id: "troubleshooting",
    title: "接入常见问题",
    group: "参考",
    description: "按连接、登录、模型和会话四类现象排查。",
    keywords: "错误 连接 失败 排错 busy permissions",
  },
  {
    id: "concepts",
    title: "术语速查",
    group: "参考",
    description: "用到一个新名词时，再来这里查它的含义。",
    keywords: "术语 概念 session run step attempt",
  },
  {
    id: "rules",
    title: "支持范围与使用规则",
    group: "参考",
    description: "了解当前已实现的能力，以及接入方需要提供的部分。",
    keywords: "范围 规则 npm 发布 分布式 worker replay",
  },
  {
    id: "quickstart",
    title: "在本地运行示例",
    group: "附录",
    description:
      "可选：准备源码开发环境，体验 Playground；接入业务项目无需先跑此页。",
    keywords: "本地 Docker Node PostgreSQL 4318 示例",
  },
  {
    id: "local-models",
    title: "示例宿主的本地配置",
    group: "附录",
    description: "仅适用于仓库 Playground 和文档站的本地凭据加载器。",
    keywords: "本地 Profile 配置 LOCAL_CONFIG .secrets .local",
    file: "../../docs/local-model-configuration.md",
  },
  {
    id: "playground",
    title: "Playground 操作手册",
    group: "附录",
    description: "可选：用随仓库提供的页面测试聊天、工具和调试记录。",
    keywords: "Playground 测试 页面 本地 停止",
  },
  {
    id: "docs-site",
    title: "文档站启动与维护",
    group: "附录",
    description: "维护本站的人从这里启动服务、更新内容和配置文档助手。",
    keywords: "文档站 4320 维护 启动 只读",
  },
];

export async function loadArticles(): Promise<Article[]> {
  return Promise.all(
    pages.map(async ({ file, ...page }) => {
      let markdown = await readFile(
        new URL(file ?? "./content/" + page.id + ".md", import.meta.url),
        "utf8",
      );
      // Code shown in the manual is read from the same source files checked by TypeScript.
      for (const match of [
        ...markdown.matchAll(/\{\{code:([a-z-]+\.ts)\}\}/g),
      ]) {
        const code = await readFile(
          new URL("./snippets/" + match[1], import.meta.url),
          "utf8",
        );
        markdown = markdown.replace(
          match[0],
          "~~~ts\n" + code.trimEnd() + "\n~~~",
        );
      }
      return {
        ...page,
        ...(file ? { source: file.replace("../../", "") } : {}),
        markdown: markdown
          .replace(/^# .*\n/, "")
          .replace(/^\[返回文档导航\].*\n/m, "")
          .replaceAll(
            "/Users/circle/git/agent-engine",
            "/path/to/agent-engine",
          ),
      };
    }),
  );
}

export const articlePath = (id: string) => `/docs/${id}/`;
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*\x60>|]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Full words plus overlapping Chinese bigrams preserve useful matches without a remote index.
export function searchArticles(articles: Article[], query: string, limit = 5) {
  const normalized = query.trim().toLowerCase().slice(0, 240);
  if (!normalized) return [];
  const words = normalized.match(/[a-z0-9_.-]+|[\p{Script=Han}]+/gu) ?? [];
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
  return articles
    .map((a) => {
      const body = plainText(a.markdown),
        lower = body.toLowerCase(),
        title = (a.title + " " + a.keywords).toLowerCase();
      const score =
        tokens.reduce(
          (n, t) =>
            n + (title.includes(t) ? 7 : 0) + (lower.includes(t) ? 1 : 0),
          0,
        ) + (title.includes(normalized) ? 12 : 0);
      const matches = tokens.map((t) => lower.indexOf(t)).filter((n) => n >= 0);
      const offset = Math.max(0, Math.min(...matches, body.length) - 180);
      return {
        id: a.id,
        title: a.title,
        url: articlePath(a.id),
        description: a.description,
        excerpt: body.slice(offset, offset + 2200),
        score,
      };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
