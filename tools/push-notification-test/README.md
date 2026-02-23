# QPS Demo Client

A lightweight web client for testing the Firebase Cloud Messaging integration with QPS (Quiet Push Service).

## Prerequisites

1. **Firebase Project** with Cloud Messaging enabled
2. **QPS Server** running locally or deployed

## Setup

### 1. Get Firebase Web Config

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create one)
3. Click the gear icon → **Project Settings**
4. Scroll to "Your apps" section
5. If no web app exists, click **Add app** → **Web** (</> icon)
6. Copy the `firebaseConfig` object

It looks like:
```json
{
  "apiKey": "AIza...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123"
}
```

### 2. Get VAPID Key (Web Push Certificate)

1. In Firebase Console → Project Settings
2. Go to **Cloud Messaging** tab
3. Scroll to "Web configuration" section
4. Under "Web Push certificates", click **Generate key pair** (if none exists)
5. Copy the **Key pair** value (starts with "B...")

### 3. Run the Demo

From the `tools/push-notification-test` directory:

```bash
# Using npx (recommended)
npx serve .

# Or using Python
python3 -m http.server 8080

# Or using PHP
php -S localhost:8080
```

Then open http://localhost:3000 (or whatever port your server uses).

### 4. Start QPS Server

In another terminal, start your QPS server:

```bash
# From the repo root
pnpm start:dev
```

Make sure QPS has Firebase credentials configured:
```bash
export FIREBASE_PROJECT_ID="your-project"
export FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com"
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

## Usage

1. **Initialize**: Paste your Firebase config JSON, VAPID key, and QPS server URL, then click "Initialize"
   - This opens a WebSocket connection to QPS and initializes Firebase

2. **Get FCM Token**: Click "Request Notification Permission & Token"
   - Allow notifications when prompted
   - An FCM device token will be generated

3. **Register with QPS**: Click "Register Device"
   - Sends a `register-device-token` WebSocket event with your FCM token
   - You'll receive a UCAN token for authorization

4. **Send Test Push**: Enter a title/body and click "Send Push Notification"
   - Sends a `qps-send-push` WebSocket event with your UCAN
   - You should receive a push notification!

## How It Works

QPS uses Socket.io WebSocket events for all operations (not HTTP):

| Event | Direction | Description |
|-------|-----------|-------------|
| `register-device-token` | client → server | Register FCM device token, returns UCAN |
| `qps-send-push` | client → server | Send push notification using UCAN |

Both events use acknowledgment callbacks. The response `status` field will be `success`, `error`, or `not found` (device token expired).

## Troubleshooting

### "WebSocket connection failed"
- Make sure the QPS server is running
- Check the server URL (default: `http://localhost:3000`)
- CORS is configured to allow all origins in development

### "Service Worker registration failed"
- The demo must be served over HTTPS or from localhost
- Make sure `firebase-messaging-sw.js` is in the same directory

### "Failed to get FCM token" or timeout
- **Use Chrome or Firefox** — some Chromium-based browsers (Brave, etc.) have issues with push notifications
- Check that your VAPID key is correct (the public key from Web Push certificates, starts with "B")
- Ensure notifications are allowed in browser settings
- Check `chrome://gcm-internals/` for GCM connection status

### "Registration failed: Push service not available"
- QPS server needs Firebase credentials configured
- Check that `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set

### "Device token no longer valid — re-register"
- The FCM token has expired or been revoked; click "Register Device" again after getting a fresh token

### "Push notification not received"
- Background notifications only work when the page is not focused
- Check browser notification settings
- Look at the browser console and service worker logs

### Viewing Service Worker Logs

1. Open Chrome DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** in the sidebar
4. Find `firebase-messaging-sw.js`
5. Click the **Console** link or check the main console

## Notes

- FCM tokens can expire or be invalidated; you may need to re-register
- The service worker must be served from the root path (or specify a scope)
- This demo stores config in localStorage for convenience
