# Blog API

A blogging backend built with NestJS, TypeORM and PostgreSQL. Accounts use the same authentication system as the e-commerce API in this repo: email verification with a code, per-device refresh tokens, password reset by email, Google sign-in, roles, and profile pictures in S3. On top of that: posts with drafts and tags, and comments with ownership rules.

Requires Node 24 or newer to run the tests outside Docker (Nest 12 ships as ES modules). The Docker image already uses Node 24.

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
| Sign up | `POST /auth/register` | JSON or multipart with an optional `image`. Needs `firstname`, `lastname`, `email`, `password`, `phoneNumber`, `dateOfBirth`, `gender` (`male`, `female`, `other`) and `address`; `middlename` is optional. Names are letters only. Emails a 6 character code |
| Verify | `POST /auth/verify-email` | `{ email, code }`. The code works once and expires in 15 minutes |
| New code | `POST /auth/resend-verification` | Same answer whether or not the email exists |
| Sign in | `POST /auth/login` | Returns `accessToken` (15 min), `refreshToken` (7 days) and the user. With 2FA on it returns `{ twoFactorRequired, challengeToken }` instead |
| 2FA step | `POST /auth/2fa/login` | `{ email, challengeToken, code }`. `code` is the 6 digit authenticator code or a backup code. Returns the tokens |
| Renew | `POST /auth/refresh` | Returns a new pair. The old refresh token is dead the moment it is used |
| Forgot password | `POST /auth/forgot-password` | Always the same answer |
| Check reset code | `POST /auth/verify-password` | `{ email, code }`. The code must belong to that email. Sets a 10 minute `password_reset` cookie (HttpOnly, SameSite strict) |
| Reset | `POST /auth/reset-password` | `{ newPassword, confirmPassword }` with that cookie. Works once, and signs out every device |
| Sign out | `POST /auth/logout` | With `{ refreshToken }`: this device. Without: every device |
| Google | `GET /auth/google` | Only when the three `GOOGLE_*` settings are set |

### Two-factor authentication (authenticator app)

For a signed-in user: `POST /auth/2fa/setup` returns a `secret` and an `otpauthUrl` (type the secret into Google Authenticator, Microsoft Authenticator, Authy or 1Password, or turn the URL into a QR code in the frontend). `POST /auth/2fa/enable` with `{ code }` proves it works, turns it on, and returns 8 backup codes once. `POST /auth/2fa/disable` needs `{ password, code }`.

- Standard TOTP (RFC 6238, checked against the RFC test vectors), written with Node's crypto, so no extra package.
- A code works once, and one step (30 s) of clock drift is allowed.
- The secret is stored encrypted (AES-256-GCM, key from `TWO_FACTOR_KEY` or `JWT_SECRET`). Backup codes are stored as hashes and deleted when used.
- The challenge from the first step lasts 5 minutes, is signed with a different key from access tokens, and the second step is limited to 5 tries a minute per email.
- Google sign-in does not ask for the second factor: it relies on the person's Google account security.

How it holds up:

- **Refresh tokens rotate per device.** Each sign-in is a session (at most 5 per user). Only the SHA-256 hash of the current token is stored. Presenting an old token again is treated as theft: that session is deleted and the user must sign in again.
- **Codes are single use.** Only a hash is stored, tied to the user and the purpose, so a verification code cannot reset a password.
- **No account enumeration.** A wrong password, an unknown email and a Google-only account all answer the same 401, and forgot-password never says whether the email exists.
- **Password rule:** 8 to 72 characters with upper and lower case, a digit and one of `!@#$%^&*`. Hashed with bcrypt (12 rounds).
- **Limits:** a global limit per client address, and tighter limits on login (5 a minute), verify, check-reset-code and reset (5), forgot and resend (3). Login, verify, resend, forgot and check-reset-code are also limited per email address, so spreading guesses over many addresses does not help against one account (the cost: someone can delay a victim for up to a minute). The health probes are never limited.
- **Deactivating a user** ends their refresh tokens at once. An access token already issued works until it expires (15 minutes by default).

## Users and roles

Roles are `user` (default) and `admin`. A client can never pick its own role.

| Endpoint | Access |
| --- | --- |
| `GET /users/me`, `PATCH /users/me` (multipart with optional `image`), `DELETE /users/me` | signed in |
| `POST /users/me/change-password` | signed in, needs the current password |
| `GET /users`, `POST /users` | admin. Create emails the new user a one-time password (it is not in the response) |
| `PATCH /users/:id/deactivate`, `PATCH /users/:id/activate` | admin |

If mail is not set up, creating a user outside production returns the password once in the response so local development still works. In production it answers 503 and creates nothing, because there would be no safe way to hand the password over. The password is in a plain-text email until they change it, a common trade-off; the alternative is to email a reset code instead.

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

Set in `.env` (see `.env.example`, which explains every variable). The app refuses to start and lists what is missing. Required: the `DB_*` settings, `JWT_SECRET` and `JWT_REFRESH_SECRET` (different, 32+ characters in production). Optional: mail (`MAIL_*`), S3 (`AWS_*`), Google (`GOOGLE_*`), `ADMIN_*`, `FRONTEND_URL`, `TRUST_PROXY`, `THROTTLE_LIMIT`, `REDIS_URL`, `TWO_FACTOR_KEY`, `ENABLE_DOCS` (Swagger is on by default and off when `NODE_ENV=production`).

`synchronize` is off. The schema changes only through migrations (`pnpm migration:generate`, `pnpm migration:run`). Real keys belong only in a local `.env` or a Kubernetes Secret, never in Git. On AWS, leave the access keys out and use an IAM role.

## Tests

```bash
pnpm test        # unit tests
# integration tests: real PostgreSQL, real migrations, fake mail and S3
docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=blog_it -p 5433:5432 postgres:16-alpine
TEST_DB_PORT=5433 pnpm test:e2e
```

To also test the Redis rate limiter against a real Redis, add `docker run -d --name it-redis -p 6380:6379 redis:7-alpine` and `REDIS_TEST_URL=redis://localhost:6380` to the command (the test is skipped without it).

The integration tests empty their tables, so they refuse to run unless the database name ends in `_it`.

## CI

`.github/workflows/blog-api.yaml` builds the image, runs lint (report only), unit tests, integration tests against PostgreSQL, a Trivy scan (fails on fixable CRITICAL), and a smoke test of the production image. On master it pushes the image to GHCR tagged by commit SHA.

## Known limitations

- Mail and S3 are written and covered by fakes in the tests, but have not been exercised against a real SMTP server or bucket yet. Google sign-in has not been run against Google.
- Sign-up answers `409` for an email that already exists, which shows whether an email has an account (login and forgot-password do not). Access tokens stay valid until they expire (15 minutes by default) after a logout or deactivation. Both are common trade-offs.
- Rate limits are shared across replicas only when `REDIS_URL` is set. Without it, or while Redis is down, each instance counts alone (so N replicas allow about N times the limit). Redis is used for the limiter only; it is not a cache.
- Two-factor has no admin reset yet: someone who loses both the authenticator and the backup codes needs a database change.
- Not load tested. No in-app notifications (the e-commerce API has them).
