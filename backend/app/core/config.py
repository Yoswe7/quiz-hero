import secrets
from pydantic_settings import BaseSettings, SettingsConfigDict
import google.generativeai as genai

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/quiz_hero"
    GEMINI_API_KEY: str = ""
    JWT_SECRET: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ]
    GOOGLE_CLIENT_ID: str = ""
    ADMIN_EMAILS: str = "joshuagabriel.tejada@cvsu.edu.ph"
    TEACHER_EMAILS: str = "joshuagabriel.tejada@cvsu.edu.ph"
    FACULTY_ACCESS_CODE: str = "CVSU_FACULTY_2026"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

def get_model() -> genai.GenerativeModel:
    return genai.GenerativeModel(
        model_name="gemini-3.6-flash",
        generation_config={"response_mime_type": "application/json"}
    )
