import { AppError } from "@/lib/errors";

import { auth } from "./auth";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new AppError("Unauthorized", "UNAUTHORIZED", 401, false);
  }

  return userId;
}
