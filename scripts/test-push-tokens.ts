import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma";

const DEFAULT_API_URL = "http://127.0.0.1:3000/api/push-tokens";
const token = `push-token-smoke-${randomUUID()}`;

async function main(): Promise<void> {
  try {
    for (const body of [{ token }, { token: ` ${token} ` }]) {
      const response = await fetch(process.argv[2] ?? DEFAULT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.strictEqual(response.status, 204);
      assert.strictEqual(await response.text(), "");
    }

    assert.strictEqual(await prisma.pushToken.count({ where: { token } }), 1);

    const response = await fetch(process.argv[2] ?? DEFAULT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, extra: true }),
    });
    assert.strictEqual(response.status, 400);
    assert.deepStrictEqual(await response.json(), { error: "INVALID_TOKEN" });
    console.log("Push token smoke test passed");
  } finally {
    await prisma.pushToken.deleteMany({ where: { token } });
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Push token smoke test failed");
  process.exitCode = 1;
});
