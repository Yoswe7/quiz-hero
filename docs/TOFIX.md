# UI
[ ] Fix the default confirmation message alert in deleting/removing the published class assessment.
[ ] Add clear loading, empty, error, and success states for generation, review, publishing, and study sessions.
[ ] Add accessible keyboard focus states and verify mobile layouts for the faculty and student workflows.

# Features

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