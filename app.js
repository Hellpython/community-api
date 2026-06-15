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

app.get('/posts', async (req, res) => {
  // 쿼리스트링에서 page, limit 받기 (없으면 기본값)
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;   // ★ 앞에서 몇 개 건너뛸지

  try {
    const result = await pool.query(
      `SELECT posts.id, posts.title, posts.content, posts.created_at,
              users.nickname AS author
       FROM posts
       JOIN users ON posts.user_id = users.id
       ORDER BY posts.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // 전체 글 수 (총 몇 페이지인지 알려주려고)
    const countResult = await pool.query('SELECT COUNT(*) FROM posts');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: result.rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/posts/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT posts.id, posts.title, posts.content, posts.created_at,
              users.nickname AS author
       FROM posts
       JOIN users ON posts.user_id = users.id
       WHERE posts.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
}); 

app.put('/posts/:id', authRequired, async (req, res) => {
  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title, content는 필수입니다' });
  }

  try {
    const result = await pool.query(
      `SELECT user_id
       FROM posts
       WHERE posts.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다' });
    }

    if (result.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    const updateResult = await pool.query(
      `UPDATE posts
       SET title = $1, content = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, user_id, title, content, updated_at`,
      [title, content, req.params.id]
    );

    res.json(updateResult.rows[0]);
  
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.delete('/posts/:id', authRequired, async (req, res) => {

  try {
    const result = await pool.query(
      `SELECT user_id
      FROM posts 
      WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다' });
    }

    if (result.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }

    await pool.query(
      `DELETE FROM posts WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: '삭제되었습니다' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.post('/posts/:id/comments', authRequired, async (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content는 필수입니다' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO comments (post_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, post_id, user_id, content, created_at`,
      [req.params.id, req.userId, content]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.get('/posts/:id/comments', async (req, res) => {
  try {
      const result = await pool.query(
        `SELECT comments.id, comments.content, comments.created_at,
                users.nickname AS author
         FROM comments
          JOIN users ON comments.user_id = users.id
          WHERE comments.post_id = $1
          ORDER BY comments.created_at ASC`,
          [req.params.id]
        );

      res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류' });
  }
});

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));