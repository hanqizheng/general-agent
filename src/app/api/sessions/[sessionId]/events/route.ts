import { NextRequest, NextResponse } from "next/server";

import { encodeSSE } from "@/core/sse/encoder";
import { liveSessionRegistry } from "@/core/session/live-session-registry";
import { repairSessionIfStale } from "@/core/session/stale-run-recovery";
import { getSessionDetail } from "@/db/repositories/session-repository";
import {
  SESSION_EVENT_TYPE,
  SSE_HEARTBEAT_INTERVAL_MS,
} from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  await repairSessionIfStale(sessionId);

  const session = await getSessionDetail(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        unsubscribe();
        clearInterval(heartbeatTimer);
        controller.close();
      };

      const push = (chunk: string) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      const unsubscribe = liveSessionRegistry.subscribe(sessionId, (event) => {
        push(encodeSSE(event));
      });

      const heartbeatTimer = setInterval(() => {
        push(
          encodeSSE({
            type: SESSION_EVENT_TYPE.HEARTBEAT,
            sessionId,
            seq: -1,
            timestamp: Date.now(),
          }),
        );
      }, SSE_HEARTBEAT_INTERVAL_MS);

      push(
        encodeSSE({
          type: SESSION_EVENT_TYPE.STATUS,
          sessionId,
          seq: -1,
          timestamp: Date.now(),
          status: session.status,
        }),
      );

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
