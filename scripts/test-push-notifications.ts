import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TokenMessage } from "firebase-admin/messaging";
import { AssignmentStatus, ReminderThreshold } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { sendPendingReminders, sendTestPush } from "../lib/push-notifications";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-09-10T00:00:00.000Z");
const fixturePrefix = `push-notification-test-${randomUUID()}`;
const courseId = `${fixturePrefix}-course`;
const tokens = [`${fixturePrefix}-token-a`, `${fixturePrefix}-token-b`] as const;
const dueAt = {
  h24: new Date(now.getTime() + 24 * HOUR),
  h6: new Date(now.getTime() + 6 * HOUR),
  h1: new Date(now.getTime() + HOUR),
} as const;

async function sentAt(assignmentId: string): Promise<Date | null | undefined> {
  return (
    await prisma.reminder.findFirst({
      where: { assignmentId },
      select: { sentAt: true },
    })
  )?.sentAt;
}

async function main(): Promise<void> {
  try {
    const pushTokens = await Promise.all(tokens.map((token) => prisma.pushToken.create({ data: { token } })));
    await prisma.course.create({
      data: {
        id: courseId,
        name: "Push notification smoke course",
        url: "https://example.test/course",
        assignments: {
          create: [
            { id: `${fixturePrefix}-h24`, title: "Twenty-four hours", url: "https://example.test/h24", dueAt: dueAt.h24, status: AssignmentStatus.NOT_SUBMITTED },
            { id: `${fixturePrefix}-h6`, title: "Six hours", url: "https://example.test/h6", dueAt: dueAt.h6, status: AssignmentStatus.NOT_SUBMITTED },
            { id: `${fixturePrefix}-h1`, title: "One hour", url: "https://example.test/h1", dueAt: dueAt.h1, status: AssignmentStatus.NOT_SUBMITTED },
            { id: `${fixturePrefix}-ineligible`, title: "Ineligible", url: "https://example.test/ineligible", dueAt: dueAt.h1, status: AssignmentStatus.SUBMITTED },
          ],
        },
      },
    });
    await prisma.reminder.createMany({
      data: [
        { assignmentId: `${fixturePrefix}-h24`, threshold: ReminderThreshold.H24 },
        { assignmentId: `${fixturePrefix}-h6`, threshold: ReminderThreshold.H6 },
        { assignmentId: `${fixturePrefix}-h1`, threshold: ReminderThreshold.H1 },
        { assignmentId: `${fixturePrefix}-ineligible`, threshold: ReminderThreshold.H1 },
      ],
    });

    const messages: TokenMessage[] = [];
    await sendPendingReminders(async (message) => {
      messages.push(message);
    }, now, async () => tokens.map((token) => ({ token })));
    assert.strictEqual(messages.length, 6);
    assert.ok(messages.every((message) => message.notification === undefined));
    assert.ok(messages.every((message) => message.webpush?.headers?.Urgency === "high"));
    assert.ok(messages.every((message) => message.data?.title === "GIST LMS Reminder"));
    assert.ok(messages.filter((message) => message.data?.body.includes("Twenty-four hours")).every((message) => message.data?.body.includes("24 hours")));
    assert.ok(messages.filter((message) => message.data?.body.includes("Six hours")).every((message) => message.data?.body.includes("6 hours")));
    assert.ok(messages.filter((message) => message.data?.body.includes("One hour")).every((message) => message.data?.body.includes("1 hour")));
    assert.ok(messages.every((message) => message.data?.body.includes(dueAt.h24.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })) || message.data?.body.includes(dueAt.h6.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })) || message.data?.body.includes(dueAt.h1.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))));
    assert.ok(await sentAt(`${fixturePrefix}-h24`));
    assert.ok(await sentAt(`${fixturePrefix}-h6`));
    assert.ok(await sentAt(`${fixturePrefix}-h1`));
    assert.strictEqual(await sentAt(`${fixturePrefix}-ineligible`), null);

    let alreadySentCalls = 0;
    await sendPendingReminders(async () => {
      alreadySentCalls += 1;
    }, now, async () => tokens.map((token) => ({ token })));
    assert.strictEqual(alreadySentCalls, 0);

    let testSenderCalls = 0;
    const sent = await sendTestPush(pushTokens[0].id, async (message) => {
      testSenderCalls += 1;
      assert.strictEqual(message.token, tokens[0]);
      assert.strictEqual(message.notification, undefined);
      assert.deepStrictEqual(message.data, { title: "GIST LMS Reminder", body: "This is a test notification." });
      assert.deepStrictEqual(message.webpush, { headers: { Urgency: "high" } });
    });
    assert.deepStrictEqual(sent, { kind: "sent" });
    assert.strictEqual(testSenderCalls, 1);
    const invalidToken = `${fixturePrefix}-invalid-token`;
    const invalidPushToken = await prisma.pushToken.create({ data: { token: invalidToken } });
    const invalidTokenError = Object.assign(new Error("Token is not registered"), { code: "messaging/registration-token-not-registered" });
    await assert.rejects(
      sendTestPush(invalidPushToken.id, async () => Promise.reject(invalidTokenError)),
      invalidTokenError,
    );
    assert.strictEqual(await prisma.pushToken.findUnique({ where: { id: invalidPushToken.id } }), null);
    assert.deepStrictEqual(await sendTestPush(`unknown-push-token-${randomUUID()}`, async () => undefined), { kind: "token-not-found" });
    await assert.rejects(sendTestPush(pushTokens[0].id, async () => Promise.reject(new Error("Sender rejected"))));

    const fanoutInvalidToken = `${fixturePrefix}-fanout-invalid`;
    await prisma.pushToken.create({ data: { token: fanoutInvalidToken } });
    await prisma.assignment.create({
      data: {
        id: `${fixturePrefix}-fanout-invalid-assignment`,
        courseId,
        title: "Fanout invalid token",
        url: "https://example.test/fanout-invalid",
        dueAt: dueAt.h1,
        status: AssignmentStatus.NOT_SUBMITTED,
      },
    });
    await prisma.reminder.create({ data: { assignmentId: `${fixturePrefix}-fanout-invalid-assignment`, threshold: ReminderThreshold.H1 } });
    const fanoutInvalidError = Object.assign(new Error("Token is not registered"), { code: "messaging/invalid-registration-token" });
    await sendPendingReminders(
      async (message) => {
        if (message.token === fanoutInvalidToken) {
          throw fanoutInvalidError;
        }
      },
      now,
      async () => [{ token: fanoutInvalidToken }, { token: tokens[0] }],
    );
    assert.strictEqual(await prisma.pushToken.findUnique({ where: { token: fanoutInvalidToken } }), null);

    await prisma.assignment.create({ data: { id: `${fixturePrefix}-partial`, courseId, title: "Partial", url: "https://example.test/partial", dueAt: dueAt.h24, status: AssignmentStatus.NOT_SUBMITTED } });
    await prisma.reminder.create({ data: { assignmentId: `${fixturePrefix}-partial`, threshold: ReminderThreshold.H24 } });
    const partialTokens: string[] = [];
    await assert.rejects(
      sendPendingReminders(async (message) => {
        partialTokens.push(message.token ?? "");
        if (message.token === tokens[1]) throw new Error("Token rejected");
      }, now, async () => tokens.map((token) => ({ token }))),
    );
    assert.deepStrictEqual(partialTokens.sort(), [...tokens].sort());
    assert.strictEqual(await sentAt(`${fixturePrefix}-partial`), null);

    let retryCalls = 0;
    await sendPendingReminders(async () => {
      retryCalls += 1;
    }, now, async () => tokens.map((token) => ({ token })));
    assert.strictEqual(retryCalls, 2);
    assert.ok(await sentAt(`${fixturePrefix}-partial`));

    await prisma.assignment.create({ data: { id: `${fixturePrefix}-zero`, courseId, title: "Zero tokens", url: "https://example.test/zero", dueAt: dueAt.h1, status: AssignmentStatus.NOT_SUBMITTED } });
    await prisma.reminder.create({ data: { assignmentId: `${fixturePrefix}-zero`, threshold: ReminderThreshold.H1 } });
    await sendPendingReminders(async () => {
      throw new Error("Sender should not be called without tokens");
    }, now, async () => []);
    assert.strictEqual(await sentAt(`${fixturePrefix}-zero`), null);
    await prisma.assignment.update({
      where: { id: `${fixturePrefix}-zero` },
      data: { status: AssignmentStatus.SUBMITTED },
    });

    await prisma.assignment.createMany({
      data: [
        { id: `${fixturePrefix}-stop-early`, courseId, title: "Stop early", url: "https://example.test/stop-early", dueAt: dueAt.h1, status: AssignmentStatus.NOT_SUBMITTED },
        { id: `${fixturePrefix}-stop-later`, courseId, title: "Stop later", url: "https://example.test/stop-later", dueAt: dueAt.h1, status: AssignmentStatus.NOT_SUBMITTED },
      ],
    });
    await prisma.reminder.createMany({
      data: [
        { id: `${fixturePrefix}-stop-early-reminder`, assignmentId: `${fixturePrefix}-stop-early`, threshold: ReminderThreshold.H1 },
        { id: `${fixturePrefix}-stop-later-reminder`, assignmentId: `${fixturePrefix}-stop-later`, threshold: ReminderThreshold.H1 },
      ],
    });
    const attemptedTitles: string[] = [];
    await assert.rejects(
      sendPendingReminders(async (message) => {
        const title = message.data?.body.includes("Stop early") ? "Stop early" : "Stop later";
        attemptedTitles.push(title);
        throw new Error("First reminder failed");
      }, now, async () => [{ token: `${fixturePrefix}-token-c` }]),
    );
    assert.deepStrictEqual(attemptedTitles, ["Stop early"]);
    assert.strictEqual(await sentAt(`${fixturePrefix}-stop-early`), null);
    assert.strictEqual(await sentAt(`${fixturePrefix}-stop-later`), null);

    console.log("Push notification tests passed");
  } finally {
    await prisma.pushToken.deleteMany({ where: { token: { startsWith: fixturePrefix } } });
    await prisma.assignment.deleteMany({ where: { courseId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Push notification tests failed");
  process.exitCode = 1;
});
