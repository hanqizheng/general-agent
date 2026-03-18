import { redirect } from "next/navigation";

import {
  createSession,
  findLatestSession,
} from "@/db/repositories/session-repository";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const latestSession = await findLatestSession();

  if (latestSession) {
    redirect(`/chat/${latestSession.id}`);
  }

  const session = await createSession(process.cwd());
  redirect(`/chat/${session.id}`);
}
