import { prisma } from "@/lib/prisma";

export async function GET(): Promise<Response> {
  try {
    const syncStatus = await prisma.syncStatus.findUnique({
      where: { id: "lms" },
      select: { lastSyncTime: true },
    });

    return Response.json(
      { lastSyncTime: syncStatus?.lastSyncTime.toISOString() ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
