"use client";

import { useEffect, useRef, useState } from "react";

import { Plus } from "lucide-react";

import { MAX_MESSAGE_ATTACHMENTS } from "@/lib/attachment-constants";
import type { SendMessageInput } from "@/lib/session-dto";
import { useComposerAttachments } from "@/hooks/use-composer-attachments";
import { AttachmentCardList } from "./attachment-card-list";

interface InputAreaProps {
  sessionId: string | null;
  ensureSessionId?: () => Promise<string>;
  busy: boolean;
  isStopping: boolean;
  onAbort: () => void | Promise<void>;
  onSend: (input: SendMessageInput) => Promise<void>;
}

export function InputArea({
  sessionId,
  ensureSessionId,
  busy,
  isStopping,
  onAbort,
  onSend,
}: InputAreaProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousSessionIdRef = useRef<string | null>(sessionId);
  const {
    drafts,
    selectionError,
    hasUploadingAttachments,
    hasErrorAttachments,
    readyAttachmentRefs,
    canSelectMore,
    addFiles,
    removeAttachment,
    retryAttachment,
    clearAttachments,
  } = useComposerAttachments(sessionId, ensureSessionId);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    previousSessionIdRef.current = sessionId;

    if (
      previousSessionId &&
      sessionId &&
      previousSessionId !== sessionId
    ) {
      setText("");
      setIsSubmitting(false);
      return;
    }

    if (previousSessionId && sessionId === null) {
      setText("");
      setIsSubmitting(false);
    }
  }, [sessionId]);

  const submit = async () => {
    const next = text.trim();

    if (
      !next ||
      busy ||
      isSubmitting ||
      hasUploadingAttachments ||
      hasErrorAttachments
    ) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSend({
        text: next,
        attachments: readyAttachmentRefs,
      });
      setText("");
      clearAttachments();
    } catch {
      // Keep text and attachments in place so the user can retry immediately.
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendDisabled =
    text.trim().length === 0 ||
    busy ||
    isSubmitting ||
    hasUploadingAttachments ||
    hasErrorAttachments;

  const attachmentItems = drafts.map((draft) => ({
    id: draft.clientId,
    name: draft.fileName,
    mimeLabel: "PDF",
    status: draft.status,
    error: draft.error,
    onRemove: () => removeAttachment(draft.clientId),
    onRetry:
      draft.status === "error"
        ? () => retryAttachment(draft.clientId)
        : undefined,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-[28px] bg-[rgba(255,252,247,0.9)] p-3 shadow-[0_20px_60px_rgba(24,24,27,0.08)] backdrop-blur-xl sm:rounded-[30px] sm:p-4">
        <input
          accept="application/pdf,.pdf"
          className="hidden"
          multiple
          onChange={(event) => {
            if (event.target.files) {
              addFiles(event.target.files);
            }
            event.currentTarget.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />

        {attachmentItems.length > 0 ? (
          <div className="mb-3">
            <AttachmentCardList items={attachmentItems} variant="composer" />
          </div>
        ) : null}

        {selectionError ? (
          <div className="mb-3 rounded-2xl bg-rose-100/90 px-3 py-2 text-xs text-rose-700">
            {selectionError}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className="min-h-22 w-full resize-none rounded-[20px] bg-stone-100/70 px-4 py-3 text-sm leading-6 text-stone-900 outline-none placeholder:text-stone-400 sm:min-h-24 sm:rounded-[22px] sm:text-[15px] sm:leading-7"
          disabled={busy || isSubmitting}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            busy
              ? "Assistant is responding..."
              : hasUploadingAttachments
                ? "Upload in progress..."
                : "Message the assistant"
          }
          rows={1}
          value={text}
        />

        <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex w-full flex-col gap-3 sm:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100/90 text-stone-700 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy || isSubmitting || !canSelectMore}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                type="button"
              >
                <Plus className="h-5 w-5" />
              </button>

              <p className="rounded-2xl bg-stone-100/80 px-3 py-2 text-xs leading-5 text-stone-500">
                PDF only. Up to {MAX_MESSAGE_ATTACHMENTS} files. Enter to send, Shift + Enter for a new line.
              </p>
            </div>
          </div>

          {busy ? (
            <button
              className="inline-flex w-full min-w-26 items-center justify-center rounded-2xl bg-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={isStopping}
              onClick={() => {
                void onAbort();
              }}
              type="button"
            >
              {isStopping ? "Stopping..." : "Stop"}
            </button>
          ) : (
            <button
              className="inline-flex w-full min-w-26 items-center justify-center rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
              disabled={sendDisabled}
              onClick={() => {
                void submit();
              }}
              type="button"
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
