import { notFound } from "next/navigation";

import { ChatContainer } from "@/components/chat/chat-container";
import { ChatProvider } from "@/components/providers/chat-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import { hydrateVisibleMessagesPage } from "@/db/repositories/message-repository";
import { getSessionDetail } from "@/db/repositories/session-repository";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  await repairSessionIfStale(sessionId);

  const session = await getSessionDetail(sessionId);
  if (!session) {
    notFound();
  }

  const initialMessagesPage = await hydrateVisibleMessagesPage(
    sessionId,
    null,
    50,
  );

  return (
    <SessionProvider initialSession={session}>
      <ChatProvider initialMessagesPage={initialMessagesPage}>
        <ChatContainer />
      </ChatProvider>
    </SessionProvider>
  );
}
