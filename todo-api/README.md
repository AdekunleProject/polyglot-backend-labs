# Todo API

Todo API is the smallest backend in this repository: a REST API for managing todos.

The project is built with NestJS, TypeORM and PostgreSQL. It is where the basics were practised before the larger projects.

## What the backend provides

- Create, list, read, update and delete todos.
- Validated request bodies.

## Technology

| Area | Technology |
| --- | --- |
| Application framework | NestJS 12, TypeScript |
| Database | PostgreSQL 16, TypeORM |
| Tests | Vitest |
| Package manager | pnpm |

## Architecture at a glance

A request reaches a controller, which hands the work to a service that uses a TypeORM repository.

## Repository layout

- `src/todos/` — entity, DTOs, service and controller.
- `test/` — end-to-end tests.

## Requirements

- Node.js 24 or newer and pnpm.
- PostgreSQL 16 (Docker is the easiest way).

## Configuration

```bash
cp .env.example .env
```

Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME`. Never commit a populated `.env` file.

## Run locally

```bash
cd todo-api
pnpm install
docker run --name pg-learn -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16
docker exec -it pg-learn psql -U postgres -c "CREATE DATABASE todo_api;"
cp .env.example .env
pnpm start:dev
```

The API runs at `http://localhost:3000`.

## Useful development commands

```bash
pnpm start:dev       # start in watch mode
pnpm build           # compile the application
pnpm lint            # run the linter
pnpm test            # unit tests
pnpm test:e2e        # end-to-end tests
```

## API overview

| Method | Path | Description |
| --- | --- | --- |
| POST | `/todos` | Create a todo |
| GET | `/todos` | List all todos |
| GET | `/todos/:id` | Get one todo |
| PATCH | `/todos/:id` | Update a todo |
| DELETE | `/todos/:id` | Delete a todo |

## Testing and quality checks

```bash
pnpm test
pnpm test:e2e
```

## Current implementation boundaries

- No authentication, so every todo is visible to every caller.
- No migrations, Dockerfile or CI workflow for this project.

## Project goal

Todo API is a first practice project: a clean NestJS and TypeORM CRUD service that the later projects build on.
