from fastapi import APIRouter
from app.api.v1 import auth, quizzes, grades, chat, srs

api_router = APIRouter()
api_router.include_router(auth.router, tags=["Auth"])
api_router.include_router(quizzes.router, tags=["Quizzes"])
api_router.include_router(grades.router, tags=["Grades"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
api_router.include_router(srs.router, tags=["Spaced Repetition"])
