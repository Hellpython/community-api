CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname      VARCHAR(50)  NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),  
  title         VARCHAR(255) NOT NULL,
  content       TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);


CREATE TABLE comments (
  id            SERIAL PRIMARY KEY,
  post_id       INTEGER NOT NULL REFERENCES posts(id),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
