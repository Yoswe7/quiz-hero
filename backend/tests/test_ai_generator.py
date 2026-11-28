import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, select

from app.api.v1.quizzes import publish_quiz_endpoint
from app.models.quiz import Question
from app.schemas.ai import (
    CompactGeneratedQuiz,
    QuestionExplanationBatch,
    QuestionExplanationItem,
)
from app.schemas.quiz import QuizRequest, QuizSection
from app.services import ai_generator, quiz_service


class TokenDietAndLazyBackfillTests(unittest.IsolatedAsyncioTestCase):
    async def test_fast_mode_uses_compact_schema_and_maps_keys(self):
        captured: list[dict] = []

        async def fake_generate_structured(prompt, schema, **kwargs):
            captured.append({"prompt": prompt, "schema": schema, "kwargs": kwargs})
            return schema.model_validate_json(json.dumps({
                "items": [{
                    "q": "Which HTTP status code indicates a resource was created?",
                    "t": "Multiple Choice",
                    "o": ["200", "201", "400", "404"],
                    "a": "201",
                    "n": 1,
                }]
            }))

        with patch.object(ai_generator, "generate_structured", side_effect=fake_generate_structured):
            questions, notice = await ai_generator.generate_quiz(
                topic="REST APIs",
                question_count=1,
                quiz_type="Multiple Choice",
                generation_mode="fast",
            )

        self.assertIsNone(notice)
        self.assertIs(captured[0]["schema"], CompactGeneratedQuiz)
        self.assertIn('omit explanation and grading_rubric', captured[0]["prompt"])
        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["question"], "Which HTTP status code indicates a resource was created?")
        self.assertEqual(questions[0]["quiz_type"], "Multiple Choice")
        self.assertEqual(questions[0]["options"], ["200", "201", "400", "404"])
        self.assertEqual(questions[0]["answer"], "201")
        self.assertEqual(questions[0]["explanation"], "")

    async def test_mixed_exam_fast_mode_maps_compact_section_keys(self):
        async def fake_generate_structured(prompt, schema, **kwargs):
            self.assertIs(schema, CompactGeneratedQuiz)
            if "Part I: Multiple Choice" in prompt:
                return schema.model_validate({
                    "items": [{
                        "q": "What does SQL stand for?",
                        "t": "Multiple Choice",
                        "o": ["Structured Query Language", "Simple Query Logic", "System Queue Link", "None"],
                        "a": "Structured Query Language",
                        "s": "Part I: Multiple Choice",
                        "n": 1,
                    }]
                })
            return schema.model_validate({
                "items": [{
                    "q": "Explain why database normalization reduces update anomalies.",
                    "t": "Open Ended",
                    "o": [],
                    "a": "Normalization eliminates redundant attribute storage across tables.",
                    "s": "Part II: Open Ended",
                    "n": 1,
                }]
            })

        with patch.object(ai_generator, "generate_structured", side_effect=fake_generate_structured):
            questions, _ = await ai_generator.generate_quiz(
                topic="Databases",
                question_count=2,
                quiz_type="Mixed Assessment",
                sections=[
                    {"quiz_type": "Multiple Choice", "question_count": 1},
                    {"quiz_type": "Open Ended", "question_count": 1},
                ],
                generation_mode="fast",
            )

        self.assertEqual(len(questions), 2)
        self.assertEqual(questions[0]["section_name"], "Part I: Multiple Choice")
        self.assertEqual(questions[1]["section_name"], "Part II: Open Ended")
        self.assertEqual(questions[0]["explanation"], "")
        self.assertEqual(questions[1]["explanation"], "")

    async def test_compact_schema_falls_back_to_verbose_keys(self):
        async def fake_generate_structured(prompt, schema, **kwargs):
            # Simulate an LLM that ignores compact keys and returns verbose keys under "questions".
            return schema.model_validate_json(json.dumps({
                "questions": [{
                    "question": "Which protocol secures HTTP traffic with TLS?",
                    "quiz_type": "Identification",
                    "options": [],
                    "answer": "HTTPS",
                    "question_number": 1,
                }]
            }))

        with patch.object(ai_generator, "generate_structured", side_effect=fake_generate_structured):
            questions, _ = await ai_generator.generate_quiz(
                topic="Web Security",
                question_count=1,
                quiz_type="Identification",
                generation_mode="fast",
            )

        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["question"], "Which protocol secures HTTP traffic with TLS?")
        self.assertEqual(questions[0]["quiz_type"], "Identification")
        self.assertEqual(questions[0]["options"], [])
        self.assertEqual(questions[0]["answer"], "HTTPS")
        self.assertEqual(questions[0]["explanation"], "")

    async def test_publish_quiz_schedules_non_blocking_lazy_backfill_and_uses_fresh_session(self):
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

        try:
            generated_items = [
                {
                    "question": "Which data structure uses FIFO ordering?",
                    "quiz_type": "Multiple Choice",
                    "options": ["Stack", "Queue", "Tree", "Graph"],
                    "answer": "Queue",
                    "explanation": "",
                },
                {
                    "question": "Compare a stack and a queue in terms of access order.",
                    "quiz_type": "Open Ended",
                    "options": [],
                    "answer": "A stack uses LIFO while a queue uses FIFO ordering.",
                    "explanation": "",
                },
            ]

            req = QuizRequest(
                topic="Data Structures",
                question_count=2,
                quiz_type="Mixed Assessment",
                sections=[
                    QuizSection(quiz_type="Multiple Choice", question_count=1),
                    QuizSection(quiz_type="Open Ended", question_count=1),
                ],
                assigned_student_emails=["student@cvsu.edu.ph"],
                generation_mode="fast",
            )
            bg_tasks = BackgroundTasks()
            teacher = SimpleNamespace(email="teacher@cvsu.edu.ph", role="TEACHER")

            with patch.object(quiz_service, "generate_quiz", AsyncMock(return_value=(generated_items, None))):
                async with session_factory() as request_db:
                    response = await publish_quiz_endpoint(
                        request=req,
                        background_tasks=bg_tasks,
                        db=request_db,
                        current_user=teacher,
                    )

            self.assertEqual(response["quiz"]["review_status"], "draft")
            self.assertEqual(len(response["quiz"]["questions"]), 2)
            self.assertEqual(response["quiz"]["questions"][0]["explanation"], "")
            self.assertEqual(len(bg_tasks.tasks), 1)
            self.assertIs(bg_tasks.tasks[0].func, quiz_service.backfill_quiz_explanations)

            quiz_id = response["quiz"]["id"]
            q1_id = response["quiz"]["questions"][0]["id"]
            q2_id = response["quiz"]["questions"][1]["id"]

            async def fake_backfill_llm(prompt, schema, **kwargs):
                self.assertIs(schema, QuestionExplanationBatch)
                return QuestionExplanationBatch(items=[
                    QuestionExplanationItem(
                        question_id=q1_id,
                        explanation="A queue dequeues elements in First-In, First-Out order.",
                        grading_rubric=None,
                    ),
                    QuestionExplanationItem(
                        question_id=q2_id,
                        explanation="Stacks pop the most recent item (LIFO), whereas queues remove the oldest (FIFO).",
                        grading_rubric="Award full credit for contrasting LIFO and FIFO ordering accurately.",
                    ),
                ])

            with (
                patch.object(quiz_service, "SessionLocal", session_factory),
                patch.object(quiz_service, "generate_structured", side_effect=fake_backfill_llm),
            ):
                await quiz_service.backfill_quiz_explanations(quiz_id)

            async with session_factory() as verify_db:
                rows = (
                    await verify_db.execute(
                        select(Question).where(Question.quiz_id == quiz_id).order_by(Question.order_index)
                    )
                ).scalars().all()

            self.assertEqual(rows[0].explanation, "A queue dequeues elements in First-In, First-Out order.")
            self.assertIsNone(rows[0].grading_rubric)
            self.assertEqual(
                rows[1].explanation,
                "Stacks pop the most recent item (LIFO), whereas queues remove the oldest (FIFO).",
            )
            self.assertEqual(
                rows[1].grading_rubric,
                "Award full credit for contrasting LIFO and FIFO ordering accurately.",
            )
        finally:
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()
