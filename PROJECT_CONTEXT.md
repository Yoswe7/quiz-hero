# PROJECT_CONTEXT.md â€” Quiz Hero (CvSU Academic Assessment Platform)

Repository root: `D:\Soften Quizapp` (a git repo). Two package directories: `frontend/` (Next.js) and `backend/` (FastAPI). `docs/` holds markdown decision/status logs. `quiz-hero/` is an ignored nested clone of this same repo (see `.gitignore` â†’ "Submodules / Nested Clones") â€” do not build against it. Root also contains `start_*.bat`/`start_*.ps1` launchers and `vercel.json` (Vercel Services deployment: `frontend` + `backend` roots, rewrites API paths to the backend, everything else to the frontend). `.env*` files are git-ignored; **never copy their values anywhere**.

## 1. Project Overview & Tech Stack

Quiz Hero is an AI-powered assessment platform for Cavite State University (CvSU, Imus City Campus). Students sign in with a CvSU Google Workspace account, take assigned quizzes/assessments, get server-side grading, track progress, and do SM-2 spaced-repetition review. Teachers ("Faculty") generate quizzes with Gemini (from topic/PDF/image/text), review AI output, publish, assign to students or classrooms, and view a gradebook and rosters.

| Layer | Stack |
|---|---|
| Frontend | Next.js **16.3.3** (App Router, Turbopack), React **19.2.8**, TypeScript (`strict`), Tailwind CSS **v4** (CSS-first `@theme`), `@react-oauth/google` 0.13.5, `@tanstack/react-query` 5.x (60s staleTime), `framer-motion` 13, `next/font` (Geist, Geist_Mono, Syne 600), ESLint 9 flat config |
| Backend | Python **3.14** (`requires-python >=3.14`), FastAPI, SQLModel / SQLAlchemy 2.0 async, Alembic, Pydantic v2 + pydantic-settings, PyJWT (python-jose is pinned but unused), google-auth, `google-generativeai` (deprecated), redis (optional), Node-free/uv for deps |
| DB | SQLite for local dev (`backend/quiz_hero.db`, untracked). Default config targets Postgres via `postgresql+asyncpg://â€¦` â€” not what local dev uses. SQLModel `create_all` runs at boot; Alembic adds the rest |
| Auth | Google OIDC ID-token verification (hosted domain `@cvsu.edu.ph`) â†’ app-issued HS256 **JWT** (no refresh tokens/sessions on the server relevant to auth) stored in browser `localStorage` |
| External APIs | Google OAuth 2.0 / `accounts.google.com` ID-token certs; Google Gemini (`gemini-3.5-flash`, plus `gemini-3.1-flash-lite-preview` for chat) |
| Roles | `STUDENT`, `TEACHER` (plain strings in DB; `UserRole` enum only in backend model). Admin/teacher email whitelists elevate accounts to TEACHER |

No tests, no CI, no typecheck/format scripts exist anywhere in this repo.

## 2. Directory Structure

```
frontend/src/
  app/                              # App Router routes (all client components)
    page.tsx                          # / â€” public landing; redirects signed-in users (teacherâ†’/studio, else /dashboard)
    layout.tsx                        # Root: Google/Query/Auth providers, Geist/Syne fonts, metadata
    providers.tsx                     # QueryClient + GoogleOAuthProvider + AuthProvider
    developers/page.tsx               # /developers â€” public team page (components/shared/Developers)
    login/page.tsx                    # /login â€” auth page (GoogleLogin + fac-code); showDevBypass prop
    login/developers/page.tsx         # /login/developers - same, renders local student + faculty test-account bypasses
    (dashboard)/layout.tsx            # Auth gate shell (client-side role redirect) + faculty sidebar / student navbar
    (dashboard)/dashboard/page.tsx    # /dashboard â€” student assessment list (QuizBrowser)
    (dashboard)/student/page.tsx      # /student â€” near-duplicate of /dashboard
    (dashboard)/teacher/page.tsx      # /teacher â€” TeacherDashboard (view="generate")
    (dashboard)/studio/page.tsx       # /studio â€” duplicate of /teacher
    (dashboard)/studio/published/page.tsx   # published-assessments list view
    (dashboard)/studio/assigned/page.tsx    # assigned tracker + class creation (draft recovery)
    (dashboard)/studio/classes/page.tsx     # classroom + invite codes
    (dashboard)/studio/students/page.tsx    # roster per class
    (dashboard)/grades/page.tsx       # role-aware gradebook (Student + Teacher)
    (dashboard)/review/page.tsx       # SM-2 due-review UI
    (dashboard)/quiz/[id]/page.tsx    # quiz runner (QuizPlayer) / teacher printable answer key
  components/
    icons.tsx                         # 24 shared SVG icon components
    QuizBrowser.tsx                   # student assessment list + join-by-invite form
    auth/AuthView.tsx                 # presentational auth shell (mode/role flip, hero copy)
    shared/                          # "global, dumb" components: LandingPage, CvSUAuthModal, AIChatbot (Hero Bot), Developers
    *.tsx                             # 8 stubs containing only `// deleted` (dead; nothing imports them)
  features/
    assessment-engine/components/  # TeacherDashboard (~58KB), AssessmentEditorModal, TeacherQuizPreview
    quiz-player/components/        # QuizPlayer (full-screen runner), ResultsScreen (score + letter grade)
    gradebook/components/          # Gradebook (~20KB, role-aware)
  lib/api.ts                        # backend client (see Â§6); ApiError, fetchWithAuth, all endpoints
  lib/srs.ts                        # /srs client: fetchDueItems(), submitReview()
  lib/draftRecovery.ts              # localStorage draft read/write/clear for quizzes & class joins
  lib/auth/AuthContext.tsx          # auth state (user, token, login, logout, isLoaded)
  types/quiz.ts                     # shared TS interfaces (incl. StudentQuestion, "no answer" anti-DevTools DTO)
  globals.css                        # Tailwind v4 `@import "tailwindcss"` + `@theme` cvsu-* tokens
  (no middleware.ts anywhere)

backend/
  main.py                  # module-level FastAPI app; lifespan â†’ init_db() (SQLModel create_all); CORS + SessionMiddleware; include_router (no prefix); GET / health
  check_models.py          # standalone manual Gemini-connectivity script, not a test
  quiz_hero.db             # local SQLite DB (untracked)
  app/api/router.py        # api_router = APIRouter(); auth, quizzes, grades at root; chat with prefix="/chat"; srs (own prefix "/srs")
  app/api/dependencies.py # engine (sqlite vs postgres), get_db_session, get_current_user, get_optional_current_user, require_teacher/require_student, init_db()
  app/api/v1/auth.py       # /auth/dev/student, /auth/dev/teacher, /auth/google (+/api alias), /auth/me (+/api alias)
  app/api/v1/quizzes.py    # /generate-quiz, /publish-quiz, /quizzes(+/answers/publish/assign), /classrooms..., /faculty-assigned-assessments, /grade-answer
  app/api/v1/grades.py     # /submit-quiz, /progress, /grades, /grades/{id}
  app/api/v1/chat.py       # /chat (Hero Bot; optional auth)
  app/api/v1/srs.py        # /srs/due, /srs/items, /srs/{id}/review
  app/core/config.py       # Settings (env_file ".env"); get_model() → gemini-3.5-flash, JSON mode
  app/core/security.py     # create/decode HS256 JWT; verify_google_oauth_token (audience=GOOGLE_CLIENT_ID); google-auth cert fetch
  app/core/rate_limit.py   # @rate_limit decorator + gemini_concurrency_limit(); Redis or in-memory fixed window; per-IP or per-email
  app/core/exceptions.py   # handlers: custom errors; generic Exception â†’ 500 with str(exc) to client; reflects any Origin in error CORS headers
  app/crud/                # crud_user.py, crud_quiz.py, crud_submission.py
  app/services/            # quiz_service.py, ai_generator.py, ai_grader.py, srs_services.py, spaced_repetition.py (unused)
  app/models/              # user.py, quiz.py (Quiz/Question/Option), classroom.py (Classroom/ClassroomMembership), submission.py, srs.py (ReviewItem), review.py (dead; broken import, never imported)
  app/schemas/             # auth.py, quiz.py, srs.py, ai.py (pydantic request/response models)
  alembic/                 # versions/6 revisions: 46cffb70 initial (assumes pre-existing tables) â†’ â€¦ â†’ e0f1a2b3c4d5 (head; adds quizzes.review_status)

docs/                       # PROJECT_STATUS, TOFIX, ROADMAP, DECISIONS, BUGS, TESTING, TRANSFER_HANDOFF (partly stale), UX_NOTES
root                         # vercel.json, start_all.bat, start_backend.* / start_frontend.* (uvicorn 127.0.0.1:8000; npm/next dev :3000)
```

## 3. Architecture & Data Flow

```
Browser (Next.js, client components)
      â”‚  fetch(`${NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}<path>`)
      â”‚  Authorization: Bearer <localStorage.cvsu_token>  (fetchWithAuth)
      â–¼
FastAPI app (main.py, module-level, no global prefix) 
      â””â”€ Depends: get_db_session (AsyncSession) | get_current_user (HTTPBearer JWT)
          | require_teacher / require_student (role, case-insensitive .upper())
          | rate_limit(limit, window, authenticated=â€¦) / gemini_concurrency_limit()
      â–¼
app/services/*  â”€â”€ AI generation/grading/prompting â”€â”€â–º Gemini API
      â–¼
SQLModel (SQLAlchemy 2 async: aiosqlite local / asyncpg)
```

**Authentication (end-to-end):**
1. `GoogleLogin` (`hosted_domain="cvsu.edu.ph"`) returns an ID token credential.
2. Client POSTs `{credential, auth_mode, requested_role, faculty_code}` to `/api/auth/google` (`authenticateCvSUGoogle` in `lib/api.ts`).
3. Backend verifies the token (`verify_google_oauth_token`: audience, `email_verified`, `hd == cvsu.edu.ph`, cvsu email suffix unless admin). Lookup by `google_sub` â†’ `email`; profile/avatar refreshed on each login.
   - **signin**: unknown non-admin/non-teacher â†’ **404**. Whitelisted emails are forced to TEACHER.
   - **signup**: role = TEACHER if admin/whitelisted, else must present `faculty_code` matching `FACULTY_ACCESS_CODE` (constant-time compare), else STUDENT. Upsert never downgrades TEACHERâ†’STUDENT.
4. Returns `UserResponse{..., token}` (HS256 JWT, `expires_delta`: 7 days for Google auth, 2h dev-test). Claims: `user_id, email, role, sub`.
5. Frontend `AuthContext` stores `cvsu_token` + `cvsu_user` in localStorage; on reload it calls `GET /api/auth/me` to re-validate.
6. All authed API calls attach `Authorization: Bearer â€¦`. Server-side authorization = `role.upper()` checks in `dependencies.py`; **client-side role gating is a UX redirect only**.

**404 auto-recovery:** unknown Google account on sign-in â†’ 404 â†’ client caches the credential, flips to signup mode, reuses the same token ("Complete Registration").

**Deploy:** `vercel.json` = Vercel Services (`frontend` Next.js root, `backend` `main:app`); rewrites `/auth/*`, `/chat`, `/quizzes/*`, `/grades/*`, `/generate-quiz`, `/publish-quiz`, `/submit-quiz`, `/grade-answer` to backend; everything else â†’ frontend. Note rewrite list does **not** include `/srs/*` or `/progress` or `/classrooms/*`.

**Quiz answer keys never leave the server for students**: `GET /quizzes/{id}` uses `StudentQuestionRead` (id, question, options, quiz_type, section_name â€” no answer). Submit grading happens in `POST /submit-quiz` (exact match for MC/TF/Identification; Gemini fallback for Identification mismatch; AI grader for Open Ended).

## 4. Database Schema & Models

Engine is chosen from `DATABASE_URL` (`sqlite*` â†’ `check_same_thread=False, timeout=15`). Tables in `app/models/` (SQLModel):

| Model (table) | Key fields | Notes / relationships |
|---|---|---|
| `User` (`users`) | `id int PK`; `google_sub str unique`; `google_id str?` (legacy); `email str unique`; `name str default ""`; `full_name str?` (legacy); `avatar_url str?`; `picture_url str?` (legacy); `role str default "STUDENT"`; `created_at/updated_at` server_default now | No ORM relationships. Other tables FK its `email` / `google_sub` |
| `Quiz` (`quizzes`) | `id str PK (uuid4[:8])`; `topic`; `quiz_type`; `question_count`; `created_by_email str? idx` FKâ†’`users.email`; `course_code/class_section str? idx`; `classroom_id str? idx/FK`; `available_from/due_at DateTime(tz)`; `assigned_student_emails list[str] JSON`; `is_assigned bool`; `review_status str idx default "draft"`; `created_at` | `questions` â†’ cascade delete-orphan (Options cascade too). Assignments stored as JSON list or classroom link |
| `Question` (`questions`) | `id PK`; `quiz_id str FKâ†’quizzes.id`; `question_text`; `quiz_type`; `section_name?`; `answer str`; `order_index int` | `options` â†’ delete-orphan |
| `Option` (`options`) | `id PK`; `question_id int FKâ†’questions.id`; `option_text`; `order_index` | |
| `Submission` (`submissions`) | `id PK`; `student_name`; `student_email idx`; `quiz_id str idx/FK`; `topic`; `score float`; `total_questions int`; `percentage float`; `answers list[dict] JSON`; `created_at` | No `by_role` FK; written only by `/submit-quiz` |
| `ReviewItem` (`review_items`) | `id UUID PK`; `user_email`; `item_key` (key format `quiz:{qid}:question:{id}`); `repetitions int 0`; `interval_days 0`; `easiness 2.5`; `last/next_review_at`; `quality_history JSON`; `created_at` | SM-2. No FK/index declared at model level; migration adds both indexes |
| `Classroom` (`classrooms`) | `id str PK (uuid4[:8])`; `name`; `course_code/class_section str? idx`; `invite_code str unique idx (8 random `[A-Z0-9]`)`; `created_by_email str idx FK`; `is_active bool`; `created_at` | |
| `ClassroomMembership` (`classroom_memberships`) | `id PK`; `classroom_id str FKâ†’classrooms.id`; `student_email`; `joined_at` | via `get/is member` in `crud_quiz.py` |

Alembic chain (head = `e0f1a2b3c4d5`): `46cffb70f4e7` initial (**assumes users/quizzes/submissions already exist**; converts created_at to tz-aware, adds quizâ†’user email FK, drops legacy `quizzes.questions` JSON) â†’ `a1b2c3d4e5f6` users google_sub/name/avatar/updated_at â†’ `b7c8d9e0f1a2` review_items â†’ `c8d9e0f1a2b3` quizzes course/section/due/assignments â†’ `d9e0f1a2b3c4` classrooms + visibility (idempotent via inspector) â†’ `e0f1a2b3c4d5` quizzes.review_status. Dead model `QuestionReview` (`app/models/review.py`) has a broken import (`from dateTime import â€¦`) and no migration. `UserRole(str, Enum)` exists; other role/status fields are free strings.

## 5. Backend API & Services

**Routes** (mounted at root; `/api/*` aliases exist only for auth; `v1` dir name is *not* in any URL). Deps: `G`=get_current_user, `T`=require_teacher, `S`=require_student. Rate limits in parentheses.

| Route | Auth | Purpose |
|---|---|---|
| `GET /` | public | health |
| `POST /auth/dev/student` | none (+5/60 IP) | local test student login; 404 unless `ENVIRONMENT != production` and `ENABLE_LOCAL_TEST_AUTH=true` |
| `POST /auth/dev/teacher` | none (+5/60 IP) | local test **faculty** login (upserts `local.teacher@cvsu.edu.ph` as TEACHER; JWT role TEACHER); same guard |
| `POST /auth/google` `/api/auth/google` | none (+10/60) | Google signin/signup (see Â§3) |
| `GET /auth/me` `/api/auth/me` | G | current user (no token in body) |
| `POST /generate-quiz` | T (+5/60) | AI quiz generation only; does **not** persist |
| `POST /publish-quiz` | T (+10/60) | AI generate â†’ **draft** (`review_status="draft"`); teacher-only; requires assignment target |
| `GET /quizzes` | G | visibility-filtered list (students: published + class/assigned + within availability) |
| `GET /quizzes/{id}` | G | student-safe detail (no answers); `available_from` declared on the response schema (Plan 2 fix) |
| `PUT /quizzes/{id}` | T + owner | rewrite topic/questions/options |
| `DELETE /quizzes/{id}` | T (**no ownership check**) | delete quiz + cascade |
| `POST /quizzes/{id}/publish` | T + owner | approve: `review_status` â†’ `published` |
| `POST /quizzes/{id}/assign` | T (**no ownership check**) | append to `assigned_student_emails` JSON |
| `GET /quizzes/{id}/answers` | T + owner | full answer key |
| `POST /classrooms` | T | create; returns `invite_code` |
| `GET /classrooms` | G | teacher: own; student: joined via memberships |
| `POST /classrooms/join` | S | join by invite code (idempotent) |
| `GET /classrooms/{id}/members` | T + owner | roster + per-student completion |
| `GET /faculty-assigned-assessments` | T | own published quizzes with pending assignees |
| `POST /grade-answer` | G (+30/60) | AI-grade a single open answer |
| `POST /submit-quiz` | G (+10/60) | **server-side exclusive grading**; creates Submission + seeds SRS items; returned `answers[]` include correct answers |
| `GET /progress` | G + **S only** | dashboard aggregates (per-topic mastery, streak, SRS retention, recommendations) |
| `GET /grades` | G | submissions; teachers reach the teacher-wide listing (role normalized to lowercase at the route boundary, Plan 2) |
| `DELETE /grades/{id}` | T (**no ownership/link check**) | delete submission |
| `POST /chat` | optional G (+20/60) | Hero Bot (Gemini, 30s timeout, 10-message history) |
| `GET /srs/due` `POST /srs/items` `POST /srs/{item_id}/review?quality=0..5` | S (+owner) | SM-2; item keys `quiz:{quiz_id}:question:{question_id}` |

**Services** (`app/services/`): `quiz_service.py` (`validate_source_payload`: 20 MB file / 100k chars text, mime whitelist PDF/JPEG/PNG/WebP; `publish_quiz_workflow`: 400 unless assigned target, AI-generates draft). `ai_generator.py` (`generate_quiz(...)`, topic/file/text sources, `Mixed Assessment` sections with roman-numeral parts, `MAX_GENERATION_ATTEMPTS=3`, temperature-0, JSON-mode output validated in-place). `ai_grader.py` (`grade_open_answer`: normalized exact match â†’ Identification match â†’ Gemini; fallback substring check). `srs_services.py` (`get_due_items`, `create_or_get_item`, `apply_sm2` with quality 0â€“5, appends `{ts,q}` to `quality_history`). `spaced_repetition.py` â€” dead; routes use `srs_services`. **CRUD:** `crud_user.py` (whitelists, upsert unused), `crud_quiz.py` (assignments, visibility, delete/update), `crud_submission.py`. **Middleware/deps:** `rate_limit.py` (fixed-window; per-IP when anonymous, per-email when `authenticated=True`; Redis (`REDIS_URL` keys `quiz-hero:rate-limit:` / `gemini-concurrency:`) or in-memory with 10k cap; Redis errors â†’ 503 in prod, memory fallback otherwise; production boot **fails** without `REDIS_URL` when `RATE_LIMIT_ENABLED`). `exceptions.py` (`QuizGenerationError`/`AIGradingError` â†’ 500, `AuthenticationError` â†’ 401, generic `Exception` â†’ 500 echoing `str(exc)`; error responses reflect returned `Origin` with `Allow-Credentials: true` / `*`). Rate-limit deps imported at route-registration time.

Gemini client: `google-generativeai`, JSON output; 3-attempt retry with previous-error feedback. **Deprecation warning for this SDK on import.**

## 6. Frontend Architecture

**Routes by role:** public = `/`, `/developers`, `/login`, `/login/developers`. Student = `/dashboard`, `/student`, `/quiz/[id]`, `/review`. Teacher = `/studio`, `/studio/*`, `/teacher`. Shared = `/grades`. `(dashboard)/layout.tsx` is a **cosmetic client-side guard** (unauthed â†’ `/login`; cross-role â†’ own landing); it can flash content and is not a security boundary.

**API layer** â€” `lib/api.ts`:
- `API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"`.
- `fetchWithAuth(url, opts)`: attaches `Authorization: Bearer <localStorage["cvsu_token"]>`, forces JSON headers + `cache: "no-store"`, on non-OK throws **plain `Error`** (no status â€” callers cast to `ApiError`, so `/submit-quiz`'s status handling relies on `authenticateCvSUGoogle`, not this path).
- `ApiError extends Error { status }`; `authenticateCvSUGoogle()` throws it with real status (drives the 404â†’signup flow). Duplicate registration means `/api/auth/google` and `/auth/google` both work.
- Endpoints: `POST /publish-quiz` `/grade-answer` `/submit-quiz` `/grade-answer`, `GET /quizzes /classrooms /quizzes/{id} /quizzes/{id}/answers /grades /progress /faculty-assigned-assessments`, `PUT /quizzes/{id}`, `DELETE /quizzes/{id}`, `POST /classrooms /classrooms/join /quizzes/{id}/publish /quizzes/{id}/assign`, `POST /chat` (35s AbortController), plus SRS (`/srs/due`, `/srs/{id}/review`) and `/api/auth/*`.

**Auth state** (`lib/auth/AuthContext.tsx`, only file in `lib/auth/`): `{ user, token, isLoaded }`; on mount reads localStorage; `login()` writes `cvsu_token`+`cvsu_user` JSON; `logout()` clears; `/api/auth/me` re-validation on reload. **Token in JS-accessible localStorage** (not httpOnly). `user` role drives landing redirects and role-check casing is inconsistent across the codebase (`.toUpperCase()==="TEACHER"` vs `.toLowerCase()==="teacher"`).

**State / caching:** React Query (`["quizzes"]`, gradebook, classrooms, progress, SRS) â€” staleTime 60s. Drafts (quiz progress, class-join, quiz form) in localStorage keys like `quiz-hero:draft:quiz:{email}:{quizId}` via `lib/draftRecovery.ts`.

`components/auth/AuthView.tsx` is the presentational login shell (now fully controlled by parent props; mode/role initialize from the URL via useSearchParams inside Suspense-wrapped page, Plan 1).

Styling: Tailwind **v4 CSS-first** â€” no live config; `@theme` in `globals.css` defines `--color-cvsu-green/dark/gold/light/vibrant`; those drive `bg-cvsu-*` utilities. `tailwind.config.ts` exists but is inert and contradicts the `@theme` hexes. `globals.css` also defines `.login-mesh-bg`, `.spring-transition`, `.btn-tactile`, etc. `.skeleton` class is used but never defined. `/exam.jpg` (3.2 MB, `frontend/public/`) is a CSS background on the auth screen.

## 7. Environment Variables & Local Setup

Names only (never copy values). `.env` (backend), `.env.local` (frontend) are git-ignored.

| Variable | Service | Controls |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | frontend | Backend base URL; falls back to `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | frontend | GoogleOAuthProvider clientId; missing â†’ providers pass `""` and `CvSUAuthModal` shows "Google Client ID Configuration Needed" prompt |
| `ENVIRONMENT` | backend | `development`\|`production`; production + no-redis â†’ boot fails |
| `DATABASE_URL` | backend | SQLAlchemy async URL; SQLite locally, `postgresql+asyncpg://` default |
| `GEMINI_API_KEY` | backend | Gemini SDK key (missing â†’ chat 500; `get_model()` still constructs) |
| `GOOGLE_CLIENT_ID` | backend | Google ID-token audience |
| `JWT_SECRET` | backend | HS256 secret. Default is **random per boot** (invalidates sessions on restart; SessionMiddleware reuses it) |
| `JWT_ALGORITHM` | backend | `HS256` default (declared; only HS256 used) |
| `JWT_EXPIRE_MINUTES` | backend | declared (10080, 7 days); unused â€” expiry is passed per-call |
| `ENABLE_LOCAL_TEST_AUTH` | backend | required true for `/auth/dev/student` and `/auth/dev/teacher` (backend always 404s them in `ENVIRONMENT=production`) |
| `ADMIN_EMAILS` | backend | comma-separated list â†’ TEACHER privilege + bypasses hd/faculty-code |
| `TEACHER_EMAILS` | backend | comma-separated list â†’ TEACHER privilege |
| `FACULTY_ACCESS_CODE` | backend | teacher signup secret (a default fallback string is hardcoded in `config.py` and duplicated in `auth.py` â€” do not rely on it) |
| `CORS_ORIGINS` | backend | allowlist for CORSMiddleware |
| `REDIS_URL` | backend | rate-limit/gemini concurrency backend; prod boot requires it |
| `RATE_LIMIT_ENABLED` | backend | master toggle (default true; prod+false requires redis) |
| `GEMINI_MAX_CONCURRENT_PER_USER` | backend | per-identity semaphore cap (default 2) |

Also referenced (secondary/legacy): `JWT_SECRET` reused by SessionMiddleware; `google generativeai` SDK env via `GEMINI_API_KEY`.

**Local setup:**
```bash
# Frontend
cd frontend; npm install; npm run dev       # http://localhost:3000
npm run build                                # production build (also the only typecheck)
npm run lint                                 # eslint flat config

# Backend
cd backend; uv sync                          # or: uv run uvicorn main:app --reload
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000
uv run alembic upgrade head                  # / uv run alembic revision --autogenerate

# Root (Windows): start_all.bat / start_backend.ps1 / start_frontend.ps1
```
Local expected URLs: frontend `http://localhost:3000`, backend `http://127.0.0.1:8000`. `backend/quiz_hero.db` is the local DB (untracked; do not read/commit). **No test runner, no migration CI** â€” manual smoke checklist lives in `docs/TESTING.md`.

## 8. Conventions, Constraints & Gotchas

**Conventions (per repo docs; mostly followed):** incremental changes only; no rewrites. Student/teacher flows stay isolated in their domain dirs; share only `types/`, `lib/`, `components/shared/`. Server-side source of truth for authorization; backend deps `get_current_user` / `require_teacher` / `require_student`. Quiz answer keys must not be sent to students before submission; submissions are graded server-side. `StudentQuestion` DTO / `StudentQuestionRead` schema for anti-DevTools. `features/<domain>/components/â€¦` naming. `@cvsu.edu.ph` enforced on both ends (Google `hd` + backend suffix check + @cvsu.edu.ph schema validation for assignment lists). No TODO/FIXME markers in code.

**Gotchas / fragile areas (current HEAD):**

Build / tooling
- RESOLVED (Plan 1): `AuthView.tsx` is fully controlled by the parent (no internal mode/role state, no effect-driven URL sync). Suspense wraps `useSearchParams` in `app/login/page.tsx`; `npm run build` prerenders `/login` and `/login/developers`.
- No tests, CI, Prettier, `typecheck`/`test` npm scripts. `eslint` fails on `AuthView.tsx` (`react-hooks/set-state-in-effect` â€” same effect drives the URLâ†’state sync); `page.tsx` also trips `@typescript-eslint/no-explicit-any`.
- `tailwind.config.ts` is inert/mismatched vs `@theme`; `.skeleton` class undefined.

Routes / state
- Path prefix inconsistency: only auth uses `/api/â€¦`; everything else is at server root (`/quizzes`, `/progress`, `/srs/*`, `/publish-quiz` â€¦). `vercel.json`'s rewrite list does **not** include `/srs/*`, `/classrooms/*`, `/progress`, `/faculty-assigned-assessments` â€” deployment via that config breaks those.
- RESOLVED (Plan 1): `authMode`/`selectedRole` now live solely in the login page (initialized from the URL). The 404 sign-in recovery flips AuthView to the signup tab, and `?role=teacher` reaches the parent so faculty registration actually registers as TEACHER.
- `LandingPage` accepts `onOpenAuth?` but never uses it; the auth CTA is a hard `window.location.href` navigation (full page reload). The `CvSUAuthModal` branch in `app/page.tsx` is effectively dead. `/dashboard`â‰¡`/student`, `/teacher`â‰¡`/studio` duplicates.

Backend defects
- **Security-ish:** `DELETE /quizzes/{id}` and `POST /quizzes/{id}/assign` have **no ownership check** (unlike PUT/publish/answers); `DELETE /grades/{submission_id}` (teacher) has none either. Any teacher can delete/assign arbitrary quizzes/submissions.
- RESOLVED (Plan 2): `/grades` route lowercases `current_user.role` before calling `get_submissions_by_role` (the helper compares `role == "teacher"`), so teachers get the teacher-wide listing; students still see only their own. Note: the case-mismatch is patched at the call site, not inside the CRUD helper (left per scope).
- RESOLVED (Plan 2): `StudentQuizDetailResponse` declares `available_from` (serialized through); no answer-key fields were added.
- Faculty-code fallback is hardcoded in `config.py` and duplicated in `auth.py`; default `JWT_SECRET` random per boot; default `ADMIN/TEACHER_EMAILS` is a personal address; `exceptions.py` reflects any Origin and returns `str(exc)`; `quiz_service.publish_quiz_workflow` crashes (TypeError â†’ 500) if `question_count` is None; quiz/classroom IDs are 8-char truncated UUIDs (collision-prone).
- `datetime.utcnow()` (naive, deprecated) is mixed with tz-aware columns (`ReviewItem.next_review_at`, created_at) â†’ naive/aware comparisons in `/progress` and SRS due queries; "streak" counts only submission dates (review activity excluded); retention = % of repsâ‰¥3 items, not a recall metric; `question_reviews` dead model.
- `delete_quiz` manual cascade; `delete_submission` no ownership; `upsert_user`/`create_quiz`/`spaced_repetition.py`/`QuizSummaryResponse`/`GradeResult` defined-unused.
- `init_db()` (`create_all`) at boot masks Alembic; initial migration assumes tables exist; `review_status` server_default `'published'` in migration vs `'draft'` in model.
- `/grade-answer` ignores quiz ownership/context; `/classrooms` returns ORM objects directly; classroom/student emails stored with un-normalized casing while queries compare lowercase.
- Rate limiting: in-process, per-worker, non-shared without `REDIS_URL`; Redis config read at import.

Security / data
- JWT in JS `localStorage` (XSS-stealable); `cvsu_user` written but never read. Error responses leak internals. `/login/developers` ships dev bypass; backend still enforces `ENVIRONMENT != production && ENABLE_LOCAL_TEST_AUTH`, so it's defense-in-depth loss, not (by itself) a full break. No server-side route protection anywhere: all role gating is client-side.
- localStorage draft keys embed emails (PII on shared machines).

Hygiene
- Docs drift: `docs/TRANSFER_HANDOFF.md` says SRS is "uncommitted" but it is committed (HEAD `b9b45d0`); `AGENTS.md` documents `features/*/{hooks,api,utils}` and `components/{ui,layout}` which **do not exist**; `frontend/README.md` is create-next-app boilerplate; `backend/README.md` empty; `.gitignore` lists `backend/.env.example`; `quiz-hero/` nested clone.
- Working tree artifacts: `.next/` exists but is git-ignored; 8 `// deleted` stub files in `components/` and `src/context/` remain as import-safe dead code; `.skeleton` utility used in loading placeholders is never defined.

Keep `npm run build` green and `uv run alembic upgrade head` as the smoke checks; there is no other safety net.
