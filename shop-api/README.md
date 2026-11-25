# Shop API

A small online-shop backend built with NestJS, TypeORM and PostgreSQL. It is a study in one problem: selling the last item to exactly one buyer when many people order at once.

## What it does

| Area | Routes |
| --- | --- |
| Accounts | `POST /auth/register`, `POST /auth/login` (JWT). Roles: `user`, `admin` |
| Products | `POST /products` (admin), `GET /products`, `GET /products/:id` |
| Orders | `POST /orders` (safe), `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/cancel`. `POST /orders/naive` is the deliberately broken version |

Orders move from `pending` to `paid` or `cancelled`. Someone else's order answers 404.

## The concurrency lesson

- `POST /orders/naive` checks stock and then lowers it in two separate steps. Two buyers can both pass the check, so it oversells. It is kept to show the bug.
- `POST /orders` does the whole order in one database transaction and locks the product rows (`SELECT ... FOR UPDATE`) in a fixed order, so two orders cannot deadlock. A failed order leaves no half-made rows.
- Cancelling an order puts the stock back, once, in the same locked way, and a second cancel is refused.

## Run it

Needs Node 24 or newer and a PostgreSQL database.

```
pnpm install
cp .env.example .env
pnpm migration:run
pnpm start:dev
```

Settings: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `PORT`.

## Tests

```
pnpm test
TEST_DB_PORT=5433 pnpm test:e2e
```

The integration tests include ten buyers ordering the last item at the same moment (exactly one wins), no orphan order when stock is short, stock restored on cancel, and one user not being able to see another's order.
