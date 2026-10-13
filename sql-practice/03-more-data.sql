INSERT INTO users (name, email) VALUES ('Chidi', 'chidi@example.com');

INSERT INTO todos (title, user_id) VALUES ('Read about indexes', 3);
INSERT INTO todos (title, user_id) VALUES ('Practice JOINs', 3);

-- A todo with no owner, to see the JOIN vs LEFT JOIN difference
INSERT INTO todos (title) VALUES ('Orphan todo');