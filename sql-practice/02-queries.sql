-- All todos with their owner's name
SELECT t.title, u.name
FROM todos t
JOIN users u ON t.user_id = u.id;

-- Keep todos even if they have no owner
SELECT t.title, u.name
FROM todos t
LEFT JOIN users u ON t.user_id = u.id;

-- How many todos does each user have?
SELECT u.name, COUNT(t.id) AS todo_count
FROM users u
LEFT JOIN todos t ON t.user_id = u.id
GROUP BY u.name;