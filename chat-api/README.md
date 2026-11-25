# chat-api

The backend for a mobile messenger in the style of WhatsApp or Messenger: one-to-one and group chats, voice notes, photos, files and video, calls, status posts, payments, and the safety and admin tools around them.

**Stack:** NestJS 12 (ES modules), PostgreSQL 16 with TypeORM migrations and raw SQL for the hot paths, Redis (rate limits, job queues), Socket.IO (live messages), BullMQ (background jobs), S3 (media), LiveKit (calls), Paystack (payments).

## What it does

| Area | What works |
| --- | --- |
| Accounts | Sign-up with a username and email code, sign-in, 2FA (authenticator app), password reset, device sessions, roles (superadmin, admin, manager, user), audit log |
| Chats | Direct and group chats, live delivery over Socket.IO, history with cursor paging, replies, edits, deletes, read receipts, typing, presence, muting |
| Media | Voice notes, images, files and video. The phone uploads straight to S3 through a pre-signed link; the server checks type, size and ownership before the message is sent |
| Add people | A personal QR code (resettable, can be turned off), and people search |
| Other devices | Open your chats on a laptop by scanning a QR code, or sign in with a phone number and a one-time SMS code. New-device alerts by email, push and live event. Sign out any device at once, or all the others |
| App lock | Per device: its own passcode (not the account password), optional Face ID or fingerprint, auto-lock time. Wrong guesses are slowed down, and ten in a row sign the device out. While locked, payments, backups and laptop links are refused |
| Status | 24-hour photo, video and text posts with audience control, viewers list and replies |
| Payments | A wallet in whole kobo (NGN) with a double-entry ledger. Top up through Paystack, send money to a person, pay inside a chat, pay by scanning a QR code. Idempotency keys, admin freeze and reversal, reconciliation |
| Calls | Voice and video calls, one-to-one or group, with ringing, accept, decline, missed-call handling and call records in the chat. LiveKit carries the media |
| Backups | An encrypted export of your chats, with a key made from your own password. The server never stores the password. A small script decrypts the file offline |
| Safety | Block people, report a person, message or status with a reason. A manager verifies, an admin decides, and the decision is audited |
| Admin | Dashboards for managers, admins and superadmins, staff activity with flags (CSV export), usage over time, and a weekly email digest to superadmins |
| Background jobs | Push notifications with retries, hourly clean-up of expired statuses and unsent uploads, and the digest check |

## Run it

```
cp .env.example .env
docker compose up --build
```

Swagger is at `/docs` outside production. Migrations run on start when `RUN_MIGRATIONS=true`.

Without real keys everything still runs: email and SMS codes are printed in the log, payments and calls use fakes, and push is off. See `.env.example` for each setting.

## Switching to real services

| Service | Setting |
| --- | --- |
| Payments | `PAYMENTS_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY`. Use a `sk_test_` key first |
| Calls | `CALLS_PROVIDER=livekit` with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| SMS codes | `SMS_PROVIDER=termii` or `twilio` with that provider's keys |
| Push | `PUSH_PROVIDER=expo` (and `EXPO_ACCESS_TOKEN` if you use one) |
| Media | The S3 bucket settings (`AWS_*`) |
| Jobs | `REDIS_URL`. Without it jobs run inside the server, once, with no retries. `QUEUES=off` forces that |
| Weekly digest | `WEEKLY_DIGEST=true`, `DIGEST_DAY`, `DIGEST_HOUR` |

## Tests

```
pnpm test
docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chat_it -p 5433:5432 postgres:16-alpine
docker run -d --name it-redis -p 6380:6379 redis:7-alpine
TEST_DB_PORT=5433 REDIS_TEST_URL=redis://localhost:6380 pnpm test:e2e
```

The integration tests run the real migrations against PostgreSQL, with fake mail, SMS, S3, payments and calls. The queue tests run against a real Redis and are skipped when `REDIS_TEST_URL` is not set.

CI (`.github/workflows/chat-api.yaml`) builds the image, runs the unit and integration tests, scans the production image with Trivy, runs a smoke test and pushes the image to GHCR on master.

## Design notes

- **Messages travel over a WebSocket**, everything else is REST. A sign-in session id is inside the access token, so signing a device out takes effect at once and closes its live sockets.
- **Money is integers.** Amounts are whole kobo, every transfer is a pair of ledger entries that sum to zero, and a wallet balance cannot go below zero. Each wallet row is locked in a fixed order so two payments cannot deadlock.
- **Roles are a ladder.** A superadmin oversees (read-only), an admin handles money and decisions, a manager does day-to-day operations, and nobody can act on someone above them.
- **Backups are encrypted with your password** (AES-256-GCM, scrypt key). Backup work stays in the server process, not in a queue, because anything queued is stored in Redis and a password must never be.
- **Real keys live in a local `.env` or a Kubernetes Secret**, never in Git.

## Known limits

- Paystack, LiveKit, Expo push and the SMS providers have not been run against the live services yet. Test keys first.
- A wallet that holds real customer money needs the right licence in Nigeria. Keep to test keys until that is sorted.
- Restoring a backup and scheduled automatic backups are not built.
- Video thumbnails and compression are not built.
- Full-screen call ringing needs the native call screen in the mobile app, and ending a call does not remove people from the LiveKit room.
- The app lock's Face ID and fingerprint check happens on the phone, so the server trusts the phone to report that it passed.
- With more than one server instance, Socket.IO needs the Redis adapter, which is not added yet.
- A payment message can be missing in the chat if the server stops between the transfer and the message; sending again with the same idempotency key fixes it.
- Automatic flagging of heavily reported people, and appeals, are not built.
