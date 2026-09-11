const DEFAULT_API_URL = "http://127.0.0.1:3000/api/sync";
const statuses = ["SUBMITTED", "NOT_SUBMITTED", "UNKNOWN"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function main(): Promise<void> {
  const response = await fetch(process.argv[2] ?? DEFAULT_API_URL, { method: "POST" });
  if (!response.ok) {
    throw new Error("API request failed");
  }

  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.courses) || !Array.isArray(body.assignments)) {
    throw new Error("Invalid API response");
  }

  const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<(typeof statuses)[number], number>;
  for (const assignment of body.assignments) {
    if (!isRecord(assignment) || typeof assignment.status !== "string" || !statuses.includes(assignment.status as (typeof statuses)[number])) {
      throw new Error("Invalid assignment status");
    }
    statusCounts[assignment.status as (typeof statuses)[number]] += 1;
  }

  console.log(JSON.stringify({ courseCount: body.courses.length, assignmentCount: body.assignments.length, statusCounts }));
}

main().catch(() => {
  console.error("Sync API smoke test failed");
  process.exitCode = 1;
});
