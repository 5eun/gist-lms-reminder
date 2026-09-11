import { syncLmsData } from "@/lib/sync";
import { LmsError } from "@/lib/lms/types";

export async function POST(): Promise<Response> {
  try {
    return Response.json(await syncLmsData());
  } catch (error: unknown) {
    if (error instanceof LmsError) {
      return Response.json({ error: error.code }, { status: 502 });
    }

    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
