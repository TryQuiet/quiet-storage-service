/**
 * Firebase Cloud Messaging Service Worker
 * Handles background push notifications from FCM.
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event);

  let data = {};
  let title = 'New Notification';
  let body = '';

  // Try to parse the push data
  if (event.data) {
    try {
      data = event.data.json();
      console.log('[SW] Push data:', JSON.stringify(data, null, 2));

      // FCM can send data in different formats
      if (data.notification) {
        title = data.notification.title || title;
        body = data.notification.body || body;
      }
      if (data.data) {
        // Custom data payload
        console.log('[SW] Custom data:', data.data);
      }
    } catch (e) {
      console.log('[SW] Push data (text):', event.data.text());
    }
  }

  const options = {
    body: body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: data.data || {},
    requireInteraction: true,  // Keep notification visible until user interacts
    tag: 'qps-notification',   // Replace previous notifications with same tag
  };

  console.log('[SW] Showing notification:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] Notification shown successfully'))
      .catch(err => console.error('[SW] Failed to show notification:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

// Also handle Firebase's background message event
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
});

console.log('[SW] Firebase Messaging Service Worker loaded');
