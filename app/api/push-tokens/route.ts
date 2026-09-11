import { prisma } from "@/lib/prisma";

type PushTokenPayload = {
  readonly token: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePushToken(value: unknown): PushTokenPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "token" || typeof value.token !== "string") {
    return null;
  }

  const token = value.token.trim();
  return token.length > 0 && token.length <= 4096 ? { token } : null;
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  const pushToken = parsePushToken(payload);
  if (!pushToken) {
    return Response.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

  try {
    await prisma.pushToken.upsert({
      where: { token: pushToken.token },
      update: { token: pushToken.token },
      create: { token: pushToken.token },
    });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
