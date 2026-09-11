# 模型与凭据配置

[返回文档导航](README.md) · [上手指南](getting-started.md) · [配置报错排查](troubleshooting.md)

先分清两件事：**模型配置告诉程序“连接哪里、使用哪个模型”；凭据告诉供应商“你有权调用”。** 本项目把两者分开保存，网页不接收密钥。

当前这台电脑已按授权从 alice 项目读取必要的 DeepSeek 配置和一枚模型密钥，并单独保存到本项目。没有复制其他业务凭据。已有配置可以直接使用，以下初始化步骤主要供新电脑或新的源码副本使用。

## 两个文件分别放什么

以下路径都相对于项目根目录。以 `.` 开头的文件夹是隐藏文件夹，macOS Finder 可按 ⌘ + Shift + . 显示；也可以直接在代码编辑器中打开对应路径。

| 文件                        | 内容                                   | 什么时候改                   |
| --------------------------- | -------------------------------------- | ---------------------------- |
| `.local/models.json`        | 模型地址、模型名称、输出限制及凭据名称 | 新增模型、改地址、改输出上限 |
| `.secrets/credentials.json` | 真实 API Key 和 `PROTOCOL_KEY`         | 首次配置，或更新供应商 Key   |

这两个目录已被 Git 忽略，所以复制源码或重新检出代码时不会自动带上配置。目录权限必须是 `700`，文件权限必须是 `600`，表示仅当前用户可访问相应私有文件。

## 新环境第一步：从模板创建文件

先在终端进入项目目录，再完整运行这一组命令。`cp -n` 会保留已经存在的文件。

```sh
mkdir -p .local .secrets
chmod 700 .local .secrets
(umask 077; cp -n examples/local-models.example.json .local/models.json)
(umask 077; cp -n examples/local-credentials.example.json .secrets/credentials.json)
chmod 600 .local/models.json .secrets/credentials.json
```

模板来自[模型配置示例](../examples/local-models.example.json)和[凭据示例](../examples/local-credentials.example.json)。在本地编辑器中打开新建的两个 JSON 文件，不要把真实 Key 填进 `examples` 下的公共模板。

## 第二步：填写供应商 Key

新建的 `.secrets/credentials.json` 结构如下，下面全部是占位值：

```json
{
  "version": 1,
  "values": {
    "MODEL_API_KEY": "REPLACE_WITH_YOUR_AUTHORIZED_KEY",
    "PROTOCOL_KEY": "REPLACE_WITH_A_STABLE_RANDOM_PROTECTION_KEY"
  }
}
```

把 `MODEL_API_KEY` 右边的占位文字换成你有权使用的真实供应商 API Key，保留两侧双引号。已有配置可能使用 `DEEPSEEK_API_KEY` 这个名称：以模型文件的 `secretRef` 实际引用为准，不必改名。

`PROTOCOL_KEY` 是引擎保存受保护的模型续接信息时使用的独立密钥，不是供应商 API Key。用下一步生成，不能拿 API Key 代替。

JSON 不支持注释，字段名和字符串用双引号，最后一个字段后不要留逗号。

## 第三步：首次生成协议保护 Key

在项目目录完整复制下面的命令，包括首行和最后的 `JS`。它只在发现模板占位值时生成随机 Key 并写入文件，不会把 Key 打印出来；已有值保持不变。

```sh
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const path = '.secrets/credentials.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
if (config.values.PROTOCOL_KEY === 'REPLACE_WITH_A_STABLE_RANDOM_PROTECTION_KEY') {
  config.values.PROTOCOL_KEY = randomBytes(32).toString('hex');
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  console.log('已生成协议保护 Key，并保存到本地文件。');
} else {
  console.log('未发现模板占位值，保持现有配置不变。');
}
JS
```

**正常重启和更新模型 API Key 时，保留原 `PROTOCOL_KEY`。** 直接换掉它，会让已有会话的加密原生续接记录不可读。需要备份历史时，数据库和这枚保护 Key 都需要妥善保留。

## 第四步：填写模型配置

下面是普通 DeepSeek 对话的填写示例。它使用第二步的 `MODEL_API_KEY` 引用；供应商 Key 的真实内容只留在凭据文件中。

```json
{
  "version": 1,
  "default": "deepseek-chat",
  "protocolKey": { "secretRef": "PROTOCOL_KEY" },
  "profiles": {
    "deepseek-chat": {
      "model": {
        "provider": "openai-compatible",
        "baseURL": "https://api.deepseek.com/v1",
        "apiKey": { "secretRef": "MODEL_API_KEY" },
        "model": "deepseek-chat",
        "limits": {
          "contextWindowTokens": 32000,
          "maxOutputTokens": 256
        }
      },
      "allowPrivateNetwork": false
    }
  }
}
```

| 字段                                | 中文解释                                                             |
| ----------------------------------- | -------------------------------------------------------------------- |
| `profiles`                          | 多套模型配置的集合，每套就是一个 Profile                             |
| `deepseek-chat`，位于 `profiles` 下 | 你给这套配置起的名称，会出现在网页模型列表中                         |
| `default`                           | 默认使用哪套配置，必须与 `profiles` 中某个名称一致                   |
| `provider`                          | 通信协议类型，内置支持 `openai-compatible` 和 `anthropic-compatible` |
| `baseURL`                           | 供应商的 API 基础地址，不能填写聊天网站地址                          |
| `apiKey.secretRef`                  | 凭据文件 `values` 中的键名，例如 `MODEL_API_KEY`；不是 Key 的真实值  |
| `model`                             | 供应商接受的模型标识，与本地 Profile 名称是两个概念                  |
| `contextWindowTokens`               | 引擎用于检查上下文容量的配置值，应与供应商能力匹配                   |
| `maxOutputTokens`                   | 每次模型请求的输出上限；256 适合短回答，不适合长文                   |
| `protocolKey.secretRef`             | 稳定协议保护 Key 的名称                                              |
| `allowPrivateNetwork`               | 是否为这套模型的目标允许私网地址；普通公开 API 保持 `false`          |

想添加第二个模型，在 `profiles` 内新增一个不同名称的条目，并在凭据文件增加它引用的 Key。多个 Profile 可以引用同一个凭据，不需要重复保存真实 Token。网页启动时会验证所有条目，因此新增条目也要填完整。

## 第五步：确认能调用

保存文件后启动 `pnpm playground`，在网页发送一个短问题。修改过配置时，先停止原服务，再重新启动；新模型配置在新对话中使用。

也可以在数据库已启动后运行供应商检查。下面两种调用方式会产生真实模型用量，选择其中一种即可：

```sh
pnpm smoke:provider
pnpm smoke:provider deepseek-chat
```

第一条使用 `default`，第二条指定 Profile；通常选择其中一条即可。最后的结果应包含 `completed: true` 和已通过的 `verifiedStages`。普通模式的 `thinking: "not_configured"` 表示没有启用思考验证，不是思考验证已通过。

检查顺序是基本响应及用量 → 只读演示工具 → 明确启用时的 Thinking 及续聊。遇到错误会停止，按输出的 `stage`、`code` 到[排查手册](troubleshooting.md)定位。

## 当前电脑的思考模式

本机已有两个 Profile，共用一枚授权 DeepSeek Key：

| 本地配置名称        | 协议与地址                                                   | 用途                         |
| ------------------- | ------------------------------------------------------------ | ---------------------------- |
| `deepseek-chat`     | `openai-compatible`，`https://api.deepseek.com/v1`           | 普通对话和工具调用           |
| `deepseek-thinking` | `anthropic-compatible`，`https://api.deepseek.com/anthropic` | 思考模型的工具调用与原生续聊 |

第二套配置在 `model` 中显式设置 `thinking.enabled: true`，并使用 `expose: "none"` 保持思考正文隐藏。Profile 的名称不会自动启用 Thinking，协议和模型也必须支持。

DeepSeek 的兼容接口支持 Thinking，但忽略 `budget_tokens`，详见 [DeepSeek 官方说明](https://api-docs.deepseek.com/guides/anthropic_api/)。本项目仍约束总输出和运行超时；已验证范围见[验收报告](release-acceptance.md)，不能直接推定所有供应商都具备相同能力。

本机代理 DNS 对该官方域名返回特殊地址，原配置因此对精确目标启用了私网例外。新环境先保留模板默认值；只有确认目标是自己授权的本地或代理服务时再调整，不要把它作为通用联网修复开关。

## 以后换 Key 或模型怎么改

换 API Key：只更新 `.secrets/credentials.json` 中被引用的条目 → 保存 → 重启服务。

换模型或调整输出上限：更新 `.local/models.json` → 保存 → 重启服务 → 新建对话。已有会话有自己的配置和原生续接约束，不会自动换成另一套模型。

当前加载器不会自动读取 `.env`，也不会自动从 alice 同步更新。只编辑 `.env` 或 alice 的文件，不会更新本项目的这两个本地文件。

供开发者参考：[`loadLocalModel`](../scripts/lib/local-model-config.ts) 每次只允许解析所选模型及协议保护所需的 Secret；`loadLocalModels` 给本地网页加载全部 Profile，每个解析器仍限定各自引用。正式宿主通过 SDK 的 `secrets.resolve(ref, principal)` 接入自己的凭据管理方式。
