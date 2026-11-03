# Expense Tracker

Personal finance app for Android (and iOS) built with Expo, React Native, TypeScript, Expo Router, and on-device SQLite. Money data stays on the device by default. Sample Indian bank SMS messages are included so the parser can be tested without reading the real inbox.

## Run on Android

From this folder:

```bash
npm install
npx expo start
```

Then:

1. Install **Expo Go** from the Play Store on your phone, or start an Android emulator (Android Studio AVD).
2. Connect the phone over USB with USB debugging enabled, or join the same Wi-Fi network as your PC.
3. Press `a` in the Expo terminal, or run:

```bash
npx expo start --android
```

Direct script:

```bash
npm run android
```

If the QR code does not open the app, start Expo Go and scan it. For a physical device on a different network:

```bash
npx expo start --tunnel
```

### Android emulator

1. Install Android Studio and create a device (API 34+ is a good default).
2. Start the emulator.
3. Run `npx expo start --android`.

### Development build (optional)

Expo Go is enough for this app’s current features (SQLite, charts, share sheet). Native SMS inbox access is **not** included and would require a custom development build, not Expo Go.

## SMS parser tests

```bash
npm run test:parser
npx tsc --noEmit
```

Open the **SMS Lab** tab in the app to import the same sample messages into the local database.

## Test the app in Expo

1. Run `npx expo start`, then press `a` for Android or scan the QR code with Expo Go.
2. Wait for the splash screen to close. The first launch seeds sample transactions into the current month and creates budgets.
3. **Dashboard:** confirm income, expenses, and balance. A spending alert should appear when a budget is at least 80% used. The donut and 6-month bar chart should render. Tap the moon/sun icon and confirm the theme changes. Use the month arrows and confirm totals change.
4. **Activity:** search `swiggy`, then clear it. Filter Debit and Credit. Filter a category chip. Open a row, change the category, save, and confirm the list updates. Tap `+`, add a manual transaction, and confirm it appears.
5. **Budgets:** set a small overall limit, return to Dashboard, and confirm the alert. Remove the budget and confirm the bar disappears.
6. **SMS Lab:** select each sample bank and confirm amount, type, date, and merchant. Import one sample and find it on Activity. Paste only a message you choose to store locally.
7. **Export:** on Activity, tap the download icon. Android should open the share sheet with a CSV. "Export this month" uses the visible list. "Export all matching" includes other months that match the search.
8. Reload the app. The same transactions should still be there, because they live in on-device SQLite.

## Android SMS permissions and limits

This project does **not** request `READ_SMS` or `RECEIVE_SMS`.

| Topic | Detail |
| --- | --- |
| Play policy | Inbox SMS permissions are restricted. Google generally allows them only for the default SMS app, not expense trackers. |
| Expo Go | Cannot read the device SMS inbox. |
| Consent | Do not collect or upload real bank SMS without an explicit, in-app consent flow. This app stores pasted or sample text locally only. |
| Safer alternatives | Sample messages (built in), user paste, a future user-picked import in a development build. SMS Retriever / User Consent APIs are for OTPs, not general bank SMS. |
| Notification access | Reading payment notifications is also sensitive and is not used here. |

When a native import is added later, declare permissions in `app.json` only after the user opts in, explain why they are needed, and keep processing on-device.

## Local storage

Transactions, budgets, and settings live in SQLite (`expense-tracker.db`) on the device. Export uses the system share sheet for a CSV file. Nothing is uploaded by this app.
