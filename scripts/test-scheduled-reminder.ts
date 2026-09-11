import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { AssignmentStatus, ReminderThreshold } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const HOUR = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 7 * 60 * 1000;
const fixtureId = randomUUID();
const courseId = `scheduled-reminder-test-${fixtureId}-course`;
const assignmentId = `scheduled-reminder-test-${fixtureId}-assignment`;
const dueAt = new Date(Date.now() + 23 * HOUR);

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForScheduledDelivery(): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  let detected = false;

  while (Date.now() < deadline) {
    const reminder = await prisma.reminder.findUnique({
      where: { assignmentId_threshold: { assignmentId, threshold: ReminderThreshold.H24 } },
      select: { threshold: true, sentAt: true },
    });

    if (reminder) {
      detected = true;
      assert.strictEqual(reminder.threshold, ReminderThreshold.H24);
      if (reminder.sentAt) {
        console.log("Scheduled reminder delivered.");
        return;
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  if (detected) {
    throw new Error("Reminder detected but delivery did not complete");
  }
  throw new Error("Scheduler did not create the H24 reminder");
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log("Creates a temporary H24 reminder and waits for the running scheduler to deliver it.");
    console.log("Requires a running app scheduler, a real PushToken, and server ADC for FCM delivery.");
    return;
  }

  let courseCreated = false;
  let assignmentCreated = false;

  try {
    await prisma.course.create({
      data: {
        id: courseId,
        name: `[TEST] Scheduled reminder ${fixtureId}`,
        url: "https://example.test/scheduled-reminder",
      },
    });
    courseCreated = true;

    await prisma.assignment.create({
      data: {
        id: assignmentId,
        courseId,
        title: `[TEST] Scheduled reminder ${fixtureId}`,
        url: "https://example.test/scheduled-reminder/assignment",
        dueAt,
        status: AssignmentStatus.NOT_SUBMITTED,
      },
    });
    assignmentCreated = true;

    console.log(`Created fixture assignment ${assignmentId}.`);
    console.log(`Due at ${dueAt.toISOString()}. Waiting for the 3-minute scheduler.`);
    await waitForScheduledDelivery();
  } finally {
    if (assignmentCreated) {
      await prisma.reminder.deleteMany({ where: { assignmentId } });
      await prisma.assignment.delete({ where: { id: assignmentId } });
    }
    if (courseCreated) {
      await prisma.course.delete({ where: { id: courseId } });
    }
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Scheduled reminder test failed");
  process.exitCode = 1;
});
