import {
  ATTACHMENT_KIND,
  ATTACHMENT_MIME_TYPE,
  ATTACHMENT_PROVIDER,
} from "@/lib/attachment-constants";
import type {
  AttachmentKind,
  AttachmentMimeType,
  AttachmentProvider,
} from "@/lib/attachment-types";

export const PROVIDER_ATTACHMENT_CAPABILITIES = {
  [ATTACHMENT_PROVIDER.ANTHROPIC]: {
    [ATTACHMENT_KIND.DOCUMENT]: [ATTACHMENT_MIME_TYPE.PDF],
  },
  [ATTACHMENT_PROVIDER.MOONSHOT]: {},
  [ATTACHMENT_PROVIDER.OPENAI]: {},
} as const;

export function providerSupportsAttachmentInput(
  provider: string,
  input: {
    kind: AttachmentKind;
    mimeType: AttachmentMimeType;
  },
): provider is AttachmentProvider {
  return (
    provider === ATTACHMENT_PROVIDER.ANTHROPIC &&
    input.kind === ATTACHMENT_KIND.DOCUMENT &&
    input.mimeType === ATTACHMENT_MIME_TYPE.PDF
  );
}
