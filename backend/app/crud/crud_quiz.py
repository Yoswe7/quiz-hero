from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select, delete
from app.models import Quiz, Question
from app.models.quiz import Option
from app.models.submission import Submission

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

