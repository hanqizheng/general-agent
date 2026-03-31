import {
  ATTACHMENT_BINDING_METHOD,
  ATTACHMENT_BINDING_STATUS,
  ATTACHMENT_KIND,
  ATTACHMENT_MIME_TYPE,
  ATTACHMENT_PROVIDER,
  ATTACHMENT_SOURCE_KIND,
  ATTACHMENT_STATUS,
} from "./attachment-constants";

export type AttachmentKind =
  (typeof ATTACHMENT_KIND)[keyof typeof ATTACHMENT_KIND];

export type AttachmentSourceKind =
  (typeof ATTACHMENT_SOURCE_KIND)[keyof typeof ATTACHMENT_SOURCE_KIND];

export type AttachmentStatus =
  (typeof ATTACHMENT_STATUS)[keyof typeof ATTACHMENT_STATUS];

export type AttachmentBindingMethod =
  (typeof ATTACHMENT_BINDING_METHOD)[keyof typeof ATTACHMENT_BINDING_METHOD];

export type AttachmentBindingStatus =
  (typeof ATTACHMENT_BINDING_STATUS)[keyof typeof ATTACHMENT_BINDING_STATUS];

export type AttachmentMimeType =
  (typeof ATTACHMENT_MIME_TYPE)[keyof typeof ATTACHMENT_MIME_TYPE];

export type AttachmentProvider =
  (typeof ATTACHMENT_PROVIDER)[keyof typeof ATTACHMENT_PROVIDER];

export interface AttachmentSnapshot {
  attachmentId: string;
  kind: AttachmentKind;
  mimeType: AttachmentMimeType;
  originalName: string | null;
}

export type AttachmentPartPayload = AttachmentSnapshot;

export interface AttachmentBindingSource {
  provider: AttachmentProvider;
  bindingMethod: AttachmentBindingMethod;
  remoteRef: string;
}

export interface AttachmentCitationAnnotation {
  provider: typeof ATTACHMENT_PROVIDER.ANTHROPIC;
  type: "page_location";
  providerFileId: string | null;
  citedText: string;
  documentIndex: number;
  documentTitle: string | null;
  startPageNumber: number;
  endPageNumber: number;
  raw: Record<string, unknown>;
}

export interface TextPartPayload {
  annotations?: AttachmentCitationAnnotation[];
}
