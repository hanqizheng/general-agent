/**
 * Token 预算管理 —— 防止消息历史超出模型上下文窗口。
 *
 * 核心思路：
 * 1. 估算当前消息列表的总 token 数
 * 2. 如果超出预算，从历史中间开始裁剪（保留首尾）
 * 3. 插入一条摘要占位符告知 LLM 中间内容被省略
 *
 * Token 估算采用 chars/3 近似（对英文约 1:4，中文约 1:2，取中间值）。
 * 当有 API 返回的真实 usage 数据时优先使用，但这里的估算用于
 * 发送前的预检，避免触发 API 的 context_length_exceeded 错误。
 */

import type { LLMContentBlock, LLMMessage } from "../provider/base";

/** 模型上下文窗口配置 */
export interface ContextWindowConfig {
  /** 模型上下文窗口总大小（token） */
  contextWindowTokens: number;
  /** 预留给模型输出的 token 数 */
  maxOutputTokens: number;
}

/** 常见模型的默认配置 */
export const MODEL_CONTEXT_CONFIGS: Record<string, ContextWindowConfig> = {
  default: {
    contextWindowTokens: 200_000,
    maxOutputTokens: 8_192,
  },
};

/**
 * 估算单个 content block 的 token 数。
 *
 * 对于文本和推理块，使用 chars/3 近似。
 * 对于 tool_use，JSON.stringify(input) 后估算，因为 input 会被序列化传给模型。
 * 对于 tool_result，content 是文本字符串。
 * 其他类型（attachment、artifact）给一个固定估算。
 *
 * 为什么是 chars/3？
 * - 英文文本约 1 token = 4 chars
 * - 中文文本约 1 token = 1.5~2 chars
 * - JSON/代码介于两者之间
 * - chars/3 是一个略偏高的估算，宁可高估也不要低估（低估会导致超窗口）
 */
export function estimateBlockTokens(block: LLMContentBlock): number {
  switch (block.type) {
    case "text":
    case "reasoning":
      return Math.ceil(block.text.length / 3);

    case "tool_use": {
      // tool name + input JSON
      const inputStr = JSON.stringify(block.input);
      return Math.ceil((block.name.length + inputStr.length) / 3) + 10; // +10 for structural overhead
    }

    case "tool_result":
      return Math.ceil(block.content.length / 3) + 5;

    case "attachment":
      // 附件的实际 token 开销取决于类型（图片、PDF），这里给保守估算
      return 1000;

    case "artifact":
      return Math.ceil(JSON.stringify(block.data).length / 3) + 20;

    default:
      return 50;
  }
}

/**
 * 估算单条消息的 token 数。
 *
 * 每条消息除了 content 本身还有 role 和消息结构开销（约 4 token）。
 */
export function estimateMessageTokens(message: LLMMessage): number {
  const contentTokens = message.content.reduce(
    (sum, block) => sum + estimateBlockTokens(block),
    0,
  );
  return contentTokens + 4; // message structure overhead
}

/**
 * 估算整个消息列表的 token 数。
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  return messages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg),
    0,
  );
}

/**
 * 估算 system prompt 的 token 数。
 */
export function estimateSystemPromptTokens(systemPrompt: string): number {
  return Math.ceil(systemPrompt.length / 3) + 4;
}

/**
 * 裁剪消息以适应上下文窗口。
 *
 * 策略：保留第一条消息（用户原始请求）和最近 N 条消息，
 * 中间的历史消息被替换为一条摘要占位符。
 *
 * 为什么保留首尾？
 * - 首条消息包含用户的原始意图，是整个对话的锚点
 * - 最近的消息包含当前上下文和最新的工具结果，是 LLM 需要的即时信息
 * - 中间的消息是历史过程，信息密度通常最低
 *
 * @param messages 完整消息列表
 * @param systemPrompt system prompt 文本
 * @param config 上下文窗口配置
 * @returns 裁剪后的消息列表，如果不需要裁剪则返回原列表
 */
export function trimMessagesToFitBudget(
  messages: LLMMessage[],
  systemPrompt: string,
  config: ContextWindowConfig = MODEL_CONTEXT_CONFIGS.default,
): LLMMessage[] {
  const inputBudget = config.contextWindowTokens - config.maxOutputTokens;
  const systemTokens = estimateSystemPromptTokens(systemPrompt);
  const messageBudget = inputBudget - systemTokens;

  // 如果消息总量在预算内，直接返回
  const totalTokens = estimateMessagesTokens(messages);
  if (totalTokens <= messageBudget) {
    return messages;
  }

  // 至少保留首条和末条消息
  if (messages.length <= 2) {
    return messages;
  }

  // 摘要占位符（告诉 LLM 有内容被省略）
  const summaryPlaceholder: LLMMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: "[Earlier conversation history has been condensed to fit context limits. The key context has been preserved.]",
      },
    ],
  };
  const summaryTokens = estimateMessageTokens(summaryPlaceholder);

  // 从尾部开始保留消息，直到预算用完
  const firstMessage = messages[0];
  const firstTokens = estimateMessageTokens(firstMessage);
  let remainingBudget = messageBudget - firstTokens - summaryTokens;

  // 从尾部向前扫描，尽可能多保留最近的消息
  const tailMessages: LLMMessage[] = [];
  for (let i = messages.length - 1; i >= 1; i--) {
    const msgTokens = estimateMessageTokens(messages[i]);
    if (msgTokens > remainingBudget) {
      break;
    }
    remainingBudget -= msgTokens;
    tailMessages.unshift(messages[i]);
  }

  // 如果能保留所有尾部消息（即只跳过 0 条），说明估算有误，返回原列表
  if (tailMessages.length === messages.length - 1) {
    return messages;
  }

  return [firstMessage, summaryPlaceholder, ...tailMessages];
}
