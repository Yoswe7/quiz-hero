# Audit

## Backend Audit

Scope: read-only audit of `backend/` on 2026-11-24. No source/config/DB files were modified. I inspected app entrypoints, config, dependencies, models, schemas, CRUD, routers, services, Alembic env/migrations, and dependency manifests. I ran safe checks only: `python -m compileall -q backend/app` (no output), and `alembic check`/`alembic upgrade head` against a temporary SQLite DB with `PYTHONPATH` set to `backend`.

### Confirmed Issues

- [x] **B1 [Critical] `backend/app/core/config.py:8-145`, `backend/app/services/llm_router.py:304,560-561`, `backend/app/api/v1/chat.py:22`** — `GEMINI_API_KEY` is missing from `Settings`, but code reads `settings.GEMINI_API_KEY`. With Pydantic Settings this undeclared field access raises `AttributeError`, breaking `get_client()`, Gemini router paths, and chat provider preflight before a useful error is returned. Smallest fix: add `GEMINI_API_KEY: str = ""` to `Settings` and keep all reads on that declared field.

- [x] **B2 [Critical]><|end|><|start|>assist to=edit<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="path">
D:\Soften Quizapp\docs\AUDIT.md `backend/app/api/v1/faculty_attempts.py:17-146`** — Faculty attempt endpoints lack quiz ownership authorization. `GET /quizzes/{quiz_id}/attempts` returns submissions for any quiz ID without verifying the current teacher owns the quiz, and `PATCH /attempts/{attempt_id}/grade` allows any teacher to grade/override any submission by ID. This is a cross-teacher data leak and unauthorized grade mutation. Smallest fix: load the related `Quiz`, enforce `quiz.created_by_email.lower() == current_user.email.lower()` for both endpoints, and return 403/404 when unauthorized.

- [x] **B3 [High] `backend/app/api/router.py:10-11`, `backend/app/api/v1/faculty_attempts.py:14`, `backend/app/api/v1/faculty_retakes.py:10`** — Faculty routers are mounted with a double `/faculty` prefix. Each child router declares `prefix="/faculty"` and `api_router.include_router(...)` also passes `prefix="/faculty"`, so routes resolve as `/faculty/faculty/...` instead of `/faculty/...`. Smallest fix: keep the prefix in only one place (prefer removing it from the child routers and leaving it in `router.py`).

- [x] **B4 [High] `backend/app/api/v1/quizzes.py:529-565`, `backend/app/crud/crud_quiz.py:119-163`** — Quiz assignment and deletion endpoints lack ownership checks. Any authenticated teacher can assign students to any quiz (`POST /quizzes/{quiz_id}/assign`) or delete any quiz (`DELETE /quizzes/{quiz_id}`) because the handlers do not verify `quiz.created_by_email` against `current_user.email`. Smallest fix: fetch the quiz and enforce owner match before calling assign/delete; return 403/404 for non-owners.

- [x] **B5 [High] `backend/app/api/v1/grades.py:130-159`, `backend/app/models/submission.py:23-42`, `backend/app/api/v1/faculty_attempts.py:65-142`** — Submission scoring fields are inconsistent: submit creates `Submission` with `score=calculated_score` but never sets `raw_score`. `raw_score` defaults to `0.0`, and `final_score` returns `adjusted_score if adjusted_score is not None else raw_score`, so unadjusted submissions report incorrect raw/final scores to faculty views. Smallest fix: set `raw_score=calculated_score` (and keep `score` only for compatibility if needed); consider backfilling existing rows where `raw_score == 0` and `score` is populated.

- [x] **B6 [High] `backend/app/api/v1/grades.py:33-159`, `backend/app/api/v1/quizzes.py:369-377`** — Retake policy is not enforced on submission. `/quizzes/{id}/start` blocks when a submission exists and `allow_retakes` is false, but `/submit-quiz` never checks existing submissions or `quiz.allow_retakes`; a client can bypass start and submit directly. Smallest fix: in `submit_quiz`, query existing submission(s) for `quiz_id + student_email`; if one exists and `not official_quiz.allow_retakes`, return 403.

- [x] **B7 [High] `backend/app/api/v1/grades.py:49-53`, `backend/app/crud/crud_quiz.py:78-108`** — Student submission does not verify that the quiz is published. `submit_quiz` checks `quiz_is_visible_to_student()` for students, but `quiz_is_visible_to_student()` only enforces assignment/class membership and availability window; it does not check `review_status == "published"`. Draft/unreviewed quizzes assigned to a student can be submitted directly. Smallest fix: add `if current_user.role.upper() == "STUDENT" and official_quiz.review_status != "published": raise HTTPException(403, ...)` in `submit_quiz`, or include review status in visibility checks.

- [x] **B8 [High] `backend/app/models/review.py:1`** — `QuestionReview` has an invalid import: `from dateTime import date, datetime`. Importing the module fails with `ModuleNotFoundError: No module named 'dateTime'` (verified with `python -c "from app.models.review import QuestionReview"`). Smallest fix: change to `from datetime import date, datetime`.

- [x] **B9 [High] `backend/alembic/versions/46cffb70f4e7_initial_schema.py:22-45`** — Initial migration is not runnable on a fresh database. It uses `batch_alter_table('quizzes'/'submissions'/'users')` but never creates these tables. Running `alembic upgrade head` on a temporary empty SQLite DB failed with `sqlalchemy.exc.NoSuchTableError: quizzes` at this migration. Smallest fix: replace/fix the initial migration so it creates the base schema (or add a proper base migration before this alter migration) and regenerate/validate the migration chain against an empty DB.

- [x] **B10 [Medium] `backend/app/api/v1/grades.py:290-300`, `backend/app/crud/crud_submission.py:20-27`** — Submission deletion lacks ownership/scope authorization. Any teacher can delete any submission by ID because the endpoint only requires `require_teacher` and `delete_submission()` deletes by primary key. Smallest fix: load the submission, verify the teacher owns the related quiz (or enforce an explicit admin policy), then delete; otherwise return 403/404.

- [x] **B11 [Medium] `backend/app/crud/crud_quiz.py:140-163`, `backend/app/models/quiz.py:61-71`** — Quiz deletion does not remove `QuizSession` rows. `QuizSession.quiz_id` is a foreign key to `quizzes.id` with no cascade, but `delete_quiz()` deletes submissions/options/questions/quiz only. Deleting a quiz that has sessions can fail on FK-enforcing databases. Smallest fix: delete `QuizSession` rows for the quiz before deleting the quiz (and consider cleaning orphaned `ReviewItem` rows keyed by `quiz:{id}:question:{id}`).

- [x] **B12 [Medium] `backend/app/api/v1/chat.py:22`** — Chat provider preflight only checks `GEMINI_API_KEY`, `GROQ_API_KEY`, or `OPENROUTER_API_KEY`. If only NVIDIA/Gonkaro keys are configured, the endpoint returns 500 "No AI provider is configured..." even though the router supports those providers. Smallest fix: include `settings.NVIDIA_API_KEY` and `settings.GONKARO_API_KEY` in the configured-provider check.

- [x] **B13 [Medium] `backend/app/services/ai_generator.py:153,173-297`** — Dead/legacy PDF extraction helpers reference undefined names (`pdfium`, `PdfReader`, `MAX_PDF_PAGES`, `MAX_IMAGES_PER_REQUEST`, `MAX_DOCUMENT_TEXT_CHARS`, `settings`, `GROQ_MAX_IMAGE_BYTES`). The module currently imports in Python 3.14 (verified), but invoking these helpers would raise `NameError`, and they create a latent maintenance/runtime hazard. Smallest fix: remove the dead helpers since `llm_router` handles extraction, or make them import-safe with required imports/constants and tests.

### Needs Manual Verification

- [x] **B14 [Medium] `backend/app/api/v1/grades.py:55-143`, `backend/app/api/v1/quizzes.py:353-410`** — Time-limit enforcement is incomplete for missing-session and timed-out submissions. `submit_quiz` only marks timeout when a timed quiz has an existing `QuizSession`; if no session exists, submission can proceed without server-side timer evidence. Timed-out submissions (>`expires_at + 15s`) are marked `timed_out=True` but still fully graded and stored. Verify intended product policy. Smallest fix: require/create a server session for timed quizzes and enforce a clear accept/reject/zero-score policy for late submissions.

- [x] **B15 [Medium] `backend/app/api/dependencies.py:112-114`, `backend/main.py:12-15`** — Startup runs `SQLModel.metadata.create_all()`. In Alembic-managed environments this can mask migration drift or diverge from migration state. Verify deployment expectations. Smallest fix: gate `create_all` to local/dev/test only when Alembic is the source of truth in production.

- [x] **B16 [Medium] `backend/app/core/config.py:15`, `backend/main.py:24`** — `JWT_SECRET` defaults to a random value at settings instantiation. If not explicitly configured in multi-worker/restart deployments, tokens and `SessionMiddleware` sessions become invalid across processes/restarts. Verify production config enforcement. Smallest fix: require an explicit `JWT_SECRET` in non-dev environments and fail startup when missing.

- [x] **B17 [Medium] `backend/app/services/ai_grader.py:19-80`** — `grade_open_answer` is async but, when a running event loop exists, it executes `generate_structured` via `asyncio.run(...)` in a `ThreadPoolExecutor`. This creates a new loop/thread for async router work that also uses module-level cooldown state/locks. Verify under real async load for thread-safety and event-loop issues. Smallest fix: make the grading path natively async (await `generate_structured` directly) and avoid `asyncio.run` inside request handling.

### Safe Checks Run

- `python -m compileall -q backend/app` (from repo root, using `backend\.venv\Scripts\python.exe`) — no output/errors.
- `alembic check` (from `backend/`, with `PYTHONPATH=backend`) — reported `Target database is not up to date` against existing local DB.
- `alembic upgrade head` on a temporary empty SQLite DB — failed at `backend/alembic/versions/46cffb70f4e7_initial_schema.py` with `NoSuchTableError: quizzes`, confirming the fresh-install migration issue (B9).

## Frontend Audit

Scope: read-only audit of `frontend/` and its contract with `backend/` on 2026-11-24. No source files were modified. I ran `npx.cmd tsc --noEmit` in `frontend/` (no output/errors) and cross-checked `frontend/src/lib/api.ts` against `backend/app/api/v1/*.py` and `backend/app/api/router.py`.

### Confirmed Issues

- [x] **F1 [High] `frontend/src/lib/api.ts:181-197`, `backend/app/schemas/quiz.py:131-136`** — `updateQuiz` sends `allow_retakes` and `max_attempts` fields, but backend `QuizUpdateRequest` only accepts `topic`, `questions`, `available_from`, `due_at`, `time_limit_minutes`. These fields are silently ignored by Pydantic, so retake toggles/max-attempts edits never persist. Smallest fix: remove unsupported fields from the payload or wire retakes to backend `PATCH /faculty/quizzes/{quiz_id}/retakes` (note that endpoint is currently unreachable due to B3's double prefix).

- [x] **F2 [High] `frontend/src/lib/api.ts:181-197`, `frontend/src/types/quiz.ts:85`** — `allow_retakes` is modeled in `PublishedQuiz` and included in `updateQuiz` payloads, but no UI control toggles it and no request calls the backend retakes endpoint. Retakes are therefore effectively unwired from the frontend. Smallest fix: add a teacher-facing toggle that calls the backend retakes endpoint once B3 is fixed, or remove the dead payload/type fields.

- [x] **F3 [High] `frontend/src/lib/api.ts:242-271`, `backend/app/schemas/quiz.py:73-79`** — `submitQuiz` sends `student_name`, `student_email`, and `score`, which backend `QuizSubmissionRequest` ignores (it derives identity from the JWT and recomputes score). While not a crash, the contract is misleading and the client-computed score is discarded; any future reliance on these fields would be wrong. Smallest fix: trim the request body to `quiz_id`, `topic`, `answers`, `total_questions` to match the backend schema.

- [x] **F4 [High] `frontend/src/app/(dashboard)/quiz/[id]/page.tsx:62-91`** — `handleQuizComplete` does not guard against double submission. `QuizPlayer` can invoke `onComplete` again on timeout auto-submit or repeated Enter keypresses, and the page calls `submitQuiz` each time, creating duplicate submissions (backend does not enforce retake/one-attempt policy on submit, see B6). Smallest fix: add an `isSubmitting`/`hasSubmitted` ref guard before calling `submitQuiz` and disable further input.

- [x] **F5 [Medium] `frontend/src/features/quiz-player/components/QuizPlayer.tsx:91-104`** — The countdown interval effect depends on `recordedAnswers`, so it is torn down and recreated on every answer. This can reset the 1-second tick cadence and, combined with `onComplete(recordedAnswers)` in the timeout branch, risks stale/missed auto-submit. Smallest fix: store latest answers in a ref and make the interval effect depend only on `expiresAtMs`.

- [x] **F6 [Medium] `frontend/src/features/quiz-player/components/QuizPlayer.tsx:76-84`** — If `startQuizSession` fails, the catch block silently continues untimed, so a timed quiz can be taken without server-side timer enforcement. Smallest fix: surface the error and block/notify instead of silently falling back, or require session creation for timed quizzes.

- [x] **F7 [Medium] `frontend/src/features/gradebook/components/Gradebook.tsx:27,177`** — Grade rows use `key={idx}` (array index) instead of a stable id. Reordering/filtering can reuse DOM nodes and show stale row state. Smallest fix: use `g.id` (or a composite key) as the React key.

- [x] **F8 [Medium] `frontend/src/lib/api.ts:16`** — `API_URL` defaults to `http://127.0.0.1:8000`, while backend config/CORS and docs commonly use `8000`/`8001`. If the backend is served on a different port, all API calls fail with no fallback. Smallest fix: document/align the default with the actual backend port and add a clear startup error when `NEXT_PUBLIC_API_URL` is unset in production.

- [x] **F9 [High] `frontend/src/lib/api.ts:166-169`, `backend/app/api/v1/quizzes.py:123-162`** — `fetchFacultyAssignedAssessments` calls `/faculty-assigned-assessments`, but the backend list endpoint omits `allow_retakes` (B3's double prefix also makes `/faculty/...` endpoints unreachable). Even where reachable, `allow_retakes` is missing from `/quizzes` list responses, so `TeacherDashboard` always renders "Off". Smallest fix: add `"allow_retakes": q.allow_retakes` to the list response and fix the prefix (B3).

- [x] **F10 [High] `frontend/src/features/assessment-engine/components/TeacherDashboard.tsx:363-372`, `backend/app/api/v1/faculty_retakes.py:13-14`** — Retakes toggle request shape mismatch. Backend declares `enabled: bool` as a query parameter, but frontend sends `{ enabled }` in the JSON body, resulting in 422. The toggle never works. Smallest fix: accept a JSON body in the backend endpoint or send `?enabled=...` from the frontend.

- [x] **F11 [Medium] `frontend/src/features/assessment-engine/components/TeacherDashboard.tsx:408-427`** — Faculty attempt review/grading UI is unwired. `openSubmissionDrawer` only opens a drawer and `saveAttemptGrade` contains a TODO; it never calls `/faculty/quizzes/{id}/attempts` or `/faculty/attempts/{id}/grade`. Smallest fix: implement fetch + PATCH calls (after fixing B3's prefix).

- [x] **F12 [Medium] `frontend/src/features/assessment-engine/components/TeacherDashboard.tsx:109`** — `maxAttempts` state is dead; backend has no `max_attempts` field anywhere. Smallest fix: remove the control or implement backend enforcement.

- [x] **F13 [Medium] `frontend/src/lib/api.ts:44`** — `fetchWithAuth` calls `response.json()` on every response, which throws on empty bodies (e.g., 204). Currently backend delete endpoints return JSON, so not breaking, but fragile. Smallest fix: check `response.status === 204` or content-type before parsing.

- [x] **F14 [High] `backend/app/api/v1/faculty_attempts.py:40-75`, `backend/app/api/v1/grades.py:108-116`, `frontend/src/features/assessment-engine/components/TeacherDashboard.tsx:700-708`** — Faculty attempt answers are stored as `question`/`user_answer` but the attempts endpoint remaps them to `question_text`/`selected_answer`, while the grading drawer reads `item.question`/`item.user_answer`. Faculty therefore sees empty question/answer values. Smallest fix: align field names in storage, the attempts endpoint, and the drawer (prefer `question`/`user_answer` throughout).

- [x] **F15 [Medium] `backend/app/schemas/quiz.py:118-136`, `backend/app/api/v1/quizzes.py:447-507`** — `update_quiz_endpoint` and `QuizUpdateRequest` do not accept `allow_retakes`/`max_attempts`, so edits sent by `updateQuiz` are silently dropped. Smallest fix: add the fields to the schema and pass them through to `update_quiz`.

- [x] **F16 [Low] `frontend/src/lib/auth/AuthContext.tsx:23-44`, `frontend/src/lib/api.ts:19-45`** — `fetchWithAuth` does not clear the stored token on 401, so stale tokens can linger in components that cached data even after `AuthContext` clears storage. Smallest fix: remove `cvsu_token`/`cvsu_user` in `fetchWithAuth` when a 401 is received before throwing.

### Needs Manual Verification

- [x] **F9 [Medium] `frontend/src/app/(dashboard)/layout.tsx:71-93`** — Auth guard redirects unauthenticated users to `/login` only after `isLoaded`. During the initial client render, protected children may briefly render before the redirect completes. Verify whether any sensitive data is fetched during that window. Smallest fix: render a loading gate until `isLoaded` and redirect before mounting children.

- [x] **F10 [Medium] `frontend/src/features/assessment-engine/components/AssessmentEditorModal.tsx:35-76`** — Editor loads answers via `fetchQuizAnswers` (teacher-only endpoint) and silently ignores a failed `fetchQuizDetail` (`.catch(() => null)`). If detail fails, `available_from`/`due_at`/`time_limit_minutes` may not load, but save still sends whatever is in state. Verify intended fallback behavior. Smallest fix: track and surface detail-load failure instead of swallowing it.

- [x] **F11 [Medium] `frontend/src/lib/auth/AuthContext.tsx:23-44`** — Session restore calls `fetchCurrentUser()` and on failure clears tokens, but it does not handle network/5xx distinctly from 401. A transient backend error logs the user out. Verify desired session-resilience behavior. Smallest fix: only clear tokens on 401/403 and retry/keep session on other errors.

- [ ] **F14 [Low] `frontend/src/app/page.tsx:28`, `frontend/src/features/assessment-engine/components/TeacherDashboard.tsx:170,707`** — Unsafe `any` typing in several places. Smallest fix: type as `CvSUUser` / concrete interfaces.

- [x] **F15 [Medium] `frontend/src/features/quiz-player/components/QuizPlayer.tsx:76-84`** — Quiz timer/retake denial from `startQuizSession` (403) is silently swallowed; the quiz remains playable and submission may still be accepted. Verify intended behavior. Smallest fix: surface the error and block play when session start fails.

- [x] **F16 [Medium] `backend/app/api/v1/quizzes.py:123-162`** — `allow_retakes` defaults for rows created before the column existed may be null. Verify DB data integrity. Smallest fix: ensure migration backfills `allow_retakes = false` for null rows.

- [ ] **F17 [Medium] `frontend/src/lib/api.ts:166-169`** — `fetchFacultyAssignedAssessments` does `data.quizzes`; if backend returns an empty/different shape, this throws at runtime. Verify against actual backend response.

- [ ] **F18 [Medium] `backend/app/api/v1/faculty_attempts.py:79-146`** — Verify whether faculty score-override UI should also update `Submission.score`/`percentage` in addition to `adjusted_score`; backend currently only stores `adjusted_score`.

- [ ] **F19 [Low] `frontend/src/app/(dashboard)/quiz/[id]/page.tsx:16`** — `params.id` is cast `as string`; verify Next.js 16 param shape (string vs array).
