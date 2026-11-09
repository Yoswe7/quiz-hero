import asyncio

from fastapi import APIRouter, HTTPException, Depends
import google.generativeai as genai

from app.schemas.ai import ChatRequest
from app.models import User
from app.api.dependencies import get_optional_current_user
from app.core.config import settings

router = APIRouter()

@router.post("")
async def chat_with_ai(
    request: ChatRequest,
    current_user: User | None = Depends(get_optional_current_user)
):
    try:
        if not settings.GEMINI_API_KEY:
            raise HTTPException(status_code=500, detail="Gemini API Key is not configured on the server.")

        if not request.messages:
            raise HTTPException(status_code=400, detail="Messages array cannot be empty.")

        context_str = f"- Active Assessment Topic: {request.context_topic}" if hasattr(request, 'context_topic') and request.context_topic else ""

        user_name = current_user.full_name if current_user else "Guest"
        user_role = current_user.role if current_user else "visitor"
        role_description = (
            "Faculty / Instructor" if user_role == "teacher"
            else "Enrolled Student" if user_role == "student"
            else "Guest / Visitor"
        )

        system_instruction = f"""You are 'Hero Bot' — the dedicated academic AI study assistant and faculty teaching partner for Cavite State University (CvSU) – Imus Campus.

User Information:
- Name: {user_name}
- Role: {user_role} ({role_description})
- Campus: Cavite State University – Imus Campus (CvSU-Imus)
{context_str}

Your Persona & Mission:
- You are 'Hero Bot', friendly, intellectual, supportive, and dedicated to the students and educators of CvSU Imus Campus.
- You help students master their courses (Information Technology, Computer Science, Business Administration, Hospitality Management, Education, General Education, etc.).
- You explain complex academic concepts with clarity, analogies, and structured markdown.
- When asked to quiz the user, give clear practice questions and assess their answers constructively.
- When assisting faculty, help draft balanced quiz questions, rubric criteria, and exam ideas.
- If asked about the university or campus, celebrate the excellence, spirit, and community of CvSU Imus Campus!

Tone & Guidelines:
- Enthusiastic, encouraging, accurate, concise, and structured.
- Use markdown formatting, bullet points, and code snippets where helpful.
"""

        generation_config = {
            "temperature": 0.7,
            "max_output_tokens": 800,
        }

        try:
            model = genai.GenerativeModel(
                model_name="gemini-3.1-flash-lite-preview",
                system_instruction=system_instruction,
                generation_config=generation_config,
            )
        except Exception:
            model = genai.GenerativeModel(
                model_name="gemini-3.6-flash",
                system_instruction=system_instruction,
                generation_config=generation_config,
            )

        recent_messages = request.messages[-10:] if len(request.messages) > 10 else request.messages
        history = []
        for msg in recent_messages[:-1]:
            role = "user" if msg.role.lower() == "user" else "model"
            history.append({"role": role, "parts": [msg.content]})

        latest_user_message = recent_messages[-1].content

        chat_session = model.start_chat(history=history)
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(chat_session.send_message, latest_user_message),
                timeout=30,
            )
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=504,
                detail="The AI service took too long to respond. Please try again.",
            )

        return {"reply": response.text}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process chat: {str(e)}")
