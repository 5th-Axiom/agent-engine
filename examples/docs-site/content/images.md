**目标：** 让模型实际读取用户上传图片，并支持历史追问。

## 前置条件

完成[环境准备](/docs/installation/)，导出 [backend 完整示例](/docs/integration/)。下列文件与 backend.ts、settings.ts 放在同一目录；这两个公共初始化文件包含在导出目录中，不需要实现额外的隐藏函数。

在 .env 设置 MODEL_IMAGES=true、MODEL_IMAGE_TOKENS=实际模型每张图片输入的保守上限，并配置真正支持视觉的 MODEL_NAME。MODEL_IMAGE_TOKENS 用于发送前预算预留，需要按供应商模型和允许的图片尺寸设置；它不是实际账单。设置 IMAGE_PATH 为一张 PNG 的本地路径。不要给纯文本模型开启视觉声明以绕过检查。

## 接入示例

{{code:image-run.ts}}

## 运行与确认

```sh
node --env-file=.env --import tsx image-run.ts
```

输出描述图片中的具体细节；第二次 Run 不必重复上传。重启后用同一身份、数据库、PROTOCOL_KEY 和 sessionId 继续会话。

## 约定与排错

支持 PNG / JPEG / WebP / GIF，单张最多 5 MiB、每条最多 8 张。浏览器可选择、粘贴或拖拽，上传中禁用发送，失败可重试或移除。图片默认保留 30 天，可在 uploadImage 指定不超过 365 天的 expiresAt。

模型不调用能力时，先检查 Session 声明和模型的 tools 能力，再检查事件与 [Debug](/docs/debug/)。权限错误需核对实际主体与宿主策略。接口细节见 [API 参考](/docs/api/)。

## 工具返回历史图片

在自己的历史检索 Binding 内，先用当前用户作用域的 engine.uploadImage 导入已经授权的图片字节，再把返回的引用放入业务 JSON。引擎识别嵌套的 imageAttachment 引用并将对应图片发送给模型。角色、时间、消息顺序都保留在原始 JSON 中，不会把历史会话转成当前用户的指令。

```ts historical-result.ts
const image = await scopedEngine.uploadImage({ data: historicalBytes, mediaType: "image/png" });
return { messages: [
  { role: "customer", timestamp: "2026-09-11T08:00:00Z", parts: ["请看这张图", image] },
  { role: "support", timestamp: "2026-09-11T08:01:00Z", parts: ["收到"] },
] };
```

这段是你的检索器返回值示意，scopedEngine 和 historicalBytes 来自已授权业务查询。只在首次导入时读取外部来源；不要把任意 URL 交给引擎自动抓取。公开类型为 ImageAttachment，已有 ID 可用 imageAttachment(id) 构建引用。

## 存储、权限与失效

默认把加密内容保存在 EngineStore 的 images 集合。对象存储可实现 ImageStorage 的 version / put / get / remove，并传给 Engine 的 imageStorage；存储接口接收到加密 JSON，不必了解模型协议。对象必须不可变，版本变更需要明确迁移。

图片读取与模型发送都重新检查 data 权限，资源为 image:ID，上传为 image:upload。同租户不同用户也不能直接读取对方附件。用 engine.deleteImage(id) 撤销图片内容；引用它的历史将停止向模型发送。IMAGE_EXPIRED 要求重新上传；IMAGE_UNAVAILABLE 表示内容缺失或不一致；MODEL_CAPABILITY_MISMATCH 表示模型不支持图片。

图片摘要、类型和引用冻结在 Run / Step 中。base64 仅在受保护存储与模型适配器发送阶段出现，普通事件与聊天快照不携带图片字节。上传后未发送的图片同样有到期清理规则。
