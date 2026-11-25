# Chat API

Chat API is the backend for a mobile messenger in the style of WhatsApp or Messenger. It brings together accounts and device sessions, one-to-one and group chats, voice notes, photos, files and video, voice and video calls, 24-hour status posts, a wallet with payments, encrypted backups, an app lock, and the safety and admin tools around them.

The project is built with NestJS, PostgreSQL and Redis. The focus is on the backend concerns that matter beyond basic CRUD: real-time delivery, session lifecycle and device control, money kept consistent with a double-entry ledger, media uploads that are checked before use, background jobs, moderation with an audit trail, and automated tests against real services.

## What the backend provides

### Authentication and account security

- Sign-up with a username and an emailed code, sign-in, password reset, and two-factor sign-in with an authenticator app.
- Each sign-in is a device session. The session id is inside the access token, so signing a device out takes effect at once and closes its live sockets. A person can sign out one device or every other device.
- Sign in with a phone number and a one-time SMS code (5-minute life, 60-second cooldown, 5 codes an hour, 5 wrong guesses lock the code). The answer is the same for known and unknown numbers.
- Open your chats on a laptop by scanning a QR code. The code lives 120 seconds, works once, and the phone approves it.
- New-device alerts by email, push and a live event.
- An app lock per device: its own passcode (6 to 32 characters, never the account password, stored as a bcrypt hash) with optional Face ID or fingerprint and an auto-lock time. Wrong guesses are slowed down (30 seconds after the 5th, doubling up to 15 minutes), and ten in a row sign the device out. While the app is locked, payments, backups and laptop links return 423.

Face ID and fingerprint are checked by the phone itself, so the server trusts the phone to report that the check passed. That is suitable for a screen lock but is not proof of identity.

### Roles and staff administration

| Role | Purpose |
| --- | --- |
| `superadmin` | Oversight, read-only: dashboards, staff activity, audit log |
| `admin` | Money and decisions: reconciliation, freezing wallets, reversing payments, deciding reports |
| `manager` | Operations: verifying reports, day-to-day work |
| `user` | Messaging |

Roles are a ladder (superadmin > admin > manager > user), and a role acts only on accounts below it. Sensitive actions are written to the audit log.

### Chats and presence

- Direct and group chats, delivered live over Socket.IO, with history by cursor paging.
- Replies, edits, deletes, read receipts, typing indicators, presence and last seen, and muting.
- Sockets join `user:{id}` and `session:{sid}` rooms, and the gateway checks the token and session in the handshake.
- Each message has a per-sender `clientId`, so a retried send never creates a duplicate.

### Media, status posts and backups

- Voice notes, images, files and video. The phone uploads straight to S3 through a pre-signed link, then sends the message with the `mediaId`. The server checks type, size, ownership and that the upload finished.
- Status posts that last 24 hours, with audience control, a viewers list and replies.
- A personal QR code to add people (resettable, can be turned off) and people search.
- Backups of your chats, encrypted with a key made from your own password (AES-256-GCM, scrypt). The server never stores the password. `scripts/decrypt-backup.mjs` decrypts a file offline; see `docs/BACKUP.md`.

### Payments and wallet

- A wallet in whole kobo (NGN) with a double-entry ledger: entries sum to zero and a balance cannot go below zero.
- Top up through Paystack, send money to a person, pay inside a chat, or pay by scanning a QR code. A payment appears in the chat as a message.
- Idempotency keys per sender, so a retried payment is not made twice. Wallet rows are locked in a fixed order so two payments cannot deadlock.
- The Paystack webhook checks an HMAC-SHA512 signature over the raw body.
- Admins can freeze and unfreeze a wallet, reverse a transaction, and run a reconciliation that compares balances with the ledger.

### Calls

- Voice and video calls, one-to-one or group, with ringing, accept, decline, missed-call handling and a ring timeout.
- Call records are posted in the chat. LiveKit carries the audio and video; this API issues the tokens and handles the signalling.

### Safety, moderation and admin

- Blocking is mutual and applies to direct messages, new chats, calls, payments, QR scans, search and statuses.
- A person can report another person, a message or a status with a reason. A manager verifies, an admin decides (dismiss, remove content, suspend, or both), and the reporters are told the outcome. Evidence is a snapshot, and viewing message evidence is audited.
- Dashboards for managers, admins and superadmins (the manager sees no money), staff activity with flags for removals, private-content lookups, off-hours work and missing 2FA (JSON or CSV), a usage report per day, and a weekly email digest to superadmins.

### Background jobs

- With `REDIS_URL` set, offline push notifications run through BullMQ with retries and backoff, and hourly jobs remove expired statuses and unsent uploads and check whether the weekly digest is due. With several replicas a scheduled job runs once.
- Without Redis the same jobs run inside the server process, once, with no retries. Backup work stays in the process because anything queued is stored in Redis and a password must never be.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 12 (ES modules), TypeScript |
| API | REST, Swagger, Socket.IO |
| Database | PostgreSQL 16, TypeORM migrations, raw SQL on hot paths |
| Cache and queue infrastructure | Redis, BullMQ, `@nestjs/throttler` |
| Authentication | JWT, bcrypt, TOTP |
| Media | AWS S3 pre-signed uploads |
| Calls | LiveKit |
| Payments | Paystack |
| Push, SMS, email | Expo push, Termii or Twilio, SMTP |
| Containers | Docker, Docker Compose |
| CI/CD and security scanning | GitHub Actions, Trivy, ghcr.io |
| Tests | Jest, supertest, socket.io-client |

## Architecture at a glance

Messages travel over a WebSocket; everything else is REST. A request passes through the rate limiter and validation, then a JWT guard that also checks the session exists, then a roles guard where needed. Controllers hand the work to services, which use PostgreSQL directly. Services publish live events through a global realtime module, and send offline pushes through the queue.

Money moves only inside database transactions, and every transfer is a pair of ledger entries. Media never passes through the API: the phone uploads to S3 and the server verifies the object before a message may use it.

## Repository layout

The main application code lives in `src/`, one folder per area:

- `src/auth/`, `src/users/`, `src/phone/`, `src/links/`, `src/security/`, `src/app-lock/` — accounts, sessions, phone sign-in, laptop linking, device alerts and the app lock.
- `src/chat/` — conversations, messages, media, blocking and the Socket.IO gateway.
- `src/contacts/`, `src/status/`, `src/backups/`, `src/wallet/`, `src/calls/` — QR contacts, status posts, backups, wallet and payments, calls.
- `src/moderation/`, `src/analytics/`, `src/audit/` — reports, dashboards and digest, audit log.
- `src/queue/`, `src/realtime/`, `src/migrations/` — jobs, live events, database schema.
- `test/` — integration tests; `docs/BACKUP.md` and `scripts/decrypt-backup.mjs` — backup format and tool.
- `.github/workflows/chat-api.yaml` — CI workflow at the monorepo root.

## Requirements

- Node.js 24 or newer (Nest 12 ships as ES modules) and pnpm, to run without Docker.
- Docker and Docker Compose for the quickest start.
- Optional credentials for the services you want to try for real: Paystack, LiveKit, S3, SMS and Expo push.

## Configuration

Start with the example environment file:

```bash
cp .env.example .env
```

The app checks its settings at start-up and lists every problem at once. Without real keys everything still runs: email and SMS codes are printed in the log, payments and calls use fakes, and push is off.

| Variable group | Purpose |
| --- | --- |
| `DB_*` | PostgreSQL connection |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing (32+ characters in production, and different) |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | The superadmin account, created at start-up |
| `PAYMENTS_PROVIDER`, `PAYSTACK_SECRET_KEY` | `fake` or `paystack`. Use a `sk_test_` key first |
| `CALLS_PROVIDER`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `fake` or `livekit` |
| `SMS_PROVIDER` and its keys | `console`, `termii` or `twilio` |
| `PUSH_PROVIDER`, `EXPO_ACCESS_TOKEN` | `expo` turns push on |
| `AWS_*` | S3 bucket for media and backups |
| `MAIL_*` | SMTP for emailed codes and alerts |
| `REDIS_URL`, `QUEUES` | Rate limits and job queues; `QUEUES=off` forces in-process jobs |
| `WEEKLY_DIGEST`, `DIGEST_DAY`, `DIGEST_HOUR`, `REPORT_TZ_OFFSET_HOURS` | The weekly digest |
| `FLAG_DELETES`, `FLAG_LOOKUPS`, `OFF_HOURS_START`, `OFF_HOURS_END` | Staff-activity flag thresholds |

`.env.example` documents every variable. Never commit a populated `.env`; on Kubernetes use a Secret.

## Run locally

```bash
cd chat-api
cp .env.example .env
docker compose up --build
```

The Compose file starts the API with PostgreSQL and Redis. Once the services are healthy:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs` (not in production)
- Health: `http://localhost:3000/health`, readiness: `http://localhost:3000/ready`

Migrations run on start when `RUN_MIGRATIONS=true`. Stop everything with `docker compose down`; add `-v` only if you want to delete the local database volume.

## Useful development commands

```bash
pnpm install
pnpm start:dev       # start in watch mode
pnpm build           # compile the application
pnpm lint            # run the linter
pnpm test            # unit tests
pnpm test:e2e        # integration tests (needs PostgreSQL)
```

## API overview

Full, interactive documentation is in Swagger. Main route groups:

| Area | Routes |
| --- | --- |
| Accounts | `/auth/*` (register, login, 2FA, refresh, logout, reset, sessions), `/users/*` |
| Phone and devices | `/auth/phone/*`, `/phone/*`, `/auth/link/*`, `/devices` |
| App lock | `GET/POST/PATCH/DELETE /app-lock`, `/app-lock/lock`, `/app-lock/unlock`, `/app-lock/unlock/biometric` |
| Chats | `/conversations/*`, `/conversations/:id/messages`, `/media/uploads`, `/blocks/*` |
| Contacts and status | `/contacts/*`, `/status/*` |
| Backups | `/backups/*` |
| Wallet | `/wallet/*`, `/admin/wallets/*`, `/payments/webhook/paystack` |
| Calls | `/calls/*` |
| Moderation | `/reports/*` |
| Admin | `/dashboard/manager|admin|superadmin`, `/analytics/staff-activity`, `/analytics/usage`, `/analytics/digest/send`, `/audit-logs` |

## Testing and quality checks

The integration tests run the real migrations against PostgreSQL and use fakes for mail, SMS, S3, payments and calls. They cover direct and group chat, live sockets, media, device sign-out, phone sign-in, QR linking and contacts, backups, status posts, the wallet and payments, calls, blocking, reports and moderation, dashboards, background jobs and the app lock. Unit tests cover the pure logic (money, backup crypto, policies, cursors).

```bash
pnpm test
docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chat_it -p 5433:5432 postgres:16-alpine
docker run -d --name it-redis -p 6380:6379 redis:7-alpine
TEST_DB_PORT=5433 REDIS_TEST_URL=redis://localhost:6380 pnpm test:e2e
```

The queue tests run against a real Redis and are skipped when `REDIS_TEST_URL` is not set. The integration tests empty their tables, so they refuse to run unless the database name ends in `_it`.

## Docker and CI/CD

The project has a multi-stage Docker build and a workflow at `.github/workflows/chat-api.yaml`. It builds a test image, runs unit tests, runs the integration tests against real PostgreSQL and Redis, builds the production image, scans it with Trivy, runs a smoke test with Redis on, and on `master` pushes the image to GitHub Container Registry tagged by commit SHA. Check the Actions tab for the result of a specific commit.

## Security notes

- Keep JWT, database, payment, LiveKit, SMS and S3 secrets outside source control.
- Use test keys until a provider flow has been checked end to end.
- Roles are checked on every request, and a revoked session loses access immediately.
- Phone codes and the QR contact code are signed or hashed, and the app lock passcode is a bcrypt hash.
- Backups are encrypted with a key derived from the user's password, which is never stored.
- Anything put in a job queue is stored in Redis, so never queue a secret.

## Current implementation boundaries

- Paystack, LiveKit, Expo push and the SMS providers have not been run against the live services yet.
- A wallet that holds real customer money needs the right licence in Nigeria. Keep to test keys until that is sorted.
- Restoring a backup and scheduled automatic backups are not built.
- Video thumbnails and compression are not built.
- Full-screen call ringing needs the native call screen in the mobile app, and ending a call does not remove people from the LiveKit room.
- The app lock's Face ID and fingerprint check happens on the phone. The lock screen, the prompts and the auto-lock timer still need to be built in the mobile app.
- With more than one server instance, Socket.IO needs the Redis adapter, which is not added yet.
- A payment message can be missing in the chat if the server stops between the transfer and the message; sending again with the same idempotency key fixes it.
- Automatic flagging of heavily reported people, and appeals, are not built.

## Project goal

Chat API is a practical backend engineering project that shows how real-time messaging, device and session security, money, media, background jobs and moderation fit together in one maintainable NestJS service, tested against real PostgreSQL and Redis.
