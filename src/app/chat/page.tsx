"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { InputArea } from "@/components/chat/input-area";
import { useChatShell } from "@/components/layout/chat-shell";
import { useSessionsContext } from "@/components/providers/sessions-provider";
import { writePendingMessage } from "@/hooks/use-initial-message";
import type { SendMessageInput } from "@/lib/session-dto";

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
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const sessionPromiseRef = useRef<Promise<string> | null>(null);
  const draftSessionIdRef = useRef<string | null>(null);
  const retainedDraftSessionRef = useRef(false);

  useEffect(() => {
    draftSessionIdRef.current = draftSessionId;
  }, [draftSessionId]);

  useEffect(() => {
    return () => {
      const orphanedDraftSessionId = draftSessionIdRef.current;
      if (!orphanedDraftSessionId || retainedDraftSessionRef.current) {
        return;
      }

      void fetch(`/api/sessions/${orphanedDraftSessionId}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    };
  }, []);

  const ensureSessionId = useCallback(async () => {
    if (draftSessionIdRef.current) {
      return draftSessionIdRef.current;
    }

    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = createSession()
        .then((session) => {
          draftSessionIdRef.current = session.id;
          setDraftSessionId((current) => current ?? session.id);
          return session.id;
        })
        .finally(() => {
          sessionPromiseRef.current = null;
        });
    }

    const sessionId = await sessionPromiseRef.current;
    draftSessionIdRef.current = sessionId;
    return sessionId;
  }, [createSession]);

  const handleSend = async (input: SendMessageInput) => {
    setIsSubmitting(true);
    try {
      const sessionId = await ensureSessionId();
      retainedDraftSessionRef.current = true;
      writePendingMessage(sessionId, input);
      router.push(`/chat/${sessionId}`);
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
          ensureSessionId={ensureSessionId}
          onSend={handleSend}
          sessionId={draftSessionId}
        />
      </div>
    </div>
  );
}
