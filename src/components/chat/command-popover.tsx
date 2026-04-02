"use client";

import { useEffect, useRef } from "react";

import type { CommandInfo } from "@/hooks/use-commands";

interface CommandPopoverProps {
  commands: CommandInfo[];
  filter: string;
  selectedIndex: number;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function CommandPopover({
  commands,
  filter,
  selectedIndex,
  onSelect,
  onClose,
}: CommandPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const filtered = commands.filter((command) =>
    command.name.includes(filter.toLowerCase()),
  );

  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (listRef.current && !listRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-50 mb-2 max-h-60 w-80 overflow-y-auto rounded-2xl border border-stone-200/80 bg-white/95 p-1.5 shadow-lg backdrop-blur-xl"
    >
      {filtered.map((command, index) => (
        <button
          key={command.name}
          ref={(el) => {
            if (el) {
              itemRefs.current.set(index, el);
            } else {
              itemRefs.current.delete(index);
            }
          }}
          className={`flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors ${
            index === selectedIndex
              ? "bg-stone-100 text-stone-900"
              : "text-stone-700 hover:bg-stone-50"
          }`}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(command.name);
          }}
          type="button"
        >
          <span className="text-sm font-medium">/{command.name}</span>
          <span className="text-xs text-stone-500 line-clamp-1">
            {command.description}
          </span>
          {command.usage ? (
            <span className="text-[11px] text-stone-400 line-clamp-1">
              {command.usage}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
