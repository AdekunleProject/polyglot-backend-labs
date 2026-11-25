# Shop API

Shop API is a small online-shop backend. It exists to study one problem: selling the last item to exactly one buyer when many people order at the same moment.

The project is built with NestJS, TypeORM and PostgreSQL. The focus is on correctness under concurrency: transactions, row locks, consistent lock order and cleanup when an order fails.

## What the backend provides

### Authentication

- Registration and login with JWT access tokens and bcrypt-hashed passwords.
- Two roles, `user` and `admin`, enforced with guards. A user's own orders are the only ones they can see; another person's order answers 404.

### Products and orders

- Products: an admin creates them, anyone can list and read them.
- Orders move from `pending` to `paid` or `cancelled`.
- Placing an order reserves stock. Cancelling an order puts the stock back, once.

### The concurrency lesson

- `POST /orders/naive` checks stock and then lowers it in two separate steps. Two buyers can both pass the check, so it oversells. It is kept on purpose to show the bug.
- `POST /orders` does the whole order in one database transaction and locks the product rows (`SELECT ... FOR UPDATE`) in a fixed order, so two orders cannot deadlock. A failed order leaves no half-made rows.
- Cancelling restores stock in the same locked way, and a second cancel is refused.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 12, TypeScript |
| Database | PostgreSQL, TypeORM migrations |
| Authentication | JWT, bcrypt |
| Tests | Jest, supertest |

## Architecture at a glance

A request passes through a JWT guard and, for admin routes, a roles guard, then a controller and a service. The order service runs inside `DataSource.transaction`, locks the products it needs, checks stock, writes the order and its items, and commits or rolls back as one unit.

## Repository layout

- `src/auth/` — register, login, JWT strategy, guards and decorators.
- `src/users/`, `src/products/`, `src/orders/` — entities, DTOs, services and controllers.
- `src/migrations/` — the database schema.
- `test/` — integration tests, including the concurrency tests.

## Requirements

- Node.js 24 or newer and pnpm.
- A PostgreSQL database.

## Configuration

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `JWT_SECRET` | Token signing secret |
| `PORT` | Listening port (default 3000) |

Never commit a populated `.env` file.

## Run locally

```bash
cd shop-api
pnpm install
cp .env.example .env
pnpm migration:run
pnpm start:dev
```

## Useful development commands

```bash
pnpm start:dev          # start in watch mode
pnpm build              # compile the application
pnpm migration:generate # create a migration from entity changes
pnpm migration:run      # apply pending migrations
pnpm migration:revert   # undo the last migration
```

## API overview

| Area | Routes |
| --- | --- |
| Accounts | `POST /auth/register`, `POST /auth/login` |
| Products | `POST /products` (admin), `GET /products`, `GET /products/:id` |
| Orders | `POST /orders`, `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/cancel`, `POST /orders/naive` |

## Testing and quality checks

```bash
pnpm test
TEST_DB_PORT=5433 pnpm test:e2e
```

The integration tests include ten buyers ordering the last item at the same moment (exactly one wins), no orphan order when stock is short, stock restored on cancel and a second cancel refused, and one user not being able to see another's order.

## Current implementation boundaries

- There is no payment step: an order is marked paid by the application, not by a payment provider.
- There is no Dockerfile or CI workflow for this project yet.
- The naive order route is deliberately unsafe and should not be used outside the demonstration.

## Project goal

Shop API is a small practical project to show how database transactions and row locks keep stock correct when many buyers order together.
