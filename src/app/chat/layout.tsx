import { redirect } from "next/navigation";

import { ChatShell } from "@/components/layout/chat-shell";
import { auth } from "@/lib/auth";
import { listSessionSummaries } from "@/db/repositories/session-repository";
import { SessionsProvider } from "@/components/providers/sessions-provider";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId || !session.user) {
    redirect("/login");
  }

  const sessions = await listSessionSummaries(userId);

  return (
    <SessionsProvider initialSessions={sessions}>
      <ChatShell user={session.user}>{children}</ChatShell>
    </SessionsProvider>
  );
}
