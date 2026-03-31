import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import {
  Agent,
  fetch,
  interceptors,
  type Dispatcher,
  type Response,
} from "undici";

const ALLOWED_ATTACHMENT_URL_PROTOCOLS = new Set(["http:", "https:"]);
const ATTACHMENT_URL_REDIRECT_LIMIT = 5;

const blockedIpAddresses = new BlockList();

blockedIpAddresses.addSubnet("0.0.0.0", 8, "ipv4");
blockedIpAddresses.addSubnet("10.0.0.0", 8, "ipv4");
blockedIpAddresses.addSubnet("100.64.0.0", 10, "ipv4");
blockedIpAddresses.addSubnet("127.0.0.0", 8, "ipv4");
blockedIpAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedIpAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedIpAddresses.addSubnet("192.0.0.0", 24, "ipv4");
blockedIpAddresses.addSubnet("192.0.2.0", 24, "ipv4");
blockedIpAddresses.addSubnet("192.168.0.0", 16, "ipv4");
blockedIpAddresses.addSubnet("198.18.0.0", 15, "ipv4");
blockedIpAddresses.addSubnet("198.51.100.0", 24, "ipv4");
blockedIpAddresses.addSubnet("203.0.113.0", 24, "ipv4");
blockedIpAddresses.addSubnet("224.0.0.0", 4, "ipv4");
blockedIpAddresses.addSubnet("240.0.0.0", 4, "ipv4");
blockedIpAddresses.addSubnet("::", 128, "ipv6");
blockedIpAddresses.addSubnet("::1", 128, "ipv6");
blockedIpAddresses.addSubnet("::ffff:0:0", 96, "ipv6");
blockedIpAddresses.addSubnet("64:ff9b:1::", 48, "ipv6");
blockedIpAddresses.addSubnet("100::", 64, "ipv6");
blockedIpAddresses.addSubnet("2001:db8::", 32, "ipv6");
blockedIpAddresses.addSubnet("fc00::", 7, "ipv6");
blockedIpAddresses.addSubnet("fe80::", 10, "ipv6");
blockedIpAddresses.addSubnet("ff00::", 8, "ipv6");

const safeAttachmentUrlDispatcher = new Agent().compose([
  interceptors.dns({
    dualStack: true,
    maxTTL: 1,
    lookup(origin, _options, callback) {
      resolveSafeAddressRecords(origin.hostname)
        .then((records) => callback(null, records))
        .catch((error) =>
          callback(error as NodeJS.ErrnoException | null, []),
        );
    },
  }),
]);

export class UnsafeAttachmentUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeAttachmentUrlError";
  }
}

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

export function isPublicIpAddress(address: string) {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }

  return !blockedIpAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

export function getUnsafeAttachmentUrlReason(url: URL) {
  if (!ALLOWED_ATTACHMENT_URL_PROTOCOLS.has(url.protocol)) {
    return "Attachment URLs must use http or https";
  }

  if (url.username || url.password) {
    return "Attachment URLs must not include credentials";
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return "Attachment URL host is required";
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return "Attachment URL host must be publicly reachable";
  }

  if (isIP(hostname) === 0 && !hostname.includes(".")) {
    return "Attachment URL host must be publicly reachable";
  }

  if (isIP(hostname) !== 0 && !isPublicIpAddress(hostname)) {
    return "Attachment URL host must resolve to a public IP address";
  }

  return null;
}

export function assertSafeAttachmentUrl(url: URL) {
  const reason = getUnsafeAttachmentUrlReason(url);
  if (reason) {
    throw new UnsafeAttachmentUrlError(reason);
  }
}

async function resolveSafeAddressRecords(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname);
  const records = await lookup(normalizedHostname, { all: true, verbatim: true });

  if (records.some((record) => !isPublicIpAddress(record.address))) {
    throw new UnsafeAttachmentUrlError(
      "Attachment URL host must resolve to a public IP address",
    );
  }

  return records.map((record) => {
    const family: 4 | 6 = record.family === 6 ? 6 : 4;

    return {
      address: record.address,
      family,
      ttl: 0,
    };
  });
}

function isRedirectResponse(response: Response) {
  return [301, 302, 303, 307, 308].includes(response.status);
}

async function executeSafeHeadRequest(url: URL) {
  assertSafeAttachmentUrl(url);

  return fetch(url.toString(), {
    dispatcher: safeAttachmentUrlDispatcher as Dispatcher,
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function fetchSafeAttachmentHead(input: string | URL) {
  let currentUrl = new URL(input);

  for (let redirectCount = 0; redirectCount <= ATTACHMENT_URL_REDIRECT_LIMIT; redirectCount += 1) {
    const response = await executeSafeHeadRequest(currentUrl);

    if (!isRedirectResponse(response)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    currentUrl = new URL(location, currentUrl);
  }

  throw new UnsafeAttachmentUrlError(
    "Attachment URL redirects too many times",
  );
}
