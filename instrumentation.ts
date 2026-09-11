export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLmsScheduler } = await import("./lib/scheduler");
    startLmsScheduler();
  }
}
