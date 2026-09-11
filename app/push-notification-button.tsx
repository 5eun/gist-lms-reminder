"use client";

import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import type { MessagePayload } from "firebase/messaging";
import { useRef, useState } from "react";

type NotificationState = "idle" | "loading" | "enabled" | "denied" | "unsupported" | "error";

const notificationLabels = {
  idle: "알림 켜기",
  loading: "알림 설정 중...",
  enabled: "알림 사용 중",
  denied: "알림 권한이 거부됨",
  unsupported: "알림을 지원하지 않음",
  error: "알림 설정 다시 시도",
} as const satisfies Record<NotificationState, string>;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export function showForegroundNotification(registration: ServiceWorkerRegistration, payload: MessagePayload): Promise<void> {
  const data = payload.data ?? {};
  const options = {
    body: payload.notification?.body ?? data.body ?? "새 알림이 도착했습니다.",
    data,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
  };

  return registration.showNotification(payload.notification?.title ?? data.title ?? "GIST LMS Reminder", options);
}

export function PushNotificationButton() {
  const [state, setState] = useState<NotificationState>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const stopForegroundMessageListener = useRef<(() => void) | null>(null);

async function enableNotifications(): Promise<void> {
    setState("loading");
    setErrorDetail(null);
    try {
      const firebaseValues = Object.values(firebaseConfig);
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!firebaseValues.every((value) => typeof value === "string" && value.length > 0) || !vapidKey) {
        setErrorDetail("알림을 설정할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        setState("error");
        return;
      }

      if (!("serviceWorker" in navigator) || !("Notification" in window) || !(await isSupported())) {
        setErrorDetail("이 브라우저에서는 알림을 사용할 수 없습니다. 지원되는 브라우저에서 다시 시도해 주세요.");
        setState("unsupported");
        return;
      }

      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();

      if (permission === "denied") {
        setErrorDetail("브라우저 사이트 설정에서 알림을 허용해 주세요.");
        setState("denied");
        return;
      }

      if (permission !== "granted") {
        setErrorDetail("알림 권한을 허용하지 않았습니다.");
        setState("error");
        return;
      }

      await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
      const serviceWorkerRegistration = await navigator.serviceWorker.ready;
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const messaging = getMessaging(app);
      if (stopForegroundMessageListener.current === null) {
        stopForegroundMessageListener.current = onMessage(messaging, (payload) => {
          void showForegroundNotification(serviceWorkerRegistration, payload);
        });
      }

      const token = await Promise.race([
        getToken(messaging, { vapidKey, serviceWorkerRegistration }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("FCM token request timed out")), 15_000);
        }),
      ]);
      if (!token) {
        setErrorDetail("알림을 설정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setState("error");
        return;
      }

      const response = await fetch("/api/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.status !== 204) {
        setErrorDetail("알림 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setState("error");
        return;
      }

      setState("enabled");
    } catch {
      setErrorDetail("알림 설정에 실패했습니다. 브라우저 권한을 확인한 뒤 다시 시도해 주세요.");
      setState("error");
    }
  }

  const disabled = state === "loading" || state === "enabled" || state === "denied" || state === "unsupported";

  return (
    <>
      <button
        type="button"
        onClick={enableNotifications}
        disabled={disabled}
        aria-busy={state === "loading"}
        className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900 dark:focus-visible:outline-white"
      >
        {notificationLabels[state]}
      </button>
      <span className="sr-only" aria-live="polite">
        {notificationLabels[state]}
      </span>
      {errorDetail && (
        <p className="basis-full text-sm text-red-700 dark:text-red-400" role="alert">
          {errorDetail}
        </p>
      )}
    </>
  );
}
