"use client";

import { useEffect, useRef, useState } from "react";

const QUICK_PROMPTS = [
  "Read the README and summarize the current architecture.",
  "Search the project for TODOs and propose the next milestone.",
  "Explain how the event bus and SSE batching work together.",
] as const;

interface InputAreaProps {
  busy: boolean;
  onSend: (text: string) => void;
}

export function InputArea({ busy, onSend }: InputAreaProps) {
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border border-stone-900/10 bg-white/80 px-3 py-1.5 text-left text-xs text-stone-700 transition hover:border-stone-900/20 hover:bg-stone-50"
            onClick={() => setText(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="rounded-[28px] border border-stone-900/10 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,244,238,0.96))] p-3 shadow-[0_12px_30px_rgba(48,36,22,0.08)]">
        <textarea
          ref={textareaRef}
          className="min-h-[72px] w-full resize-none bg-transparent px-2 py-2 font-sans text-[15px] leading-7 text-stone-900 outline-none placeholder:text-stone-400"
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
            busy
              ? "Agent is responding..."
              : "Ask the agent to inspect the project, read files, run tools, or explain what it is doing."
          }
          rows={1}
          value={text}
        />

        <div className="mt-3 flex flex-col gap-3 border-t border-stone-900/8 px-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-stone-500">
            Enter to send. Shift + Enter for a new line.
          </p>

          <button
            className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={busy || text.trim().length === 0}
            onClick={submit}
            type="button"
          >
            {busy ? "Running" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
