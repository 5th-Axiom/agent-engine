**目标：** 先检索产品资料，再根据可追溯的片段回答。

## 前置条件

完成[环境准备](/docs/installation/)，导出 [backend 完整示例](/docs/integration/)。下列文件与 backend.ts、settings.ts 放在同一目录；这两个公共初始化文件包含在导出目录中，不需要实现额外的隐藏函数。

## 接入示例

{{code:knowledge-run.ts}}

## 运行与确认

```sh
node --env-file=.env --import tsx knowledge-run.ts
```

输出包含 answer 与 citations。引用中的 sourceId 必须来自实际检索并获准进入上下文的资料。

## 约定与排错

演示检索器只有一条固定资料，不能冒充生产检索。接业务时处理 query、可信 principal 与 signal，并过滤不可见或过期资料。强制引用要求输出 Schema 的对应字段为 sourceId 数组；缺少时在受理阶段报错。

模型不调用能力时，先检查 Session 声明和模型的 tools 能力，再检查事件与 [Debug](/docs/debug/)。权限错误需核对实际主体与宿主策略。接口细节见 [API 参考](/docs/api/)。


## 在文档助手中体验

本站的 `manual` 知识库检索真实场景手册，模型通过 `engine.knowledge.manual` 调用。检索结果带来源 ID；过程列表与会话调试可核对实际执行。「配置」→「知识与记忆」可关闭该知识库。

聊天采用自由文本回答，因此不强制结构化 citations。要观察严格的引用校验，打开[配置实验](/ai/capabilities/#experiments)，选择「引用核验」：实验故意提供一个无效来源 ID，再验证 SDK 是否按配置修复。它使用合成资料，不代表语义准确性评估。
