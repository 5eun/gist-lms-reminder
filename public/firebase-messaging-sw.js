importScripts("/firebase-app-compat.js");
importScripts("/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) {
    return;
  }

  const data = payload.data ?? {};
  return self.registration.showNotification(data.title ?? "GIST LMS Reminder", {
    body: data.body ?? "새 알림이 도착했습니다.",
    data,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
  });
});
