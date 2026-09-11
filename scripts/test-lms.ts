import { GistLmsClient } from "../lib/lms/client";

async function main(): Promise<void> {
  const client = GistLmsClient.fromEnv();
  const courses = await client.getCourses();
  let assignmentCount = 0;
  const statusCounts = {
    SUBMITTED: 0,
    NOT_SUBMITTED: 0,
    UNKNOWN: 0,
  };

  for (const course of courses) {
    const assignments = await client.getAssignments(course.id);
    assignmentCount += assignments.length;
    for (const assignment of assignments) {
      statusCounts[assignment.status] += 1;
    }
  }

  console.log(JSON.stringify({ courseCount: courses.length, assignmentCount, statusCounts }));
}

main().catch(() => {
  console.error("LMS smoke test failed");
  process.exitCode = 1;
});
