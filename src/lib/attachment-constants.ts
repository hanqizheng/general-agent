export const ATTACHMENT_KIND = {
  DOCUMENT: "document",
} as const;

export const ATTACHMENT_SOURCE_KIND = {
  UPLOAD: "upload",
  URL: "url",
} as const;

export const ATTACHMENT_STATUS = {
  PENDING: "pending",
  BOUND: "bound",
  FAILED: "failed",
  EXPIRED: "expired",
} as const;

export const ATTACHMENT_BINDING_METHOD = {
  PROVIDER_FILE_ID: "provider_file_id",
  PROVIDER_URL: "provider_url",
  INLINE_BASE64: "inline_base64",
} as const;

export const ATTACHMENT_BINDING_STATUS = {
  PENDING: "pending",
  READY: "ready",
  FAILED: "failed",
  EXPIRED: "expired",
} as const;

export const ATTACHMENT_MIME_TYPE = {
  PDF: "application/pdf",
} as const;

export const ATTACHMENT_PROVIDER = {
  ANTHROPIC: "anthropic",
  OPENAI: "openai",
  MOONSHOT: "moonshot",
} as const;

export const MAX_MESSAGE_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
