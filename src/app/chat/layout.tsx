import { ChatShell } from "@/components/layout/chat-shell";
import { SessionsProvider } from "@/components/providers/sessions-provider";
import { listSessionSummaries } from "@/db/repositories/session-repository";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessions = await listSessionSummaries();

  return (
    <SessionsProvider initialSessions={sessions}>
      <ChatShell>{children}</ChatShell>
    </SessionsProvider>
  );
}
