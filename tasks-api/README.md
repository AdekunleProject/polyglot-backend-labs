# Tasks API

A NestJS, TypeORM and PostgreSQL backend for a task tracker. **Work in progress:** accounts are done, the tasks themselves are next.

## State

| Part | State |
| --- | --- |
| Sign-up and sign-in (`POST /auth/register`, `POST /auth/login`), JWT, roles | Done |
| Projects, tasks, assignees, status, due dates, comments | Next |
| Audit log, dashboards and reports | After that |

## Run it

Needs Node 24 or newer and a PostgreSQL database.

```
pnpm install
cp .env.example .env
pnpm start:dev
```

## Tests

```
pnpm test
pnpm test:e2e
```
