import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSafeAttachmentUrl,
  getUnsafeAttachmentUrlReason,
  isPublicIpAddress,
} from "./url-safety.ts";

test("allows public https attachment URLs", () => {
  assert.equal(
    getUnsafeAttachmentUrlReason(new URL("https://example.com/document.pdf")),
    null,
  );
});

test("rejects localhost attachment URLs", () => {
  assert.equal(
    getUnsafeAttachmentUrlReason(new URL("http://localhost/document.pdf")),
    "Attachment URL host must be publicly reachable",
  );
});

test("rejects private IPv4 attachment URLs", () => {
  assert.equal(isPublicIpAddress("10.0.0.1"), false);
  assert.throws(
    () => assertSafeAttachmentUrl(new URL("http://10.0.0.1/document.pdf")),
    /public IP address/,
  );
});

test("rejects unique-local IPv6 attachment URLs", () => {
  assert.equal(isPublicIpAddress("fd00::1"), false);
  assert.throws(
    () => assertSafeAttachmentUrl(new URL("https://[fd00::1]/document.pdf")),
    /public IP address/,
  );
});
