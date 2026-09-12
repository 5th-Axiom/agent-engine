**目标：** 按已验证身份读取跨会话偏好。

## 前置条件

完成[环境准备](/docs/installation/)，导出 [backend 完整示例](/docs/integration/)。下列文件与 backend.ts、settings.ts 放在同一目录；这两个公共初始化文件包含在导出目录中，不需要实现额外的隐藏函数。

## 接入示例

{{code:memory-run.ts}}

## 运行与确认

```sh
node --env-file=.env --import tsx memory-run.ts
```

执行记录出现 memory.read.completed，模型回答可利用中文与简洁偏好。检查事件确认读取；模型是否遵从偏好还需评估。

## 约定与排错

当前会话历史无需 Memory。自动记忆每个 Run 读取一次，并在重试中冻结；显式读取有独立执行记录。namespace 必须来自可信身份，与模型参数分开。这里只读；写入还需要业务幂等、审批和版本比较。

模型不调用能力时，先检查 Session 声明和模型的 tools 能力，再检查事件与 [Debug](/docs/debug/)。权限错误需核对实际主体与宿主策略。接口细节见 [API 参考](/docs/api/)。
