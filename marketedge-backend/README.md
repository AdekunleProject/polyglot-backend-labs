# MarketEdge Backend

NestJS GraphQL API for a retail CRM: staff accounts and roles, customer VIP scoring, bulk SMS
campaigns, and Paystack payment webhooks.

**Stack:** NestJS 12, GraphQL (Apollo, graphql-ws subscriptions), MongoDB (Mongoose), Redis
(cache, pub/sub), BullMQ, JWT, Docker, Helm, GitHub Actions.

## Run it
```bash
cd ~/polyglot-backend-labs/marketedge-backend
cp .env.example .env        # fill in secrets; JWT_SECRET needs 32+ characters
docker compose up --build
```
GraphQL: http://localhost:3000/graphql (sandbox is off when `NODE_ENV=production`)
Health: `/health` (process), `/ready` (MongoDB and Redis).

The first admin is created from `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` when no admin exists.

## Test
```bash
pnpm install
pnpm test            # unit tests
pnpm exec tsc --noEmit
scripts/smoke.sh     # builds the image, starts the stack, calls the real API
```

## What it does
- Auth: local sign-up with email OTP, login lockout, access and refresh tokens, Google and Apple sign-in
  by verifying the provider's ID token. Roles: ADMIN, MANAGER, AGENT, CUSTOMER.
- SMS broadcast: messages are stored and queued in batches of 1,000; a worker sends them with retries
  and records SENT or FAILED. **The provider is a dry run (logs only) until you plug in a real one.**
- VIP scores: per-customer score from recent transactions, cached in Redis, pushed to subscribers over
  GraphQL subscriptions (Redis pub/sub, so it works with several pods).
- Orders: `placeOrder` is idempotent through a unique key, so a retried request does not create duplicates.
- Paystack webhook at `POST /webhooks/paystack`: HMAC-SHA512 over the raw body, constant-time compare,
  duplicate events ignored.

## DevOps
- Multi-stage, non-root Docker image with a health check.
- CI (`.github/workflows/marketedge-backend.yaml` at the repo root): tests, type check, Trivy scan,
  smoke test, push to GHCR tagged by commit SHA.
- Helm chart in `helm/marketedge` (probes, security context, HPA). See `docs/deploy.md`.
  In-cluster MongoDB and Redis are demo-grade.
- Review notes: `docs/review-findings.md`.
