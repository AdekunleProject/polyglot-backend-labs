<!-- Why each choice
content is TEXT, not VARCHAR(200). A title is short, but a note’s body can be any length. TEXT has no limit.
user_id is the foreign key. It is the pointer to users(id), the same idea as the user_id you added to todos. The database will refuse a note that points to a user who doesn’t exist.
NOT NULL on user_id. In todos, orphans were allowed. A note without an author makes no sense, so here we forbid it.
The query is your todos query with the names swapped: todos became notes, t became n, and t.title became n.title. The JOIN ... ON n.user_id = u.id line matches each note to its author.
Where TypeORM comes in

Later, you won’t run the CREATE TABLE statements yourself. You’ll write two entity classes, and TypeORM builds these same tables from them. The SQL above is the plan those entities must match. -->



# Notes API design

## users
- id: integer, primary key, auto-counting
- name: varchar(100), required
- email: varchar(150), required, unique

## notes
- id: integer, primary key, auto-counting
- title: varchar(200), required
- content: text, required
- created_at: timestamp, defaults to now
- user_id: integer, required, foreign key -> users(id)

## Relationship
One user has many notes. Each note belongs to exactly one user.

## SQL equivalent
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL
);

CREATE TABLE notes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  user_id INTEGER NOT NULL REFERENCES users(id)
);
```

## Query: every note with its author's name
```sql
SELECT n.title, u.name
FROM notes n
JOIN users u ON n.user_id = u.id;
```