import assert from "node:assert/strict";

import { AssignmentStatus, ReminderThreshold } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { detectPendingReminders } from "../lib/reminders";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-09-07T00:00:00.000Z");
const fixturePrefix = `reminder-smoke-${process.pid}`;
const courseId = `${fixturePrefix}-course`;
const assignmentIds = {
  at24Hours: `${fixturePrefix}-at-24-hours`,
  over6Hours: `${fixturePrefix}-over-6-hours`,
  at6Hours: `${fixturePrefix}-at-6-hours`,
  over1Hour: `${fixturePrefix}-over-1-hour`,
  at1Hour: `${fixturePrefix}-at-1-hour`,
  afterNow: `${fixturePrefix}-after-now`,
  atNow: `${fixturePrefix}-at-now`,
  past: `${fixturePrefix}-past`,
  beyond24Hours: `${fixturePrefix}-beyond-24-hours`,
  noDueAt: `${fixturePrefix}-no-due-at`,
  submitted: `${fixturePrefix}-submitted`,
  unknown: `${fixturePrefix}-unknown`,
  concurrent: `${fixturePrefix}-concurrent`,
} as const;

async function main(): Promise<void> {
  let courseCreated = false;

  try {
    await prisma.course.create({
      data: {
        id: courseId,
        name: "Reminder smoke course",
        url: "https://example.test/course",
        assignments: {
          create: [
            { id: assignmentIds.at24Hours, title: "At 24 hours", url: "https://example.test/a", dueAt: new Date(now.getTime() + 24 * HOUR), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.over6Hours, title: "Over 6 hours", url: "https://example.test/b", dueAt: new Date(now.getTime() + 6 * HOUR + 1), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.at6Hours, title: "At 6 hours", url: "https://example.test/c", dueAt: new Date(now.getTime() + 6 * HOUR), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.over1Hour, title: "Over 1 hour", url: "https://example.test/d", dueAt: new Date(now.getTime() + HOUR + 1), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.at1Hour, title: "At 1 hour", url: "https://example.test/e", dueAt: new Date(now.getTime() + HOUR), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.afterNow, title: "After now", url: "https://example.test/f", dueAt: new Date(now.getTime() + 1), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.atNow, title: "At now", url: "https://example.test/g", dueAt: now, status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.past, title: "Past", url: "https://example.test/h", dueAt: new Date(now.getTime() - 1), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.beyond24Hours, title: "Beyond 24 hours", url: "https://example.test/i", dueAt: new Date(now.getTime() + 24 * HOUR + 1), status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.noDueAt, title: "No due date", url: "https://example.test/j", dueAt: null, status: AssignmentStatus.NOT_SUBMITTED },
            { id: assignmentIds.submitted, title: "Submitted", url: "https://example.test/k", dueAt: new Date(now.getTime() + HOUR), status: AssignmentStatus.SUBMITTED },
            { id: assignmentIds.unknown, title: "Unknown", url: "https://example.test/l", dueAt: new Date(now.getTime() + HOUR), status: AssignmentStatus.UNKNOWN },
          ],
        },
      },
    });
    courseCreated = true;

    assert.strictEqual(await detectPendingReminders(now), 6);

    const reminders = await prisma.reminder.findMany({
      where: { assignmentId: { in: Object.values(assignmentIds).slice(0, 6) } },
      select: { assignmentId: true, sentAt: true, threshold: true },
    });
    const thresholds = new Map(reminders.map((reminder) => [reminder.assignmentId, reminder.threshold]));
    assert.strictEqual(thresholds.get(assignmentIds.at24Hours), ReminderThreshold.H24);
    assert.strictEqual(thresholds.get(assignmentIds.over6Hours), ReminderThreshold.H24);
    assert.strictEqual(thresholds.get(assignmentIds.at6Hours), ReminderThreshold.H6);
    assert.strictEqual(thresholds.get(assignmentIds.over1Hour), ReminderThreshold.H6);
    assert.strictEqual(thresholds.get(assignmentIds.at1Hour), ReminderThreshold.H1);
    assert.strictEqual(thresholds.get(assignmentIds.afterNow), ReminderThreshold.H1);
    assert.ok(reminders.every((reminder) => reminder.sentAt === null));

    assert.strictEqual(await detectPendingReminders(now), 0);

    const sentAt = new Date("2026-09-06T00:00:00.000Z");
    await prisma.reminder.update({
      where: { assignmentId_threshold: { assignmentId: assignmentIds.at1Hour, threshold: ReminderThreshold.H1 } },
      data: { sentAt },
    });
    assert.strictEqual(await detectPendingReminders(now), 0);
    const preservedReminder = await prisma.reminder.findUnique({
      where: { assignmentId_threshold: { assignmentId: assignmentIds.at1Hour, threshold: ReminderThreshold.H1 } },
      select: { sentAt: true },
    });
    assert.ok(preservedReminder);
    assert.strictEqual(preservedReminder.sentAt?.toISOString(), sentAt.toISOString());

    await prisma.assignment.create({
      data: {
        id: assignmentIds.concurrent,
        courseId,
        title: "Concurrent",
        url: "https://example.test/concurrent",
        dueAt: new Date(now.getTime() + 2 * HOUR),
        status: AssignmentStatus.NOT_SUBMITTED,
      },
    });
    const concurrentCounts = await Promise.all([detectPendingReminders(now), detectPendingReminders(now)]);
    assert.strictEqual(concurrentCounts[0] + concurrentCounts[1], 1);
    assert.strictEqual(
      await prisma.reminder.count({
        where: { assignmentId: assignmentIds.concurrent, threshold: ReminderThreshold.H6 },
      }),
      1,
    );

    console.log("Reminder smoke test passed");
  } finally {
    if (courseCreated) {
      await prisma.assignment.deleteMany({ where: { courseId } });
      await prisma.course.delete({ where: { id: courseId } });
    }
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Reminder smoke test failed");
  process.exitCode = 1;
});
