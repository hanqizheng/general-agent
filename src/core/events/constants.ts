/** 从 lib 层 re-export 共享常量 */
export {
  MESSAGE_STATUS,
  SESSION_EVENT_TYPE,
  SESSION_STATUS,
  LOOP_END_REASON,
  TOOL_END_STATE,
  MESSAGE_PART_END_STATE,
} from "@/lib/constants";

/** 以下是后端独有的常量 */

/** 单次 Turn 结束原因 */
export const TURN_END_REASON = {
  COMPLETE: "complete",
  ERROR: "error",
  INTERRUPTED: "interrupted",
} as const;

export const EVENT_KEY = "agent_event";
