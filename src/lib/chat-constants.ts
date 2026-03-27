/** 前端 chat reducer / transport 专用常量。不要让后端依赖这些 UI action。 */

export const CHAT_TRANSPORT_STATUS = {
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  DISCONNECTED: "disconnected",
} as const;

export const CHAT_ACTION_TYPE = {
  HYDRATE_SESSION: "hydrate_session",
  HYDRATE_MESSAGES: "hydrate_messages",
  PREPEND_HISTORY_PAGE: "prepend_history_page",
  USER_MESSAGE: "user_message",
  SESSION_STATUS: "session_status",
  REQUEST_ERROR: "request_error",
  CLEAR_REQUEST_ERROR: "clear_request_error",
  TRANSPORT_STATUS: "transport_status",
  LOOP_START: "loop_start",
  LOOP_END: "loop_end",
  TURN_START: "turn_start",
  MESSAGE_START: "message_start",
  MESSAGE_END: "message_end",
  PART_START: "part_start",
  PART_END: "part_end",
  TEXT_DELTA: "text_delta",
  REASONING_DELTA: "reasoning_delta",
  ARTIFACT: "artifact",
  TOOL_START: "tool_start",
  TOOL_RUNNING: "tool_running",
  TOOL_UPDATE: "tool_update",
  TOOL_END: "tool_end",
  RESET: "reset",
} as const;
