// Agent context — builds messages array (history + system prompt) for LLM calls

// 上下文构建

import type { LLMContentBlock, LLMMessage } from "../provider/base";

import { MESSAGE_ROLE } from "@/lib/constants";

export function buildContext(
  history: LLMMessage[],
  userContent: LLMContentBlock[],
): LLMMessage[] {
  return [
    ...history,
    {
      role: MESSAGE_ROLE.USER,
      content: userContent,
    },
  ];
}
