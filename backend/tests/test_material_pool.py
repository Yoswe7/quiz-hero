import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, select

from app.api.v1 import materials as materials_api
from app.api.v1.quizzes import publish_quiz_endpoint
from app.models import CourseMaterial, MaterialQuestionPool
from app.schemas.quiz import QuizRequest, QuizSection
from app.services import quiz_service


class MaterialQuestionPoolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        self.session_factory = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_append_questions_to_pool_deduplicates_by_fingerprint(self):
        async with self.session_factory() as db:
            material = CourseMaterial(
                filename="notes.pdf",
                created_by_email="teacher@cvsu.edu.ph",
                file_hash="fh1",
                content_hash="ch1",
                extracted_text="Database systems text.",
                status="ready",
            )
            db.add(material)
            await db.commit()
            await db.refresh(material)

            inserted_first = await quiz_service.append_questions_to_pool(
                material.id,
                [
                    {
                        "question": "What is a primary key?",
                        "quiz_type": "Identification",
                        "options": [],
                        "answer": "Unique row identifier",
                    },
                    {
                        "question": "  what is   a primary key? ",
                        "quiz_type": "Identification",
                        "options": [],
                        "answer": "Unique row identifier",
                    },
                ],
                db=db,
            )
            self.assertEqual(inserted_first, 1)

            rows = (
                await db.execute(
                    select(MaterialQuestionPool).where(MaterialQuestionPool.material_id == material.id)
                )
            ).scalars().all()
            self.assertEqual(len(rows), 1)

    async def test_slice_first_mixed_assembly_skips_llm_on_full_hit_and_uses_delta_on_partial_hit(self):
        async with self.session_factory() as db:
            material = CourseMaterial(
                filename="algorithms.pdf",
                created_by_email="teacher@cvsu.edu.ph",
                file_hash="fh2",
                content_hash="ch2",
                extracted_text="Sorting algorithms and asymptotic complexity.",
                status="ready",
            )
            db.add(material)
            await db.commit()
            await db.refresh(material)

            seed_items = [
                {
                    "question": f"MC Question {i}",
                    "quiz_type": "Multiple Choice",
                    "options": ["A", "B", "C", "D"],
                    "answer": "A",
                    "explanation": "Concise explanation.",
                }
                for i in range(2)
            ] + [
                {
                    "question": f"ID Question {i}",
                    "quiz_type": "Identification",
                    "options": [],
                    "answer": f"Term {i}",
                    "explanation": "Concise explanation.",
                }
                for i in range(2)
            ] + [
                {
                    "question": "OE Question 0",
                    "quiz_type": "Open Ended",
                    "options": [],
                    "answer": "Comprehensive model answer for open ended zero.",
                    "explanation": "Concise explanation.",
                }
            ]
            await quiz_service.append_questions_to_pool(material.id, seed_items, db=db)

            teacher = SimpleNamespace(email="teacher@cvsu.edu.ph", role="TEACHER")

            # 1) 100% pool hit: 2 MC + 2 ID -> LLM must NOT be called.
            full_hit_req = QuizRequest(
                topic="Algorithms",
                question_count=4,
                quiz_type="Mixed Assessment",
                sections=[
                    QuizSection(quiz_type="Multiple Choice", question_count=2),
                    QuizSection(quiz_type="Identification", question_count=2),
                ],
                material_id=material.id,
                assigned_student_emails=["student@cvsu.edu.ph"],
                generation_mode="fast",
            )
            with patch.object(quiz_service, "generate_quiz", AsyncMock()) as mock_gen:
                res = await publish_quiz_endpoint(
                    request=full_hit_req,
                    background_tasks=BackgroundTasks(),
                    db=db,
                    current_user=teacher,
                )
                mock_gen.assert_not_called()
            self.assertTrue(res["served_from_cache"])
            self.assertEqual(len(res["quiz"]["questions"]), 4)

            # 2) Partial hit: 2 MC (pool) + 2 ID (pool) + 3 OE (1 in pool -> delta 2 OE)
            partial_req = QuizRequest(
                topic="Algorithms",
                question_count=7,
                quiz_type="Mixed Assessment",
                sections=[
                    QuizSection(quiz_type="Multiple Choice", question_count=2),
                    QuizSection(quiz_type="Identification", question_count=2),
                    QuizSection(quiz_type="Open Ended", question_count=3),
                ],
                material_id=material.id,
                assigned_student_emails=["student@cvsu.edu.ph"],
                generation_mode="fast",
            )
            delta_generated = [
                {
                    "question": "OE Delta 1",
                    "quiz_type": "Open Ended",
                    "options": [],
                    "answer": "Delta open ended model answer one.",
                    "explanation": "",
                },
                {
                    "question": "OE Delta 2",
                    "quiz_type": "Open Ended",
                    "options": [],
                    "answer": "Delta open ended model answer two.",
                    "explanation": "",
                },
            ]
            mock_delta = AsyncMock(return_value=(delta_generated, None))
            with patch.object(quiz_service, "generate_quiz", mock_delta):
                res2 = await publish_quiz_endpoint(
                    request=partial_req,
                    background_tasks=BackgroundTasks(),
                    db=db,
                    current_user=teacher,
                )

            mock_delta.assert_awaited_once()
            call_kwargs = mock_delta.call_args.kwargs
            self.assertEqual(call_kwargs["question_count"], 2)
            self.assertEqual(call_kwargs["quiz_type"], "Open Ended")
            self.assertFalse(res2["served_from_cache"])
            self.assertEqual(len(res2["quiz"]["questions"]), 7)

            # Verify delta OE items were appended to MaterialQuestionPool (5 seeded + 2 delta = 7).
            pool_rows = (
                await db.execute(
                    select(MaterialQuestionPool).where(MaterialQuestionPool.material_id == material.id)
                )
            ).scalars().all()
            self.assertEqual(len(pool_rows), 7)

    async def test_background_pool_warming_populates_starter_pool_sequentially(self):
        async with self.session_factory() as db:
            material = CourseMaterial(
                filename="lecture.docx",
                created_by_email="teacher@cvsu.edu.ph",
                file_hash="fh3",
                content_hash="ch3",
                extracted_text="Operating systems scheduling and virtual memory.",
                status="processing",
            )
            db.add(material)
            await db.commit()
            await db.refresh(material)
            material_id = material.id

        calls: list[tuple[str, int]] = []

        async def fake_generate_quiz(*, question_count, quiz_type, **kwargs):
            calls.append((quiz_type, question_count))
            return ([{
                "question": f"{quiz_type} starter question",
                "quiz_type": quiz_type,
                "options": ["A", "B", "C", "D"] if quiz_type == "Multiple Choice" else (["True", "False"] if quiz_type == "True or False" else []),
                "answer": "A" if quiz_type == "Multiple Choice" else ("True" if quiz_type == "True or False" else "Model starter answer for question."),
                "explanation": "",
            }], None)

        with (
            patch.object(materials_api, "SessionLocal", self.session_factory),
            patch.object(quiz_service, "SessionLocal", self.session_factory),
            patch.object(materials_api, "generate_quiz", side_effect=fake_generate_quiz),
        ):
            await materials_api._run_pregeneration(material_id, "Operating systems scheduling and virtual memory.")

        self.assertEqual(calls, list(materials_api.STARTER_POOL_SPEC))
        async with self.session_factory() as verify_db:
            mat = await verify_db.get(CourseMaterial, material_id)
            self.assertEqual(mat.status, "ready")
            pool_rows = (
                await verify_db.execute(
                    select(MaterialQuestionPool).where(MaterialQuestionPool.material_id == material_id)
                )
            ).scalars().all()
            self.assertEqual(len(pool_rows), 4)


if __name__ == "__main__":
    unittest.main()
