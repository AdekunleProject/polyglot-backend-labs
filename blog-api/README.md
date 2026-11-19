# Blog API

A blogging backend built with NestJS, TypeORM and PostgreSQL. Accounts use the same authentication system as the e-commerce API in this repo: email verification with a code, per-device refresh tokens, password reset by email, Google sign-in, roles, and profile pictures in S3. On top of that: posts with drafts and tags, and comments with ownership rules.

## Quick start (Docker, any computer)

```bash
cd blog-api
cp .env.example .env
docker compose up -d --build
docker compose exec api node scripts/demo-seed.mjs   # optional demo data
curl http://localhost:3000/ready
```

The API runs on port 3000 and Swagger is at http://localhost:3000/docs. The migrations run on start, so the database builds its own schema. Demo accounts from the seed: `ada@demo.test` and `tunde@demo.test`, password `Demo-Passw0rd!`.

Without a mail server, the verification and reset codes are printed in the API log (never in production): `docker compose logs api`.

## Authentication

| Step | Endpoint | Notes |
| --- | --- | --- |
| Sign up | `POST /auth/register` | JSON or multipart with an optional `image`. Emails a 6 character code |
| Verify | `POST /auth/verify-email` | `{ email, code }`. The code works once and expires in 15 minutes |
| New code | `POST /auth/resend-verification` | Same answer whether or not the email exists |
| Sign in | `POST /auth/login` | Returns `accessToken` (15 min), `refreshToken` (7 days) and the user |
| Renew | `POST /auth/refresh` | Returns a new pair. The old refresh token is dead the moment it is used |
| Forgot password | `POST /auth/forgot-password` | Always the same answer |
| Reset | `POST /auth/reset-password` | `{ email, code, newPassword, confirmPassword }`. Signs out every device |
| Sign out | `POST /auth/logout` | With `{ refreshToken }`: this device. Without: every device |
| Google | `GET /auth/google` | Only when the three `GOOGLE_*` settings are set |

How it holds up:

- **Refresh tokens rotate per device.** Each sign-in is a session (at most 5 per user). Only the SHA-256 hash of the current token is stored. Presenting an old token again is treated as theft: that session is deleted and the user must sign in again.
- **Codes are single use.** Only a hash is stored, tied to the user and the purpose, so a verification code cannot reset a password.
- **No account enumeration.** A wrong password, an unknown email and a Google-only account all answer the same 401, and forgot-password never says whether the email exists.
- **Password rule:** 8 to 72 characters with upper and lower case, a digit and one of `!@#$%^&*`. Hashed with bcrypt (12 rounds).
- **Limits:** a global limit per client address, and tighter limits on login (5 a minute), verify and reset (5), forgot and resend (3). The health probes are never limited.
- **Deactivating a user** ends their refresh tokens at once. An access token already issued works until it expires (15 minutes by default).

## Users and roles

Roles are `user` (default) and `admin`. A client can never pick its own role.

| Endpoint | Access |
| --- | --- |
| `GET /users/me`, `PATCH /users/me` (multipart with optional `image`), `DELETE /users/me` | signed in |
| `POST /users/me/change-password` | signed in, needs the current password |
| `GET /users`, `POST /users` | admin. Create returns a one-time `defaultPassword` |
| `PATCH /users/:id/deactivate`, `PATCH /users/:id/activate` | admin |

The first admin is created at start from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters).

## Posts, tags and comments

| Method | Path | Access |
| --- | --- | --- |
| GET | `/posts`, `/posts/:slug`, `/tags` | public (published posts only) |
| GET | `/posts/mine` | signed in (includes drafts) |
| POST | `/posts` | signed in |
| PATCH, DELETE | `/posts/:id` | author or admin |
| GET | `/posts/:postId/comments` | public |
| POST | `/posts/:postId/comments` | signed in, published posts only |
| DELETE | `/comments/:id` | commenter, post author or admin |
| GET | `/health`, `/ready` | liveness; readiness (checks the database, 503 if down) |

`GET /posts` supports `page`, `limit` (max 50), `tag` and a search term.

## Configuration

Set in `.env` (see `.env.example`, which explains every variable). The app refuses to start and lists what is missing. Required: the `DB_*` settings, `JWT_SECRET` and `JWT_REFRESH_SECRET` (different, 32+ characters in production). Optional: mail (`MAIL_*`), S3 (`AWS_*`), Google (`GOOGLE_*`), `ADMIN_*`, `FRONTEND_URL`, `TRUST_PROXY`, `THROTTLE_LIMIT`, `ENABLE_DOCS`.

`synchronize` is off. The schema changes only through migrations (`pnpm migration:generate`, `pnpm migration:run`). Real keys belong only in a local `.env` or a Kubernetes Secret, never in Git. On AWS, leave the access keys out and use an IAM role.

## Tests

```bash
pnpm test        # unit tests
# integration tests: real PostgreSQL, real migrations, fake mail and S3
docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=blog_it -p 5433:5432 postgres:16-alpine
TEST_DB_PORT=5433 pnpm test:e2e
```

The integration tests empty their tables, so they refuse to run unless the database name ends in `_it`.

## CI

`.github/workflows/blog-api.yaml` builds the image, runs lint (report only), unit tests, integration tests against PostgreSQL, a Trivy scan (fails on fixable CRITICAL), and a smoke test of the production image. On master it pushes the image to GHCR tagged by commit SHA.

## Known limitations

- Mail and S3 are written and covered by fakes in the tests, but have not been exercised against a real SMTP server or bucket yet. Google sign-in has not been run against Google.
- Rate limits are counted in memory per instance. With several replicas a shared store (Redis) is the next step.
- Not load tested. No in-app notifications (the e-commerce API has them).
