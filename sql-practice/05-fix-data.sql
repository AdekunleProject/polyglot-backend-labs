-- Give the orphan done todos to a user
UPDATE todos SET user_id = 1 WHERE id IN (4, 5);

-- Give Chidi a not-done todo and Ada a not-done todo
INSERT INTO todos (title, is_done, user_id) VALUES ('Practice JOINs', false, 3);
INSERT INTO todos (title, is_done, user_id) VALUES ('Read about indexes', false, 1);