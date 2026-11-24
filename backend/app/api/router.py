from fastapi import APIRouter
from app.api.v1 import auth, quizzes, grades, chat, srs, faculty_attempts, faculty_retakes, materials

api_router = APIRouter()
api_router.include_router(auth.router, tags=["Auth"])
api_router.include_router(quizzes.router, tags=["Quizzes"])
api_router.include_router(grades.router, tags=["Grades"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
api_router.include_router(srs.router, tags=["Spaced Repetition"])
api_router.include_router(faculty_attempts.router, prefix="/faculty", tags=["Faculty"])
api_router.include_router(faculty_retakes.router, prefix="/faculty", tags=["Faculty"])
api_router.include_router(materials.router, tags=["Materials"])
