# E-commerce Backend API

[![CI](https://github.com/AdekunleProject/polyglot-backend-labs/actions/workflows/ecommerce-backend.yaml/badge.svg)](https://github.com/AdekunleProject/polyglot-backend-labs/actions/workflows/ecommerce-backend.yaml)

A REST API for an online store, built with **NestJS, TypeScript and MongoDB**. It covers sign-up and login, products and variants, carts, orders, payments and admin analytics. The project also ships with the DevOps work around it: a hardened Docker image, a GitHub Actions pipeline, Terraform for AWS EKS and a Helm chart.

- API docs (Swagger): `http://localhost:5000/docs` when running
- Health checks: `GET /health` (liveness) and `GET /ready` (readiness, checks MongoDB)

## Contents

1. [What it does](#what-it-does)
2. [How a purchase works](#how-a-purchase-works)
3. [Tech stack](#tech-stack)
4. [Run it locally](#run-it-locally)
5. [Configuration](#configuration)
6. [API overview](#api-overview)
7. [Tests](#tests)
8. [CI/CD pipeline](#cicd-pipeline)
9. [Deploy to AWS EKS](#deploy-to-aws-eks)
10. [Security notes](#security-notes)
11. [Known limitations](#known-limitations)
12. [Project layout](#project-layout)

## What it does

| Area | What it provides |
| --- | --- |
| Auth | Sign-up with email verification, login, per-device refresh tokens that rotate on every use, logout (this device or all), forgot and reset password, Google sign-in |
| Users and roles | Two roles, `customer` and `admin`, enforced by JWT and role guards |
| Catalogue | Products, product variants (with stock), brands and categories |
| Cart and orders | Per-user cart, order creation, order history, admin order management |
| Payments | Paystack payment initialisation, webhook handling, refunds, bank-transfer approval flow |
| Notifications | In-app notifications with unread counts |
| Analytics | Admin and customer dashboards: orders, products, inventory, transactions |
| Operations | `/health` endpoint, Swagger docs, global validation, rate limiting, security headers |

## How a purchase works

The checkout is the part I spent the most time on, because it is where money and stock are involved.

1. **Cart.** A cart line points at a product variant (for example a size or colour), because price and stock live on the variant.
2. **Order.** `POST /orders` reads the cart, works out prices from the database (never from the client) and reserves stock. Each variant is updated with one atomic query that checks there is enough stock and subtracts it in the same step, so two buyers cannot both get the last unit. If any item fails, the stock already taken is put back.
3. **Payment.** `POST /payments/initialize` creates a payment record with a unique reference inside a MongoDB transaction and asks Paystack for a payment page. The amount is sent in kobo.
4. **Verification.** When Paystack calls the webhook, the signature is checked first (HMAC over the raw body), but the payload is not trusted. The app asks Paystack for the transaction itself and checks that it succeeded and that the amount and currency match the order. Only then are the payment and order marked paid. A payment that is already paid returns early, so a repeated webhook cannot pay an order twice.
5. **Refunds and bank transfers.** A refund only works on a successful payment that has not been refunded. A bank transfer is submitted by the customer and approved or rejected by an admin.

## Tech stack

- **Runtime and framework:** Node.js 22, NestJS 11, TypeScript
- **Database:** MongoDB 7 with Mongoose
- **Auth:** JWT (access and refresh tokens), Passport (JWT and Google OAuth), bcrypt password hashing
- **API safety:** class-validator, Helmet, rate limiting with `@nestjs/throttler`
- **Files:** AWS S3 (SDK v3) for uploads
- **Email:** Nodemailer over SMTP
- **Tooling:** pnpm, Jest, ESLint, Prettier
- **Delivery:** Docker, GitHub Actions, Trivy, ghcr.io, Terraform, Helm, AWS EKS

## Run it locally

You need Docker with Compose. Nothing else is required.

```bash
git clone https://github.com/AdekunleProject/polyglot-backend-labs.git
cd polyglot-backend-labs/Ade-projects/e-commerce-backend
cp .env.example .env
```

The example file already contains working values for a local run, so you can start straight away. Before using the API for anything real, change `JWT_SECRET`, `JWT_REFRESH_SECRET` and `ADMIN_PASSWORD`.

Start the API and MongoDB:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:5000/health
```

The health check returns `{"status":"ok"}` once the app is ready (allow about 20 seconds). `GET /ready` also checks the database connection. Then open **http://localhost:5000/docs**.

Load a small demo catalogue (3 categories, 3 brands, 4 products with variants). It is safe to run twice:

```bash
docker compose exec api node scripts/demo-seed.mjs
```

To try the admin routes: call `POST /auth/login` with the admin email and password from `.env`, copy the `accessToken`, click **Authorize** in Swagger, paste the token, and call `GET /users`.

Stop everything with `docker compose down` (add `-v` only if you want to delete the database volume).

If your network blocks Docker's default DNS, create a local `docker-compose.override.yml` that sets `dns` for the `api` service. That file is ignored by Git on purpose.

### Try a payment (Paystack test mode)

Put a Paystack **test** secret key (`sk_test_...`, from the Paystack dashboard in Test mode) in `.env` as `PAYSTACK_SECRET_KEY`, then recreate the API so it reads it: `docker compose up -d --force-recreate api`. No real money moves in test mode.

1. `POST /auth/login` as the admin, click **Authorize** in Swagger and paste the `accessToken`.
2. Run the demo seed above (or create a brand, category, product and variant by hand with `POST /brands`, `/categories`, `/products` and `/variants`), then pick a variant id from `GET /variants/product/{productId}`.
3. `POST /auth/signup` a customer. Email is not sent without SMTP settings, so read the 6-character code from the API log: `docker compose logs api | grep "mail disabled"` (codes are stored hashed, so the database no longer shows them). Then `POST /auth/verify-email` and `POST /auth/login`. Authorize as the customer.
4. `POST /cart/items`, then `POST /orders` with a shipping address.
5. `POST /payments/initialize` with the order id. Open the returned `authorizationUrl` and choose **Success** on the Paystack test page.
6. As the admin, call `GET /payments/verify/{reference}`. It confirms the payment with Paystack and checks that the amount and currency match the order.

Access tokens last 15 minutes. A 401 means log in again and re-Authorize.

Payments use MongoDB transactions, which need a replica set. `docker-compose.yml` therefore runs MongoDB as a single-node replica set (`rs0`). In production, use a managed replica set such as MongoDB Atlas.

### Running without Docker

```bash
corepack enable
pnpm install
pnpm start:dev
```

You need a MongoDB **replica set** (transactions are used for payments; Atlas works) and `MONGODB_URI` set in `.env`. Without a `PORT` setting the app listens on 5000.

## Configuration

All settings are environment variables. `.env.example` lists them; real values go in a local `.env` (never committed) or, on Kubernetes, in a Secret.

The app checks its settings when it starts. It refuses to boot if `MONGODB_URI`, `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing, and when `NODE_ENV=production` (the Docker image's default) both secrets must be at least 32 characters and different from each other. The error message lists every problem at once. If an old `.env` has short secrets, replace them with long random strings (for example `openssl rand -hex 32`).

| Variable | Purpose |
| --- | --- |
| `NODE_ENV`, `PORT` | Mode and listening port (5000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Access token signing key and lifetime |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Refresh token signing key and lifetime |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google sign-in |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_CALLBACK_URL` | Paystack payments |
| `FRONTEND_URL` | Allowed CORS origin and redirect target |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` | File uploads to S3 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin account created at start-up if missing |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | SMTP settings for verification and reset emails |
| `ENABLE_DOCS` | Swagger is on except when `NODE_ENV=production`; set `true` or `false` to override |
| `THROTTLE_LIMIT`, `TRUST_PROXY` | Requests per minute per client address (default 60); set `TRUST_PROXY=true` behind a load balancer so limits see the real client address |
| `REDIS_URL` | Share rate limit counters between replicas. Optional; without it, or while Redis is down, each instance counts alone |
| `TWO_FACTOR_KEY` | Encrypts authenticator secrets in the database. Optional: `JWT_SECRET` is used when unset |

The app reads the Google, Paystack, JWT and AWS keys with `getOrThrow`, so they must be present to start. They do not have to be real. Without real Google or Paystack keys the app runs and everything works except Google sign-in and real payments.

## API overview

Full, interactive documentation is in Swagger at `/docs`. Main route groups:

| Prefix | Purpose |
| --- | --- |
| `/auth` | `signup`, `verify-email`, `resend-verification`, `login`, `refresh`, `logout`, `me`, `forgot-password`, `verify-password`, `reset-password`, `google`, and `2fa/setup`, `2fa/enable`, `2fa/disable`, `2fa/login` |
| `/users` | List users (admin), create users |
| `/products`, `/variants` | Products, variants and stock updates |
| `/brands`, `/categories` | Catalogue organisation |
| `/cart` | View cart, add and remove items |
| `/orders` | Place orders, order history, admin order updates |
| `/payments` | Initialise, verify, refund, webhook, bank-transfer approval |
| `/notifications` | List, unread count, mark as read |
| `/analytics` | Admin and customer reports |
| `/health` | Liveness: the process is up (does not depend on MongoDB, so a database outage never restarts pods) |
| `/ready` | Readiness: pings MongoDB and returns 503 when it is unreachable |

There are two roles. Browsing products, variants, brands and categories is public. Customers manage their own cart, orders and payments. Admins manage the catalogue, see all orders and payments, issue refunds, approve bank transfers and read the admin analytics.

## Tests

```bash
pnpm test
```

The suite covers the roles guard (including the unauthenticated case), the global exception filter, the health route, Paystack webhook signature checking and atomic stock handling. Run the command to see the current number of tests. The CI pipeline runs the same tests on every push.

There is also an integration test for the money path (`test/checkout.e2e-spec.ts`). It starts the real app against a real MongoDB replica set and fakes only Paystack. It checks that stock is reserved, that two buyers cannot both get the last unit (repeated 10 times), that the amount sent to Paystack is in kobo, that a webhook with a bad signature changes nothing, that a good one marks the payment and order paid only after Paystack confirms the amount, and that a replayed webhook is ignored. CI runs it on every push. To run it locally:

```bash
docker run -d --name it-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
docker exec it-mongo mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
pnpm test:e2e
```

The test only runs against a database whose name ends in `_it`, and it wipes that database. Stop the container with `docker rm -f it-mongo` when you are done.

## CI/CD pipeline

The workflow is `.github/workflows/ecommerce-backend.yaml` at the repository root. It runs on pushes and pull requests to `master` that touch this folder.

1. Check out the code (action pinned to a commit SHA)
2. Build a test image and run lint (report only) and unit tests
3. Build the production image
4. Scan the image with **Trivy**; the build fails on any fixable CRITICAL vulnerability
5. Smoke test: start the image with MongoDB and require `/health` and `/ready` to answer
6. On `master` only, push the image to `ghcr.io/adekunleproject/ecommerce-backend`, tagged with the commit SHA

Every deployed image maps to exactly one commit, which makes rollbacks and audits straightforward.

### The Docker image

- Multi-stage build: compile in one stage, ship only production dependencies and compiled code
- Base image pinned by digest
- Runs as a non-root user (uid 10001)
- Built-in `HEALTHCHECK` against `/health`
- Small final image (about 80 MB)

## Deploy to AWS EKS

The `terraform/` folder builds the cluster and `helm/ecommerce/` deploys the app. The full step-by-step guide is in [`docs/deploy.md`](docs/deploy.md). In short:

```bash
# 1. Create the cluster (about 10 minutes, 38 resources)
cd terraform
terraform init
terraform apply

# 2. Connect kubectl
aws eks update-kubeconfig --region eu-north-1 --name ecommerce-eks

# 3. Create the Secret from your local .env (never stored in Git), then install
helm install ecommerce helm/ecommerce --set image.tag=<commit-sha> --wait --timeout 5m

# 4. Open it
kubectl port-forward svc/ecommerce-api 5000:5000
```

The chart runs two API replicas and a standalone MongoDB deployment (fine for a demo; payments need a replica set or Atlas), with a ConfigMap for settings, a Secret for credentials, and probes: startup and liveness on `/health`, readiness on `/ready`. Pods run as non-root with all Linux capabilities dropped.

### Rolling back a bad release

```bash
helm upgrade ecommerce helm/ecommerce --set image.tag=thisdoesnotexist --wait --timeout 90s
helm history ecommerce
helm rollback ecommerce <last-good-revision> --wait
```

The failed upgrade leaves the running pods untouched, so the service stays up, and the rollback restores the last good revision with one command.

### Cost

The cluster costs roughly 0.35 USD per hour while it is running. Destroy it when you are done:

```bash
cd terraform
terraform destroy
```

It can be rebuilt from the same code in about 15 minutes.

## Security notes

- Secrets live only in a local `.env` or a Kubernetes Secret, never in Git
- A database credential that was committed in the early history of the repository was removed from the code. Anything that has touched Git history should be treated as exposed, so it must be rotated
- Role guards protect admin routes; the guard denies access instead of crashing when no user is attached to the request
- Global validation rejects unknown or malformed input
- Helmet security headers and rate limiting are enabled. Auth routes have their own limits per client address and, for login, verification, resend, forgot and reset, also per email address, so a spread-out guessing attempt on one account is slowed too. Counters are shared across replicas when `REDIS_URL` is set
- Verification and reset codes are stored only as hashes, tied to one purpose (a verification code cannot reset a password), single use, and expire after 15 minutes. Wrong email, wrong password and Google-only accounts all get the same login answer
- Two-factor sign-in with an authenticator app (standard TOTP, RFC 6238): `POST /auth/2fa/setup` returns a secret and an `otpauthUrl`; `POST /auth/2fa/enable` with a code turns it on and returns 8 one-time backup codes; with it on, `POST /auth/login` returns `{ twoFactorRequired, challengeToken }` and `POST /auth/2fa/login` finishes the sign-in; `POST /auth/2fa/disable` needs the password and a code. Codes work once, the secret is stored encrypted (AES-256-GCM) and backup codes as hashes. Google sign-in does not ask for the second factor
- A user created by an admin gets a one-time password by email, never in the response. If email is not set up, development shows it once in the response; production refuses and creates nothing
- The container runs as a non-root user and the image is scanned on every build
- Payment webhooks are verified with an HMAC signature
- Refresh tokens are per device, stored only as SHA-256 hashes (never bcrypt, which ignores everything after 72 bytes and would accept an old token), and rotated on every use. Replaying an old token is treated as theft and ends that session. Resetting a password signs the account out everywhere. At most 5 devices stay signed in per user

## Known limitations

- Because refresh tokens rotate, a client must save the new `refreshToken` that `/auth/refresh` returns and must not send two refresh calls for the same token at once, or it gets signed out. Sessions are not listed or revocable one by one from the API yet; logout ends the current device or all devices.
- Two-factor has no admin reset yet: someone who loses both the authenticator and the backup codes needs a database change.
- Rate limits are shared across replicas only when `REDIS_URL` is set. In Kubernetes, point it at a managed Redis (for example ElastiCache); the chart does not deploy one. Redis is used for the limiter only, not as a cache.
- The temporary password for an admin-created user travels in a plain-text email until they change it, a common trade-off.
- Google sign-in still returns its tokens in the redirect query string; the blog API uses the URL fragment, which keeps them out of server logs, but that needs a matching change in the frontend.
- Lint is report-only in CI for now.
- No queue for slow work such as emails, which are sent during the request.
- The EKS cluster was destroyed after testing, so nothing is running. The chart's MongoDB is a single demo pod, and the app has not been load tested.

## Project layout

```
Ade-projects/e-commerce-backend/
  src/              NestJS modules (auth, users, products, cart, orders, payments, ...)
  test/             end-to-end test setup
  Dockerfile        multi-stage, non-root image
  docker-compose.yml  API + MongoDB for local use
  helm/ecommerce/   Helm chart for Kubernetes
  terraform/        AWS EKS infrastructure
  docs/             deployment guide
  CODE-REVIEW-FINDINGS.md   bugs found and fixed in a full code review
.github/workflows/ecommerce-backend.yaml   CI pipeline (repository root)
```

See `CODE-REVIEW-FINDINGS.md` for the 16 bugs found and fixed in a full code review before the DevOps work, such as a refresh-token route that validation rejected, which would have logged users out every 15 minutes.

## Author

Alimi Lateef Adekunle, Backend / DevOps Engineer. [GitHub](https://github.com/AdekunleProject) · [LinkedIn](https://www.linkedin.com/in/alimi-lateef-adekunle-35a295211)
