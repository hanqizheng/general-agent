"use client";

import { useEffect, useRef, useState } from "react";

interface InputAreaProps {
  busy: boolean;
  isStopping: boolean;
  onAbort: () => void | Promise<void>;
  onSend: (text: string) => void;
}

export function InputArea({
  busy,
  isStopping,
  onAbort,
  onSend,
}: InputAreaProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [text]);

  const submit = () => {
    const next = text.trim();

    if (!next || busy) {
      return;
    }

    onSend(next);
    setText("");
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-[30px] bg-[rgba(255,252,247,0.9)] p-4 shadow-[0_20px_60px_rgba(24,24,27,0.08)] backdrop-blur-xl">
        <textarea
          ref={textareaRef}
          className="min-h-[96px] w-full resize-none rounded-[22px] bg-stone-100/70 px-4 py-3 text-[15px] leading-7 text-stone-900 outline-none placeholder:text-stone-400"
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            busy ? "Assistant is responding..." : "Message the assistant"
          }
          rows={1}
          value={text}
        />

        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="rounded-[16px] bg-stone-100/80 px-3 py-2 text-xs text-stone-500">
            Enter to send. Shift + Enter for a new line.
          </p>

          {busy ? (
            <button
              className="inline-flex min-w-[104px] items-center justify-center rounded-[16px] bg-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-300 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="inline-flex min-w-[104px] items-center justify-center rounded-[16px] bg-stone-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={text.trim().length === 0}
              onClick={submit}
              type="button"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
