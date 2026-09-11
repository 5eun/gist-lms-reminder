import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { Message, Notification, TokenMessage } from "firebase-admin/messaging";
import { ReminderThreshold } from "../generated/prisma/client";

import { prisma } from "./prisma";

const thresholdLabels = {
  [ReminderThreshold.H24]: "24 hours",
  [ReminderThreshold.H6]: "6 hours",
  [ReminderThreshold.H1]: "1 hour",
} as const satisfies Record<ReminderThreshold, string>;

const highUrgencyWebpush = {
  headers: { Urgency: "high" },
} as const;

const invalidTokenErrorCodes = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const testNotification = {
  title: "GIST LMS Reminder",
  body: "This is a test notification.",
} as const satisfies Notification;

type PushNotificationSender = (message: TokenMessage) => Promise<void>;
type PushTokenLoader = () => Promise<readonly { readonly token: string }[]>;

export type SendTestPushResult = { readonly kind: "sent" } | { readonly kind: "token-not-found" };

function createPushMessage(token: string, notification: Notification): TokenMessage {
  return {
    token,
    data: {
      title: notification.title ?? "GIST LMS Reminder",
      body: notification.body ?? "새 알림이 도착했습니다.",
    },
    webpush: highUrgencyWebpush,
  };
}

function isInvalidTokenError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && invalidTokenErrorCodes.has(String(error.code));
}

async function deletePushToken(token: string): Promise<void> {
  await prisma.pushToken.deleteMany({ where: { token } });
}

export async function sendTestPush(pushTokenId: string, send: PushNotificationSender): Promise<SendTestPushResult> {
  const pushToken = await prisma.pushToken.findUnique({
    where: { id: pushTokenId },
    select: { token: true },
  });

  if (pushToken === null) {
    return { kind: "token-not-found" };
  }

  try {
    await send(createPushMessage(pushToken.token, testNotification));
  } catch (error: unknown) {
    if (isInvalidTokenError(error)) {
      await deletePushToken(pushToken.token);
    }
    throw error;
  }
  return { kind: "sent" };
}

export async function sendFirebaseMessage(message: Message): Promise<void> {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.projectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "gist-lms-reminder",
    });
  await getMessaging(app).send(message);
}

async function loadPushTokens(): Promise<readonly { readonly token: string }[]> {
  return prisma.pushToken.findMany({ select: { token: true } });
}

export async function sendPendingReminders(
  send: PushNotificationSender,
  now: Date = new Date(),
  loadTokens: PushTokenLoader = loadPushTokens,
): Promise<void> {
  const reminders = await prisma.reminder.findMany({
    where: {
      sentAt: null,
      assignment: { is: { status: "NOT_SUBMITTED", dueAt: { gt: now } } },
    },
    select: {
      id: true,
      threshold: true,
      assignment: { select: { dueAt: true, title: true } },
    },
    orderBy: { id: "asc" },
  });
  const pushTokens = await loadTokens();
  if (pushTokens.length === 0) {
    return;
  }

  for (const reminder of reminders) {
    const dueAt = reminder.assignment.dueAt;
    if (dueAt === null) continue;

    const message = {
      data: {
        title: "GIST LMS Reminder",
        body: `${reminder.assignment.title} is due in ${thresholdLabels[reminder.threshold]} at ${dueAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}.`,
      },
      webpush: highUrgencyWebpush,
    } as const;
    const results = await Promise.allSettled(pushTokens.map((pushToken) => send({ ...message, token: pushToken.token })));
    const invalidTokens = results.flatMap((result, index) => {
      if (result.status === "rejected" && isInvalidTokenError(result.reason)) {
        return [pushTokens[index].token];
      }
      return [];
    });
    await Promise.all(invalidTokens.map(deletePushToken));

    const failed = results.find((result) => result.status === "rejected" && !isInvalidTokenError(result.reason));
    if (failed?.status === "rejected") {
      throw failed.reason;
    }

    await prisma.reminder.updateMany({
      where: { id: reminder.id, sentAt: null },
      data: { sentAt: new Date() },
    });
  }
}
