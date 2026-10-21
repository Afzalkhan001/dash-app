# Push notifications: owner steps

The app code and the server code are written. Nobody gets a notification until you do the steps below.
You only do them once.

The server changes sit on a **local** git branch, `feature/mobile-push`, in the company repo
(`dash-tamada-latest`, checked out in `../dash-mobile-push`). Nothing is pushed, deployed or run against the database.
`docs/SERVER-CHANGES.md` lists every changed line.

## What you get

- A visitor is at reception: the host's phone rings right away (the loudest channel).
- Anything DASH already emails a staff member also arrives on their phone: tasks, tickets, reimbursements,
  petty cash, bounty coins, password changes. A tap opens the matching screen in the app.
- **Sign-in codes, confirmation codes and coupon codes are never sent as notifications.** Lock screens show
  notification text. Those sends are marked `noPush`, and the sender drops anything that looks like a code.
- Signing out of the app removes the phone. An expired session removes it automatically.

## What does not work in Expo Go

Remote push does not exist in Expo Go (Expo removed it in SDK 53). In Expo Go the Notifications screen says
"Available in the installed app". The **demo** still works in Expo Go. Under More › Notifications,
"Try a sample" sends a real local notification to the phone, and tapping it opens the right screen.

## Steps

### 1. Firebase (Android)

1. Open the Firebase console. You can use the DASH web project or a new one.
2. Add an **Android app** with the package name `com.tamadamedia.dashmobile`.
3. Download `google-services.json` and put it in `mobile/`. It is not a secret and may be committed.
4. Ask the integrator to add `"googleServicesFile": "./google-services.json"` under `android` in
   `app.json`.
5. In Firebase, open Project settings › Service accounts › **Generate new private key**. This downloads the
   FCM V1 key as JSON. **Never commit this file.**

### 2. Upload the keys to Expo

- **Android:** run `npx eas-cli@latest credentials`, choose Android, then **Google Service Account › FCM V1**,
  and upload the JSON from step 1.5. You can also do this on expo.dev, under Project › Credentials.
- **iOS:** this needs a paid Apple Developer account. In the same `eas credentials` menu, choose iOS and
  **Push Notifications key**, and let EAS create the APNs key for you.
- **Recommended:** on expo.dev, open Project › Settings and turn on **enhanced push security**. Create an
  access token there and give it to the server as `EXPO_ACCESS_TOKEN` (see step 4).

### 3. A notification icon (Android)

Make a 96×96 PNG with a white shape on a transparent background, and save it as
`mobile/assets/images/notification-icon.png`. Ask the integrator to add `"icon": "./assets/images/notification-icon.png"`
to the `expo-notifications` plugin in `app.json`. Without it, Android shows a grey square.

### 4. The server

1. Open the Supabase SQL editor and run `sql/push_devices.sql` from the branch. It is safe to run twice.
2. Review the branch and merge it the way you normally do. Then deploy it.
3. Set these variables on the host:
   - `PUSH_ENABLED=1`. This is the on switch. Without it nothing is sent, so you can deploy first and
     turn push on later.
   - `EXPO_ACCESS_TOKEN=…` (optional; required if you turned on enhanced push security).

### 5. Build the app

Expo Go cannot receive pushes, so you need an installed build:

```
npx eas-cli@latest build --profile preview --platform android
```

Install it on a real phone and sign in. Then go to More › Notifications › **Turn on notifications** ›
**Send a test notification**. A notification titled "Notifications are on" should arrive in a few seconds.

## Your choice: how much a lock screen shows

Today the notification shows the email's subject and its first line, for example
"Reimbursement awaiting your approval". Some of those lines include names or amounts. If you would rather
show only "You have something waiting in DASH", say so. It is a one-line change in `lib/push.js`
(`pushForEmail`).

## Later (phase 2, not built)

These events send no email today, so they send no push either:

- new Meets chat messages;
- HR approvals waiting for you, and decisions on your own leave or claims;
- new announcements.

Each one needs a `Push.pushToUsers(...)` call next to the event on the server. Explicit deep links per event
(for example `/tasks/<id>` instead of `/tasks`) are in the same phase.
