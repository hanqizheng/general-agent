import type { SessionDetailDto, SessionSummaryDto } from "./session-dto";

export type SessionPatch = {
  id: string;
} & Partial<Omit<SessionDetailDto, "id">>;

export function toSessionSummary(
  session: SessionDetailDto | SessionSummaryDto,
): SessionSummaryDto {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt,
    lastMessageAt: session.lastMessageAt,
  };
}

export function applyPatchToSummary(
  summary: SessionSummaryDto,
  patch: SessionPatch,
): SessionSummaryDto {
  return {
    id: summary.id,
    title: patch.title ?? summary.title,
    status: patch.status ?? summary.status,
    createdAt: patch.createdAt ?? summary.createdAt,
    lastMessageAt:
      patch.lastMessageAt !== undefined
        ? patch.lastMessageAt
        : summary.lastMessageAt,
  };
}

export function areSessionSummariesEqual(
  left: SessionSummaryDto,
  right: SessionSummaryDto,
) {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.lastMessageAt === right.lastMessageAt
  );
}
