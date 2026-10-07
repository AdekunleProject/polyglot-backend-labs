-- 1. Not-done todos with the owner's name, sorted by title
SELECT t.title, u.name
FROM todos t
JOIN users u ON t.user_id = u.id
WHERE t.is_done = false
ORDER BY t.title;

-- 2. Users who have no todos
SELECT u.name
FROM users u
LEFT JOIN todos t ON t.user_id = u.id
WHERE t.id IS NULL;

-- 3. Completed todos per user
SELECT u.name, COUNT(t.id) AS done_count
FROM users u
JOIN todos t ON t.user_id = u.id
WHERE t.is_done = true
GROUP BY u.name;