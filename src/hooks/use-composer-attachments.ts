"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ATTACHMENT_MIME_TYPE,
  MAX_ATTACHMENT_UPLOAD_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
} from "@/lib/attachment-constants";
import {
  isAuthRedirectError,
  parseJsonResponse,
} from "@/lib/client-auth";
import type { ComposerAttachmentDraft } from "@/lib/chat-types";
import type { CreateAttachmentResponseDto } from "@/lib/session-dto";

function createDraftId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildDedupeKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isPdfFile(file: File) {
  return (
    file.type === ATTACHMENT_MIME_TYPE.PDF ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${bytes} B`;
}

interface UseComposerAttachmentsResult {
  drafts: ComposerAttachmentDraft[];
  selectionError: string | null;
  hasUploadingAttachments: boolean;
  hasErrorAttachments: boolean;
  readyAttachmentRefs: Array<{ attachmentId: string }>;
  canSelectMore: boolean;
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (clientId: string) => void;
  retryAttachment: (clientId: string) => void;
  clearAttachments: () => void;
}

export function useComposerAttachments(
  sessionId: string | null,
  ensureSessionId?: () => Promise<string>,
): UseComposerAttachmentsResult {
  const [drafts, setDrafts] = useState<ComposerAttachmentDraft[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const draftsRef = useRef<ComposerAttachmentDraft[]>([]);
  const previousSessionIdRef = useRef<string | null>(sessionId);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const uploadDraft = useCallback(
    async (
      draft: ComposerAttachmentDraft,
      sessionIdOverride?: string | null,
    ) => {
      const activeSessionId =
        sessionIdOverride ?? sessionId ?? (await ensureSessionId?.());
      if (!activeSessionId) {
        setDrafts((current) =>
          current.map((item) =>
            item.clientId === draft.clientId
              ? {
                  ...item,
                  status: "error",
                  attachmentId: null,
                  error: "Failed to create a session for this attachment.",
                  abortController: null,
                }
              : item,
          ),
        );
        return;
      }

      const controller = new AbortController();

      setDrafts((current) =>
        current.map((item) =>
          item.clientId === draft.clientId
            ? {
                ...item,
                status: "uploading",
                attachmentId: null,
                error: null,
                abortController: controller,
              }
            : item,
        ),
      );

      try {
        const formData = new FormData();
        formData.set("file", draft.file);

        const response = await fetch(
          `/api/sessions/${activeSessionId}/attachments`,
          {
          method: "POST",
          body: formData,
          signal: controller.signal,
          },
        );
        const payload =
          await parseJsonResponse<CreateAttachmentResponseDto>(response);

        setDrafts((current) =>
          current.map((item) =>
            item.clientId === draft.clientId
              ? {
                  ...item,
                  status: "ready",
                  attachmentId: payload.attachment.id,
                  error: null,
                  abortController: null,
                }
              : item,
          ),
        );
      } catch (error: unknown) {
        if (controller.signal.aborted || isAuthRedirectError(error)) {
          return;
        }

        setDrafts((current) =>
          current.map((item) =>
            item.clientId === draft.clientId
              ? {
                  ...item,
                  status: "error",
                  attachmentId: null,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to upload attachment",
                  abortController: null,
                }
              : item,
          ),
        );
      }
    },
    [ensureSessionId, sessionId],
  );

  const clearAttachments = useCallback(() => {
    setDrafts((current) => {
      for (const draft of current) {
        draft.abortController?.abort();
      }

      return [];
    });
    setSelectionError(null);
  }, []);

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    previousSessionIdRef.current = sessionId;

    if (
      previousSessionId &&
      sessionId &&
      previousSessionId !== sessionId
    ) {
      clearAttachments();
      return;
    }

    if (previousSessionId && sessionId === null) {
      clearAttachments();
    }
  }, [clearAttachments, sessionId]);

  useEffect(() => {
    return () => {
      for (const draft of draftsRef.current) {
        draft.abortController?.abort();
      }
    };
  }, []);

  const addFiles = useCallback(
    (incomingFiles: FileList | File[]) => {
      const files = Array.from(incomingFiles);
      if (files.length === 0) {
        return;
      }

      const nextErrors: string[] = [];
      const existingKeys = new Set(draftsRef.current.map((draft) => draft.dedupeKey));
      let availableSlots = MAX_MESSAGE_ATTACHMENTS - draftsRef.current.length;
      const acceptedDrafts: ComposerAttachmentDraft[] = [];

      for (const file of files) {
        const dedupeKey = buildDedupeKey(file);

        if (existingKeys.has(dedupeKey)) {
          nextErrors.push(`${file.name} is already attached.`);
          continue;
        }

        if (!isPdfFile(file)) {
          nextErrors.push(`${file.name} is not a PDF.`);
          continue;
        }

        if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
          nextErrors.push(
            `${file.name} exceeds ${formatBytes(MAX_ATTACHMENT_UPLOAD_BYTES)}.`,
          );
          continue;
        }

        if (availableSlots <= 0) {
          nextErrors.push(
            `You can attach up to ${MAX_MESSAGE_ATTACHMENTS} PDF files.`,
          );
          break;
        }

        existingKeys.add(dedupeKey);
        availableSlots -= 1;

        acceptedDrafts.push({
          clientId: createDraftId(),
          fileName: file.name,
          mimeType: file.type || ATTACHMENT_MIME_TYPE.PDF,
          sizeBytes: file.size,
          status: "uploading",
          attachmentId: null,
          error: null,
          abortController: null,
          file,
          dedupeKey,
        });
      }

      if (acceptedDrafts.length > 0) {
        setDrafts((current) => [...current, ...acceptedDrafts]);

        void (async () => {
          let activeSessionId: string | null = sessionId;
          try {
            activeSessionId = sessionId ?? (await ensureSessionId?.()) ?? null;
          } catch (error: unknown) {
            if (isAuthRedirectError(error)) {
              return;
            }

            setDrafts((current) =>
              current.map((item) =>
                acceptedDrafts.some((draft) => draft.clientId === item.clientId)
                  ? {
                      ...item,
                      status: "error",
                      attachmentId: null,
                      error:
                        error instanceof Error
                          ? error.message
                          : "Failed to create a session for these attachments.",
                      abortController: null,
                    }
                  : item,
              ),
            );
            return;
          }

          for (const draft of acceptedDrafts) {
            void uploadDraft(draft, activeSessionId);
          }
        })();
      }

      setSelectionError(nextErrors[0] ?? null);
    },
    [ensureSessionId, sessionId, uploadDraft],
  );

  const removeAttachment = useCallback((clientId: string) => {
    setSelectionError(null);
    setDrafts((current) => {
      const draft = current.find((item) => item.clientId === clientId);
      draft?.abortController?.abort();
      return current.filter((item) => item.clientId !== clientId);
    });
  }, []);

  const retryAttachment = useCallback(
    (clientId: string) => {
      setSelectionError(null);
      const draft = draftsRef.current.find((item) => item.clientId === clientId);
      if (!draft) {
        return;
      }

      void uploadDraft(draft);
    },
    [uploadDraft],
  );

  const hasUploadingAttachments = drafts.some(
    (draft) => draft.status === "uploading",
  );
  const hasErrorAttachments = drafts.some((draft) => draft.status === "error");
  const readyAttachmentRefs = useMemo(
    () =>
      drafts.flatMap((draft) =>
        draft.status === "ready" && draft.attachmentId
          ? [{ attachmentId: draft.attachmentId }]
          : [],
      ),
    [drafts],
  );

  return {
    drafts,
    selectionError,
    hasUploadingAttachments,
    hasErrorAttachments,
    readyAttachmentRefs,
    canSelectMore: drafts.length < MAX_MESSAGE_ATTACHMENTS,
    addFiles,
    removeAttachment,
    retryAttachment,
    clearAttachments,
  };
}
