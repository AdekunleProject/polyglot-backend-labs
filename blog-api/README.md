# Blog API

Blog API is a backend for a blogging platform. It brings together an authentication system shared with the e-commerce API in this repository, a four-level staff hierarchy with an audit log, posts with drafts and tags, comments with ownership rules, and role-based dashboards with a weekly digest.

The project is built with NestJS, TypeORM and PostgreSQL, with Redis for shared rate limits. The focus is on backend concerns that matter beyond basic CRUD: session lifecycle, authorization by role checked in the database, required reasons and an audit trail for staff actions, input validation and automated tests against a real database.

## What the backend provides

### Authentication and account security

- Sign-up with a 6-character emailed code, then login. JSON or multipart with an optional profile `image`. Names are letters only and `middlename` is optional.
- Access tokens (15 minutes) and refresh tokens (7 days). Refresh tokens rotate per device: each sign-in is a session (at most 5 per user), only the SHA-256 hash of the current token is stored, and presenting an old token again is treated as theft and deletes that session.
- Logout for this device (with `{ refreshToken }`) or for every device (without).
- Three-step password reset: `forgot-password` always gives the same answer, `verify-password` checks the code and sets a 10-minute `password_reset` cookie (HttpOnly, SameSite strict), and `reset-password` sets the new password once and signs out every device.
- Google sign-in, only when the three `GOOGLE_*` settings are set.
- Two-factor sign-in with an authenticator app (standard TOTP, RFC 6238, checked against the RFC test vectors and written with Node's crypto). `2fa/setup` returns a secret and an `otpauthUrl`, `2fa/enable` proves it works and returns 8 backup codes once, and `2fa/disable` needs the password and a code. Secrets are stored encrypted (AES-256-GCM) and backup codes as hashes. The login challenge lasts 5 minutes and is signed with a different key from access tokens. Google sign-in does not ask for the second factor.

How it holds up:

- **Codes are single use.** Only a hash is stored, tied to the user and the purpose, so a verification code cannot reset a password.
- **No account enumeration.** A wrong password, an unknown email and a Google-only account all answer the same 401.
- **Password rule:** 8 to 72 characters with upper and lower case, a digit and one of `!@#$%^&*`, hashed with bcrypt (12 rounds).
- **Limits:** a global limit per client address, tighter limits on login (5 a minute), verify, check-reset-code and reset (5), and forgot and resend (3). Several of these are also limited per email address, so spreading guesses over many addresses does not help against one account. Health probes are never limited.
- **Roles are checked in the database on every request**, not read from the token, so a deactivated, deleted or demoted account loses access at once.

### Roles and staff administration

Four roles sit in a strict ladder: **superadmin > admin > manager > user**. A role can act only on accounts *below* its own rank, so nobody can act on themselves or on an equal, and a manager can never reach an admin.

| Action | Superadmin | Admin | Manager |
| --- | --- | --- | --- |
| See and edit own profile, change own password, delete own account | yes | yes | yes |
| List and view accounts (`GET /users`, `GET /users/:id`) | all below | managers and users | users |
| Create an account (`POST /users`) | admin, manager, user | manager, user | no |
| Change a role (`PATCH /users/:id/role`) | any role below superadmin | up to manager | user to manager only |
| Edit another profile (`PATCH /users/:id`) | admins, managers, users | managers, users | users |
| Deactivate or activate (`PATCH /users/:id/deactivate`, `/activate`) | all below | managers, users | no |
| Delete and restore (`DELETE /users/:id`, `POST /users/:id/restore`) | all below | managers, users | no |
| Read everything a user wrote, drafts included (`GET /users/:id/posts`, `/comments`) | yes | no | no |
| Read the audit log (`GET /audit-logs`) | yes | no | no |
| Edit or delete any post, delete any comment | yes | yes | no |

Details:

- **The superadmin is not made through the API.** It is created at start from `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` (12+ characters; the older `ADMIN_EMAIL` and `ADMIN_PASSWORD` names still work). If that email already has an account, it becomes the superadmin and keeps its password. No endpoint can create or promote a superadmin.
- **Created accounts get an emailed temporary password** (never in the response) and must change it before using anything else: until then every route except `GET /users/me`, `POST /users/me/change-password` and `POST /auth/logout` answers 403. If mail is not set up, creating a user outside production returns the password once so local development still works. In production it answers 503 and creates nothing.
- **Admins and superadmins must turn on two-factor** before using the API, when `REQUIRE_ADMIN_2FA=true` (the default in production, off elsewhere).
- **A written reason is required** (5 to 500 characters, as `{ "reason": "..." }`) to deactivate or delete an account, and for staff to remove someone else's post or comment. It is kept in the audit log. Authors deleting their own content need none.
- **Delete is soft.** The account cannot sign in and leaves the list (`GET /users?deleted=true` shows deleted ones), but the row, posts and comments stay, and restore brings it back. Deleting your own account with `DELETE /users/me` removes it for good, with its posts and comments.
- **Audit log.** Creating accounts, edits, role changes, deactivation, deletion, restore, and every time a superadmin reads another user's posts or comments is recorded with who, whom and when (never passwords or codes).

Your own account: `GET /users/me`, `PATCH /users/me` (multipart with optional `image`), `POST /users/me/change-password` (needs the current password), `DELETE /users/me`.

### Posts, tags and comments

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

### Dashboards, reports and the weekly digest

| Route | Who | What it shows |
| --- | --- | --- |
| `GET /dashboard/manager` | manager and above | Posts, comments, readers, and your own last 30 days of actions |
| `GET /dashboard/admin` | admin, superadmin | The above, plus accounts by role, deactivated and deleted accounts, and moderation counts |
| `GET /dashboard/superadmin` | superadmin | The above, plus staff without 2FA and the latest audit entries |
| `GET /reports/staff-activity?from&to&format=csv` | manager and above | What staff did, with flags. Superadmin sees admins and managers, an admin sees managers, a manager sees only themselves |
| `GET /reports/content?from&to&format=csv` | admin, superadmin | Posts, comments, sign-ups and moderation, per day |
| `POST /reports/digest/send` | superadmin | Sends the weekly summary now |

Staff activity flags many removals, many private lookups, off-hours work and missing 2FA, using thresholds you can set (`FLAG_DELETES`, `FLAG_LOOKUPS`, `OFF_HOURS_START`, `OFF_HOURS_END`, `REPORT_TZ_OFFSET_HOURS`).

The digest is an email to every active superadmin, sent on `DIGEST_DAY` after `DIGEST_HOUR` when `WEEKLY_DIGEST=true`. It runs in the app process and uses the audit log to send once a week; with several replicas running, two could send in the same hour, so run the digest on one replica or trigger it from a cron job calling the route.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 12 (ES modules), TypeScript |
| API | REST, Swagger |
| Database | PostgreSQL 16, TypeORM migrations |
| Rate-limit counters | Redis (optional), `@nestjs/throttler` |
| Authentication | JWT, Passport (JWT and Google OAuth), bcrypt, TOTP |
| Files and email | AWS S3 for profile pictures, Nodemailer over SMTP |
| Containers | Docker, Docker Compose |
| CI/CD and security scanning | GitHub Actions, Trivy, ghcr.io |
| Tests | Jest, supertest |

## Architecture at a glance

A request passes through the rate limiter and global validation, then a JWT guard (which checks the account in the database) and a roles guard, and reaches a controller. Controllers hand the work to services, which use TypeORM repositories and query builders. Staff actions write an audit entry with the reason.

The schema changes only through migrations (`synchronize` is off), and the migrations run on start in Docker.

## Repository layout

- `src/auth/` — sign-up, login, tokens, 2FA, password reset, guards.
- `src/users/`, `src/posts/`, `src/comments/`, `src/tags/` — accounts, posts, comments and tags.
- `src/audit/`, `src/reports/` — the audit log, dashboards, staff reports and the digest.
- `src/migrations/` — the database schema.
- `postman/` — a collection and environment that walk through the whole API.
- `scripts/` — the demo seed.
- `.github/workflows/blog-api.yaml` — CI workflow at the monorepo root.

## Requirements

- Node.js 24 or newer to run the tests outside Docker (Nest 12 ships as ES modules). The Docker image already uses Node 24.
- Docker and Docker Compose for the quickest start.
- Optional credentials for services you want to try for real: SMTP, S3 and Google.

## Configuration

Set in `.env` (see `.env.example`, which explains every variable). The app refuses to start and lists what is missing.

| Variable group | Purpose |
| --- | --- |
| `DB_*` | PostgreSQL connection (required) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing (required; different, 32+ characters in production) |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | The superadmin account |
| `MAIL_*`, `AWS_*`, `GOOGLE_*` | Optional mail, S3 and Google sign-in |
| `FRONTEND_URL`, `TRUST_PROXY`, `THROTTLE_LIMIT` | CORS and rate limiting |
| `REDIS_URL` | Share rate-limit counters between replicas (optional) |
| `TWO_FACTOR_KEY`, `REQUIRE_ADMIN_2FA` | Authenticator-secret encryption and admin 2FA |
| `WEEKLY_DIGEST`, `DIGEST_DAY`, `DIGEST_HOUR` | The weekly digest |
| `ENABLE_DOCS` | Swagger is on by default and off when `NODE_ENV=production` |

Real keys belong only in a local `.env` or a Kubernetes Secret, never in Git. On AWS, leave the access keys out and use an IAM role.

## Run locally

```bash
cd blog-api
cp .env.example .env
docker compose up -d --build
docker compose exec api node scripts/demo-seed.mjs   # optional demo data
curl http://localhost:3000/ready
```

The API runs on port 3000 and Swagger is at `http://localhost:3000/docs`. Demo accounts from the seed: `ada@demo.test` and `tunde@demo.test`, password `Demo-Passw0rd!`.

Without a mail server, the verification and reset codes are printed in the API log (never in production): `docker compose logs api`.

## Useful development commands

```bash
pnpm install
pnpm start:dev          # start in watch mode
pnpm build              # compile the application
pnpm lint               # run the linter
pnpm test               # unit tests
pnpm migration:generate # create a migration from entity changes
pnpm migration:run      # apply pending migrations
```

## API overview

Full, interactive documentation is in Swagger. Main route groups:

| Area | Routes |
| --- | --- |
| Authentication | `/auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/2fa/*`, `/auth/refresh`, `/auth/forgot-password`, `/auth/verify-password`, `/auth/reset-password`, `/auth/logout`, `/auth/google` |
| Users | `/users`, `/users/me`, `/users/:id` and its role, deactivate, activate, restore and content routes |
| Content | `/posts`, `/tags`, `/posts/:postId/comments`, `/comments/:id` |
| Staff | `/audit-logs`, `/dashboard/*`, `/reports/*` |

## Testing and quality checks

```bash
pnpm test        # unit tests
# integration tests: real PostgreSQL, real migrations, fake mail and S3
docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=blog_it -p 5433:5432 postgres:16-alpine
TEST_DB_PORT=5433 pnpm test:e2e
```

To also test the Redis rate limiter against a real Redis, add `docker run -d --name it-redis -p 6380:6379 redis:7-alpine` and `REDIS_TEST_URL=redis://localhost:6380` to the command (the test is skipped without it). The integration tests empty their tables, so they refuse to run unless the database name ends in `_it`.

`postman/` has a collection and an environment that walk through the whole API: sign-up, sessions, the three-step password reset, profile, posts, comments and every role rule. Import both files, select the **blog-api (local)** environment and run the folders in order. Locally the emailed codes are printed in the API log, so copy them into the `code` and `resetCode` variables when a request says so. The staff folders need `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` in `.env` (put the same values in the `superEmail` and `superPassword` variables).

## Docker and CI/CD

`.github/workflows/blog-api.yaml` builds the image, runs lint (report only), unit tests, integration tests against PostgreSQL, a Trivy scan (fails on fixable CRITICAL) and a smoke test of the production image. On `master` it pushes the image to GHCR tagged by commit SHA. Check the Actions tab for the result of a specific commit.

## Security notes

- Keep JWT, database, SMTP, Google and S3 secrets outside source control.
- Use HTTPS and secure secret storage in deployed environments.
- Refresh tokens and one-time codes are stored only as hashes.
- Every staff action on another person or their content needs a written reason and is audited.

## Current implementation boundaries

- Mail and S3 are written and covered by fakes in the tests, but have not been exercised against a real SMTP server or bucket yet. Google sign-in has not been run against Google.
- Sign-up answers `409` for an email that already exists, which shows whether an email has an account (login and forgot-password do not). Access tokens stay valid until they expire (15 minutes by default) after a logout, though a deactivated, deleted or demoted account is cut off at once. Both are common trade-offs.
- Rate limits are shared across replicas only when `REDIS_URL` is set. Without it, or while Redis is down, each instance counts alone. Redis is used for the limiter only; it is not a cache.
- Two-factor has no admin reset yet: someone who loses both the authenticator and the backup codes needs a database change.
- Not load tested. No in-app notifications (the e-commerce API has them).

## Project goal

Blog API is a practical backend engineering project covering secure authentication, strict role-based administration with an audit trail, content ownership rules, reporting and automated tests, in a maintainable NestJS service.
