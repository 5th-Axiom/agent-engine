后端 SDK 通过 **secretRef 引用密钥**，通过 secrets.resolve 在服务器取得实际值。SDK 不要求某个固定凭据文件，也不会自动加载 .env。你可以接公司已有的 Secret 服务；下面给出一个容易上手的环境变量方案。

## 集中管理服务端配置

在你的 Node 项目创建 .env，填入你自己的值。以下均为占位示例，不能原样连接：

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/YOUR_DATABASE
MODEL_BASE_URL=https://your-model.example/v1
MODEL_NAME=your-model
MODEL_API_KEY=REPLACE_WITH_YOUR_PROVIDER_KEY
PROTOCOL_KEY=REPLACE_WITH_A_STABLE_RANDOM_KEY
```

将 .env 加入业务项目的 .gitignore；在 Unix 下使用 chmod 600 .env 限制读取。实际密钥只留在服务端文件或部署环境，不要使用 VITE_、NEXT_PUBLIC_ 等会暴露给浏览器的变量名。

PROTOCOL_KEY 是用于保护原生协议续接信息的稳定密钥，不是供应商 API Key。首次配置时生成并保存至少 32 字节随机值，正常重启时保留原值。更换它可能使旧会话无法继续。可以通过你已有的 Secret 管理工具生成并保存，不需要将值输出到文档或聊天中。

## 创建 settings.ts

将下列文件与后端教程的 backend.ts 放在同一目录。这是接入方的配置模块，示例使用环境变量；以后换成 Secret 服务时保留相同的 secrets.resolve 契约即可。

{{code:settings.ts}}

defineSessionConfig 会按当前 SDK 规则校验配置，并补齐默认值。baseURL 填供应商 API 地址，不是聊天网站地址；limits 按具体模型的能力调整，不能靠增大数字获得供应商不支持的窗口。

此例只解析明确列出的两个凭据引用。多租户使用不同模型账号时，secrets.resolve(ref, principal) 可根据已验证身份读取对应凭据；Engine 的 authorize 也应验证该主体可使用这个 Secret。

## 哪个参数控制什么

| 参数                       | 用途                                 | 何时修改             |
| -------------------------- | ------------------------------------ | -------------------- |
| provider                   | 协议适配器，本例为 openai-compatible | 供应商采用不同协议时 |
| baseURL                    | 模型 API 地址                        | 更换网关或供应商时   |
| apiKey.secretRef           | 服务端凭据引用名                     | 更换凭据配置键名时   |
| model                      | 供应商模型标识                       | 切换具体模型时       |
| limits.contextWindowTokens | 模型上下文窗口声明                   | 按模型实际能力设置   |
| limits.maxOutputTokens     | 单次输出上限                         | 需要更长或更短回答时 |
| routing.primary            | 首选的已声明模型键，本例为 primary   | 存在多个已声明模型时 |
| instructions.text          | 助手的目标、表达方式和使用规则       | 定制产品助手时       |

内置兼容协议包括 openai-compatible 和 anthropic-compatible。本文示例的后端 policy 也绑定了 openai-compatible；切换协议时同时调整模型声明与 allowedModelTargets，地址和能力应匹配实际供应商。Thinking、重试、备用模型属于按需配置，精确约定见[接口参考](/docs/api/)。

## 让配置生效

使用 node --env-file=.env --import tsx run.ts 时，Node 先读取 .env，再由 settings.ts 取得值。常驻服务将环境变量交给你的进程管理方式注入；不要以为 SDK 会自动发现这个文件。

本例在启动时读取配置。修改后重启服务会影响之后创建的会话；已有 Session 保存自己的配置，需通过[replaceConfig](/docs/sessions/)明确更新。密钥轮换由 resolver 的实现决定，本例将值读入内存，需要重启才能加载新值。

## 使用私网模型或开发代理

公共模型服务通常不需要额外设置。若你明确使用私网模型，或开发代理把模型域名解析到私网地址，在服务端环境中设置 MODEL_ALLOW_PRIVATE_ORIGIN=true。本例会将 MODEL_BASE_URL 对应的精确 origin 加入 allowPrivateOrigins；默认关闭，不会开放所有私网目标。

出现 ACCESS_DENIED 时，先确认是不是目标网络被策略阻止，再决定是否需要这个例外。它不能解决供应商 API Key 错误或用户权限问题。

## 使用仓库内置示例时

Playground 和文档站采用另一套本地加载器：.local/models.json 保存模型 Profile，.secrets/credentials.json 保存实际值。这是**仓库示例的约定**，不是 SDK 对你业务项目的强制要求。现有配置可保留，操作入口见[本地示例](/docs/quickstart/)。
