export {};

const DEFAULT_API_URL = "http://127.0.0.1:3000/api/assignments";
const COURSE_KEYS = ["id", "name", "professor", "url"] as const;
const ASSIGNMENT_KEYS = ["id", "courseId", "title", "url", "dueAt", "status"] as const;

type CourseRecord = {
  id: string;
  name: string;
  professor?: string;
  url: string;
};

type AssignmentRecord = {
  id: string;
  courseId: string;
  title: string;
  url: string;
  dueAt?: string;
  status: "SUBMITTED" | "NOT_SUBMITTED" | "UNKNOWN";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && keys.every((key) => expectedKeys.includes(key));
}

function isCourse(value: unknown): value is CourseRecord {
  if (!isRecord(value) || !hasOnlyKeys(value, COURSE_KEYS)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    (value.professor === undefined || typeof value.professor === "string")
  );
}

function isAssignment(value: unknown): value is AssignmentRecord {
  if (!isRecord(value) || !hasOnlyKeys(value, ASSIGNMENT_KEYS)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.courseId === "string" &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    (value.dueAt === undefined || (typeof value.dueAt === "string" && !Number.isNaN(Date.parse(value.dueAt)))) &&
    (value.status === "SUBMITTED" || value.status === "NOT_SUBMITTED" || value.status === "UNKNOWN")
  );
}

function isOrdered<T>(values: readonly T[], compare: (left: T, right: T) => number): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1], value) <= 0);
}

async function main(): Promise<void> {
  const response = await fetch(process.argv[2] ?? DEFAULT_API_URL);
  if (!response.ok) {
    throw new Error("API request failed");
  }

  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    !hasExactKeys(body, ["courses", "assignments"]) ||
    !Array.isArray(body.courses) ||
    !Array.isArray(body.assignments)
  ) {
    throw new Error("Invalid API response");
  }

  const courses = body.courses.filter(isCourse);
  const assignments = body.assignments.filter(isAssignment);
  const courseOrder = new Map(courses.map((course, index) => [course.id, index]));
  if (
    courses.length !== body.courses.length ||
    assignments.length !== body.assignments.length ||
    !assignments.every((assignment) => courseOrder.has(assignment.courseId)) ||
    !isOrdered(courses, (left, right) => `${left.name}\u0000${left.id}`.localeCompare(`${right.name}\u0000${right.id}`)) ||
    !isOrdered(assignments, (left, right) => {
      const leftCourse = courseOrder.get(left.courseId) ?? Number.MAX_SAFE_INTEGER;
      const rightCourse = courseOrder.get(right.courseId) ?? Number.MAX_SAFE_INTEGER;
      if (leftCourse !== rightCourse) return leftCourse - rightCourse;
      if (left.dueAt === undefined) return right.dueAt === undefined ? left.id.localeCompare(right.id) : 1;
      if (right.dueAt === undefined) return -1;
      return left.dueAt === right.dueAt ? left.id.localeCompare(right.id) : left.dueAt.localeCompare(right.dueAt);
    })
  ) {
    throw new Error("Invalid API response");
  }

  console.log(JSON.stringify({ courseCount: courses.length, assignmentCount: assignments.length }));
}

main().catch(() => {
  console.error("Assignments API smoke test failed");
  process.exitCode = 1;
});
