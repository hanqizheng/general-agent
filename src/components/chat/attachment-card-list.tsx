"use client";

import { AlertCircle, FileText, LoaderCircle, RefreshCw, X } from "lucide-react";

import type { ComposerAttachmentStatus } from "@/lib/chat-types";

export interface AttachmentCardItem {
  id: string;
  name: string;
  mimeLabel?: string;
  sizeLabel?: string | null;
  status?: ComposerAttachmentStatus | "ready";
  error?: string | null;
  onRemove?: () => void;
  onRetry?: () => void;
}

interface AttachmentCardListProps {
  items: AttachmentCardItem[];
  variant?: "composer" | "message";
}

function getStatusLabel(item: AttachmentCardItem) {
  switch (item.status) {
    case "uploading":
      return "Uploading PDF...";
    case "error":
      return item.error ?? "Upload failed";
    default:
      return item.sizeLabel ? `${item.mimeLabel ?? "PDF"} • ${item.sizeLabel}` : item.mimeLabel ?? "PDF";
  }
}

function renderStatusIcon(status: AttachmentCardItem["status"]) {
  if (status === "uploading") {
    return <LoaderCircle className="h-4 w-4 animate-spin" />;
  }

  if (status === "error") {
    return <AlertCircle className="h-4 w-4" />;
  }

  return <FileText className="h-4 w-4" />;
}

function getListClasses(variant: NonNullable<AttachmentCardListProps["variant"]>) {
  if (variant === "message") {
    return "flex w-full flex-wrap justify-end gap-2";
  }

  return "flex max-h-48 w-full flex-wrap gap-2 overflow-y-auto pr-1";
}

function getCardClasses(variant: NonNullable<AttachmentCardListProps["variant"]>) {
  if (variant === "message") {
    return "min-w-0 max-w-[320px] flex-[0_1_260px] rounded-[18px] bg-stone-300/58 px-3 py-2";
  }

  return "min-w-0 max-w-[320px] flex-[0_1_260px] rounded-[18px] bg-white/82 px-3 py-2";
}

function getIconWrapClasses(
  variant: NonNullable<AttachmentCardListProps["variant"]>,
  status: AttachmentCardItem["status"],
) {
  const base =
    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]";

  if (status === "error") {
    return `${base} bg-rose-500 text-white`;
  }

  if (variant === "message") {
    return `${base} bg-rose-500 text-white`;
  }

  return `${base} bg-rose-400 text-white`;
}

function getTitleClasses(variant: NonNullable<AttachmentCardListProps["variant"]>) {
  return variant === "message"
    ? "truncate text-[13px] font-semibold leading-5 text-stone-900"
    : "truncate text-[13px] font-semibold leading-5 text-stone-900";
}

function getSubtitleClasses(
  variant: NonNullable<AttachmentCardListProps["variant"]>,
  status: AttachmentCardItem["status"],
) {
  if (status === "error") {
    return variant === "message" ? "mt-0.5 text-[11px] text-rose-700" : "mt-0.5 text-[11px] text-rose-600";
  }

  return variant === "message"
    ? "mt-0.5 text-[10px] text-stone-600"
    : "mt-0.5 text-[10px] text-stone-500";
}

function getRemoveButtonClasses(
  variant: NonNullable<AttachmentCardListProps["variant"]>,
) {
  return variant === "message"
    ? "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-100 transition hover:bg-white/16"
    : "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-200/80 text-stone-500 transition hover:bg-stone-300";
}

export function AttachmentCardList({
  items,
  variant = "composer",
}: AttachmentCardListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={getListClasses(variant)}>
      {items.map((item) => (
        <div className={getCardClasses(variant)} key={item.id}>
          <div className="flex items-start gap-2">
            <div className={getIconWrapClasses(variant, item.status)}>
              {renderStatusIcon(item.status ?? "ready")}
            </div>

            <div className="min-w-0 flex-1">
              <div className={getTitleClasses(variant)}>
                {item.name}
              </div>
              <div className={getSubtitleClasses(variant, item.status)}>
                {getStatusLabel(item)}
              </div>
              {item.status === "error" && item.onRetry ? (
                <button
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition ${
                    variant === "message"
                      ? "bg-white/10 text-white hover:bg-white/16"
                      : "bg-stone-200/85 text-stone-700 hover:bg-stone-300"
                  }`}
                  onClick={item.onRetry}
                  type="button"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              ) : null}
            </div>

            {item.onRemove ? (
              <button
                aria-label={`Remove ${item.name}`}
                className={getRemoveButtonClasses(variant)}
                onClick={item.onRemove}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
