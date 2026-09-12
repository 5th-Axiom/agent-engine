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
