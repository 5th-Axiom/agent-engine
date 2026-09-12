# ADR 0006：场景接入、类型化作者接口与图片

用户明确追加图片输入和按场景接入文档，并授权直接改善公共 API。原 M0–M3 的文本/JSON边界在本 ADR 中扩展到图片，不扩大到分布式调度、真实 replay 或自动代码执行。

## 选择

- 传统阅读入口按用户任务组织。产品交付入口独立维护，当前仅源码与本地 SDK 开发包可用；公共 npm、CLI、压缩包、安装包待确定。
- 作者接口暴露 SessionConfigInput 等输入类型；未知外部 JSON 走 parseConfig。defineBoundTool 同时产出可序列化 definition 和宿主 bindings，保持显式声明、注册与授权边界。
- RunInput.skill 可指定已声明的 Skill，在首个模型请求前加载并应用工具子集；沿用原 Skill loader、版本、预算、事件和退出行为。选择参与受理幂等，恢复不重复激活。
- 图片先以可信主体上传，得到 ImageAttachment。默认存入 EngineStore 的 images 集合，使用 protocolKey 加密；ImageStorage 可接宿主对象存储，保存加密 JSON。禁止自动抓取任意 URL。
- Run.input 保持文本/JSON；attachments 是可选字段。嵌套的工具结果 ImageAttachment 也被识别，原角色、时间、顺序保留在业务 JSON 中。
- Run 与 Step 只保存图片 ID、摘要、类型、字节数与到期时间。受理幂等 hash 包含附件引用；发送前解密、核对摘要并重新授权。重试不会重新访问历史业务数据来源，引用的内容不可变，撤权或到期时失败。
- 图片默认 30 天，上传可设最多 365 天，后台清除过期加密正文并留下到期元数据。上传未发送的内容也被清理；外部存储先写到期元数据再上传加密正文，写入中断留下的对象仍可被清理。图片失效会阻止含其来源的历史继续读取/发送，不能无声地把图文变成纯文本。
- 模型与适配器的 images 能力必须同时成立，配置 maxImageInputTokens 每图预算上限。上下文和费用预留包含该上限，Provider 实际统计仍作为账本事实。
- OpenAI 兼容协议使用 image_url 内联数据；工具图片在完整工具响应批次后附入标明来源的 user 图片块。Anthropic 兼容协议使用 base64 image，工具图片置于 tool_result.content。
- 浏览器通过已认证 ChatTransport 上传/读取图片，普通快照只携带引用。预览为临时 object URL；卸载、账号/会话切换释放资源，上传失败可重试，发送重试沿用已经冻结的引用。

## 协议依据

实现核对官方 [OpenAI Images and vision](https://developers.openai.com/api/docs/guides/images-vision) 和 [Anthropic Vision](https://platform.claude.com/docs/en/build-with-claude/vision)。兼容适配器支持协议不等于某个具体模型支持视觉，声明与真实供应商 smoke 分开验收。

## 兼容与迁移

既有文本 Run、手工 Tool/Binding 和不支持附件的自定义 Transport 保持兼容。新增作者输入类型可能指出以前被 unknown 遮蔽的错误；外部配置先 parseConfig。现有 Secret 必须保持稳定。图片存储版本不同会明确拒绝恢复，不自动猜测迁移。

不把未知写副作用转成可重试；不把业务 metadata 当身份；不向普通事件、日志或 ChatRun 暴露图片原文。详情与验证结果在本轮总结及行为卡中维护。

验证证据和 API 迁移见[场景接入优化总结](../usage-optimization-summary.md)。
