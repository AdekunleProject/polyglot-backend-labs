# Code review findings and fixes

| Severity | Finding | Fix |
|---|---|---|
| Critical | Google/Apple login trusted an email and provider id sent by the client (anyone could log in as anyone, including an admin) | The server now verifies the provider's ID token (signature, audience, issuer, expiry) |
| Critical | Default JWT secret in code; Docker/compose had hard-coded passwords and published Mongo/Redis on every interface | App refuses to start without secrets; compose reads `.env`, binds to 127.0.0.1 |
| Critical | `Dockerfile.prod` broke PATH, ran as root on EOL Node 20; deploy workflow never ran (wrong folder and branch) | Multi-stage non-root Node 22 image with health check; root-level workflow with tests, Trivy and smoke test |
| High | Managers could promote anyone to admin | Only admins change roles; nobody can delete themselves |
| High | Any subscriber received every customer's VIP score | Subscription filtered by `customerId`; customers cannot read scores |
| High | No way to create the first admin | `ADMIN_*` bootstrap at start-up |
| High | SMS broadcast never worked: invalid schema, input fields stripped by validation, and no worker consuming the queue | Fixed schema and DTOs, batched inserts, `SmsProcessor` worker with retry and status |
| High | Webhook: non-constant-time compare, leaked errors, no duplicate protection | `timingSafeEqual`, 401 generic, Redis idempotency key |
| Medium | Refresh token worked as an access token; no refresh endpoint | Token `type` claim checked; `refreshTokens` mutation |
| Medium | `Math.random` OTPs, shared OTP fields, no attempt limits, user enumeration | `crypto.randomInt`, separate fields, attempt cap, login lockout, generic messages |
| Medium | In-memory PubSub broke with more than one pod | Redis-backed pub/sub |
| Medium | No `/health`, schema file written at runtime, playground on in production | `/health` and `/ready`, in-memory schema in production, playground off |
| Low | Junk dependencies, dead code, default README | Removed; real README |

Not verifiable without a running stack: WebSocket subscription auth (test by hand), real SMS/mail/social providers.
