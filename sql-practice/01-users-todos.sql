-- create the user table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR (100) NOT NULL,
    email VARCHAR (150) UNIQUE NOT NULL
);

-- LINK todos user
ALTER TABLE todos ADD COLUMN user_id INTEGER REFERENCES users(id);

--ADD SOME USERS
INSERT INTO users (name, email) VALUE ('Ada', 'ada@example.com');
INSERT INTO users (name, email) VALUE ('Tunde' 'tunde@example.com')

-- Assign todos to users
UPDATE todos SET USER_id = 1 Where id = 1;
UPDATE todos SET USER_id = 2 Where id = 2;
