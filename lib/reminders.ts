import { ReminderThreshold } from "../generated/prisma/client";

import { prisma } from "./prisma";

const HOUR = 60 * 60 * 1000;

export async function detectPendingReminders(now: Date = new Date()): Promise<number> {
  const windowEnd = new Date(now.getTime() + 24 * HOUR);
  const assignments = await prisma.assignment.findMany({
    where: {
      status: "NOT_SUBMITTED",
      dueAt: { gt: now, lte: windowEnd },
    },
    select: { dueAt: true, id: true },
  });
  const reminders = assignments.flatMap((assignment) => {
    if (assignment.dueAt === null) {
      return [];
    }

    const remaining = assignment.dueAt.getTime() - now.getTime();
    const threshold =
      remaining > 6 * HOUR
        ? ReminderThreshold.H24
        : remaining > HOUR
          ? ReminderThreshold.H6
          : ReminderThreshold.H1;

    return [{ assignmentId: assignment.id, threshold }];
  });

  if (reminders.length === 0) {
    return 0;
  }

  return (await prisma.reminder.createMany({ data: reminders, skipDuplicates: true })).count;
}
