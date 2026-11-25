# Notes API

Notes API is a small backend for users and their notes. Each person signs in and sees only their own notes; an admin can see everyone's.

The project is built with NestJS, TypeORM and PostgreSQL. The focus is on the fundamentals done properly: JWT sign-in, ownership rules, validated input, paging and search, and database changes through migrations.

## What the backend provides

### Authentication and roles

- Registration and login with JWT access tokens and bcrypt-hashed passwords.
- Two roles, `user` and `admin`. Users see and change only their own notes. Admins can list users, read any user and filter notes by owner.

### Notes

- Create, read, update and delete notes.
- `GET /notes` has paging and a case-insensitive title search, and an admin can filter by `userId`.
- A note that belongs to someone else answers as not found for a normal user.

### Database

- The schema changes only through TypeORM migrations, never through automatic synchronisation.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 12, TypeScript |
| Database | PostgreSQL 16, TypeORM migrations |
| Authentication | JWT, Passport, bcrypt |
| Validation | class-validator |
| Tests | Vitest |
| Package manager | pnpm |

## Architecture at a glance

A request passes through a JWT guard and, on admin routes, a roles guard, then a controller and a service. Services use TypeORM repositories and take the signed-in user from the token, never from the request body.

## Repository layout

- `src/auth/` — register, login, JWT strategy, guards and decorators.
- `src/users/`, `src/notes/` — entities, DTOs, services and controllers.
- `src/migrations/` — the database schema.
- `test/` — end-to-end tests against a test database.
- `design.md` — design notes.

## Requirements

- Node.js 24 or newer and pnpm.
- PostgreSQL 16 (Docker is the easiest way).

## Configuration

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `JWT_SECRET` | Token signing secret |

Never commit a populated `.env` file.

## Run locally

```bash
cd notes-api
pnpm install
docker run --name pg-learn -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16
docker exec -it pg-learn psql -U postgres -c "CREATE DATABASE notes_api;"
cp .env.example .env
pnpm migration:run
pnpm start:dev
```

The API runs at `http://localhost:3000`.

## Useful development commands

```bash
pnpm start:dev                                 # start in watch mode
pnpm build                                     # compile the application
pnpm lint                                      # run the linter
pnpm migration:generate src/migrations/Name    # create a migration from entity changes
pnpm migration:run                             # apply pending migrations
pnpm migration:revert                          # undo the last migration
```

## API overview

| Area | Routes |
| --- | --- |
| Accounts | `POST /auth/register`, `POST /auth/login` |
| Users | `GET /users/me`, `GET /users` (admin), `GET /users/:id` (admin) |
| Notes | `POST /notes`, `GET /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id` |

`GET /notes` query parameters:

| Param | Description | Default |
| --- | --- | --- |
| `page` | Page number | 1 |
| `limit` | Items per page (max 50) | 10 |
| `search` | Case-insensitive match on the title | none |
| `userId` | Only notes by this user (admin only) | none |

## Testing and quality checks

Create the test database and apply migrations once:

```bash
docker exec -it pg-learn psql -U postgres -c "CREATE DATABASE notes_api_test;"
pnpm test:db:migrate
```

Copy `.env.test.example` to `.env.test`, then run:

```bash
pnpm test
pnpm test:e2e
```

## Current implementation boundaries

- No refresh tokens, email verification or password reset.
- No Dockerfile or CI workflow for this project yet.

## Project goal

Notes API is a small practical project that covers the basics of a secure REST backend: authentication, ownership rules, validation, paging and migrations.
