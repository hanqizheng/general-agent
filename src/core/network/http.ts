import {
  fetch,
  ProxyAgent,
  type Dispatcher,
  type RequestInit,
  type Response,
} from "undici";

import { env } from "@/lib/config";
import { createLogger } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 10_000;

const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_ABORTED",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_ERROR",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const proxyDispatchers = new Map<string, Dispatcher>();
const logger = createLogger("outbound-http");

export type OutboundHttpTransport = "direct" | "proxy";

export interface OutboundFetchOptions
  extends Omit<RequestInit, "dispatcher" | "signal"> {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OutboundFetchResult {
  response: Response;
  transport: OutboundHttpTransport;
}

interface TransportAttempt {
  transport: OutboundHttpTransport;
  dispatcher?: Dispatcher;
  description: string;
}

function getConfiguredProxyUrl() {
  return (
    env.OUTBOUND_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

function getNoProxyValue() {
  return env.OUTBOUND_NO_PROXY || process.env.NO_PROXY || process.env.no_proxy;
}

function getProxyDispatcher(proxyUrl: string) {
  const cached = proxyDispatchers.get(proxyUrl);
  if (cached) {
    return cached;
  }

  const dispatcher = new ProxyAgent(proxyUrl);
  proxyDispatchers.set(proxyUrl, dispatcher);
  return dispatcher;
}

function getErrorCode(error: Error) {
  const cause = error.cause;
  if (!cause || typeof cause !== "object") {
    return undefined;
  }

  return "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
}

function sanitizeProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "configured proxy";
  }
}

function isIPv4Address(value: string) {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

function ipv4ToInt(value: string) {
  return value
    .split(".")
    .map((part) => Number(part))
    .reduce((result, part) => (result << 8) + part, 0) >>> 0;
}

function isHostInCidr(host: string, cidr: string) {
  const [range, prefixLength] = cidr.split("/");
  const prefix = Number(prefixLength);
  if (!isIPv4Address(host) || !isIPv4Address(range)) {
    return false;
  }
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  if (prefix === 0) {
    return true;
  }

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToInt(host) & mask) === (ipv4ToInt(range) & mask);
}

function stripPort(entry: string) {
  if (entry.startsWith("[") && entry.includes("]")) {
    return entry.slice(1, entry.indexOf("]"));
  }

  const firstColon = entry.indexOf(":");
  const lastColon = entry.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon) {
    return entry.slice(0, lastColon);
  }

  return entry;
}

function hostMatchesNoProxyRule(host: string, rule: string) {
  if (rule === "*") {
    return true;
  }

  if (rule.includes("/")) {
    return isHostInCidr(host, rule);
  }

  const normalizedRule = stripPort(rule).replace(/^\*\./, ".").toLowerCase();
  if (!normalizedRule) {
    return false;
  }

  if (normalizedRule.startsWith(".")) {
    return host === normalizedRule.slice(1) || host.endsWith(normalizedRule);
  }

  return host === normalizedRule || host.endsWith(`.${normalizedRule}`);
}

function shouldBypassProxy(url: string) {
  const rawNoProxy = getNoProxyValue();
  if (!rawNoProxy) {
    return false;
  }

  const host = new URL(url).hostname.toLowerCase();

  return rawNoProxy
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((rule) => hostMatchesNoProxyRule(host, rule));
}

function resolvePrimaryAttempt(url: string): TransportAttempt {
  const mode = env.OUTBOUND_HTTP_MODE ?? "auto";
  const proxyUrl = getConfiguredProxyUrl();

  if (shouldBypassProxy(url)) {
    return {
      transport: "direct",
      description: "direct (matched no_proxy)",
    };
  }

  if (mode === "direct") {
    return {
      transport: "direct",
      description: "direct",
    };
  }

  if (!proxyUrl) {
    if (mode === "proxy") {
      throw new Error(
        "Outbound HTTP is configured for proxy mode, but no proxy URL is set. Configure OUTBOUND_PROXY_URL or HTTPS_PROXY/HTTP_PROXY.",
      );
    }

    return {
      transport: "direct",
      description: "direct",
    };
  }

  return {
    transport: "proxy",
    dispatcher: getProxyDispatcher(proxyUrl),
    description: `proxy (${sanitizeProxyUrl(proxyUrl)})`,
  };
}

function shouldAttemptDirectFallback(
  attempt: TransportAttempt,
  error: unknown,
) {
  if (attempt.transport !== "proxy") {
    return false;
  }

  if ((env.OUTBOUND_HTTP_MODE ?? "auto") !== "auto") {
    return false;
  }

  if (!env.OUTBOUND_ALLOW_DIRECT_FALLBACK) {
    return false;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const code = getErrorCode(error);
  return error.name === "TimeoutError" || !!(code && RETRYABLE_NETWORK_CODES.has(code));
}

function buildSignal(timeoutMs: number, signal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) {
    return timeoutSignal;
  }

  return AbortSignal.any([signal, timeoutSignal]);
}

async function executeAttempt(
  url: string,
  attempt: TransportAttempt,
  options: OutboundFetchOptions,
  timeoutMs: number,
) {
  const requestInit: RequestInit = {
    ...options,
    signal: buildSignal(timeoutMs, options.signal),
    ...(attempt.dispatcher ? { dispatcher: attempt.dispatcher } : {}),
  };

  logger.debug("Starting outbound request", {
    url,
    transport: attempt.transport,
    description: attempt.description,
    method: requestInit.method ?? "GET",
  });

  const response = await fetch(url, requestInit);

  logger.debug("Outbound request completed", {
    url,
    transport: attempt.transport,
    description: attempt.description,
    status: response.status,
  });

  return response;
}

export function formatNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }

  const code = getErrorCode(error);
  const cause = error.cause;
  const causeMessage =
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
      ? cause.message
      : undefined;

  const details = [code, causeMessage]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(": ");

  return details ? `${error.message} (${details})` : error.message;
}

export async function outboundFetch(
  url: string,
  options: OutboundFetchOptions = {},
): Promise<OutboundFetchResult> {
  const timeoutMs = options.timeoutMs ?? env.OUTBOUND_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS;
  const primaryAttempt = resolvePrimaryAttempt(url);

  try {
    const response = await executeAttempt(url, primaryAttempt, options, timeoutMs);
    return {
      response,
      transport: primaryAttempt.transport,
    };
  } catch (primaryError: unknown) {
    if (!shouldAttemptDirectFallback(primaryAttempt, primaryError)) {
      throw primaryError;
    }

    const fallbackAttempt: TransportAttempt = {
      transport: "direct",
      description: "direct fallback",
    };

    logger.warn("Proxy request failed, retrying direct", {
      url,
      primaryTransport: primaryAttempt.description,
      error: formatNetworkError(primaryError),
    });

    try {
      const response = await executeAttempt(url, fallbackAttempt, options, timeoutMs);
      return {
        response,
        transport: fallbackAttempt.transport,
      };
    } catch (fallbackError: unknown) {
      throw new Error(
        `Outbound request failed via ${primaryAttempt.description}: ${formatNetworkError(primaryError)}. Direct fallback also failed: ${formatNetworkError(fallbackError)}.`,
        {
          cause: fallbackError instanceof Error ? fallbackError : undefined,
        },
      );
    }
  }
}
