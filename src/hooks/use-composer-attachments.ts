"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";

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
import type {
  CreateAttachmentResponseDto,
  DeleteAttachmentResponseDto,
} from "@/lib/session-dto";

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

function createDraft(file: File, overrides?: Partial<ComposerAttachmentDraft>) {
  return {
    clientId: createDraftId(),
    sessionId: null,
    fileName: file.name,
    mimeType: file.type || ATTACHMENT_MIME_TYPE.PDF,
    sizeBytes: file.size,
    status: "uploading" as const,
    attachmentId: null,
    error: null,
    retryable: true,
    abortController: null,
    file,
    dedupeKey: buildDedupeKey(file),
    ...overrides,
  };
}

async function deleteDraftAttachmentRequest(
  sessionId: string,
  attachmentId: string,
) {
  const response = await fetch(
    `/api/sessions/${sessionId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );

  if (response.status === 404) {
    return;
  }

  await parseJsonResponse<DeleteAttachmentResponseDto>(response);
}

interface UseComposerAttachmentsResult {
  drafts: ComposerAttachmentDraft[];
  selectionError: string | null;
  hasUploadingAttachments: boolean;
  hasErrorAttachments: boolean;
  readyAttachmentRefs: Array<{ attachmentId: string }>;
  canSelectMore: boolean;
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (clientId: string) => Promise<void>;
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

  const updateDrafts = useCallback(
    (action: SetStateAction<ComposerAttachmentDraft[]>) => {
      setDrafts((current) => {
        const next =
          typeof action === "function"
            ? (action as (value: ComposerAttachmentDraft[]) => ComposerAttachmentDraft[])(current)
            : action;
        draftsRef.current = next;
        return next;
      });
    },
    [],
  );

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
        updateDrafts((current) =>
          current.map((item) =>
            item.clientId === draft.clientId
              ? {
                  ...item,
                  status: "error",
                  attachmentId: null,
                  error: "Failed to create a session for this attachment.",
                  retryable: true,
                  abortController: null,
                }
              : item,
          ),
        );
        return;
      }

      const controller = new AbortController();

      updateDrafts((current) =>
        current.map((item) =>
          item.clientId === draft.clientId
              ? {
                  ...item,
                  sessionId: activeSessionId,
                  status: "uploading",
                  attachmentId: null,
                  error: null,
                  retryable: true,
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
        let shouldDeleteOrphanedAttachment = false;

        updateDrafts((current) => {
          const exists = current.some((item) => item.clientId === draft.clientId);
          if (!exists) {
            shouldDeleteOrphanedAttachment = true;
            return current;
          }

          return current.map((item) =>
            item.clientId === draft.clientId
              ? {
                  ...item,
                  sessionId: activeSessionId,
                  status: "ready",
                  attachmentId: payload.attachment.id,
                  error: null,
                  retryable: false,
                  abortController: null,
                }
              : item,
          );
        });

        if (shouldDeleteOrphanedAttachment) {
          await deleteDraftAttachmentRequest(
            activeSessionId,
            payload.attachment.id,
          ).catch(() => undefined);
        }
      } catch (error: unknown) {
        if (controller.signal.aborted || isAuthRedirectError(error)) {
          return;
        }

        updateDrafts((current) =>
          current.map((item) =>
            item.clientId === draft.clientId
              ? {
                  ...item,
                  sessionId: activeSessionId,
                  status: "error",
                  attachmentId: null,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to upload attachment",
                  retryable: true,
                  abortController: null,
                }
              : item,
          ),
        );
      }
    },
    [ensureSessionId, sessionId, updateDrafts],
  );

  const discardDraftResources = useCallback(
    (items: ComposerAttachmentDraft[]) => {
      for (const draft of items) {
        draft.abortController?.abort();

        if (
          draft.status === "ready" &&
          draft.attachmentId &&
          draft.sessionId
        ) {
          void deleteDraftAttachmentRequest(
            draft.sessionId,
            draft.attachmentId,
          ).catch(() => undefined);
        }
      }
    },
    [],
  );

  const clearAttachments = useCallback(() => {
    updateDrafts((current) => {
      for (const draft of current) {
        draft.abortController?.abort();
      }

      return [];
    });
    setSelectionError(null);
  }, [updateDrafts]);

  const discardAttachments = useCallback(() => {
    updateDrafts((current) => {
      discardDraftResources(current);
      return [];
    });
    setSelectionError(null);
  }, [discardDraftResources, updateDrafts]);

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    previousSessionIdRef.current = sessionId;

    if (
      previousSessionId &&
      sessionId &&
      previousSessionId !== sessionId
    ) {
      discardAttachments();
      return;
    }

    if (previousSessionId && sessionId === null) {
      discardAttachments();
    }
  }, [discardAttachments, sessionId]);

  useEffect(() => {
    return () => {
      discardDraftResources(draftsRef.current);
    };
  }, [discardDraftResources]);

  const addFiles = useCallback(
    (incomingFiles: FileList | File[]) => {
      const files = Array.from(incomingFiles);
      if (files.length === 0) {
        return;
      }

      const existingKeys = new Set(draftsRef.current.map((draft) => draft.dedupeKey));
      let availableSlots = MAX_MESSAGE_ATTACHMENTS - draftsRef.current.length;
      const nextDrafts: ComposerAttachmentDraft[] = [];
      const acceptedDrafts: ComposerAttachmentDraft[] = [];

      for (const file of files) {
        const dedupeKey = buildDedupeKey(file);

        if (existingKeys.has(dedupeKey)) {
          nextDrafts.push(
            createDraft(file, {
              status: "error",
              error: `${file.name} is already attached.`,
              retryable: false,
            }),
          );
          continue;
        }

        if (!isPdfFile(file)) {
          nextDrafts.push(
            createDraft(file, {
              status: "error",
              error: `${file.name} is not a PDF.`,
              retryable: false,
            }),
          );
          continue;
        }

        if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
          nextDrafts.push(
            createDraft(file, {
              status: "error",
              error: `${file.name} exceeds ${formatBytes(MAX_ATTACHMENT_UPLOAD_BYTES)}.`,
              retryable: false,
            }),
          );
          continue;
        }

        if (availableSlots <= 0) {
          nextDrafts.push(
            createDraft(file, {
              status: "error",
              error: `You can attach up to ${MAX_MESSAGE_ATTACHMENTS} PDF files.`,
              retryable: false,
            }),
          );
          continue;
        }

        existingKeys.add(dedupeKey);
        availableSlots -= 1;

        const draft = createDraft(file);
        acceptedDrafts.push(draft);
        nextDrafts.push(draft);
      }

      if (nextDrafts.length > 0) {
        updateDrafts((current) => [...current, ...nextDrafts]);
      }

      if (acceptedDrafts.length > 0) {
        void (async () => {
          let activeSessionId: string | null = sessionId;
          try {
            activeSessionId = sessionId ?? (await ensureSessionId?.()) ?? null;
          } catch (error: unknown) {
            if (isAuthRedirectError(error)) {
              return;
            }

            updateDrafts((current) =>
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
                      retryable: true,
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

      setSelectionError(null);
    },
    [ensureSessionId, sessionId, updateDrafts, uploadDraft],
  );

  const removeAttachment = useCallback(
    async (clientId: string) => {
      setSelectionError(null);
      const draft = draftsRef.current.find((item) => item.clientId === clientId);
      if (!draft) {
        return;
      }

      if (draft.status === "uploading") {
        draft.abortController?.abort();
        updateDrafts((current) =>
          current.filter((item) => item.clientId !== clientId),
        );
        return;
      }

      if (draft.status === "ready" && draft.attachmentId && draft.sessionId) {
        try {
          await deleteDraftAttachmentRequest(
            draft.sessionId,
            draft.attachmentId,
          );
        } catch (error: unknown) {
          if (isAuthRedirectError(error)) {
            return;
          }

          setSelectionError(
            error instanceof Error
              ? error.message
              : "Failed to delete attachment",
          );
          return;
        }
      }

      updateDrafts((current) =>
        current.filter((item) => item.clientId !== clientId),
      );
    },
    [updateDrafts],
  );

  const retryAttachment = useCallback(
    (clientId: string) => {
      setSelectionError(null);
      const draft = draftsRef.current.find((item) => item.clientId === clientId);
      if (!draft || !draft.retryable || draft.status !== "error") {
        return;
      }

      void uploadDraft(draft, draft.sessionId);
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
