/**
 * streamWithRetry —— 在 provider.stream() 外层包装重试逻辑。
 *
 * 设计原则：
 * - 对调用者来说，签名和 provider.stream() 完全一样（返回 AsyncIterable）
 * - 只重试 provider.stream() 的初始调用失败（HTTP 层面），不重试流消费中的错误
 * - 可重试条件：429 (rate limit)、529 (overloaded)、5xx (server error)
 * - 不可重试：401 (auth)、400 (bad request)、中断
 * - 指数退避 + 随机抖动，防止 thundering herd
 * - 支持通过 AbortSignal 中断等待
 */

import type { EventEmitter } from "../events/emitter";
import type { LLMProvider, LLMStreamChunk, LLMStreamParams } from "../provider/base";
import { InterruptedError, isAbortError } from "@/lib/errors";
import { SESSION_EVENT_TYPE } from "@/lib/constants";

interface StreamRetryOptions {
  /** 最大尝试次数（含首次），默认 3 */
  maxAttempts: number;
  /** 基础退避时间 (ms)，默认 1000 */
  baseDelayMs: number;
  /** 可选的事件发射器，用于通知前端重试状态 */
  emitter?: EventEmitter;
}

/**
 * 判断一个 stream() 调用失败的错误是否值得重试。
 *
 * LangChain 和各 SDK 抛出的 HTTP 错误通常带 status/statusCode 属性。
 * 这里检查两个字段是因为不同库的命名不一致。
 */
function isRetryableStreamError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const statusCode =
    (error as { status?: number }).status ??
    (error as { statusCode?: number }).statusCode;

  if (typeof statusCode === "number") {
    if (statusCode === 429) return true; // Rate limit
    if (statusCode === 529) return true; // Overloaded (Anthropic 特有)
    if (statusCode >= 500) return true; // Server error
  }

  // 网络级别错误（DNS 解析失败、连接超时等）
  const code = (error as { code?: string }).code;
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return true;
  }

  return false;
}

/**
 * 指数退避 + 随机抖动。
 *
 * attempt=1 → base * 1 = 1s  (+ 0~250ms jitter)
 * attempt=2 → base * 2 = 2s  (+ 0~500ms jitter)
 * attempt=3 → base * 4 = 4s  (+ 0~1000ms jitter)
 * 上限 30s，防止等太久。
 *
 * 抖动 = 25% 的随机偏移。作用是让多个并发请求的重试时间错开，
 * 避免所有请求同时重试导致再次 429。
 */
function calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, 30_000);
  const jitter = capped * 0.25 * Math.random();
  return capped + jitter;
}

/**
 * 可中断的等待。
 *
 * 和普通 setTimeout 的区别：如果 AbortSignal 在等待期间触发，
 * 会立即 reject 而不是继续等待。这样用户点击"停止"可以即时响应。
 */
function interruptibleDelay(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new InterruptedError());
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new InterruptedError());
      },
      { once: true },
    );
  });
}

export async function streamWithRetry(
  provider: LLMProvider,
  params: LLMStreamParams,
  options: StreamRetryOptions,
): Promise<AsyncIterable<LLMStreamChunk>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await provider.stream(params);
    } catch (error) {
      lastError = error;

      // 用户中断 → 不重试
      if (params.signal?.aborted || isAbortError(error)) {
        throw error;
      }

      // 不可重试的错误 → 直接抛出
      if (!isRetryableStreamError(error)) {
        throw error;
      }

      // 重试次数用完 → 抛出
      if (attempt >= options.maxAttempts) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, options.baseDelayMs);

      // 通知前端正在重试
      options.emitter?.emit({
        type: SESSION_EVENT_TYPE.ERROR,
        error: {
          code: "RETRYING",
          message: `API call failed (${error instanceof Error ? error.message : "unknown"}), retrying in ${Math.round(delay / 1000)}s (attempt ${attempt}/${options.maxAttempts})`,
          recoverable: true,
        },
      });

      // 等待退避时间，支持被 AbortSignal 中断
      await interruptibleDelay(delay, params.signal);
    }
  }

  throw lastError;
}
