const { Pool } = require('pg');
require('dotenv').config();

// DB 연결 풀 — 매 요청마다 새로 연결하지 않고 재사용
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;