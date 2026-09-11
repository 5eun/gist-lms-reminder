import type { SendTestPushResult } from "../lib/push-notifications";

async function runTestPush(pushTokenId: string): Promise<SendTestPushResult> {
  const { prisma } = await import("../lib/prisma");

  try {
    const { sendFirebaseMessage, sendTestPush } = await import("../lib/push-notifications");
    return await sendTestPush(pushTokenId, sendFirebaseMessage);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  const pushTokenId = arguments_[0];

  if (arguments_.length !== 1 || pushTokenId === undefined || pushTokenId.trim().length === 0) {
    console.error("Test push failed.");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runTestPush(pushTokenId);
    if (result.kind === "sent") {
      console.log("Test push sent.");
      return;
    }
  } catch {
    console.error("Test push failed.");
    process.exitCode = 1;
    return;
  }

  console.error("Test push failed.");
  process.exitCode = 1;
}

void main();
