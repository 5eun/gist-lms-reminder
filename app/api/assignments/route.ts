import { prisma } from "@/lib/prisma";

export async function GET(): Promise<Response> {
  try {
    const courses = await prisma.course.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: {
        assignments: {
          orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        },
      },
    });

    return Response.json({
      courses: courses.map((course) => ({
        id: course.id,
        name: course.name,
        professor: course.professor ?? undefined,
        url: course.url,
      })),
      assignments: courses.flatMap((course) =>
        course.assignments.map((assignment) => ({
          id: assignment.id,
          courseId: assignment.courseId,
          title: assignment.title,
          url: assignment.url,
          dueAt: assignment.dueAt?.toISOString(),
          status: assignment.status,
        })),
      ),
    });
  } catch {
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
