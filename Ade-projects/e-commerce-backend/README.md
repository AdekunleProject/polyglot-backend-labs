# E-commerce Backend API

[![CI](https://github.com/AdekunleProject/polyglot-backend-labs/actions/workflows/ecommerce-backend.yaml/badge.svg)](https://github.com/AdekunleProject/polyglot-backend-labs/actions/workflows/ecommerce-backend.yaml)

A REST API for an online store. It brings together customer accounts, a four-level staff hierarchy, products with variants and stock, carts, orders, Paystack payments, a refund and replacement workflow, an audit log and role-based dashboards. The project also ships the DevOps work around it: a hardened Docker image, a GitHub Actions pipeline, Terraform for AWS EKS and a Helm chart.

The project is built with NestJS and MongoDB. The focus is on the backend concerns that matter beyond basic CRUD: authentication and session lifecycle, authorization by role, money handled safely (atomic stock, verified payments, replay-proof webhooks), an audit trail and operational checks.

- API docs (Swagger): `http://localhost:5000/docs` when running outside production
- Health checks: `GET /health` (liveness) and `GET /ready` (readiness, checks MongoDB)

## What the backend provides

### Authentication and account security

- Sign-up with a 6-character email verification code, then login. The middle name is optional and names are letters only.
- Per-device refresh tokens that rotate on every use. Only the SHA-256 hash of the current token is stored, and replaying an old token is treated as theft and ends that session. At most 5 devices stay signed in per user.
- Logout for this device or for every device.
- Three-step password reset: ask for a code (`forgot-password`), check it (`verify-password`, which sets a short-lived httpOnly cookie), then set the new password (`reset-password`, which signs every device out).
- Google sign-in.
- Two-factor sign-in with an authenticator app (standard TOTP). Authenticator secrets are encrypted with AES-256-GCM, and eight one-time backup codes are stored as hashes. Admins can be required to turn it on (`REQUIRE_ADMIN_2FA`).
- Per-client and per-email rate limits on the auth routes, shared across replicas when Redis is configured.

Verification and reset codes are stored only as hashes, are tied to one purpose (a verification code cannot reset a password), work once and expire after 15 minutes. A wrong email, a wrong password and a Google-only account all get the same login answer.

### Roles and staff administration

Four roles sit in a ladder, and each staff role owns one area of work:

| Role | Purpose |
| --- | --- |
| `superadmin` | Oversight: appoints admins and managers, reads the audit log and the reports. Can look at customers but does not change them |
| `admin` | Money and accounts: payments, refund decisions, customer accounts, managers |
| `manager` | The shop floor: products, stock, orders, verifying refund requests, helping customers |
| `customer` | Shopping: own cart, orders, payments and refund requests |

- Nobody can hand out the superadmin role. That account exists only through the `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` settings at start-up.
- Staff can act only on accounts below them. Managers look after customer accounts, admins can also deactivate and delete them, and nobody acts on themselves or an equal.
- Deactivate, activate, delete (a soft delete) and restore need a reason, and each is written to the audit log.
- A person whose account was created by an admin receives a one-time password by email, and may use only a few routes until they change it. Production refuses to create the account if email is not set up.
- `GET /audit-logs` (superadmin) lists who did what, with filters. Besides account actions, it records every product create, edit (with the old and new values) and delete, variant create, stock change (old and new) and delete, and order update (old and new status).

### Catalogue, cart and orders

- Products, product variants with stock, brands and categories. Price and stock live on the variant, for example a size or colour.
- A per-user cart, order creation, order history and staff order management.
- Prices are always worked out from the database, never from the client.

### Payments and refunds

- Paystack payment initialisation, with the amount sent in kobo.
- Webhook processing that checks the signature, then asks Paystack for the transaction and checks that it succeeded and that the amount and currency match the order. A repeated webhook cannot pay an order twice.
- Bank-transfer payments that the customer submits and an admin approves or rejects.
- A refund and replacement workflow:
  - A customer asks for a refund or a replacement within the time window after delivery, with photo or video evidence for a defect.
  - A manager verifies the request, an admin decides (refund, replacement or decline), and a manager marks a replacement as sent.
  - The time windows and the share returned for a cancellation are settings (see `docs/REFUND_POLICY.md`). By default a refund can be asked for within 24 hours of delivery, a replacement within 72 hours, and a cancellation before delivery returns 65%.
  - Every step is audited and the customer is notified.

### Notifications and analytics

- In-app notifications with unread counts.
- Dashboards by role: `GET /analytics/manager`, `/admin` and `/superadmin`, plus a customer's own dashboard. Staff can also open a customer's dashboard.
- Reports on orders, products, inventory and transactions.
- A staff-activity report (`GET /analytics/staff-activity`, JSON or CSV): what each person on the team did in a period, with flags for many removals, many openings of customer accounts, off-hours work and a missing second factor. A manager sees only themselves, an admin sees managers, and the superadmin sees admins and managers.
- A sales report (`GET /analytics/sales`, JSON or CSV, admins and above): orders, paid money, refunds and new customers per day.
- A weekly email digest to the superadmins (sales, refunds, new customers, team activity and anything flagged), switched on with `WEEKLY_DIGEST=true`, or sent now with `POST /analytics/digest/send`.

### Operations

- `/health` (liveness) and `/ready` (readiness, pings MongoDB and returns 503 when it is unreachable).
- Global validation, security headers, rate limiting, a global exception filter, and Swagger docs that are off in production.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 11, TypeScript, Node.js 22 |
| API | REST, Swagger |
| Database | MongoDB 7 (single-node replica set locally), Mongoose |
| Rate-limit counters | Redis (optional), `@nestjs/throttler` |
| Authentication | JWT access and refresh tokens, Passport (JWT and Google OAuth), bcrypt, TOTP |
| Payments | Paystack |
| Files | AWS S3 (SDK v3) |
| Email | Nodemailer over SMTP |
| Containers | Docker, Docker Compose |
| Deployment packaging | Helm, Terraform, AWS EKS |
| CI/CD and security scanning | GitHub Actions, Trivy, ghcr.io |
| Tests | Jest |

## Architecture at a glance

A request passes through Helmet, the rate limiter and global validation, then a JWT guard and a roles guard, and reaches a controller. Controllers hand the work to services, which use Mongoose models. Anything that changes an account, a payment or a refund also writes an audit entry.

### How a purchase works

1. **Cart.** A cart line points at a product variant, because price and stock live on the variant.
2. **Order.** `POST /orders` reads the cart, works out prices from the database and reserves stock. Each variant is updated with one atomic query that checks there is enough stock and subtracts it in the same step, so two buyers cannot both get the last unit. If any item fails, the stock already taken is put back.
3. **Payment.** `POST /payments/initialize` creates a payment record with a unique reference inside a MongoDB transaction and asks Paystack for a payment page.
4. **Verification.** When Paystack calls the webhook, the signature is checked first (HMAC over the raw body), but the payload is not trusted. The app asks Paystack for the transaction itself and checks the status, amount and currency. Only then are the payment and order marked paid.
5. **After the sale.** A refund only works on a successful payment that has not been refunded, and goes through the request, verify and decide steps above.

## Repository layout

```
Ade-projects/e-commerce-backend/
  src/              NestJS modules (auth, users, products, cart, orders, payments, refunds, audit, analytics, ...)
  test/             integration tests
  Dockerfile        multi-stage, non-root image
  docker-compose.yml  API + MongoDB for local use
  helm/ecommerce/   Helm chart for Kubernetes
  terraform/        AWS EKS infrastructure
  docs/             deployment guide and refund policy
  scripts/          demo seed
  CODE-REVIEW-FINDINGS.md   bugs found and fixed in a full code review
.github/workflows/ecommerce-backend.yaml   CI pipeline (repository root)
```

See `CODE-REVIEW-FINDINGS.md` for the 16 bugs found and fixed in a full code review before the DevOps work, such as a refresh-token route that validation rejected, which would have logged users out every 15 minutes.

## Requirements

- Docker with Compose for the quickest start.
- Node.js 22 and pnpm (`corepack enable`) to run without Docker.
- A MongoDB **replica set** if you run without Docker (payments use transactions; MongoDB Atlas works).
- Optional credentials for the external services you want to try: Paystack, Google, SMTP and S3.

## Configuration

All settings are environment variables. `.env.example` lists them; real values go in a local `.env` (never committed) or, on Kubernetes, in a Secret.

The app checks its settings when it starts. It refuses to boot if `MONGODB_URI`, `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing, and when `NODE_ENV=production` (the Docker image's default) both secrets must be at least 32 characters and different from each other. The error message lists every problem at once. Replace short secrets with long random strings (for example `openssl rand -hex 32`).

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Mode and listening port (5000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Access token signing key and lifetime |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Refresh token signing key and lifetime |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | The superadmin account, created at start-up if missing |
| `REQUIRE_ADMIN_2FA` | Make admins and the superadmin turn on 2FA before using the API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google sign-in |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_CALLBACK_URL` | Paystack payments |
| `FRONTEND_URL` | Allowed CORS origin and redirect target |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` | File uploads to S3 |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | SMTP settings for verification, reset and new-account emails |
| `REFUND_CLAIM_HOURS`, `REPLACEMENT_CLAIM_HOURS`, `CANCELLATION_REFUND_PERCENT` | The refund policy (defaults 24, 72 and 65) |
| `WEEKLY_DIGEST`, `DIGEST_DAY`, `DIGEST_HOUR`, `REPORT_TZ_OFFSET_HOURS` | The weekly digest (off by default) |
| `FLAG_DELETES`, `FLAG_LOOKUPS`, `OFF_HOURS_START`, `OFF_HOURS_END` | Staff-activity flag thresholds |
| `ENABLE_DOCS` | Swagger is on except when `NODE_ENV=production`; set `true` or `false` to override |
| `THROTTLE_LIMIT`, `TRUST_PROXY` | Requests per minute per client address (default 60); set `TRUST_PROXY=true` behind a load balancer |
| `REDIS_URL` | Share rate-limit counters between replicas. Optional; without it, or while Redis is down, each instance counts alone |
| `TWO_FACTOR_KEY` | Encrypts authenticator secrets in the database. Optional: `JWT_SECRET` is used when unset |

The app reads the Google, Paystack, JWT and AWS keys with `getOrThrow`, so they must be present to start. They do not have to be real. Without real Google or Paystack keys everything works except Google sign-in and real payments.

## Run locally

```bash
git clone https://github.com/AdekunleProject/polyglot-backend-labs.git
cd polyglot-backend-labs/Ade-projects/e-commerce-backend
cp .env.example .env
```

The example file contains working values for a local run. Before using the API for anything real, change `JWT_SECRET`, `JWT_REFRESH_SECRET` and `SUPERADMIN_PASSWORD`.

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:5000/health
```

The health check returns `{"status":"ok"}` once the app is ready (allow about 20 seconds). Then open `http://localhost:5000/docs`.

Load a small demo catalogue (3 categories, 3 brands, 4 products with variants). It is safe to run twice:

```bash
docker compose exec api node scripts/demo-seed.mjs
```

To try the staff routes, call `POST /auth/login` with the superadmin email and password from `.env`, copy the `accessToken`, click **Authorize** in Swagger and paste it. Access tokens last 15 minutes; a 401 means log in again.

Stop everything with `docker compose down`. Add `-v` only if you want to delete the local database volume.

If your network blocks Docker's default DNS, create a local `docker-compose.override.yml` that sets `dns` for the `api` service. That file is ignored by Git on purpose.

### Try a payment (Paystack test mode)

Put a Paystack **test** secret key (`sk_test_...`) in `.env` as `PAYSTACK_SECRET_KEY`, then recreate the API: `docker compose up -d --force-recreate api`. No real money moves in test mode.

1. Run the demo seed, then pick a variant id from `GET /variants/product/{productId}`.
2. `POST /auth/signup` a customer. Without SMTP settings the email is not sent, so read the 6-character code from the API log: `docker compose logs api | grep "mail disabled"`. Then `POST /auth/verify-email` and `POST /auth/login`, and authorize as the customer.
3. `POST /cart/items`, then `POST /orders` with a shipping address.
4. `POST /payments/initialize` with the order id. Open the returned `authorizationUrl` and choose **Success** on the Paystack test page.
5. As an admin, call `GET /payments/verify/{reference}`. It confirms the payment with Paystack and checks the amount and currency.

Payments use MongoDB transactions, which need a replica set. `docker-compose.yml` therefore runs MongoDB as a single-node replica set (`rs0`). In production use a managed replica set such as MongoDB Atlas.

### Running without Docker

```bash
corepack enable
pnpm install
pnpm start:dev
```

Set `MONGODB_URI` in `.env` to a replica set. Without a `PORT` setting the app listens on 5000.

## Useful development commands

Run these from `Ade-projects/e-commerce-backend/`:

```bash
pnpm start:dev       # start the NestJS application in watch mode
pnpm build           # compile the application
pnpm lint            # run the configured linter
pnpm test            # run the unit test suite
pnpm test:e2e        # run the integration tests (needs a MongoDB replica set)
```

## API overview

Full, interactive documentation is in Swagger at `/docs`. Main route groups:

| Prefix | Purpose |
| --- | --- |
| `/auth` | `signup`, `verify-email`, `resend-verification`, `login`, `refresh`, `logout`, `me`, `forgot-password`, `verify-password`, `reset-password`, `google`, and `2fa/setup`, `2fa/enable`, `2fa/disable`, `2fa/login` |
| `/users` | Own profile and password change; staff: list, view, edit, change role, deactivate, activate, delete, restore |
| `/audit-logs` | The audit log (superadmin) |
| `/products`, `/variants` | Products, variants and stock updates |
| `/brands`, `/categories` | Catalogue organisation |
| `/cart` | View cart, add and remove items |
| `/orders` | Place orders, order history, staff order updates |
| `/payments` | Initialise, verify, refund, webhook, bank-transfer approval |
| `/refunds` | Customer: request and list own. Staff: list and view, manager `verify` and `replacement-sent`, admin `decide` |
| `/notifications` | List, unread count, mark as read |
| `/analytics` | `manager`, `admin` and `superadmin` dashboards, a customer's own dashboard, order, product, inventory and transaction reports, `staff-activity`, `sales` and `digest/send` |
| `/health`, `/ready` | Liveness and readiness |

Browsing products, variants, brands and categories is public. Customers manage their own cart, orders, payments and refund requests. What each staff role can do is set by the role ladder above and enforced on the server.

## Testing and quality checks

```bash
pnpm test
```

The unit tests cover the staff-activity flags, the CSV export, the roles guard and the role policy, the global exception filter, the health route, Paystack webhook signature checking, atomic stock handling, token hashing, access restrictions and the Redis rate-limit storage. Run the command to see the current number of tests. The CI pipeline runs them on every push.

Integration tests start the real app against a real MongoDB replica set and fake only Paystack. The checkout test (`test/checkout.e2e-spec.ts`) checks that stock is reserved, that two buyers cannot both get the last unit (repeated 10 times), that the amount sent to Paystack is in kobo, that a webhook with a bad signature changes nothing, that a good one marks the payment and order paid only after Paystack confirms the amount, and that a replayed webhook is ignored. The auth tests cover sign-up, tokens, resets and 2FA, and the staff-reports tests cover the audit trail, the per-role staff list, the sales report and the digest. To run them locally:

```bash
docker run -d --name it-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
docker exec it-mongo mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
pnpm test:e2e
```

The integration tests only run against a database whose name ends in `_it`, and they wipe it. Stop the container with `docker rm -f it-mongo` when you are done.

## Docker and CI/CD

The workflow is `.github/workflows/ecommerce-backend.yaml` at the repository root. It runs on pushes and pull requests to `master` that touch this folder:

1. Check out the code (action pinned to a commit SHA).
2. Build a test image and run lint (report only) and the unit tests.
3. Build the production image.
4. Scan the image with Trivy; the build fails on any fixable CRITICAL vulnerability.
5. Smoke test: start the image with MongoDB and require `/health` and `/ready` to answer.
6. On `master` only, push the image to `ghcr.io/adekunleproject/ecommerce-backend`, tagged with the commit SHA.

Every deployed image maps to exactly one commit, which makes rollbacks and audits straightforward. Check the Actions tab for the result of a specific commit rather than assuming success.

The Docker image is a multi-stage build that ships only production dependencies and compiled code, with the base image pinned by digest, a non-root user (uid 10001), a built-in `HEALTHCHECK` against `/health`, and a final size of about 80 MB.

## Kubernetes deployment

The `terraform/` folder builds the cluster and `helm/ecommerce/` deploys the app. The full step-by-step guide is in [`docs/deploy.md`](docs/deploy.md).

```bash
cd terraform && terraform init && terraform apply          # about 10 minutes, 38 resources
aws eks update-kubeconfig --region eu-north-1 --name ecommerce-eks
helm install ecommerce helm/ecommerce --set image.tag=<commit-sha> --wait --timeout 5m
kubectl port-forward svc/ecommerce-api 5000:5000           # then curl /health and /ready
```

The chart runs two API replicas and a standalone MongoDB deployment (fine for a demo; payments need a replica set or Atlas), with a ConfigMap for settings, a Secret for credentials, and probes: startup and liveness on `/health`, readiness on `/ready`. Pods run as non-root with all Linux capabilities dropped. Create the Secret from your local `.env`; it is never stored in Git.

### Rolling back a bad release

```bash
helm upgrade ecommerce helm/ecommerce --set image.tag=thisdoesnotexist --wait --timeout 90s
helm history ecommerce
helm rollback ecommerce <last-good-revision> --wait
```

The failed upgrade leaves the running pods untouched, so the service stays up, and the rollback restores the last good revision with one command.

### Cost

The cluster costs roughly 0.35 USD per hour while it is running. Destroy it when you are done with `cd terraform && terraform destroy`. It can be rebuilt from the same code in about 15 minutes.

## Security notes

- Secrets live only in a local `.env` or a Kubernetes Secret, never in Git. A database credential that was committed in the early history of the repository was removed from the code; anything that has touched Git history should be treated as exposed and rotated.
- Role guards protect staff routes and deny access instead of crashing when no user is attached to the request. Role changes and account actions follow the policy in `src/common/role-policy.ts`.
- Global validation rejects unknown or malformed input. Helmet security headers and rate limiting are enabled, with extra per-email limits on login, verification, resend, forgot and reset.
- Refresh tokens are stored only as SHA-256 hashes (never bcrypt, which ignores everything after 72 bytes and would accept an old token). Resetting a password signs the account out everywhere.
- Payment webhooks are verified with an HMAC signature, and the payment is then confirmed with Paystack before anything is marked paid.
- The container runs as a non-root user and the image is scanned on every build.

## Current implementation boundaries

- Because refresh tokens rotate, a client must save the new `refreshToken` that `/auth/refresh` returns and must not send two refresh calls for the same token at once, or it gets signed out. Sessions are not listed or revocable one by one from the API yet.
- Two-factor has no admin reset yet: someone who loses both the authenticator and the backup codes needs a database change.
- Audit entries cover account actions, role changes, refund steps and product, stock and order changes. Price is audited when a product is edited, but a variant's price cannot be changed through the API yet, so there is nothing to audit there.
- The weekly digest runs in the app process, so with several replicas two could send in the same hour; run it on one replica or call `POST /analytics/digest/send` from a cron job. It has not been tested against a real mail server.
- The temporary password for an admin-created user travels in a plain-text email until they change it.
- Google sign-in still returns its tokens in the redirect query string, which should move to the URL fragment together with a matching change in the frontend.
- Rate limits are shared across replicas only when `REDIS_URL` is set. In Kubernetes, point it at a managed Redis; the chart does not deploy one. Redis is used for the limiter only, not as a cache.
- There is no queue for slow work such as emails, which are sent during the request.
- Lint is report-only in CI for now.
- The EKS cluster was destroyed after testing, so nothing is running. The chart's MongoDB is a single demo pod, and the app has not been load tested.

## Project goal

This is a practical backend engineering project covering secure authentication, role-based authorization, safe handling of money and stock, an audit trail, automated tests and deployment workflows, in a maintainable NestJS service.

## Author

Alimi Lateef Adekunle, Backend / DevOps Engineer. [GitHub](https://github.com/AdekunleProject) · [LinkedIn](https://www.linkedin.com/in/alimi-lateef-adekunle-35a295211)
