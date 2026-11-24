# Quiz Hero — AI Context & Project Overview

> **Project Name:** Quiz Hero  
> **Institution:** Cavite State University (CvSU) – Imus City Campus  
> **Purpose:** AI-powered institutional academic assessment & spaced repetition (SRS) learning platform for students and educators.

---

## 1. Executive Summary

**Quiz Hero** is a full-stack educational web application designed for Cavite State University – Imus Campus. It bridges automated AI assessment generation with cognitive science-backed study techniques:

- **For Students:**
  - Complete AI-curated and teacher-assigned quizzes (Multiple Choice, True/False, Identification, Open Ended, Mixed).
  - Review questions and flashcards using an automated **SM-2 Spaced Repetition System (SRS)** to optimize long-term memory retention.
  - Track study streaks, mastery rates, and historical performance.
  - Interact with **Hero Bot**, a specialized AI academic tutor tailored for CvSU coursework and campus programs.

- **For Faculty / Teachers:**
  - **Assessment Studio:** Instant AI quiz generation from topic prompts, pasted lecture text, uploaded PDFs (with OCR support for scanned materials), or images via Groq.
  - **Classrooms & Assignments:** Create classes with unique invite codes, schedule assessment windows (`available_from`, `due_at`), and assign quizzes to student cohorts.
  - **Grading & Analytics:** Automated semantic AI grading for subjective questions, anti-tampering score verification, student roster monitoring, and gradebook exports.

---

## 2. Technology Stack

### Backend
- **Framework:** FastAPI (Python >= 3.12 / 3.14)
- **Package Manager:** `uv`
- **ORM / Database Access:** SQLModel & SQLAlchemy (asynchronous)
- **Database Engine:**
  - **Development:** SQLite via `aiosqlite` (`sqlite+aiosqlite:///./quiz_hero.db`)
  - **Production:** PostgreSQL 16+ via `asyncpg` (`postgresql+asyncpg://...`)
  - **Migrations:** Alembic
- **AI Integration:** Groq API (`groq>=1.7.0`)
  - Default Model: `qwen/qwen3.8-27b` (supports vision input and JSON output modes)
  - Tasks: Assessment generation, semantic answer grading, scanned PDF/image OCR, and Hero Bot chat
- **Document Processing:** `pypdf`, `pypdfium2`, `pillow` (handles PDF parsing and scanned page rendering)
- **Authentication & Security:**
  - Google OAuth 2.0 with strict institutional domain enforcement (`@cvsu.edu.ph` / `hd: cvsu.edu.ph`)
  - JWT tokens (`HS256`, 7-day expiration)
  - Passwordless / Token-based auth, role-based access control (`STUDENT`, `TEACHER`, `ADMIN`)
  - Rate limiting (token bucket / in-memory or Redis) and concurrent AI request limiting per user

### Frontend
- **Framework:** Next.js 16.3.3 (App Router)
- **Language / Runtime:** TypeScript 5, React 19.2.8, Node.js >= 20
- **Package Manager:** `npm`
- **Styling & Animation:** Tailwind CSS v4, Framer Motion
- **State & Data Fetching:** TanStack Query v5 (`@tanstack/react-query`)
- **Authentication Client:** `@react-oauth/google` with local test fallback for offline development

---

## 3. Architecture & Project Structure

```plaintext
quiz-hero/
├── AI_CONTEXT.md                     # This documentation file
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── dependencies.py       # Auth dependencies (get_current_user, init_db, db session)
│   │   │   ├── router.py             # Main v1 API router assembly
│   │   │   └── v1/
│   │   │       ├── auth.py           # Google OAuth, /auth/dev/student test login, /auth/me
│   │   │       ├── chat.py           # Hero Bot conversational AI endpoint
│   │   │       ├── grades.py         # Submissions, gradebook, scoring
│   │   │       ├── quizzes.py        # Quiz creation, publishing, assignment, student fetching
│   │   │       └── srs.py            # Spaced repetition endpoints (reviews, SM-2 updates)
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic BaseSettings, Groq client factory, CORS config
│   │   │   ├── exceptions.py         # Global error handlers
│   │   │   ├── rate_limit.py         # Concurrency and rate limiting middleware
│   │   │   └── security.py           # JWT encoding/decoding, Google token validation
│   │   ├── crud/
│   │   │   ├── crud_quiz.py          # Quiz & Question database operations
│   │   │   ├── crud_submission.py    # Submission records & scoring
│   │   │   └── crud_user.py          # User lookup, creation, and role synchronization
│   │   ├── models/                   # SQLModel Database Models
│   │   │   ├── classroom.py          # Classroom & ClassroomMembership tables
│   │   │   ├── quiz.py               # Quiz, Question, Option tables
│   │   │   ├── review.py             # QuestionReview (SM-2 item tracking)
│   │   │   ├── srs.py                # ReviewItem (UUID-based generic SM-2 metadata)
│   │   │   ├── submission.py         # Student quiz submission records & JSON answers
│   │   │   └── user.py               # User table with role ('STUDENT' | 'TEACHER')
│   │   ├── schemas/                  # Pydantic Request/Response validations
│   │   │   ├── ai.py                 # Chat and prompt schemas
│   │   │   ├── auth.py               # Token responses and Google credentials
│   │   │   ├── quiz.py               # Quiz generation & student-sanitized view schemas
│   │   │   └── srs.py                # Review rating inputs & schedule responses
│   │   └── services/                 # Core Business Logic
│   │       ├── ai_generator.py       # Prompt templates, OCR pipelines, Groq calls
│   │       ├── ai_grader.py          # Semantic evaluation of student answers
│   │       ├── quiz_service.py       # Quiz drafting, publishing, student answer stripping
│   │       └── spaced_repetition.py  # SM-2 algorithmic interval & ease factor calculation
│   ├── alembic/                      # Database migrations
│   ├── quiz_hero.db                  # Local SQLite database
│   ├── main.py                       # FastAPI factory, lifespan handlers, CORS & middleware
│   ├── pyproject.toml                # uv build configuration & dependencies
│   ├── requirements.txt              # Pip-compatible requirement list
│   └── .env                          # Backend environment variables
│
└── frontend/
    ├── src/
    │   ├── app/                      # Next.js App Router
    │   │   ├── (dashboard)/          # Authenticated routes
    │   │   │   ├── layout.tsx        # Dashboard shell, navigation guards
    │   │   │   ├── dashboard/        # Student overview, recent quizzes, daily recall
    │   │   │   ├── grades/           # Performance charts, score reports
    │   │   │   ├── quiz/[id]/        # Active quiz-taking interface
    │   │   │   ├── review/           # Daily SM-2 flashcard recall review deck
    │   │   │   ├── studio/           # Teacher assessment creator & classroom studio
    │   │   │   │   ├── assigned/     # Active scheduled assessments
    │   │   │   │   ├── classes/      # Classroom roster & join codes
    │   │   │   │   ├── published/    # Published quiz library
    │   │   │   │   └── students/     # Student roster & performance breakdown
    │   │   │   ├── student/          # Student quiz browser
    │   │   │   └── teacher/          # Teacher landing / legacy view
    │   │   ├── login/                # Authentication page (Google SSO + Dev bypass)
    │   │   │   └── developers/       # Developer-specific login shortcut
    │   │   ├── developers/           # Project attribution & engineering team
    │   │   ├── layout.tsx            # Root layout, Syne font, metadata
    │   │   ├── page.tsx              # Public landing page
    │   │   └── providers.tsx         # GoogleOAuthProvider, QueryClientProvider, AuthProvider
    │   ├── components/               # Reusable UI components
    │   │   ├── auth/                 # AuthView, Google login button, role toggle
    │   │   ├── shared/               # AIChatbot (Hero Bot widget), navbar, modals
    │   │   └── ui/                   # Base buttons, input controls, cards
    │   ├── features/                 # Domain-driven feature modules
    │   │   ├── assessment-engine/    # Quiz creation wizard, format sliders, PDF uploader
    │   │   └── quiz-player/          # Timed exam runner, answer selection, submission
    │   ├── lib/
    │   │   ├── api.ts                # Typed client fetch wrapper for all backend routes
    │   │   ├── auth/                 # AuthContext (React context for user session state)
    │   │   ├── draftRecovery.ts      # LocalStorage backup for in-flight quiz creations
    │   │   └── srs.ts                # Client-side spaced repetition calculations
    │   └── types/
    │       └── quiz.ts               # Core TypeScript interfaces (CvSUUser, Quiz, Question)
    ├── package.json
    ├── .env                          # Frontend public env (API URL, Google Client ID)
    └── .env.local                    # Local dev flags (NEXT_PUBLIC_ENABLE_LOCAL_TEST_AUTH)
```

---

## 4. Database Schema & Models

1. **`users` table (`User` in `backend/app/models/user.py`):**
   - `id`: Integer primary key
   - `google_sub`: Unique Google subject ID
   - `email`: Institutional email (must end in `@cvsu.edu.ph`)
   - `name`: User display name
   - `avatar_url`: Profile picture link
   - `role`: `"STUDENT"` or `"TEACHER"`
   - Timestamps: `created_at`, `updated_at`

2. **`quizzes` table (`Quiz` in `backend/app/models/quiz.py`):**
   - `id`: String identifier (e.g., UUID or slug)
   - `topic`, `quiz_type`: Assessment subject and format (`"Multiple Choice"`, `"True or False"`, `"Identification"`, `"Open Ended"`, `"Mixed Assessment"`)
   - `question_count`: Total questions
   - `created_by_email`: Foreign key to `users.email`
   - `course_code`, `class_section`, `classroom_id`: Optional class links
   - `available_from`, `due_at`: Timed release windows
   - `assigned_student_emails`: JSON array of target student emails
   - `is_assigned`: Boolean flag
   - `review_status`: `"draft"` | `"published"`
   - Cascade relationship to `questions`

3. **`questions` & `options` tables (`Question`, `Option`):**
   - `questions`: Holds `question_text`, `quiz_type`, `section_name`, `answer` (hidden from students before submission), `order_index`.
   - `options`: Multiple choice alternatives linked to a question.

4. **`submissions` table (`Submission` in `backend/app/models/submission.py`):**
   - Tracks `student_email`, `student_name`, `quiz_id`, `score`, `total_questions`, `percentage`, and raw `answers` (JSON array of student selections).

5. **`classrooms` & `classroom_memberships` (`Classroom`, `ClassroomMembership`):**
   - Teacher-owned classrooms with `course_code`, `class_section`, and unique `invite_code`.
   - Maps student emails to enrolled classrooms.

6. **`question_reviews` & `ReviewItem` (Spaced Repetition Tables):**
   - Implementation of the **SuperMemo-2 (SM-2)** algorithm:
     - `repetitions`: Number of successful consecutive reviews
     - `interval_days`: Days until the item is next presented
     - `ease_factor` / `easiness`: Multiplier adjusting difficulty (starts at 2.5)
     - `next_review_date` / `next_review_at`: Timestamp for due flashcards

---

## 5. Authentication & Authorization Flow

1. **Google OAuth 2.0 (Institutional):**
   - The user clicks the Google Sign-In button on the frontend.
   - Google Identity Services sends back a signed credential (ID token).
   - The frontend sends the credential to `POST /auth/google`.
   - The backend validates the token using `google.oauth2.id_token.verify_oauth2_token`.
   - **Hosted Domain Enforcement:** The email domain must be `@cvsu.edu.ph`. Personal accounts (`@gmail.com`) are rejected with `403 Forbidden`.
   - **Teacher Role Gate:** Registering as `"TEACHER"` requires supplying the institutional `FACULTY_ACCESS_CODE` (configured in `.env`).
   - If valid, the backend issues an institutional JWT Bearer token containing `user_id`, `email`, and `role`.

2. **Local Developer Bypass (`ENABLE_LOCAL_TEST_AUTH=true`):**
   - When running locally, visiting `/login/developers` (or `/login` with the flag enabled) shows the **"Use local student test account"** button.
   - Makes a request to `POST /auth/dev/student`.
   - Generates/retrieves a mock user `local.student@cvsu.edu.ph` and returns a valid JWT session token, bypassing Google Cloud setup completely.

3. **Role-Based Guards:**
   - Routes starting with `/studio` require the `TEACHER` role.
   - Student quiz taking and review decks are optimized for `STUDENT` users.
   - Student-facing endpoints (e.g., `GET /quizzes/{id}`) automatically strip the `answer` field to prevent client-side answer inspection.

---

## 6. AI Pipelines & Business Logic

### A. Quiz Generation (`ai_generator.py`)
- Faculty can supply:
  1. Plain topic title / prompt
  2. Raw text or pasted lecture notes
  3. PDF documents:
     - Text is extracted directly via `pypdf`.
     - Scanned pages are rendered to images with `pypdfium2` and transcribed via Groq vision in batches of up to 3 images.
     - Hard limits: 60 pages maximum, 100,000 characters maximum.
  4. Uploaded images (diagrams, exam screenshots, whiteboards).
- Prompts Groq (`qwen/qwen3.8-27b`) with a JSON-enforced schema requesting questions, distractors, correct answers, and explanations.

### B. Semantic Answer Evaluation (`ai_grader.py`)
- Used for open-ended or short-answer questions.
- Compares student response with the reference answer using Groq to award partial or full credit and provide constructive feedback.

### C. Hero Bot (`backend/app/api/v1/chat.py`)
- System prompt adopts the persona of **"Hero Bot"**, an academic partner for CvSU Imus Campus.
- Aware of user identity, role, and current active quiz context.
- Adheres to academic integrity: guides students with hints, conceptual breakdowns, and Socratic questioning rather than directly giving away exam answers.

---

## 7. Environment Variables

### Backend (`backend/.env`)
```env
# Database (defaults to SQLite if omitted)
DATABASE_URL=sqlite+aiosqlite:///./quiz_hero.db

# Groq AI Provider
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_CHAT_MODEL=qwen/qwen3.8-27b

# Authentication & Security
JWT_SECRET=your_super_secret_jwt_key_here
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
FACULTY_ACCESS_CODE=CVSU_FACULTY_2026

# Pre-authorized Faculty/Admin Emails
ADMIN_EMAILS=joshuagabriel.tejada@cvsu.edu.ph
TEACHER_EMAILS=joshuagabriel.tejada@cvsu.edu.ph

# Environment & Dev Flags
ENVIRONMENT=development
ENABLE_LOCAL_TEST_AUTH=true
AI_MAX_CONCURRENT_PER_USER=2
RATE_LIMIT_ENABLED=true
```

### Frontend (`frontend/.env` and `frontend/.env.local`)
```env
# frontend/.env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

# frontend/.env.local
NEXT_PUBLIC_ENABLE_LOCAL_TEST_AUTH=true
```

---

## 8. Running the Application Locally

```bash
# 1. Start the Backend (from /backend directory)
cd backend
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000

# 2. Start the Frontend (from /frontend directory)
cd frontend
npm run dev
# Accessible at http://localhost:3000
```

---

## 9. Architectural Directives for AI Agents

When editing or extending Quiz Hero, follow these strict guidelines:
1. **Never rebuild from scratch:** Work incrementally within existing folder structures (`app/`, `features/`, `components/`, `services/`, `crud/`).
2. **Never expose secrets:** Never hardcode `GROQ_API_KEY`, `JWT_SECRET`, or credentials into code or commit history.
3. **Never leak student answer keys:** Any endpoint returning questions to a student prior to submission must sanitize and exclude the `answer` attribute.
4. **Maintain Async Python:** All database queries must use asynchronous SQLAlchemy / SQLModel patterns (`await db.execute(...)`, `await db.commit()`).
5. **Preserve Domain Integrity:** Keep institutional validation (`@cvsu.edu.ph` domain checks and faculty verification codes) intact.
