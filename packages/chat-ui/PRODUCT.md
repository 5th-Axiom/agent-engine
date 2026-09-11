# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

管理后台的开发者需要嵌入通用聊天入口；后台使用者通过入口图标打开 IM，在当前工作环境里和 Agent 对话。用户明确要求 PC 与移动端布局、换皮肤、改颜色。

## Product Purpose

将已有模型聊天能力作为可安装、可组合的前端 SDK 提供。悬浮入口与嵌入式页面共享展示组件和状态控制器，前端不持有模型密钥。

## Operating Context

参考 alice 的设计 Token、原子组件、业务组件、页面分层与 ViewData/回调边界，仅参考结构，不搬运其私有代码、素材或会话。项目已有本地 Playground 和只读 Debug；本轮在管理后台示例中展示 SDK 接入。

## Capabilities and Constraints

具备文本对话、流式快照、工具状态、用量、续聊、历史、取消和错误恢复。设计 Token 与身份认证 Token 为不同概念。模型和工具授权由服务器决定；宿主提供已验证身份。使用框架无关 DOM/Shadow DOM 挂载接口，保持业务组件无网络依赖。首版不增加文件上传、语音、群聊、分布式调度或生产重放。

## Brand Commitments

继承 Agent Engine 已有白色工作面、深蓝文字和清晰操作的开发工具语气。用户授权本 SDK 支持可替换皮肤及品牌色；这些能力不改变现有 Debug 的视觉身份。

## Evidence on Hand

现有 Playground、确定性模型与真实 PostgreSQL 验证设施、已授权本地 DeepSeek 配置。后台示例只使用合成数据。
