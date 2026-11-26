import asyncio
import base64
import json
from io import BytesIO
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from google.genai import types
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject

from app.schemas.ai import GeneratedQuiz
from app.schemas.quiz import QuizRequest
from app.services import ai_generator, llm_router, quiz_service


def _build_pdf_with_images(
    pages: list[str],
    *,
    images_per_page: list[tuple[int, int, bytes]] | None = None,
    shared_image: tuple[int, int, bytes] | None = None,
) -> bytes:
    """Create a synthetic PDF containing text and optional /XObject images."""
    writer = PdfWriter()
    shared_ref = None
    if shared_image is not None:
        w, h, data = shared_image
        img_obj = DecodedStreamObject()
        img_obj.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Image"),
            NameObject("/Width"): NumberObject(w),
            NameObject("/Height"): NumberObject(h),
        })
        img_obj.set_data(data)
        shared_ref = writer._add_object(img_obj)

    for idx, page_text in enumerate(pages):
        page = writer.add_blank_page(width=612, height=792)
        if page_text:
            # Inject minimal PDF text stream so pypdf.extract_text() reads it.
            escaped = page_text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            stream = DecodedStreamObject()
            stream.set_data(f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("latin-1"))
            font_dict = DictionaryObject({
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            })
            resources = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font_dict)})
            })
            page[NameObject("/Resources")] = resources
            page[NameObject("/Contents")] = writer._add_object(stream)
        else:
            page[NameObject("/Resources")] = DictionaryObject()

        xobjects = DictionaryObject()
        if shared_ref is not None:
            xobjects[NameObject("/ImShared")] = shared_ref
        if images_per_page and idx < len(images_per_page):
            w, h, data = images_per_page[idx]
            img_obj = DecodedStreamObject()
            img_obj.update({
                NameObject("/Type"): NameObject("/XObject"),
                NameObject("/Subtype"): NameObject("/Image"),
                NameObject("/Width"): NumberObject(w),
                NameObject("/Height"): NumberObject(h),
            })
            img_obj.set_data(data)
            xobjects[NameObject("/ImPage")] = writer._add_object(img_obj)
        if xobjects:
            res = page.get("/Resources")
            if not isinstance(res, DictionaryObject):
                res = DictionaryObject()
                page[NameObject("/Resources")] = res
            res[NameObject("/XObject")] = xobjects

    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


class ComplexModeTests(unittest.IsolatedAsyncioTestCase):
    def test_analyze_pdf_ignores_small_and_repeated_slide_logos(self):
        # 3-page slide deck with >= 150 chars/page, a 120x120 small icon, and a 400x400 shared school logo across all pages
        slide_text = "Lecture notes covering database normalization, 1NF, 2NF, 3NF, BCNF, functional dependencies, and lossless join decomposition. " * 2
        pdf_bytes = _build_pdf_with_images(
            [slide_text, slide_text, slide_text],
            images_per_page=[(120, 120, b"icon1"), (100, 100, b"icon2"), (80, 80, b"icon3")],
            shared_image=(400, 400, b"school-logo-repeated"),
        )
        info = llm_router._analyze_pdf(pdf_bytes, "complex")
        self.assertEqual(info["page_count"], 3)
        self.assertFalse(info["has_meaningful_images"])
        self.assertFalse(info["use_raw_pdf"])

    def test_analyze_pdf_keeps_raw_pdf_for_unique_large_diagram_or_sparse_pages(self):
        # Multi-page PDF with >500 total chars of headers across 5 pages (120 chars/page < 150) AND a unique 600x400 diagram
        header_only = "CS 101 Lecture Slide Header Footer Copyright University " * 2
        pdf_bytes = _build_pdf_with_images(
            [header_only] * 5,
            images_per_page=[(600, 400, b"unique-diagram-page-1")],
        )
        info = llm_router._analyze_pdf(pdf_bytes, "complex")
        self.assertTrue(info["has_meaningful_images"])
        self.assertTrue(info["use_raw_pdf"])

    def test_route_order_prioritizes_fast_providers_for_large_text_and_pdf_fallback(self):
        self.assertEqual(
            llm_router._route_order(is_large_text=True, is_image=False, is_pdf=False),
            ["gemini", "openrouter", "groq", "nvidia", "gonkaro"],
        )
        self.assertEqual(
            llm_router._route_order(is_large_text=False, is_image=False, is_pdf=True, has_pdf_text=True),
            ["gemini", "openrouter", "groq", "nvidia", "gonkaro"],
        )
        self.assertEqual(
            llm_router._route_order(is_large_text=False, is_image=False, is_pdf=True, has_pdf_text=False),
            ["gemini"],
        )

    def test_gemini_config_applies_medium_thinking_only_for_small_complex_38_batches(self):
        cfg_small = llm_router._gemini_config(
            "generation",
            model_name="gemini-3.8-flash",
            generation_mode="complex",
            batch_size=10,
        )
        self.assertEqual(cfg_small.thinking_config.thinking_level, types.ThinkingLevel.MEDIUM)

        cfg_large = llm_router._gemini_config(
            "generation",
            model_name="gemini-3.8-flash",
            generation_mode="complex",
            batch_size=15,
        )
        self.assertEqual(cfg_large.thinking_config.thinking_level, types.ThinkingLevel.LOW)

        cfg_lite = llm_router._gemini_config(
            "generation",
            model_name="gemini-3.5-flash-lite",
            generation_mode="complex",
            batch_size=5,
        )
        self.assertEqual(cfg_lite.thinking_config.thinking_level, types.ThinkingLevel.LOW)

    async def test_gemini_complex_orders_38_first_and_falls_back_to_text_on_pdf(self):
        slide_text = "Detailed software testing lifecycle steps and black-box equivalence partitioning criteria. " * 3
        pdf_bytes = _build_pdf_with_images([slide_text], images_per_page=[(500, 400, b"diagram")])
        called_models: list[tuple[str, str]] = []

        async def fake_call_gemini(model, task, **kwargs):
            called_models.append(("gemini", model))
            raise RuntimeError("429 RESOURCE_EXHAUSTED")

        async def fake_call_openai(provider, model, task, **kwargs):
            called_models.append((provider, model))
            self.assertIn("SOURCE MATERIAL:", kwargs["prompt"])
            return GeneratedQuiz(items=[{
                "question": "What does equivalence partitioning test?",
                "quiz_type": "Multiple Choice",
                "options": ["Input classes", "Hardware", "Network", "Compiler"],
                "answer": "Input classes",
                "question_number": 1,
            }])

        with (
            patch.object(llm_router.settings, "GEMINI_API_KEY", "fake-gem"),
            patch.object(llm_router.settings, "OPENROUTER_API_KEY", "fake-or"),
            patch.object(llm_router, "_is_cooldown", AsyncMock(return_value=False)),
            patch.object(llm_router, "_mark_cooldown", AsyncMock()),
            patch.object(llm_router, "_call_gemini", side_effect=fake_call_gemini),
            patch.object(llm_router, "_call_openai_compatible", side_effect=fake_call_openai),
        ):
            res = await llm_router.generate_structured(
                "Generate 1 question",
                GeneratedQuiz,
                task="generation",
                file_bytes=pdf_bytes,
                mime_type=llm_router.PDF_MIME,
                generation_mode="complex",
                batch_size=1,
            )

        self.assertEqual(len(res.items), 1)
        self.assertEqual(called_models[0], ("gemini", "gemini-3.8-flash"))
        self.assertEqual(called_models[1], ("gemini", "gemini-3.5-flash-lite"))
        self.assertEqual(called_models[2][0], "openrouter")

    async def test_generate_quiz_parallel_mixed_sections_respects_semaphore_2_and_merges(self):
        active_calls = 0
        max_concurrent = 0
        batch_sizes: list[int] = []

        async def fake_generate_structured(prompt, schema, **kwargs):
            nonlocal active_calls, max_concurrent
            active_calls += 1
            max_concurrent = max(max_concurrent, active_calls)
            batch_size = kwargs["batch_size"]
            batch_sizes.append(batch_size)
            await asyncio.sleep(0.02)
            active_calls -= 1
            if "Part I: Identification" in prompt:
                return GeneratedQuiz(items=[
                    {
                        "question": f"Which QA methodology concept covers scenario number {i}?",
                        "quiz_type": "Identification",
                        "section_name": "Part I: Identification",
                        "options": [],
                        "answer": f"Boundary Value {i}",
                        "question_number": i,
                    }
                    for i in range(1, batch_size + 1)
                ])
            return GeneratedQuiz(items=[
                {
                    "question": f"Explain QA scenario {i} in detail.",
                    "quiz_type": "Open Ended",
                    "section_name": "Part II: Open Ended",
                    "options": [],
                    "answer": f"A detailed model explanation for QA scenario {i} covering root causes.",
                    "question_number": i,
                }
                for i in range(1, batch_size + 1)
            ])

        sections = [
            {"quiz_type": "Identification", "question_count": 10},
            {"quiz_type": "Open Ended", "question_count": 10},
        ]
        with patch.object(ai_generator, "generate_structured", side_effect=fake_generate_structured):
            items, notice = await ai_generator.generate_quiz(
                topic="Software Testing",
                question_count=20,
                quiz_type="Mixed Assessment",
                sections=sections,
                generation_mode="complex",
            )

        self.assertIsNone(notice)
        self.assertEqual(len(items), 20)
        self.assertEqual(sorted(batch_sizes), [10, 10])
        self.assertLessEqual(max_concurrent, 2)
        self.assertEqual(sum(1 for q in items if q["quiz_type"] == "Identification"), 10)
        self.assertEqual(sum(1 for q in items if q["quiz_type"] == "Open Ended"), 10)

    def test_should_use_visual_file_for_complex_pdfs_and_images(self):
        img_req = QuizRequest(
            topic="Diagrams",
            question_count=5,
            quiz_type="Multiple Choice",
            source_type="file",
            file_base64=base64.b64encode(b"png-bytes").decode("ascii"),
            file_mime_type="image/png",
            generation_mode="complex",
        )
        self.assertTrue(quiz_service.should_use_visual_file(img_req))

        text_pdf = _build_pdf_with_images(["Comprehensive lecture material on algorithms and complexity analysis. " * 4])
        pdf_req = QuizRequest(
            topic="Algorithms",
            question_count=5,
            quiz_type="Multiple Choice",
            source_type="file",
            file_base64=base64.b64encode(text_pdf).decode("ascii"),
            file_mime_type="application/pdf",
            generation_mode="complex",
        )
        self.assertFalse(quiz_service.should_use_visual_file(pdf_req))

    async def test_overall_deadline_stops_fallback_chain(self):
        attempts: list[str] = []
        clock_ticks = iter([0.0, 0.0, 0.0, 70.0])  # Exceeds 65s budget after first failure

        async def fake_call_openai(provider, model, task, **kwargs):
            attempts.append(f"{provider}:{model}")
            raise asyncio.TimeoutError("simulated timeout")

        with (
            patch.object(llm_router.settings, "GROQ_API_KEY", "fake-groq"),
            patch.object(llm_router.settings, "OPENROUTER_API_KEY", "fake-or"),
            patch.object(llm_router.settings, "GEMINI_API_KEY", "fake-gem"),
            patch.object(llm_router, "_is_cooldown", AsyncMock(return_value=False)),
            patch.object(llm_router, "_mark_cooldown", AsyncMock()),
            patch.object(llm_router, "_call_openai_compatible", side_effect=fake_call_openai),
            patch.object(llm_router.time, "monotonic", side_effect=lambda: next(clock_ticks, 70.0)),
        ):
            with self.assertRaises(llm_router.LLMRouterError) as ctx:
                await llm_router.generate_structured(
                    "Generate 5 questions",
                    GeneratedQuiz,
                    task="generation",
                    generation_mode="complex",
                    batch_size=5,
                )

        self.assertEqual(len(attempts), 1)
        self.assertIn("overall deadline exceeded", str(ctx.exception))

    async def test_auth_error_skips_remaining_models_on_same_provider(self):
        attempts: list[tuple[str, str]] = []

        class AuthError(Exception):
            status_code = 401

        async def fake_call_openai(provider, model, task, **kwargs):
            attempts.append((provider, model))
            if provider == "groq":
                raise AuthError("401 Unauthorized")
            return GeneratedQuiz(items=[{
                "question": "What does regression testing verify?",
                "quiz_type": "Multiple Choice",
                "options": ["Existing features", "New UI colors", "Hardware", "Payroll"],
                "answer": "Existing features",
                "question_number": 1,
            }])

        with (
            patch.object(llm_router.settings, "GROQ_API_KEY", "bad-groq-key"),
            patch.object(llm_router.settings, "OPENROUTER_API_KEY", "good-or-key"),
            patch.object(llm_router, "_is_cooldown", AsyncMock(return_value=False)),
            patch.object(llm_router, "_mark_cooldown", AsyncMock()) as mark_cd,
            patch.object(llm_router, "_call_openai_compatible", side_effect=fake_call_openai),
        ):
            res = await llm_router.generate_structured(
                "Generate 1 question",
                GeneratedQuiz,
                task="generation",
                generation_mode="complex",
                batch_size=1,
            )

        self.assertEqual(len(res.items), 1)
        # Groq has 3 generation models, but 401 should stop after the 1st model
        groq_attempts = [a for a in attempts if a[0] == "groq"]
        self.assertEqual(len(groq_attempts), 1)
        self.assertEqual(mark_cd.await_count, len(llm_router.GROQ_MODELS["generation"]))


if __name__ == "__main__":
    unittest.main()
