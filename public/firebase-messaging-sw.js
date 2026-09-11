importScripts("/firebase-app-compat.js");
importScripts("/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCNOd5AM7WBQkxJXYU9Uyz31Z0RvWiKW58",
  authDomain: "gist-lms-reminder.firebaseapp.com",
  projectId: "gist-lms-reminder",
  storageBucket: "gist-lms-reminder.firebasestorage.app",
  messagingSenderId: "880293658634",
  appId: "1:880293658634:web:8de7ffc563be1270759ff3",
  measurementId: "G-T58WT1MCKC",
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
