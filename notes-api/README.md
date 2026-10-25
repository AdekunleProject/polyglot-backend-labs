# Notes API

A REST API for users and their notes, built with NestJS, TypeORM and PostgreSQL.

## Tech stack
- NestJS
- PostgreSQL 16 (Docker)
- TypeORM with migrations
- class-validator for request validation
- pnpm

## Getting started

1. Install dependencies:
```bash
   pnpm install
```
2. Start PostgreSQL in Docker and create the database:
```bash
   docker run --name pg-learn -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16
   docker exec -it pg-learn psql -U postgres -c "CREATE DATABASE notes_api;"
```
3. Copy `.env.example` to `.env` and fill in your values.
4. Create the tables by running the migrations:
```bash
   pnpm migration:run
```
5. Start the app:
```bash
   pnpm start:dev
```

The API runs at `http://localhost:3000`.

## Database migrations

| Command | What it does |
|---|---|
| `pnpm migration:generate src/migrations/Name` | Create a migration from entity changes |
| `pnpm migration:run` | Apply pending migrations |
| `pnpm migration:revert` | Undo the last migration |

## Endpoints

### Users
| Method | Path | Description |
|---|---|---|
| POST | /users | Create a user |
| GET | /users | List users |
| GET | /users/:id | Get a user with their notes |

### Notes
| Method | Path | Description |
|---|---|---|
| POST | /notes | Create a note for a user |
| GET | /notes | List notes (paginated, filterable) |
| GET | /notes/:id | Get one note |
| PATCH | /notes/:id | Update a note |
| DELETE | /notes/:id | Delete a note |

`GET /notes` query parameters:

| Param | Description | Default |
|---|---|---|
| page | Page number | 1 |
| limit | Items per page (max 50) | 10 |
| search | Case-insensitive match on the title | none |
| userId | Only notes by this user | none |