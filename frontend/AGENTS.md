# AGENTS.md

## Project Overview
Quiz Hero is an AI-powered academic assessment platform. It operates across two primary environments. The frontend uses Next.js 16 for user interfaces. The backend uses FastAPI to handle database operations and Gemini AI integration.

## Core Directive
**Do not rebuild the application from scratch.** You must work within the existing architectural boundaries. Incrementally fix or build missing features within the current directory structure. Never rewrite established modules. Never propose sweeping framework migrations unless explicitly commanded by the user.

## Environment & Tooling
* **Frontend:** Node.js >= 20. The package manager is `npm`.
* **Backend:** Python >= 3.12. The package manager is `uv`. 
* **Database:** PostgreSQL 16+.

You must strictly separate frontend and backend execution contexts. Never use bare `python` or `pip` commands. Prefix all Python operations with `uv run`.

```bash
# Frontend Execution
npm run dev
npm install <package-name>

# Backend Execution
uv run uvicorn main:app --reload
uv add <package-name>
uv run alembic upgrade head

Project Structure
Maintain domain-driven and layered isolation. Do not dump files into global directories. You must strictly adhere to the following routing and separation of concerns:

Plaintext
frontend/
├── src/
│   ├── app/                      # Next.js App Router (Routing only)
│   │   ├── (dashboard)/
│   │   │   ├── teacher/page.tsx  # Mounts <TeacherDashboard/>
│   │   │   ├── student/page.tsx  # Mounts <QuizBrowser/>
│   │   │   └── quiz/[id]/page.tsx
│   │   ├── layout.tsx            # Root layout, fonts, globals
│   │   └── page.tsx              # Public landing page
│   │
│   ├── features/                 # Domain-driven modules (The core change)
│   │   ├── assessment-engine/    # Teacher creation tools
│   │   │   ├── components/       # Format selector, mixed sliders, previews
│   │   │   ├── hooks/            # useQuizGeneration()
│   │   │   └── utils/            # File parsing, size validation
│   │   ├── quiz-player/          # Student taking the quiz
│   │   │   ├── components/       # MC options, timer, progress bar
│   │   │   ├── hooks/            # useKeyboardShortcuts(), useQuizState()
│   │   │   └── api/              # Submit answers, request hints
│   │   └── gradebook/            # Shared grade viewing logic
│   │
│   ├── components/               # Global, dumb UI components only
│   │   ├── ui/                   # Buttons, Modals, Inputs, Cards
│   │   ├── layout/               # Navbar, Footer, AuthGuard
│   │   └── shared/               # AIChatbot, CvSUAuthModal
│   │
│   ├── lib/                      # Framework integrations
│   │   ├── auth/                 # Google OAuth, Session sync
│   │   ├── query-client.ts       # TanStack Query setup
│   │   └── utils.ts              # Generic helpers (cn, formatters)
│   │
│   └── types/                    # Global TypeScript interfaces

backend/
├── alembic/                      # Database migrations (Needed for Postgres)
├── app/
│   ├── api/                      # HTTP Routing (Controllers)
│   │   ├── dependencies.py       # get_current_user, get_db_session
│   │   ├── v1/
│   │   │   ├── auth.py
│   │   │   ├── quizzes.py        # Calls services/quiz.py
│   │   │   └── grades.py
│   │   └── router.py             # Assembles all v1 routers
│   │
│   ├── core/                     # Application-wide settings
│   │   ├── config.py             # Pydantic BaseSettings (Env vars)
│   │   ├── security.py           # JWT signing/verification, Google token validation
│   │   └── exceptions.py         # Custom HTTP exception handlers
│   │
│   ├── models/                   # SQLModel ORM Definitions (Database Tables)
│   │   ├── user.py               # Postgres User schema
│   │   ├── quiz.py               # Split into Quiz, Question, Option tables
│   │   └── submission.py
│   │
│   ├── schemas/                  # Pydantic validations (Request/Response)
│   │   ├── auth.py
│   │   ├── quiz.py               # Strip answers out for student responses here
│   │   └── ai.py
│   │
│   ├── services/                 # Business Logic (The brain)
│   │   ├── quiz_service.py       # Handles the publish workflow
│   │   ├── ai_generator.py       # Gemini prompt building & JSON parsing
│   │   └── ai_grader.py          # Semantic grading logic
│   │
│   └── crud/                     # Data Access Layer (Postgres operations)
│       ├── crud_user.py          # Upsert logic
│       ├── crud_quiz.py          # Fetch, delete, pagination
│       └── crud_submission.py
│
├── main.py                       # FastAPI application factory
├── requirements.txt
└── .env
Code Conventions & Style
Write explicit, highly readable code. Always provide comprehensive type hints for every function across both Python and TypeScript files.

Frontend (TypeScript)

Use React functional components.

Type all props and state with TypeScript interfaces.

Use camelCase for variables and functions. Use PascalCase for React components and interface names.

Keep student and teacher logic strictly isolated in their respective features/ directories.

Backend (Python)

Follow PEP 8 conventions.

All database operations must be asynchronous via asyncpg.

Validate all request and response payloads using Pydantic schemas.

Use snake_case for variables, functions, and file names. Use PascalCase for classes and Pydantic models.

Keep AI logic isolated in the services/ layer. Do not hardcode complex Gemini prompts inside API route handlers.

Avoid deeply nested structures. Use flat, single-purpose functions wherever possible.

Hard Boundaries
Never delete files with rm or similar destructive terminal commands.

Never execute any Git commands.

Never expose the JWT secret or Gemini API keys in the codebase.

Never return unstripped answer keys in student-facing API endpoints.