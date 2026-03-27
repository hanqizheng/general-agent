"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { UIToolPart } from "@/lib/chat-types";
import { TOOL_CALL_STATUS } from "@/lib/constants";

import { ToolRenderer } from "./tool-renderer";

interface ToolStackRendererProps {
  parts: UIToolPart[];
}

function isActiveStatus(status: UIToolPart["status"]) {
  return (
    status === TOOL_CALL_STATUS.PENDING || status === TOOL_CALL_STATUS.RUNNING
  );
}

function getFocusedTool(parts: UIToolPart[]) {
  return (
    [...parts].reverse().find((part) => isActiveStatus(part.status)) ??
    parts[parts.length - 1]
  );
}

export function ToolStackRenderer({ parts }: ToolStackRendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const focusedPart = getFocusedTool(parts);
  const hiddenCount = parts.length - 1;
  const toggleButton = (
    <button
      aria-expanded={isExpanded}
      className="flex cursor-pointer items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-stone-600"
      onClick={() => {
        setIsExpanded((value) => !value);
      }}
      type="button"
    >
      <span>
        {isExpanded
          ? "Collapse"
          : hiddenCount > 0
            ? `Expand ${hiddenCount}`
            : "Expand"}
      </span>
      {isExpanded ? (
        <ChevronUp className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
    </button>
  );

  return (
    <section className="min-w-0">
      <div className="space-y-3">
        {isExpanded
          ? parts.map((part, index) => (
              <ToolRenderer
                key={part.toolCallId ?? `tool-stack-${part.partIndex}`}
                detailsAccessory={index === 0 ? toggleButton : undefined}
                part={part}
              />
            ))
          : (
              <ToolRenderer
                detailsAccessory={toggleButton}
                key={focusedPart.toolCallId ?? `tool-focus-${focusedPart.partIndex}`}
                part={focusedPart}
              />
            )}
      </div>
    </section>
  );
}
