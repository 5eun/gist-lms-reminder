import { GistLmsClient } from "@/lib/lms/client";
import { prisma } from "@/lib/prisma";
import type { LmsAssignment, LmsCourse } from "@/lib/lms/types";

export interface SyncResult {
  courses: LmsCourse[];
  assignments: LmsAssignment[];
}

export async function syncLmsData(): Promise<SyncResult> {
  const client = GistLmsClient.fromEnv();
  const courses = await client.getCourses();
  const assignments: LmsAssignment[] = [];

  for (const course of courses) {
    assignments.push(...(await client.getAssignments(course.id)));
  }

  await prisma.$transaction(async (transaction) => {
    for (const course of courses) {
      await transaction.course.upsert({
        where: { id: course.id },
        create: { id: course.id, name: course.name, professor: course.professor ?? null, url: course.url },
        update: { name: course.name, professor: course.professor ?? null, url: course.url },
      });
    }

    for (const assignment of assignments) {
      await transaction.assignment.upsert({
        where: { id: assignment.id },
        create: {
          id: assignment.id,
          courseId: assignment.courseId,
          title: assignment.title,
          url: assignment.url,
          dueAt: assignment.dueAt ?? null,
          status: assignment.status,
        },
        update: {
          courseId: assignment.courseId,
          title: assignment.title,
          url: assignment.url,
          dueAt: assignment.dueAt ?? null,
          status: assignment.status,
        },
      });
    }

    await transaction.syncStatus.upsert({
      where: { id: "lms" },
      create: { id: "lms", lastSyncTime: new Date() },
      update: { lastSyncTime: new Date() },
    });
  });

  return { courses, assignments };
}
