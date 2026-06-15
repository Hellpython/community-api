# board-api

Express + PostgreSQL로 직접 만들고 **라즈베리파이에 배포·운영 중인** 게시판 REST API.
회원 인증부터 게시글·댓글 CRUD, 페이지네이션까지 구현하며 백엔드 기본기를 다진 프로젝트.

🔗 **Live**: https://board.ecowarden.systems/health

## 기술 스택
- **Node.js / Express**
- **PostgreSQL** (Docker)
- **인증**: JWT + bcrypt
- **배포**: Raspberry Pi + Docker Compose + Cloudflare Tunnel

## 주요 기능
- [x] 회원가입 (bcrypt 해싱)
- [x] 로그인 (JWT 발급)
- [x] 인증 미들웨어 (보호 라우트)
- [x] 게시글 CRUD + 작성자 본인만 수정/삭제 (401/403/404)
- [x] 댓글 작성/조회 (JOIN으로 작성자 표시)
- [x] 게시글 목록 페이지네이션 (page/limit)
- [x] 통일된 에러 응답 (404 + 중앙 에러 핸들러)
- [x] 배포 (홈서버 + Cloudflare 터널)

## API
| Method | Path | 설명 | 인증 |
|---|---|---|---|
| POST | `/auth/signup` | 회원가입 | - |
| POST | `/auth/login` | 로그인 (토큰 발급) | - |
| GET | `/posts` | 게시글 목록 (페이지네이션) | - |
| GET | `/posts/:id` | 게시글 상세 | - |
| POST | `/posts` | 게시글 작성 | ✅ |
| PUT | `/posts/:id` | 게시글 수정 (작성자) | ✅ |
| DELETE | `/posts/:id` | 게시글 삭제 (작성자) | ✅ |
| POST | `/posts/:id/comments` | 댓글 작성 | ✅ |
| GET | `/posts/:id/comments` | 댓글 목록 | - |

> API 서버라 브라우저로 `/` 접속 시 화면(프론트엔드)은 없음 — JSON 응답. `/health`, `/posts` 등으로 확인.

## DB 스키마
```
users    (id, email, password_hash, nickname, created_at)
posts    (id, user_id→users, title, content, created_at, updated_at)
comments (id, post_id→posts, user_id→users, content, created_at)

관계: user 1:N posts · post 1:N comments
```

## 로컬 실행
```bash
npm install
# .env 작성 (아래)
docker compose up --build
docker exec -i board-db psql -U board -d boarddb < src/db/schema.sql   # 첫 실행 시
```
`.env`:
```
DB_HOST=localhost
DB_PORT=5433
DB_USER=board
DB_PASSWORD=<your-password>
DB_NAME=boarddb
JWT_SECRET=<random-secret>
```
> `docker-compose.yml`은 Cloudflare 터널 네트워크(`iot-network`)에 연결되는 **배포 구성**이라, 순수 로컬 실행 시엔 networks 부분 조정 필요.

## 배포 구조
라즈베리파이(24시간 가동)에서 Docker Compose로 app + db 컨테이너 실행, **Cloudflare Tunnel**로 외부 공개.
cloudflared가 같은 도커 네트워크(`iot-network`)에서 컨테이너 이름(`board-api`)으로 직접 라우팅 → 호스트 포트 노출 없이 `board.ecowarden.systems` 서비스.

## 트러블슈팅 (직접 겪고 해결)
### 1. `localhost:5432`가 엉뚱한 DB로 연결됨
- 증상: `docker exec` psql은 되는데 Node에서 `role "board" does not exist`
- 원인: 호스트의 별도 postgres가 `127.0.0.1:5432`를 점유 → 더 구체적인 바인딩이 우선
- 해결: board-db를 5433으로 분리

### 2. 컨테이너 간 통신은 `localhost`가 아니다
- app 컨테이너 안의 `localhost`는 자기 자신 → db를 못 찾음
- 해결: 같은 compose 네트워크에서 **서비스 이름(`DB_HOST=db`)** 으로 통신

### 3. `.env` 없는 폴더에서 `compose up` → postgres 크래시
- 증상: `POSTGRES_PASSWORD` 빈 값으로 db가 `Exited(1)`
- 원인: compose는 *실행한 폴더*의 `.env`를 읽음 → 다른 폴더에서 실행해 빈 값
- 해결: 프로젝트 폴더에서 실행, `down -v`로 어중간한 볼륨 제거 후 재기동

### 4. Cloudflare 1033 에러
- 증상: DNS는 등록됐는데 `error code: 1033`
- 원인: 터널 `config.yml`에 ingress 규칙 누락 → 호스트명을 어디로 보낼지 모름
- 해결: ingress에 `board.ecowarden.systems → http://board-api:3000` 추가 후 cloudflared 재시작
```