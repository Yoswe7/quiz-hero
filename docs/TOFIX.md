# UI
[ ] Fix the default confirmation message alert in deleting/removing the published class assessment.
[ ] Add clear loading, empty, error, and success states for generation, review, publishing, and study sessions.
[ ] Add accessible keyboard focus states and verify mobile layouts for the faculty and student workflows.

# Features

OVERALL
[x] Add a detailed and complete learning progress feature in Gradebook.tsx
  [x] Topic-level progress
  [x] Retention or mastery
  [x] Due reviews
  [x] Review streaks
  [x] Spaced-repetition progress
  [x] Recommended topics to revisit
[ ] Course/section targeting
[ ] Pause/resume quiz
[ ] SRS/Review workflow
[ ] Error States
[ ] Mobile/Accessibility verification

Should help students answer:
[] What should I study next?
[] Which topic am I weak in?
[] What is due today?
[] What have I already completed?
[] What needs review?

STUDY WORKFLOW
[ ] Flashcard Generation
[ ] Student study sets
[ ] Study commons
[ ] Shared study materials
[ ] Due-review page
[ ] Automatic review-item creation

ACCESSIBILITY
[ ] Keyboard navigation verification
[ ] Visible focus states
[ ] Mobile layout review
[ ] Accessible controls

ERROR HANDLING
[ ] “Add course/section enrollment rules so students see only assessments intended for their class.”

If the backend is offline or the request fails, the dashboard can display:

“Nothing is waiting for you yet”

That incorrectly suggests there are no assessments instead of explaining that loading failed. This is especially important because TESTING.md explicitly requires understandable error states.

FACULTY SIDE
[x] Add a generated quiz preview with answer keys.
[ ] Add a resizable feature for the generated quiz material before printing.
[ ] Add question-level editing for generated questions, options, and answer keys before approval.
[ ] Add a draft/pending-review state so generation does not publish directly to the class.
[ ] Add a human-in-the-loop review screen with explicit approve/publish action.
[ ] Add verified/published badges so students can distinguish teacher-approved material.
[ ] Add a way to reject or regenerate individual inaccurate questions instead of regenerating the entire quiz.


[ ] Add a archive option to published quizzes that will go to archived quizzes.
[ ] Add some search filters for verified/published/pending generated quizzes.
[ ] Add course-code and section metadata to assessments, then support filtering by course code.
[ ] Add DOCX upload and parsing if the research scope continues to promise PDF and DOCX support.
[ ] Align the displayed file-size limits with the actual backend limits and the research scope.

STUDENT SIDE

[ ] Implement flashcard generation and flashcard study sessions from teacher-approved course material.
[ ] Add student study sets with create, edit, delete, and organize actions.
[ ] Add the Student Study Commons for sharing and discovering approved study sets.
[ ] Add course-code indexing and search for shared study sets and assessments.
[ ] Add teacher-verified labels and visibility rules for shared student-created materials.
[ ] Add student study progress beyond quiz scores, including reviewed items, retention, and due reviews.

PUBLISHED ASSESSMENTS
[ ] Current enrollment filtering
[ ] Section filtering
[ ] Course code filtering
[ ] Assignment targeting
[ ] Due date
[ ] "Assigned to me" distinction

SPACED REPETITION
[ ] Connect the existing SM-2 ReviewItem model and service to registered FastAPI routes.
[ ] Replace the frontend placeholder SRS proxy calls with the real backend API base URL and authentication.
[ ] Create a due-review page with review cards, recall input, and quality ratings from 0 to 5.
[ ] Automatically create review items when a student completes or saves a flashcard/quiz item.
[ ] Show next-review dates, due counts, streaks, and topic-level progress.

AI GENERATION QUALITY
[x] Enforce requested item counts and type-specific output validation in the generation service.
[ ] Add source evidence or page references to generated questions so faculty can verify PDF grounding.
[ ] Add duplicate-concept detection, unsupported-fact detection, and a visible validation report before approval.
[ ] Add a regeneration flow for missing, malformed, or low-confidence items.
[ ] Return generated questions from the publish response or load them explicitly so the immediate faculty preview cannot receive undefined question data.
[ ] Add generation tests for exact counts, mixed-section distributions, option validity, short identification answers, and substantive open-ended model answers.

AUTHENTICATION AND ACCESS
[ ] Replace email-only simulation login with verified Google OAuth for production research evaluation.
[ ] Ensure role assignment cannot be changed by an untrusted client request after authentication.
[ ] Add course/section enrollment rules so students see only assessments intended for their class.

RESEARCH ALIGNMENT
[ ] Reconcile the research stack description with the implementation: the project currently uses Next.js 16, FastAPI, SQLModel/SQLAlchemy, and SQLite by default; it does not use Prisma, Auth.js, or the stated Next.js 14 stack.
[ ] Reconcile the model description: the code currently configures Gemini 3.6 Flash, while the research text names Gemini 1.5 Flash.
[ ] Reconcile the input/output scope: the research text mentions flashcards and DOCX, while the current application supports quiz generation from PDF, images, text, and topic prompts only.
[ ] Define and implement the research evaluation workflow for interviews, consent, participant codes, feedback capture, and thematic-analysis export outside the production gradebook.

SECURITY AND PRIVACY
[ ] Add rate limiting for authentication, quiz generation/publishing, AI grading, chat, file uploads, and repeated quiz/submission requests. Use a shared store such as Redis for multi-instance deployment; in-memory limits are only suitable for local development.
[ ] Add request and concurrency limits for expensive Gemini operations so one account cannot exhaust the API quota or create runaway costs.
[ ] Verify Google ID tokens cryptographically using Google's published keys, issuer, audience, expiry, and hosted-domain checks. The current `decode_google_jwt` only decodes the payload and does not verify the signature.
[ ] Remove email-only simulation login before production or research deployment. Restrict authentication to verified Google OAuth identities rather than accepting any typed `@cvsu.edu.ph` address.
[ ] Require a configured JWT secret at startup and add issuer, audience, expiry, key rotation, and short-lived access-token policies. Do not use a generated fallback secret in deployed environments.
[ ] Add object-level authorization checks: teachers should only edit, view answer keys for, archive, or delete assessments they own or are explicitly assigned to manage.
[ ] Restrict quiz access by course/section enrollment instead of exposing every published assessment to every authenticated student.
[ ] Prevent client-controlled submission fields from affecting grading, especially `quiz_id`, topic, score, answer keys, and item ordering. Verify that the submitted question sequence belongs to the selected quiz.
[ ] Add server-side request-body limits and validate decoded file bytes, MIME signatures, file extensions, malformed Base64, and decompression risks before sending files to Gemini.
[ ] Standardize upload limits across the frontend, backend, reverse proxy, and research scope. The current limits and documented limits do not match.
[ ] Treat uploaded PDFs, notes, and AI output as untrusted content. Add prompt-injection boundaries and reject generated content that includes instructions, secrets, or unsupported source claims.
[ ] Add security headers including Content-Security-Policy, Strict-Transport-Security in HTTPS environments, X-Content-Type-Options, Referrer-Policy, and frame protections.
[ ] Keep production CORS origins explicit and environment-specific. Never use wildcard origins with credentials.
[ ] Replace client-facing exception details with generic error messages and log technical details server-side without exposing secrets or provider responses.
[ ] Add audit logs for sign-ins, role changes, assessment generation, approval, publication, archive, deletion, answer-key access, and grade changes.
[ ] Define data-retention and deletion rules for institutional emails, uploaded documents, generated content, submissions, chat messages, and interview data.
[ ] Keep `.env` and generated databases out of version control, rotate any credentials that may have been committed, and use a deployment secret manager.
[ ] Use least-privilege database credentials, encrypted connections in deployed environments, backups, and tested restore procedures.
[ ] Pin and regularly audit Python and npm dependencies for known vulnerabilities.
[ ] Add automated security tests for unauthenticated access, student/faculty role boundaries, cross-user object access, expired/tampered JWTs, upload limits, prompt-injection inputs, and rate-limit behavior.