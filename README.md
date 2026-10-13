# Todo API

A REST API for managing todos, built with NestJS, TypeORM and PostgreSQL.

## Tech stack
- NestJS
- PostgreSQL 16 (Docker)
- TypeORM
- pnpm

## Getting started

1. Clone the repo and install dependencies:
```bash
   pnpm install
```
2. Start PostgreSQL in Docker:
```bash
   docker run --name pg-learn -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16
   docker exec -it pg-learn psql -U postgres -c "CREATE DATABASE todo_api;"
```
3. Copy `.env.example` to `.env` and fill in your values.
4. Run the app:
```bash
   pnpm start:dev
```

The API runs at `http://localhost:3000`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /todos | Create a todo |
| GET | /todos | List all todos |
| GET | /todos/:id | Get one todo |
| DELETE | /todos/:id | Delete a todo |
| PATCH | /todos/:id | Update a todo |