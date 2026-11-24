import asyncio

from fastapi import APIRouter, HTTPException, Depends

from app.schemas.ai import ChatRequest
from app.models import User
from app.api.dependencies import get_optional_current_user
from app.core.config import get_groq_client, settings
from app.core.rate_limit import ai_concurrency_limit, rate_limit

router = APIRouter()

@router.post("")
async def chat_with_ai(
    request: ChatRequest,
    current_user: User | None = Depends(get_optional_current_user),
    _rate_limit: None = Depends(rate_limit(20, 60)),
    _ai_limit: None = Depends(ai_concurrency_limit()),
):
    try:
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

        recent_messages = request.messages[-10:] if len(request.messages) > 10 else request.messages
        messages = [{"role": "system", "content": system_instruction}]
        for msg in recent_messages[:-1]:
            role = "assistant" if msg.role.lower() in ("assistant", "model") else "user"
            messages.append({"role": role, "content": msg.content})

        latest_user_message = recent_messages[-1].content

        async with get_groq_client() as client:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=settings.GROQ_CHAT_MODEL,
                    messages=[*messages, {"role": "user", "content": latest_user_message}],
                    temperature=0.7,
                    max_completion_tokens=800,
                    reasoning_effort="none",
                ),
                timeout=30,
            )

        reply = response.choices[0].message.content
        if not reply:
            raise HTTPException(status_code=502, detail="Groq returned an empty chat response.")
        return {"reply": reply}

    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="The AI service took too long to respond. Please try again.",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process chat: {str(e)}")
