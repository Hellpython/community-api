# board-api

Express + PostgreSQL로 만든 게시판 REST API.
회원 인증부터 게시글·댓글까지 직접 구현하며 백엔드 기본기를 다지는 학습 겸 포트폴리오 프로젝트.

## 기술 스택
- **Node.js / Express**
- **PostgreSQL** (Docker)
- **인증**: JWT + bcrypt

## 주요 기능
- [x] 회원가입 (비밀번호 bcrypt 해싱)
- [x] 로그인 (JWT 발급)
- [x] 인증 미들웨어 (보호된 라우트)
- [x] 게시글 작성
- [ ] 게시글 조회 (목록·상세, JOIN으로 작성자 표시)
- [ ] 게시글 수정·삭제 (작성자 본인만)
- [ ] 댓글
- [ ] 페이지네이션 + 통일된 에러 응답
- [ ] 배포

## 실행 방법
```bash
# 1. 의존성 설치
npm install

# 2. .env 작성 (아래 값 참고)

# 3. DB 컨테이너 실행
docker compose up -d

# 4. 스키마 적용
docker exec -i board-db psql -U board -d boarddb < src/db/schema.sql

# 5. 서버 실행
node app.js   # http://localhost:3000
```

### 환경변수 (.env)
```
DB_HOST=localhost
DB_PORT=5433
DB_USER=board
DB_PASSWORD=<your-password>
DB_NAME=boarddb
JWT_SECRET=<random-secret>
```

## DB 스키마
```
users    (id, email, password_hash, nickname, created_at)
posts    (id, user_id→users, title, content, created_at, updated_at)
comments (id, post_id→posts, user_id→users, content, created_at)

관계: user 1:N posts · post 1:N comments
```

## API
| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | `/auth/signup` | 회원가입 | - |
| POST | `/auth/login` | 로그인 (토큰 발급) | - |
| POST | `/posts` | 게시글 작성 | 필요 |
| ... | | (조회·수정·삭제·댓글 추가 예정) | |

## 기록 / 트러블슈팅
### `localhost:5432`가 엉뚱한 DB로 연결됨
- **증상**: `docker exec`로 psql은 되는데, Node에서 쿼리 시 `role "board" does not exist`.
- **원인**: 호스트에 별도 postgres가 `127.0.0.1:5432`를 점유 중. board-db는 `*:5432`라, 더 구체적인 `127.0.0.1` 바인딩이 우선되어 Node가 board-db가 아닌 호스트 postgres로 연결됨.
- **해결**: board-db를 5433으로 분리 (`docker-compose.yml` `"5433:5432"`, `.env` `DB_PORT=5433`).
- **배운 점**: `localhost`가 항상 내 컨테이너로 간다는 보장은 없다. 같은 포트에 여러 바인딩이 있으면 더 구체적인 주소가 이긴다.
```
