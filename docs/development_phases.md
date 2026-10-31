# Project Development Phases & Architecture Roadmap

**Platform:** CvSU Quiz Hero — AI-Assisted Assessment & Spaced-Repetition Platform  
**Target Institution:** Cavite State University (CvSU)  
**Current Tech Stack:**
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query, `@react-oauth/google`
- **Backend:** FastAPI, Python >=3.12 (managed with `uv`), SQLModel / SQLAlchemy (asyncpg / aiosqlite), Alembic
- **Database:** PostgreSQL (production) / SQLite (`quiz_hero.db` for local development)
- **AI Engine:** Google Gemini API (`gemini-3.6-flash`, `gemini-3.1-flash-lite`)
- **Authentication:** Google OAuth 2.0 OpenID Connect with `@cvsu.edu.ph` Hosted Domain (`hd`) verification

---

## Phase 1: Institutional Authentication & Security Overhaul
**Status:** ✅ COMPLETED (2026-10-30)

- [x] **Remove Insecure Manual Auth:** Completely eliminated unverified email/password forms and mock login simulation bypasses.
- [x] **Real-Time Cryptographic Google OAuth:** Integrated `google.oauth2.id_token.verify_oauth2_token()` in backend with strict audience checks.
- [x] **Triple-Layer Institutional Access Control:**
  1. `email_verified is True`
  2. `hd == "cvsu.edu.ph"` (Google Workspace Hosted Domain enforcement)
  3. `email.endswith("@cvsu.edu.ph")`
- [x] **Strict Audience Guard:** Fails securely with HTTP 500 if server OAuth client configuration is missing.
- [x] **Database User Schema Update:** Added `google_sub`, `avatar_url`, `name`, `updated_at`, without password fields.
- [x] **Whitelist-Only Teacher Assignment:** Configured `TEACHER_EMAILS` whitelist allowing faculty to be automatically granted `TEACHER` role upon first login. All other `@cvsu.edu.ph` users are strictly assigned `STUDENT`. Zero self-upgrade or passkey mechanisms.
- [x] **One-Way Dual-Role Switcher (Faculty Only):** Authenticated faculty can toggle between **Faculty Studio** (`/studio`) and **Student Preview** (`/dashboard`) from the top navbar. For students, the switcher is completely hidden and access to `/studio` or `/teacher` is strictly blocked and redirected.
- [x] **Strict Backend Route Guards:** Applied `require_teacher` dependency to all sensitive endpoints (`/generate-quiz`, `/publish-quiz`, `/quizzes/{id}/answers`, `DELETE /quizzes/{id}`, `DELETE /grades/{id}`).
- [x] **Anti-DevTools Protection (Stripped Student Payloads):** Created `StudentQuestionRead` response schema omitting `answer` and `correct_answer`. Student quiz fetching serializes exclusively through this schema so inspecting the browser Network tab never exposes answer keys.
- [x] **Server-Side Exclusive Grading:** Re-engineered `POST /submit-quiz` so answers are evaluated directly against server database records. Scores and feedback are only returned after submission is recorded.

---

## Phase 2: Assessment Engine & Human-in-the-Loop Review
**Status:** 🟡 IN PROGRESS

- [x] **Multi-format Generation:** PDF, image, text, and topic-based assessment generation using Gemini.
- [x] **Faculty Preview Screen:** Human-in-the-loop review step before publishing assessments.
- [ ] **Question-Level Editing:** Inline edits for questions, distractors, and answer keys prior to approval.
- [ ] **Course/Section Metadata:** Section tagging for class-level assessment distribution.

---

## Phase 3: Spaced-Repetition System (SM-2)
**Status:** 🟡 IN PROGRESS

- [x] **SM-2 Core Algorithm:** Implemented in `backend/app/services/spaced_repetition.py`.
- [x] **SRS Models & Schemas:** Review item models and schemas created.
- [ ] **Interactive Due Reviews:** Student flashcard and review UI with 0–5 recall ratings.
- [ ] **Auto-Scheduling:** Automatic review item creation upon completing assessments.

---

## Phase 4: Production Hardening & Research Evaluation
**Status:** ⚪ UPCOMING

- [ ] Rate limiting on expensive Gemini generation endpoints.
- [ ] Audit logging for assessment publications, grade edits, and role assignments.
- [ ] Cross-browser and accessibility audits (WCAG 2.1 AA).
- [ ] Research telemetry export for academic thesis evaluation.
