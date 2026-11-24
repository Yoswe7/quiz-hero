import base64
from io import BytesIO
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from pypdf import PdfWriter

from app.services.ai_grader import grade_open_answer
from app.services.ai_generator import generate_quiz


def _quiz_response() -> str:
    return json.dumps({
        "questions": [{
            "question": "Which option is correct?",
            "quiz_type": "Multiple Choice",
            "options": ["A", "B", "C", "D"],
            "answer": "A",
        }],
    })


class FakeGroqClient:
    def __init__(self, responses: list[str]):
        self.responses = iter(responses)
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        content = next(self.responses)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


class GenerateQuizTests(unittest.IsolatedAsyncioTestCase):
    async def test_topic_generation_uses_groq_json_mode(self):
        client = FakeGroqClient([_quiz_response()])

        with patch("app.services.ai_generator.get_groq_client", return_value=client):
            questions = await generate_quiz(
                topic="Photosynthesis",
                question_count=1,
                quiz_type="Multiple Choice",
            )

        self.assertEqual(len(questions), 1)
        self.assertEqual(client.calls[0]["response_format"], {"type": "json_object"})

    async def test_image_source_is_sent_as_groq_vision_input(self):
        client = FakeGroqClient([_quiz_response()])
        image_data = base64.b64encode(b"image-bytes").decode("ascii")

        with patch("app.services.ai_generator.get_groq_client", return_value=client):
            await generate_quiz(
                topic="Lecture",
                question_count=1,
                quiz_type="Multiple Choice",
                source_type="file",
                file_base64=image_data,
                file_mime_type="image/png",
                file_name="lecture.png",
            )

        message_content = client.calls[0]["messages"][0]["content"]
        self.assertEqual(message_content[1]["type"], "image_url")
        self.assertTrue(message_content[1]["image_url"]["url"].startswith("data:image/png;base64,"))

    async def test_scanned_pdf_pages_are_rendered_and_transcribed_before_generation(self):
        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)
        pdf_buffer = BytesIO()
        writer.write(pdf_buffer)
        pdf_data = base64.b64encode(pdf_buffer.getvalue()).decode("ascii")
        client = FakeGroqClient([
            json.dumps({"pages": [{"page_number": 1, "text": "Cell division creates two daughter cells."}]}),
            _quiz_response(),
        ])

        with patch("app.services.ai_generator.get_groq_client", return_value=client):
            questions = await generate_quiz(
                topic="Lecture",
                question_count=1,
                quiz_type="Multiple Choice",
                source_type="file",
                file_base64=pdf_data,
                file_mime_type="application/pdf",
                file_name="scanned-lecture.pdf",
            )

        self.assertEqual(len(questions), 1)
        ocr_content = client.calls[0]["messages"][0]["content"]
        self.assertTrue(any(part["type"] == "image_url" for part in ocr_content))
        generation_prompt = client.calls[1]["messages"][0]["content"]
        self.assertIn("Cell division creates two daughter cells.", generation_prompt)

    async def test_open_answer_grading_uses_groq_json_response(self):
        client = FakeGroqClient([
            json.dumps({
                "is_correct": True,
                "score": 82,
                "feedback": "The answer explains the central concept.",
            }),
        ])

        with patch("app.services.ai_grader.get_groq_client", return_value=client):
            result = await grade_open_answer(
                question="Explain the process.",
                correct_answer="A detailed model answer.",
                user_answer="A student explanation.",
                quiz_type="Open Ended",
            )

        self.assertEqual(result["score"], 82.0)
        self.assertEqual(client.calls[0]["response_format"], {"type": "json_object"})


if __name__ == "__main__":
    unittest.main()
