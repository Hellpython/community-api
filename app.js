const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();
app.use(express.json()); // JSON 요청 본문 파싱

// Authorization 헤더의 토큰을 검증하는 미들웨어
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;      // "Bearer eyJ..."
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId; // ★ 검증된 사용자 id를 요청에 심음
    next();                      // 통과 → 다음 핸들러로
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
  }
}

// 서버 살아있나 확인용
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));

const pool = require('./src/db/pool');

// DB 연결 확인용
app.get('/db-check', async (req, res) => {
  const result = await pool.query('SELECT NOW()');
  res.json({ now: result.rows[0].now });
});

const bcrypt = require('bcrypt');

app.post('/auth/signup', async (req, res) => {
  const { email, password, nickname } = req.body;

  // 입력 검증
  if (!email || !password || !nickname) {
    return res.status(400).json({ error: 'email, password, nickname는 필수입니다' });
  }

  try {
    // 비밀번호는 원문 저장 금지 → 해시만 저장
    const passwordHash = await bcrypt.hash(password, 10);

    // ★ 파라미터화 쿼리 ($1,$2,$3) — SQL 인젝션 방지
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, nickname)
       VALUES ($1, $2, $3)
       RETURNING id, email, nickname, created_at`,
      [email, passwordHash, nickname]
    );

    res.status(201).json(result.rows[0]); // ★ password_hash는 반환 안 함
  } catch (err) {
    if (err.code === '23505') { // UNIQUE 위반 = 이메일 중복
      return res.status(409).json({ error: '이미 가입된 이메일입니다' });
    }
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email, password는 필수입니다' });
  }

  try {
    // 1) email로 유저 찾기
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0]; // 없으면 undefined

    // 2) 유저 없음 / 비번 틀림 → 똑같은 401 (어느 쪽인지 안 알려줌 = enumeration 방지)
    if (!user) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    // 3) 토큰 발급 (1시간 유효)
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/posts', authRequired, async (req, res) => {  // ★ authRequired 통과해야 도달
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title, content는 필수입니다' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts (user_id, title, content)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, title, content, created_at`,
      [req.userId, title, content]   // ★ user_id는 토큰에서 (req.body 아님!)
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});