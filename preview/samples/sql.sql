-- One universal rule set also colours SQL.
CREATE TABLE IF NOT EXISTS users (
  id       INTEGER PRIMARY KEY,
  email    TEXT UNIQUE NOT NULL,
  name     TEXT,
  score    INTEGER DEFAULT 0,
  -- metadata columns
  created  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (email, name, score) VALUES
  ('ana@example.com', 'ana', 10),
  ('bob@example.com', 'bob', 25);

SELECT name, score
FROM users
WHERE score >= 10 AND email LIKE '%example.com'
ORDER BY score DESC, name ASC
LIMIT 5;

UPDATE users SET score = score + 1 WHERE id IN (1, 2, 3);
-- DELETE FROM users WHERE email = 'x@example.com';
