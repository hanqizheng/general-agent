"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

import { SessionSidebar } from "@/components/layout/session-sidebar";

interface ChatShellContextValue {
  desktopShellPadding: string;
}

const ChatShellContext = createContext<ChatShellContextValue | null>(null);

export function ChatShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ sessionId?: string | string[] }>();
  const hasSession = Boolean(params.sessionId);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(hasSession);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const desktopShellPadding = isDesktopSidebarOpen
    ? "lg:pl-84 lg:pr-8"
    : "lg:px-8";

  const value = useMemo(
    () => ({
      desktopShellPadding,
    }),
    [desktopShellPadding],
  );

  return (
    <ChatShellContext.Provider value={value}>
      <div className="h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.62),_transparent_28%),linear-gradient(180deg,_#f3efe8_0%,_#ece8e0_100%)] text-stone-950">
        <div className="flex h-full min-h-0">
          <SessionSidebar
            isDesktopOpen={isDesktopSidebarOpen}
            onDesktopOpenChange={setIsDesktopSidebarOpen}
            isMobileOpen={isMobileSidebarOpen}
            onMobileOpenChange={setIsMobileSidebarOpen}
          />

          <section className="flex min-w-0 flex-1 flex-col">{children}</section>
        </div>
      </div>
    </ChatShellContext.Provider>
  );
}

export function useChatShell() {
  const context = useContext(ChatShellContext);
  if (!context) {
    throw new Error("useChatShell must be used within ChatShell");
  }

  return context;
}
