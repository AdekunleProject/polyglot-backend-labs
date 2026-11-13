# MarketEdge Backend

MarketEdge is a backend API for a retail/customer relationship management platform. It brings together customer accounts, staff access control, transaction-driven customer insights, order handling, messaging workflows and payment-webhook processing.

The project is built with NestJS and GraphQL, with MongoDB for persistent data and Redis for caching and background-work infrastructure. The focus is on backend concerns that matter beyond basic CRUD: authentication, session lifecycle, authorization, input validation, asynchronous jobs, idempotency, operational checks and automated testing.

## What the backend provides

### Authentication and account security

- Local customer registration and login.
- Email OTP verification during registration.
- Password recovery and password reset.
- Google and Apple sign-in flows that verify provider ID tokens.
- JWT-based access and refresh tokens.
- Refresh-token rotation, with only hashed refresh-token values stored in the database.
- Session tracking to support multiple signed-in devices.
- Logout for one session and logout-all for all sessions.
- Revocation checks in the GraphQL authentication guard, so a revoked session can no longer use its access token.
- Login-failure handling and account lockout protections.

Refresh tokens are rotated rather than reused indefinitely. A refresh token is associated with a session identifier, and rotation is performed against the stored session state. Password changes and password resets invalidate existing refresh sessions.

### Roles and staff administration

The application defines four roles:

| Role | Purpose |
| --- | --- |
| `ADMIN` | Full administrative access, including staff role management |
| `MANAGER` | Staff-management operations permitted to managers |
| `AGENT` | Operational staff role |
| `CUSTOMER` | Customer-facing account access |

Authorization is enforced on the server with GraphQL guards and role metadata. Customer profile operations use the authenticated user's identity rather than trusting a client-supplied user ID.

The initial administrator can be bootstrapped from environment variables when the application starts and no administrator account exists. Admin and manager permissions are intentionally different: managers may perform permitted staff updates, but only an administrator can change a user's role.

### Customer and transaction workflows

- Customer profile retrieval and updates.
- Transaction records used by customer intelligence features.
- Customer VIP scoring based on transaction activity.
- Redis caching for computed scores.
- GraphQL subscriptions for publishing score updates to connected clients.

### Orders and payment events

- Order placement supports an idempotency key to prevent duplicate orders when a client retries a request.
- Paystack webhook processing validates the request signature using HMAC-SHA512 over the raw request body.
- Duplicate webhook events are handled so that a retried event is not processed as a new event.

### Messaging and background jobs

- SMS broadcast requests are queued and processed asynchronously with BullMQ and Redis.
- Messages are processed in batches, with retry handling and delivery status tracking.
- The current SMS provider implementation is a dry run: it logs the outgoing message rather than delivering a real SMS. Connect a real provider before using this feature for live messaging.
- Email functionality uses SMTP configuration; supply valid provider credentials to enable actual email delivery.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 12, TypeScript |
| API | GraphQL, Apollo, graphql-ws |
| Database | MongoDB, Mongoose |
| Cache and queue infrastructure | Redis, BullMQ |
| Authentication | JWT, bcrypt |
| Payments | Paystack webhook signature verification |
| Containers | Docker, Docker Compose |
| Deployment packaging | Helm |
| CI/CD and security scanning | GitHub Actions, Trivy |
| Tests | Vitest |

## Architecture at a glance

A GraphQL request enters the NestJS application and is handled by a resolver. Authentication and role guards protect operations that require a signed-in user or a particular role. Resolvers delegate business operations to services, which work with MongoDB models and supporting infrastructure.

Redis is used for caching and as the backing service for queued work and subscription-related pub/sub. BullMQ workers handle background messaging so that a broadcast request does not need to perform every delivery operation during the original API request.

The Paystack webhook is exposed as an HTTP endpoint because payment providers send webhook requests over HTTP rather than through the GraphQL API.

## Repository layout

The main application code lives in `src/`, organized into NestJS modules and their related resolvers, services, DTOs, guards and schemas. Supporting project files include:

- `src/auth/` — authentication, token and session workflows.
- `src/user/` — user accounts, staff administration, roles and bootstrap logic.
- `src/market-edge/` — MarketEdge domain functionality and supporting services.
- `helm/marketedge/` — Helm chart for deploying the API.
- `docs/` — deployment and project review notes.
- `.github/workflows/marketedge-backend.yaml` — CI workflow at the monorepo root.
- `docker-compose.yml` — local application and dependency stack.
- `scripts/` — operational and smoke-test scripts.

## Requirements

For local development, install:

- Node.js (use a version compatible with the project's package configuration).
- pnpm.
- Docker and Docker Compose.

You will also need credentials for any external services you intend to exercise, such as Paystack, Google/Apple identity providers and SMTP. The SMS integration remains in dry-run mode until a real provider is configured.

## Configuration

Start with the example environment file:

```bash
cp .env.example .env
```

Set the values required by your environment. Important configuration groups include:

| Variable group | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection |
| `JWT_SECRET` | JWT signing secret; use a strong secret of at least 32 characters |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial administrator bootstrap |
| `REDIS_HOST`, `REDIS_PORT` and optional Redis credentials | Redis connection |
| `PAYSTACK_SECRET_KEY` | Paystack webhook signature verification |
| `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` | Social identity-token verification |
| SMTP variables | Outgoing email configuration |
| `CORS_ORIGIN` | Allowed browser origin(s) |

The exact set of variables and defaults is documented in `.env.example`. Replace example values with your own credentials. Never commit a populated `.env` file, production secrets, private keys or real customer data.

## Run locally

From the repository root:

```bash
cd marketedge-backend
pnpm install
cp .env.example .env
```

Edit `.env` with valid local configuration, then start the stack:

```bash
docker compose up --build
```

The Compose configuration starts the API together with its local MongoDB and Redis dependencies. Once the services are healthy:

- GraphQL endpoint: `http://localhost:3000/graphql`
- Process health endpoint: `http://localhost:3000/health`
- Dependency readiness endpoint: `http://localhost:3000/ready`

The GraphQL sandbox is not enabled when `NODE_ENV=production`.

To stop the stack:

```bash
docker compose down
```

To stop it and remove the Compose-managed data volume as well, use `docker compose down -v`. This deletes local database data, so do not run it if you need to keep that data.

## Useful development commands

Run these from `marketedge-backend/`:

```bash
pnpm start:dev       # start the NestJS application in watch mode
pnpm build           # compile the application
pnpm lint            # run the configured linter
pnpm typecheck       # run TypeScript type checking
pnpm test            # run the unit test suite
pnpm test:watch      # run tests in watch mode
pnpm test:cov        # run tests with coverage
```

## GraphQL operations

The schema includes operations for the main account and business workflows. The exact input fields and return types are defined in the GraphQL schema and DTOs.

| Area | Example operations |
| --- | --- |
| Customer authentication | `registerLocal`, `loginLocal`, `verifyEmailRegistration` |
| Password and sessions | `forgotPassword`, `confirmPasswordReset`, `changePassword`, `refreshTokens`, `logout`, `logoutAll` |
| Customer profile | `myProfile` |
| Administration | `myAdminProfile`, `createAdminUser`, `updateAdminUser` |
| Business workflows | `addTransaction`, `broadcastSms` |

Social sign-in operations are also available for the configured identity providers. Consult the schema for the full operation signatures and required arguments.

## Testing and quality checks

The project uses Vitest for automated tests. The suite covers service and resolver behavior, authentication and authorization paths, session handling, and other application logic.

The latest local test run recorded during development completed with:

```text
Test Files  20 passed (20)
Tests       139 passed (139)
```

Run the checks yourself after installing dependencies and configuring the project:

```bash
pnpm test
pnpm typecheck
pnpm build
```

The repository also includes a smoke-test script for exercising the containerized application. Run it from the project directory when Docker is available:

```bash
scripts/smoke.sh
```

The test count above is a record of a local development run, not a guarantee that every future commit or deployment has passed.

## Docker and CI/CD

The project includes a multi-stage Docker build and a GitHub Actions workflow at `.github/workflows/marketedge-backend.yaml`. The workflow is configured to run the project's automated checks, build container images, scan the production image with Trivy, run a containerized smoke test and publish an image to GitHub Container Registry for pushes to the main development branch.

The workflow configuration is the source of truth for the exact checks and their enforcement. In particular, lint is currently configured as a reporting step, while the other configured validation and image checks determine whether the workflow can complete successfully. Check the Actions tab for the result of a specific commit rather than assuming a successful deployment from the presence of the workflow.

## Kubernetes deployment

A Helm chart is included under `helm/marketedge`, with application deployment settings such as health probes, resource/security settings and autoscaling configuration. Deployment notes are maintained in `docs/deploy.md`.

The bundled MongoDB and Redis chart configuration is intended as a starting point, not a production-grade data-platform setup. For a real environment, use appropriately managed database and Redis services, persistent storage, backups, network restrictions, secret management, monitoring and resource limits. The chart has not been represented here as a live production deployment.

## Security notes

- Keep JWT, database, SMTP, social-provider and payment-provider secrets outside source control.
- Use HTTPS and secure secret storage in deployed environments.
- Restrict CORS to trusted application origins.
- Keep dependencies and container base images updated.
- Review authorization rules whenever adding a resolver or mutation.
- Do not expose internal error details or sensitive authentication data in logs.
- Configure real email and SMS providers before relying on message delivery.

## Current implementation boundaries

Some integrations are deliberately not described as production-ready:

- SMS delivery is currently a dry run until a real provider is connected.
- Email delivery requires working SMTP credentials.
- Google and Apple sign-in require valid provider configuration.
- The included Helm chart and its bundled data-service settings need environment-specific hardening before production use.

## Project goal

MarketEdge is being developed as a practical backend engineering project, with emphasis on secure authentication, authorization, reliable session management, asynchronous processing, payment-event handling, automated tests and deployment workflows. The codebase is intended to demonstrate how these concerns fit together in a maintainable NestJS service.
