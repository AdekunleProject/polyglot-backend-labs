# Tasks API

Tasks API is meant to become the backend for a task tracker. It is at the very start: the project is scaffolded and the sign-up and login code is written, but it is not connected to the application or a database yet.

The project is built with NestJS, TypeORM and PostgreSQL.

## What the backend provides

### Written but not yet connected

- Registration and login (`src/auth/`) with JWT access tokens and bcrypt-hashed passwords, a JWT guard, a roles guard and a current-user decorator.
- A global exception filter that turns errors into clean responses.

### Planned

- Database connection and migrations, then users.
- Projects, tasks, assignees, status and due dates, and comments.
- An audit log, dashboards and reports.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 12, TypeScript |
| Database | PostgreSQL, TypeORM (planned wiring) |
| Authentication | JWT, bcrypt |
| Tests | Jest, supertest |

## Architecture at a glance

The intended shape is the same as the other APIs in this repository: a request passes through a JWT guard and a roles guard, then a controller and a service, with a global exception filter at the edge.

## Repository layout

- `src/auth/` — register and login code, JWT strategy, guards and decorators.
- `src/common/filters/` — the global exception filter.
- `src/app.module.ts` — the application module, still the generated scaffold.
- `test/` — end-to-end test setup.

## Requirements

- Node.js 24 or newer and pnpm.
- A PostgreSQL database, once the database wiring is added.

## Configuration

There is no `.env.example` yet. It will list the database connection (`DB_*`) and `JWT_SECRET` when the wiring is added. Never commit a populated `.env` file.

## Run locally

```bash
cd tasks-api
pnpm install
pnpm start:dev
```

The server starts with only the generated root route.

## Useful development commands

```bash
pnpm start:dev       # start in watch mode
pnpm build           # compile the application
pnpm test            # unit tests
pnpm test:e2e        # end-to-end tests
```

## Testing and quality checks

Only the generated root-route tests exist so far.

## Current implementation boundaries

- The auth module is not imported into the application yet, so no auth routes are served.
- There is no database wiring, no migrations, no Dockerfile and no CI workflow for this project yet.
- `src/app.module.ts` still contains the generated observability placeholder with dummy keys; replace or remove it before real use.

## Project goal

Tasks API will grow into a practical task-tracking backend with roles, an audit trail and reports, following the patterns used in the blog and chat APIs.
