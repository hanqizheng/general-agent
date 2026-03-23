"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { InputArea } from "@/components/chat/input-area";
import { useChatShell } from "@/components/layout/chat-shell";
import { useSessionsContext } from "@/components/providers/sessions-provider";
import { writePendingMessage } from "@/hooks/use-initial-message";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function ChatPage() {
  const router = useRouter();
  const { desktopShellPadding } = useChatShell();
  const { createSession } = useSessionsContext();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = async (text: string) => {
    setIsSubmitting(true);
    try {
      const session = await createSession();
      writePendingMessage(session.id, text);
      router.push(`/chat/${session.id}`);
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center px-4 py-8 transition-[padding] duration-300 ${desktopShellPadding}`}
    >
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            {getGreeting()}
          </h1>
          <p className="mt-2 text-base text-stone-500">
            How can I help you today?
          </p>
        </div>

        <InputArea
          busy={isSubmitting}
          isStopping={false}
          onAbort={() => {}}
          onSend={(text) => {
            void handleSend(text);
          }}
        />
      </div>
    </div>
  );
}
