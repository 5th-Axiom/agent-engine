**目标：** 回答概念问题时使用可复用的处理步骤。

## 前置条件

完成[环境准备](/docs/installation/)，导出 [backend 完整示例](/docs/integration/)。下列文件与 backend.ts、settings.ts 放在同一目录；这两个公共初始化文件包含在导出目录中，不需要实现额外的隐藏函数。

## 接入示例

{{code:skill-run.ts}}

## 运行与确认

```sh
node --env-file=.env --import tsx skill-run.ts
```

run({ skill: "concise-help", input }) 在第一次模型请求前加载指定的已声明 Skill，无需额外让模型猜测是否选择。查看输出的 skill.* 事件确认实际选择，不能仅凭回答文本判断。

## 约定与排错

allowedTools 只能引用 Session 已声明工具。Skill 不授予权限；也支持模型自主选择和退出；省略 RunInput.skill 时由模型决定。明确的业务场景可直接传 skill，保证首轮应用对应步骤。要强制遵守的全局规则放 instructions。加载器型技能需要版本和声明的 loader Binding，恢复时不接受版本漂移。

模型不调用能力时，先检查 Session 声明和模型的 tools 能力，再检查事件与 [Debug](/docs/debug/)。权限错误需核对实际主体与宿主策略。接口细节见 [API 参考](/docs/api/)。


## 在文档助手中体验

输入框下方的技能选择提供「接入指南」和「问题排查」。前者使用内联 instructions；后者通过带版本及内容哈希的 loader 按需加载。选择技能后发送问题，在过程记录中核对 `skill.loaded`，不能只凭文字风格判断。

「配置」→「Skill」可以关闭某个技能；它会同时从手选目录和模型可自主选择的目录移除。工具的独立禁用仍然生效，Skill 不会提升权限。实际宿主配置见 `examples/docs-site/capabilities.ts`。
