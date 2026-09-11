先确定问题出在浏览器、聊天接入桥、Engine 还是模型供应商。记录错误码和 sessionId / runId 即可，排错时不需要向文档助手发送真实密钥或完整业务数据。

## 图标出现了，但无法聊天

图标出现只表示前端挂载成功。检查 baseURL 是否与后端 createChatHandler 的 basePath 一致，/api/agent-chat 路由是否挂在默认 404 和正文解析中间件之前。

开发环境存在前端代理时，确认代理转发到真实后端；allowedOrigins 填浏览器地址栏的 origin，而不是模型地址或后端地址。接入方式见[连接后端](/docs/frontend-server/)。

## 401、403 或切换账号后看不到历史

401 通常需要恢复宿主登录；403 应检查 origin、助手权限、Engine authorize 及会话所属主体。浏览器提交 tenantId 不会自动成为可信身份。

登录恢复后可 reconnect。换账号时销毁旧实例并重建；会话按用户隔离，新账号看不到原账号历史是预期行为。不要放开 authorize 或共用固定身份来绕过排错。

## 安装包找不到或依赖下载失败

当前包未发布公共 npm，先生成 .tgz，再在业务项目安装。chat-ui / chat-server / debug 的内部依赖需要同版本本地 overrides。只使用后端 sdk 时无需安装 chat-ui。

复制工作区配置时保留已有设置，检查安装包的实际绝对路径。详见[安装与包的选择](/docs/installation/)。

## 模型配置报错

| 现象或错误码             | 先检查                                                 |
| ------------------------ | ------------------------------------------------------ |
| Missing server setting   | 本文示例的 .env 是否通过 --env-file 显式加载           |
| Unknown secret reference | secrets.resolve 是否包含所用的 secretRef               |
| CONFIG_INVALID           | 字段、协议、模型限额是否符合当前 schema                |
| MODEL_AUTH_FAILED        | 服务端 API Key、模型名称和 API 地址                    |
| MODEL_RATE_LIMITED       | 供应商限流，等待后按业务重试策略处理                   |
| MODEL_TIMEOUT            | 网络、API 地址、供应商响应与超时设置                   |
| MODEL_OUTPUT_LIMIT       | 单次输出上限；先缩短回答要求，再按供应商能力调整       |
| CONTEXT_BUDGET_EXCEEDED  | 输入、历史或工具结果过长；控制检索体积并使用上下文策略 |

SDK 不会自动读取 .env。仓库内置 Playground 的 LOCAL_CONFIG_PERMISSIONS 等错误来自本地加载器，需要按其私有文件权限约定处理；这不是所有 SDK 用户必须采用的文件结构。

## Engine 或 Session 忙碌

ENGINE_MANAGER_LOCKED 通常表示同一数据库已有 Engine 管理实例。复用已有实例，或为不同服务使用独立数据库。不要为了启动第二份服务强行解锁或删除数据库。

SESSION_BUSY 表示该会话已有活动运行，先处理现有状态。awaiting_input 与 awaiting_tool_resolution 需要宿主介入，重复发送原消息不能解决等待。

## 重试报 RUN_REQUEST_CONFLICT

同一 requestId 必须对应完全相同的输入、context、输出契约和 overrides。修改后的问题使用新 ID；仅网络结果不明时，保留旧 ID 与原请求内容。

## 重启后无法继续旧会话

确认连接的是原数据库、使用相同的已验证主体，且 PROTOCOL_KEY 未被重新生成。改动默认模型配置不会自动修改旧 Session，需显式 replaceConfig。

## 工具没有调用或返回格式错误

核对 Engine 是否注册了对应 Binding、Session 是否声明了 Tool、当前用户是否获准调用，且 Tool 名称和 bindingKey 没有混淆。输出需满足 outputSchema。

模型声称调用了工具，不是执行证据。通过[Debug](/docs/debug/)查看操作记录；写入成功但格式不正确时不要重跑，先核验实际业务结果。

## 只是想运行本地演示

本机入口、Docker 和私有配置步骤在[本地示例附录](/docs/quickstart/)；测试页操作在[Playground 手册](/docs/playground/)。这些入口只有对应服务正在运行时才可访问。
