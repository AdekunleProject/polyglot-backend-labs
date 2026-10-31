# E-commerce Backend API

[![CI](https://github.com/AdekunleProject/polyglot-backend-labs/actions/workflows/ecommerce-backend.yaml/badge.svg)](https://github.com/AdekunleProject/polyglot-backend-labs/actions/workflows/ecommerce-backend.yaml)

A REST API for an online store, built with **NestJS, TypeScript and MongoDB**. It covers sign-up and login, products and variants, carts, orders, payments and admin analytics. The project also ships with the DevOps work around it: a hardened Docker image, a GitHub Actions pipeline, Terraform for AWS EKS and a Helm chart.

- API docs (Swagger): `http://localhost:5000/docs` when running
- Health check: `GET /health`

## Contents

1. [What it does](#what-it-does)
2. [Tech stack](#tech-stack)
3. [Run it locally](#run-it-locally)
4. [Configuration](#configuration)
5. [API overview](#api-overview)
6. [Tests](#tests)
7. [CI/CD pipeline](#cicd-pipeline)
8. [Deploy to AWS EKS](#deploy-to-aws-eks)
9. [Security notes](#security-notes)
10. [Project layout](#project-layout)

## What it does

| Area | What it provides |
| --- | --- |
| Auth | Sign-up with email verification, login, refresh tokens, logout, forgot and reset password, Google sign-in |
| Users and roles | Two roles, `customer` and `admin`, enforced by JWT and role guards |
| Catalogue | Products, product variants (with stock), brands and categories |
| Cart and orders | Per-user cart, order creation, order history, admin order management |
| Payments | Paystack payment initialisation, webhook handling, refunds, bank-transfer approval flow |
| Notifications | In-app notifications with unread counts |
| Analytics | Admin and customer dashboards: orders, products, inventory, transactions |
| Operations | `/health` endpoint, Swagger docs, global validation, rate limiting, security headers |

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

Open `.env` and set at least these values. Everything else can stay as a placeholder for local use:

- `JWT_SECRET` and `JWT_REFRESH_SECRET`: any long random strings
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: the admin account created on first start
- `PORT=5000`

Start the API and MongoDB:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:5000/health
```

The health check returns `{"status":"ok"}` once the app is ready (allow about 20 seconds). Then open **http://localhost:5000/docs**.

To try the admin routes: call `POST /auth/login` with your admin email and password, copy the `accessToken`, click **Authorize** in Swagger, paste the token, and call `GET /users`.

Stop everything with `docker compose down` (add `-v` only if you want to delete the database volume).

### Try a payment (Paystack test mode)

Put a Paystack **test** secret key (`sk_test_...`, from the Paystack dashboard in Test mode) in `.env` as `PAYSTACK_SECRET_KEY`, then recreate the API so it reads it: `docker compose up -d --force-recreate api`. No real money moves in test mode.

1. `POST /auth/login` as the admin, click **Authorize** in Swagger and paste the `accessToken`.
2. Create a brand (`POST /brands`), a category (`POST /categories`), a product (`POST /products`) and a variant with stock (`POST /variants`).
3. `POST /auth/signup` a customer. Email is not sent without SMTP settings, so read the 6-digit code from the database:
   `docker compose exec mongo mongosh ecommerce --quiet --eval 'db.mailtokens.find().sort({createdAt:-1}).limit(1).forEach(d=>print(d.token))'`
   then `POST /auth/verify-email` and `POST /auth/login`. Authorize as the customer.
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
| `ENABLE_DOCS` | Set to `false` to switch Swagger off |

The app reads the Google, Paystack, JWT and AWS keys with `getOrThrow`, so they must be present to start. They do not have to be real. Without real Google or Paystack keys the app runs and everything works except Google sign-in and real payments.

## API overview

Full, interactive documentation is in Swagger at `/docs`. Main route groups:

| Prefix | Purpose |
| --- | --- |
| `/auth` | `signup`, `verify-email`, `login`, `refresh`, `logout`, `me`, `forgot-password`, `reset-password`, `google` |
| `/users` | List users (admin), create users |
| `/products`, `/variants` | Products, variants and stock updates |
| `/brands`, `/categories` | Catalogue organisation |
| `/cart` | View cart, add and remove items |
| `/orders` | Place orders, order history, admin order updates |
| `/payments` | Initialise, verify, refund, webhook, bank-transfer approval |
| `/notifications` | List, unread count, mark as read |
| `/analytics` | Admin and customer reports |
| `/health` | Liveness and readiness probe |

## Tests

```bash
pnpm test
```

The suite (17 tests) covers the roles guard (including the unauthenticated case), the global exception filter, the health route, Paystack webhook signature checking and atomic stock handling. The CI pipeline runs the same tests on every push.

## CI/CD pipeline

The workflow is `.github/workflows/ecommerce-backend.yaml` at the repository root. It runs on pushes and pull requests to `master` that touch this folder.

1. Check out the code (action pinned to a commit SHA)
2. Build a test image and run lint (report only) and unit tests
3. Build the production image
4. Scan the image with **Trivy**; the build fails on any fixable CRITICAL vulnerability
5. Smoke test: start the image with MongoDB and require `/health` to answer
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

The chart runs two API replicas and a standalone MongoDB deployment (fine for a demo; payments need a replica set or Atlas), with a ConfigMap for settings, a Secret for credentials, and startup, readiness and liveness probes on `/health`. Pods run as non-root with all Linux capabilities dropped.

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
- A database credential that was committed in the early history of the repository was removed from the code and rotated
- Role guards protect admin routes; the guard denies access instead of crashing when no user is attached to the request
- Global validation rejects unknown or malformed input
- Helmet security headers and rate limiting are enabled
- The container runs as a non-root user and the image is scanned on every build
- Payment webhooks are verified with an HMAC signature

## Project layout

```
Ade-projects/e-commerce-backend/
  src/              NestJS modules (auth, users, products, cart, orders, payments, ...)
  test/             end-to-end test setup
  Dockerfile        multi-stage, non-root image
  docker-compose.yml  API + MongoDB for local use
  helm/ecommerce/   Helm chart for Kubernetes
  terraform/        AWS EKS infrastructure
  docs/             deployment guide and fixes log
.github/workflows/ecommerce-backend.yaml   CI pipeline (repository root)
```

See `docs/devops-fixes.md` for the list of bugs and hardening changes made while preparing the app for production.

## Author

Alimi Lateef Adekunle, Backend / DevOps Engineer. [GitHub](https://github.com/AdekunleProject) · [LinkedIn](https://www.linkedin.com/in/alimi-lateef-adekunle-35a295211)
