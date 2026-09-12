export const defaultChatCopy = {
  title: "AI 助手",
  launcherLabel: "打开聊天助手",
  close: "收起聊天",
  welcomeTitle: "有什么可以帮你？",
  welcomeMessage: "在这里提问，继续当前工作。",
  placeholder: "输入消息…",
  send: "发送",
  sending: "发送中",
  cancel: "停止",
  cancelling: "停止中",
  newSession: "新对话",
  history: "对话列表",
  sessionDetails: "当前会话",
  tools: "已接入工具",
  toolsButton: "工具",
  closePanel: "关闭面板",
  assistant: "助手",
  self: "你",
  emptyHistory: "还没有对话，发送第一条消息后会保存在这里。",
  reconnect: "重新连接",
  retry: "重试发送",
  discard: "结束重试",
  jump: "回到最新消息",
  details: "执行详情",
  debug: "查看 Debug",
  footnote: "AI 回答可能有误，请核对重要信息。",
};
export type ChatCopy = typeof defaultChatCopy;
export const runLabels: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  recovering: "恢复中",
  awaiting_input: "等待宿主处理输入",
  awaiting_tool_resolution: "等待宿主核验",
  completed: "已完成",
  failed: "执行失败",
  cancelled: "已停止",
};
export const errorMessages: Record<string, string> = {
  CHAT_MODEL_UNAVAILABLE: "该模型当前不可用，请重新选择或新建对话。",
  CHAT_SKILL_UNAVAILABLE: "该技能当前不可用，请取消选择后重试。",
  MODEL_HISTORY_INCOMPATIBLE:
    "所选模型无法继续此会话的原生历史，请使用原模型，或新建对话后切换模型。",
  MODEL_CONTINUATION_UNAVAILABLE:
    "会话历史暂时无法恢复，请联系管理员检查服务端配置，或新建对话。",
  IMAGE_INVALID:
    "图片格式或大小不符合要求：支持 PNG、JPEG、WebP、GIF，每张最多 5 MiB，每条最多 8 张。",
  IMAGE_EXPIRED: "图片已过期，请重新上传并新建对话。",
  IMAGE_UNAVAILABLE: "图片暂时无法读取，请重试上传或移除后发送。",
  MODEL_CAPABILITY_MISMATCH:
    "当前模型不支持此输入，请选择支持图片的模型或移除图片。",
  MODEL_AUTH_FAILED: "模型认证失败，请联系管理员检查服务端配置。",
  MODEL_RATE_LIMITED: "模型请求过于频繁，请稍后再试。",
  MODEL_OUTPUT_LIMIT: "回答达到了输出上限，可以要求简短回答。",
  MODEL_TIMEOUT: "模型响应超时，请稍后再试。",
  CHAT_UNAUTHENTICATED: "登录已失效，请重新登录后连接。",
  ACCESS_DENIED: "无权读取当前对话，请确认登录账户。",
  CHAT_ASSISTANT_UNAVAILABLE: "当前助手暂不可用，请联系管理员。",
  CHAT_CONNECTION_FAILED: "连接中断，请检查网络后重新连接。",
  CHAT_REQUEST_TIMEOUT: "请求超时。重试发送会复用原请求编号。",
  LOCAL_SESSION_REQUIRED: "本地服务已重启，请刷新页面。",
  RUN_ORDER_UNAVAILABLE: "旧会话缺少顺序记录，请新建对话。",
  DATA_RETENTION_EXPIRED: "会话已超过保留期限，请新建对话。",
  CHAT_SEND_PENDING: "上一条请求还未确认，请等待或重试原请求。",
};
export const explainChatError = (code: string) =>
  `${errorMessages[code] ?? "操作未完成，请重试或联系管理员。"} (${code})`;
