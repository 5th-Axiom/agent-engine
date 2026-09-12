import { deliveryForms } from "./delivery.js";
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
const pages: Omit<Article, "markdown" | "source">[] = [
  {
    id: "welcome",
    title: "从这里开始",
    group: "开始使用",
    description: "按场景接入，代码可以直接运行。",
    keywords: "产品 介绍 总览 接入",
  },
  {
    id: "installation",
    title: "环境准备与交付方式",
    group: "开始使用",
    description: "确认可用交付方式，准备数据库、模型和运行环境。",
    keywords: "环境 安装 npm pnpm tgz CLI 压缩包 安装包",
  },
  {
    id: "integration",
    title: "跑通一条完整接入路径",
    group: "开始使用",
    description:
      "选择仅后端、已有后端的前端或前后端完整示例，运行后继续接入业务。",
    keywords: "完整 接入 路径 示例 全栈 auth",
  },
  {
    id: "sdk",
    title: "创建第一个对话",
    group: "使用场景",
    description: "初始化 Engine、创建 Session、发送消息，读取回答并关闭资源。",
    keywords: "createAgentEngine createSession run 后端 SDK",
  },
  {
    id: "sessions",
    title: "继续对话与更新配置",
    group: "使用场景",
    description: "恢复会话，用 requestId 安全重试，通过版本检查更新配置。",
    keywords: "session loadSession replaceConfig requestId CAS 历史",
  },
  {
    id: "images",
    title: "发送图片与读取历史图片",
    group: "使用场景",
    description: "从上传、预览到模型理解与追问；支持工具返回的历史会话图片。",
    keywords: "image 图片 多模态 vision uploadImage attachments 粘贴 拖拽",
  },
  {
    id: "tools",
    title: "调用业务工具",
    group: "使用场景",
    description: "用类型推导同时定义工具契约和执行绑定，显式启用。",
    keywords: "defineBoundTool defineTool tool binding 工具 库存",
  },
  {
    id: "skills",
    title: "调用 Skill",
    group: "使用场景",
    description: "为助手提供可复用的工作步骤，观察技能选择和工具限制。",
    keywords: "Skill 技能 defineSkill select",
  },
  {
    id: "knowledge",
    title: "检索知识与引用来源",
    group: "使用场景",
    description: "连接检索器，用授权资料回答并返回可追溯的引用。",
    keywords: "知识库 knowledge defineKnowledgeBase citations sourceId",
  },
  {
    id: "memory",
    title: "读取跨会话记忆",
    group: "使用场景",
    description: "按可信身份隔离偏好，在运行中读取和冻结记忆。",
    keywords: "memory 读取记忆 namespace",
  },
  {
    id: "events",
    title: "展示进度、停止与用量",
    group: "使用场景",
    description: "订阅执行事件，恢复断线界面，停止运行并读取模型用量。",
    keywords: "事件 subscribe startRun cancelRun usage 用量",
  },
  {
    id: "debug",
    title: "接入 Debug 控制台",
    group: "使用场景",
    description: "启动只读调试页，定位一次运行的模型、工具与权限问题。",
    keywords: "Debug startDebugServer 调试 控制台",
  },
  {
    id: "frontend",
    title: "嵌入聊天界面",
    group: "使用场景",
    description: "将聊天窗口挂到现有网站，连接已经提供的聊天接口。",
    keywords: "mountChatWidget 前端 React Vue frontend SDK",
  },
  {
    id: "frontend-server",
    title: "连接登录与用户权限",
    group: "使用场景",
    description: "认证每次请求，再取得该用户的 Engine 作用域。",
    keywords: "authorize 鉴权 登录 createChatHandler Cookie Origin",
  },
  {
    id: "frontend-customize",
    title: "调整主题与页面布局",
    group: "使用场景",
    description: "换肤、响应式布局、历史管理与卸载清理。",
    keywords: "theme tokens 主题 皮肤 生命周期",
  },
  {
    id: "models",
    title: "配置模型与密钥",
    group: "使用场景",
    description: "配置协议、能力与限制，集中解析服务端凭据。",
    keywords: "模型 secretRef MODEL_API_KEY PROTOCOL_KEY settings",
  },
  {
    id: "api",
    title: "API 参考",
    group: "参考",
    description: "按公开符号查输入、返回、默认行为和错误。",
    keywords: "API 参数 defineSessionConfig ImageStorage authorize",
  },
  {
    id: "troubleshooting",
    title: "按现象排错",
    group: "参考",
    description: "定位连接、认证、模型、会话和图片错误。",
    keywords: "失败 错误 排错 busy permissions",
  },
  {
    id: "concepts",
    title: "术语速查",
    group: "参考",
    description: "用到新名词时查询其含义。",
    keywords: "术语 Session Run Step Attempt",
  },
  {
    id: "rules",
    title: "支持范围与运行规则",
    group: "参考",
    description: "查阅实现边界、恢复和保留规则。",
    keywords: "范围 规则 replay 分布式",
  },
  {
    id: "capabilities",
    title: "能力接入索引（旧链接）",
    group: "附录",
    description: "技能、知识库与记忆已拆为独立场景，旧链接仍可访问。",
    keywords: "能力 索引",
  },
  {
    id: "quickstart",
    title: "运行仓库示例",
    group: "附录",
    description: "准备源码开发环境，运行本地 Playground。",
    keywords: "Docker PostgreSQL Node 本地",
  },
  {
    id: "local-models",
    title: "示例宿主的本地配置",
    group: "附录",
    description: "仓库 Playground 与文档站的本地凭据加载器。",
    keywords: "Profile .local .secrets",
  },
  {
    id: "playground",
    title: "Playground 操作手册",
    group: "附录",
    description: "测试聊天、工具和调试记录。",
    keywords: "Playground 4318",
  },
  {
    id: "docs-site",
    title: "文档站启动与维护",
    group: "附录",
    description: "启动本站，更新内容和配置文档助手。",
    keywords: "4320 维护 文档站",
  },
];

export async function loadArticles(): Promise<Article[]> {
  return Promise.all(
    pages.map(async (page) => {
      const file =
        page.id === "local-models"
          ? "../../docs/local-model-configuration.md"
          : undefined;
      let markdown = await readFile(
        new URL(file ?? "./content/" + page.id + ".md", import.meta.url),
        "utf8",
      );
      markdown = markdown.replace(
        "{{delivery}}",
        "| 形态 | 当前状态 | 使用入口 |\n| --- | --- | --- |\n" +
          deliveryForms
            .map(
              (form) =>
                `| ${form.label} | ${form.status === "available" ? "当前可用" : "待确定"} | ${"href" in form ? `[查看接入方法](${form.href})` : "发布后补充"} |`,
            )
            .join("\n"),
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
          "~~~ts " + match[1] + "\n" + code.trimEnd() + "\n~~~",
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

export const headingSlug = (text: string) =>
  text
    .replace(/<[^>]*>/g, "")
    .replace(/[*`]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";
export function articleSections(article: Article) {
  const sections: { id: string; title: string; text: string }[] = [
    { id: "", title: article.title, text: "" },
  ];
  const seen = new Map<string, number>();
  let fence = "";
  for (const line of article.markdown.split("\n")) {
    const marker = /^(~{3,}|`{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker[0]!;
      else if (marker[0] === fence) fence = "";
    }
    const heading = !fence && /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      const title = plainText(heading[2]!);
      const base = headingSlug(title);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      sections.push({ id: base + (n ? `-${n}` : ""), title, text: "" });
    } else sections.at(-1)!.text += line + "\n";
  }
  return sections.map((section) => ({
    ...section,
    text: plainText(section.text),
  }));
}
