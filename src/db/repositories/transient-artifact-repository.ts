import { and, eq, inArray, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { transientArtifacts } from "@/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

export async function findExpirableArtifacts(cutoff: Date) {
  return db
    .select()
    .from(transientArtifacts)
    .where(
      and(
        or(
          eq(transientArtifacts.status, "uploaded"),
          eq(transientArtifacts.status, "in_use"),
        ),
        lt(transientArtifacts.expiresAt, cutoff),
      ),
    );
}

export async function expireArtifacts(
  executor: DbExecutor,
  artifactIds: string[],
) {
  if (artifactIds.length === 0) {
    return [];
  }

  return executor
    .update(transientArtifacts)
    .set({
      status: "expired",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(transientArtifacts.id, artifactIds))
    .returning();
}
