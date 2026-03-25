import { notFound, redirect } from "next/navigation";

import { ChatContainer } from "@/components/chat/chat-container";
import { ChatProvider } from "@/components/providers/chat-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import { hydrateVisibleMessagesPage } from "@/db/repositories/message-repository";
import { getOwnedSessionDetail } from "@/db/repositories/session-repository";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  let ownedSession = await getOwnedSessionDetail(sessionId, userId);
  if (!ownedSession) {
    notFound();
  }

  await repairSessionIfStale(sessionId);

  ownedSession = await getOwnedSessionDetail(sessionId, userId);
  if (!ownedSession) {
    notFound();
  }

  const initialMessagesPage = await hydrateVisibleMessagesPage(
    sessionId,
    null,
    50,
  );

  return (
    <SessionProvider initialSession={ownedSession}>
      <ChatProvider initialMessagesPage={initialMessagesPage}>
        <ChatContainer />
      </ChatProvider>
    </SessionProvider>
  );
}
