# Quiz Hero - Agent Handoff

Updated: 2026-11-11

This document is a high-level project handoff for another coding agent. It intentionally
does not contain source-code dumps, credentials, tokens, API keys, or database contents.
The repository itself remains the source of truth.

## Project summary

Quiz Hero is a CvSU academic assessment platform:

- Next.js 16 / React 19 frontend in `frontend/`
- FastAPI backend in `backend/`
- SQLModel/SQLAlchemy persistence
- SQLite for the current local development environment
- PostgreSQL is supported by configuration for non-local environments
- JWT-based authentication
- Student and teacher role separation
- AI-assisted quiz generation and open-answer grading
- Quiz taking, server-side grading, gradebook, classrooms, assignments, and progress

## Current user-facing flows

### Students

- Sign in through the existing authentication flow.
- Browse available published assessments.
- Take quizzes at `/quiz/[id]`.
- Submit answers for server-side evaluation.
- View grades and progress.
- Open spaced-repetition reviews at `/review`.

### Teachers

- Use the faculty studio under `/studio`.
- Generate, review, publish, assign, and manage assessments.
- View gradebook and classroom/student management screens.

## Work completed in the current session

### Spaced repetition

The existing `ReviewItem` model and SM-2 service are now connected to registered
authenticated FastAPI routes:

- `GET /srs/due?limit=50`
- `POST /srs/items`
- `POST /srs/{item_id}/review`

The review API:

- Restricts access to authenticated students.
- Returns due or new review items.
- Resolves quiz question prompts and topics from keys such as
  `quiz:<quiz-id>:question:<question-id>`.
- Validates review quality from 0 through 5.
- Persists SM-2 interval, repetitions, easiness, timestamps, and quality history.

The frontend SRS client now uses the configured backend API base URL and the shared JWT
authentication helper instead of placeholder proxy URLs.

The student review screen includes:

- Recall textarea
- Ratings 0-5
- Due count
- Reviewed count
- Retention percentage
- Study streak
- Topic-level progress
- Current interval
- Next-review date after rating
- Empty, loading, and error states

Quiz completion already creates review items for each official quiz question. That
behavior was retained and verified while connecting the review UI.

### Bug fixes made while validating the feature

- Corrected SQLModel result extraction in the SRS service.
- Corrected progress aggregation that treated `Submission` ORM objects as dictionaries.
- These fixes resolved the observed HTTP 500 responses from `/srs/due` and `/progress`.

## Current worktree state

The current implementation is **uncommitted**. Do not reset or discard these changes.
The intended modified/added areas are:

- Backend SRS route registration and implementation
- SRS schemas and service result handling
- Progress aggregation
- Frontend authenticated API helpers
- Frontend SRS client
- Student dashboard navigation
- New student review page
- `docs/TOFIX.md` SRS checklist

Use `git status --short` before making further changes.

## Validation already performed

Successful checks:

- Backend Python compilation:
  - `Set-Location backend; python -m compileall app`
- SRS OpenAPI route registration:
  - `/srs/due`
  - `/srs/items`
  - `/srs/{item_id}/review`
- Authenticated local API smoke test:
  - `GET /srs/due?limit=50` returned 200
  - `GET /progress` returned 200
- Targeted frontend ESLint for the new SRS files
- Frontend production build:
  - `Set-Location frontend; npm.cmd run build`

The backend emits an existing deprecation warning for `google.generativeai`; it was not
part of the SRS fix.

## Local development

Start the backend from the repository root:

```powershell
.\start_backend.ps1
```

Start the frontend separately:

```powershell
.\start_frontend.ps1
```

Expected local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`

The local development environment currently uses `backend/.env`. Never copy that file
into a handoff, issue, prompt, or external service. Treat all values in it as secrets.

For local smoke testing, the repository supports a development student account when
local test authentication is enabled. Use the normal login flow or the existing local
development endpoint; do not hard-code or share tokens.

## Important implementation conventions

- Frontend API calls should use the shared authenticated helper in `frontend/src/lib/api.ts`.
- Do not create frontend proxy endpoints for backend routes unless the architecture
  explicitly changes.
- Backend authorization should use the existing dependency functions:
  `get_current_user`, `require_student`, and `require_teacher`.
- Preserve role guards: students must not access faculty routes, and teachers must not
  be treated as students by default.
- Quiz answer keys must remain server-side until submission is finalized.
- Prefer existing SQLModel/FastAPI patterns and explicit error responses.
- Do not expose environment variables, JWT secrets, Google credentials, or database files.

## Known gaps and recommended next steps

1. Add backend automated API tests for SRS:
   - unauthenticated access
   - non-student access
   - due item ownership
   - quality values outside 0-5
   - SM-2 interval transitions
2. Add frontend tests for the review page:
   - loading, error, and empty states
   - rating a card
   - next-review feedback
3. Consider adding a normalized topic/item metadata strategy instead of deriving
   question prompts from `item_key`.
4. Add an explicit database migration/test for environments that do not use
   `SQLModel.metadata.create_all`.
5. Reconcile older roadmap/status documents with the completed SRS work.
6. Improve progress semantics:
   - current streak counts only submission dates
   - review activity is not yet included in streak calculation
   - retention currently reflects mastered review items, not a weighted recall metric
7. Replace the deprecated `google.generativeai` package in a separate dependency
   modernization task.
8. Add broader backend smoke tests and end-to-end student-flow coverage.

## Handoff instructions for the next agent

1. Read this document first.
2. Inspect `git status --short` and preserve all existing uncommitted work.
3. Read the relevant files before editing; do not assume the older roadmap is current.
4. Reproduce any reported API issue with an authenticated request before changing UI code.
5. Run the smallest targeted validation command after each cohesive change.
6. Do not commit unless explicitly requested by the user.
7. Do not include secrets or copy the contents of `.env`, database files, or tokens into
   chat, documentation, commits, or external tools.
