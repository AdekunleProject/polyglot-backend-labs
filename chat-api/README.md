# chat-api

A messenger backend, like WhatsApp or Messenger: one-to-one and group chats, voice notes, images and files, voice and video calls.

**Stack:** NestJS 12, PostgreSQL 16 (TypeORM migrations), Redis (rate limits, real-time, job queues), Socket.IO (live messages), BullMQ (background jobs), LiveKit (calls).

## Status

| Part | State |
| --- | --- |
| Accounts: sign-up with a username, email codes, sign-in, 2FA, device sessions, password reset, roles, audit log | Done (carried over from `blog-api`) |
| Push tokens for phones | Done |
| Chats, groups, live messages, receipts, typing, presence | Next |
| Media and voice notes | After that |
| Offline push and unread counts (BullMQ) | After that |
| Voice and video calls (LiveKit) | After that |
| Blocking, reporting, moderation | Last |

## Run it

```
cp .env.example .env
docker compose up --build
```

The first time on a machine, run `pnpm install` once so the lockfile includes the real-time packages, and commit `pnpm-lock.yaml`.

## Tests

```
pnpm test
docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chat_it -p 5433:5432 postgres:16-alpine
TEST_DB_PORT=5433 pnpm test:e2e
```

## Design notes

- Messages travel over a WebSocket. Everything else (accounts, history, groups, uploads) is plain REST.
- Calls use WebRTC. This API only does the signalling (ringing, accept, decline, tokens). LiveKit carries the audio and video, including group calls.
- Real keys live in a local `.env` or a Kubernetes Secret, never in Git.
