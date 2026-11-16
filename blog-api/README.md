# Blog API

A blogging backend built with NestJS, TypeORM and PostgreSQL: accounts with JWT login, posts with drafts and tags, and comments with ownership rules.

## Quick start (Docker, any computer)

```bash
cd blog-api
cp .env.example .env
docker compose up -d --build
docker compose exec api node scripts/demo-seed.mjs   # optional demo data
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

The API runs on port 3000. The migrations run on start (`RUN_MIGRATIONS=true`), so the database builds its own schema. Demo accounts from the seed: `ada@demo.test` and `tunde@demo.test`, password `Demo-Passw0rd!`.

## Configuration

Set in `.env` (see `.env.example`). The app refuses to start with a clear list of what is missing.

| Variable | Notes |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `DB_SSL` | `true` for managed databases that need TLS |
| `JWT_SECRET` | In production it must be at least 32 characters |
| `JWT_EXPIRES_IN` | Default `1h` |
| `RUN_MIGRATIONS` | `true` to run pending migrations on start |
| `FRONTEND_URL` | Comma-separated allowed origins. Empty means no CORS |
| `PORT` | Default 3000 |

`synchronize` is off. The schema changes only through migrations (`pnpm migration:generate`, `pnpm migration:run`).

## Endpoints

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | public |
| GET | `/posts`, `/posts/:slug`, `/tags` | public (published posts only) |
| GET | `/posts/mine` | logged in (includes drafts) |
| POST | `/posts` | logged in |
| PATCH, DELETE | `/posts/:id` | author or admin |
| GET | `/posts/:postId/comments` | public |
| POST | `/posts/:postId/comments` | logged in, published posts only |
| DELETE | `/comments/:id` | commenter, post author or admin |
| GET | `/health`, `/ready` | liveness; readiness (checks the database, 503 if down) |

`GET /posts` supports `page`, `limit` (max 50), `tag` and a search term.

## Tests

```bash
pnpm test        # unit tests
# integration tests: real PostgreSQL, real migrations
docker run -d --name it-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=blog_it -p 5433:5432 postgres:16-alpine
TEST_DB_PORT=5433 pnpm test:e2e
```

The integration test empties its tables, so it refuses to run unless the database name ends in `_it`.

## CI

`.github/workflows/blog-api.yaml` builds the image, runs lint (report only), unit tests, integration tests against PostgreSQL, a Trivy scan (fails on fixable CRITICAL), and a smoke test of the production image. On master it pushes the image to GHCR tagged by commit SHA.

## Known limitations

- Single access token, no refresh tokens or logout yet.
- No rate limiting, security headers or Swagger yet (they need new dependencies).
- Not load tested.
