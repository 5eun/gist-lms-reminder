import cron from "node-cron";

import { sendFirebaseMessage, sendPendingReminders } from "./push-notifications";
import { detectPendingReminders } from "./reminders";
import { syncLmsData } from "./sync";
import { LmsError } from "./lms/types";

declare global {
  var gistLmsSchedulerRegistered: boolean | undefined;
}

function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "UNKNOWN";
  }

  const code = error.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

export function startLmsScheduler(): void {
  if (globalThis.gistLmsSchedulerRegistered) {
    return;
  }

  cron.schedule(
    "*/3 * * * *",
    async () => {
      console.log(`[CRON] START ${new Date().toLocaleString("ko-KR")}`);
      let stage = "sync";
      try {
        await syncLmsData();
        stage = "reminder-detection";
        await detectPendingReminders();
        stage = "push-delivery";
        await sendPendingReminders(sendFirebaseMessage);
        console.log(`[CRON] SUCCESS ${new Date().toLocaleString("ko-KR")}`);
      } catch (error: unknown) {
        const code = error instanceof LmsError ? error.code : "INTERNAL_ERROR";
        console.log(`[CRON] FAILED ${new Date().toLocaleString("ko-KR")}`);
        console.error("Scheduled sync/reminder task failed", code, stage, errorCode(error));
      }
    },
    { noOverlap: true, timezone: "Asia/Seoul" },
  );
  globalThis.gistLmsSchedulerRegistered = true;
}
