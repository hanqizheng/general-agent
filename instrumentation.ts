export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { markAllStaleRunsInterrupted } = await import(
    "@/core/session/stale-run-recovery"
  );

  await markAllStaleRunsInterrupted();
}
