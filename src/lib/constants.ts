// Agent loop
export const DEFAULT_MAX_TURNS = 25;
export const DOOM_LOOP_THRESHOLD = 4;

// Tool output
export const MAX_TOOL_OUTPUT_CHARS = 30_000;

// File read
export const DEFAULT_READ_LINE_LIMIT = 2000;

// Bash
export const DEFAULT_BASH_TIMEOUT_MS = 120_000;
export const MAX_BASH_TIMEOUT_MS = 600_000;
export const MAX_BASH_OUTPUT_CHARS = 30_000;

// Write
export const MAX_WRITE_CONTENT_CHARS = 100_000;

// Glob
export const MAX_GLOB_RESULTS = 1000;

// Grep
export const MAX_GREP_MATCHES = 500;

// SSE
export const SSE_BATCH_INTERVAL_MS = 16;
export const SSE_HEARTBEAT_INTERVAL_MS = 30_000;

// Retry
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1_000;

/** chat message role */
export const MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;

/** assistant message 内部 part 的种类 */
export const MESSAGE_PART_KIND = {
  TEXT: "text",
  ATTACHMENT: "attachment",
  REASONING: "reasoning",
  TOOL: "tool",
  ARTIFACT: "artifact",
} as const;

// ─── 共享状态常量（前后端都会用到）──────────────

/** session 状态 */
export const SESSION_STATUS = {
  IDLE: "idle",
  BUSY: "busy",
  ERROR: "error",
} as const;

/** message 生命周期状态：前后端共享 */
export const MESSAGE_STATUS = {
  STREAMING: "streaming",
  COMPLETED: "completed",
  ERROR: "error",
  INTERRUPTED: "interrupted",
} as const;

/** session 级别 SSE 事件名：前后端共享 */
export const SESSION_EVENT_TYPE = {
  STATUS: "session.status",
  ERROR: "session.error",
  HEARTBEAT: "session.heartbeat",
  PRESENTATION: "session.presentation",
} as const;

/** Agent Loop 结束原因 */
export const LOOP_END_REASON = {
  COMPLETE: "complete",
  INTERRUPTED: "interrupted",
  ERROR: "error",
  MAX_TURNS: "max_turns",
} as const;

/** tool 执行结束态：对应 message.tool.end.state */
export const TOOL_END_STATE = {
  COMPLETE: "complete",
  ERROR: "error",
  INTERRUPTED: "interrupted",
} as const;

/** part 收口状态：对应 message.part.end.state */
export const MESSAGE_PART_END_STATE = {
  COMPLETE: "complete",
  ERROR: "error",
  INTERRUPTED: "interrupted",
} as const;

/** 工具调用生命周期状态（前端 UI 用） */
export const TOOL_CALL_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  DONE: "done",
  ERROR: "error",
  INTERRUPTED: "interrupted",
} as const;
