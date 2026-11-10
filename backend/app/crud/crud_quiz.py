from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select, delete
from app.models import Quiz, Question
from app.models.quiz import Option
from app.models.submission import Submission
from app.models.classroom import ClassroomMembership
from datetime import datetime, timezone

async def create_quiz(db: AsyncSession, quiz: Quiz) -> Quiz:
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    return quiz

async def get_quiz_by_id(db: AsyncSession, quiz_id: str) -> Quiz | None:
    stmt = select(Quiz).where(Quiz.id == quiz_id).options(
        selectinload(Quiz.questions).selectinload(Question.options)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def list_quizzes(db: AsyncSession) -> list[Quiz]:
    result = await db.execute(select(Quiz).order_by(Quiz.created_at.desc()))
    return result.scalars().all()

async def list_faculty_pending_assignments(
    db: AsyncSession,
    teacher_email: str,
) -> list[dict]:
    quizzes = await list_quizzes(db)
    submitted_result = await db.execute(
        select(Submission.quiz_id, Submission.student_email).where(
            Submission.student_email.is_not(None)
        )
    )
    completed_by_quiz: dict[str, set[str]] = {}
    for quiz_id, student_email in submitted_result.all():
        completed_by_quiz.setdefault(quiz_id, set()).add(student_email.strip().lower())

    assignments = []
    for quiz in quizzes:
        if quiz.created_by_email and quiz.created_by_email.lower() != teacher_email.lower():
            continue
        pending_students = [
            email.strip().lower()
            for email in (quiz.assigned_student_emails or [])
            if email.strip().lower() not in completed_by_quiz.get(quiz.id, set())
        ]
        if quiz.classroom_id:
            members_result = await db.execute(
                select(ClassroomMembership.student_email).where(
                    ClassroomMembership.classroom_id == quiz.classroom_id
                )
            )
            pending_students.extend(
                email.strip().lower()
                for email in members_result.scalars().all()
                if email.strip().lower() not in completed_by_quiz.get(quiz.id, set())
            )
        if pending_students:
            assignments.append({
                "id": quiz.id,
                "topic": quiz.topic,
                "quiz_type": quiz.quiz_type,
                "question_count": quiz.question_count,
                "created_by_email": quiz.created_by_email,
                "created_at": quiz.created_at,
                "course_code": quiz.course_code,
                "class_section": quiz.class_section,
                "due_at": quiz.due_at,
                "pending_student_emails": sorted(set(pending_students)),
            })
    return assignments

def quiz_is_assigned_to_student(quiz: Quiz, student_email: str) -> bool:
    return quiz.is_assigned and student_email.strip().lower() in {
        email.strip().lower() for email in (quiz.assigned_student_emails or [])
    }

def quiz_is_visible_to_student(
    quiz: Quiz,
    student_email: str,
    member_class_ids: set[str] | None = None,
) -> bool:
    email = student_email.strip().lower()
    direct_assignment = quiz_is_assigned_to_student(quiz, email)
    class_assignment = bool(
        quiz.classroom_id
        and member_class_ids
        and quiz.classroom_id in member_class_ids
    )
    if not (direct_assignment or class_assignment):
        return False
    now = datetime.now(timezone.utc)
    available_from = quiz.available_from
    due_at = quiz.due_at
    if available_from and available_from.tzinfo is None:
        available_from = available_from.replace(tzinfo=timezone.utc)
    if due_at and due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    if available_from and available_from > now:
        return False
    if due_at and due_at < now:
        return False
    return True

async def get_student_class_ids(db: AsyncSession, student_email: str) -> set[str]:
    result = await db.execute(
        select(ClassroomMembership.classroom_id).where(
            ClassroomMembership.student_email == student_email.strip().lower()
        )
    )
    return set(result.scalars().all())

async def assign_student_to_quiz(
    db: AsyncSession,
    quiz_id: str,
    student_email: str,
) -> tuple[Quiz | None, bool]:
    quiz = await get_quiz_by_id(db, quiz_id)
    if not quiz:
        return None, False

    assigned_emails = {
        email.strip().lower()
        for email in (quiz.assigned_student_emails or [])
        if email and email.strip()
    }
    already_assigned = student_email in assigned_emails
    assigned_emails.add(student_email)
    quiz.assigned_student_emails = sorted(assigned_emails)
    quiz.is_assigned = True
    await db.commit()
    await db.refresh(quiz)
    return quiz, already_assigned

async def delete_quiz(db: AsyncSession, quiz_id: str) -> bool:
    quiz = await get_quiz_by_id(db, quiz_id)
    if not quiz:
        return False

    # 1. Delete associated student submissions
    await db.execute(delete(Submission).where(Submission.quiz_id == quiz_id))

    # 2. Find all questions for this quiz to delete their options
    q_stmt = select(Question.id).where(Question.quiz_id == quiz_id)
    q_result = await db.execute(q_stmt)
    question_ids = q_result.scalars().all()

    # 3. Delete options for these questions
    if question_ids:
        await db.execute(delete(Option).where(Option.question_id.in_(question_ids)))

    # 4. Delete questions
    await db.execute(delete(Question).where(Question.quiz_id == quiz_id))

    # 5. Delete the quiz record
    await db.delete(quiz)
    await db.commit()
    return True

async def update_quiz(
    db: AsyncSession,
    quiz_id: str,
    topic: str,
    questions_data: list[dict]
) -> Quiz | None:
    quiz = await get_quiz_by_id(db, quiz_id)
    if not quiz:
        return None

    quiz.topic = topic.strip()
    quiz.question_count = len(questions_data)

    # 1. Find existing questions for this quiz to delete their options
    q_stmt = select(Question.id).where(Question.quiz_id == quiz_id)
    q_result = await db.execute(q_stmt)
    old_question_ids = q_result.scalars().all()

    # 2. Delete options for old questions
    if old_question_ids:
        await db.execute(delete(Option).where(Option.question_id.in_(old_question_ids)))

    # 3. Delete old questions
    await db.execute(delete(Question).where(Question.quiz_id == quiz_id))

    # 4. Insert updated questions and their options
    for i, q in enumerate(questions_data):
        new_q = Question(
            quiz_id=quiz.id,
            question_text=q["question"].strip(),
            quiz_type=q.get("quiz_type") or quiz.quiz_type,
            section_name=q.get("section_name"),
            answer=q["answer"].strip(),
            order_index=i,
        )
        db.add(new_q)
        await db.flush()

        for j, opt in enumerate(q.get("options", [])):
            if opt and str(opt).strip():
                new_opt = Option(
                    question_id=new_q.id,
                    option_text=str(opt).strip(),
                    order_index=j,
                )
                db.add(new_opt)

    await db.commit()
    await db.refresh(quiz)
    return quiz
