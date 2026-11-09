import secrets
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import google.generativeai as genai

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    ENABLE_LOCAL_TEST_AUTH: bool = False
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
    REDIS_URL: str = ""
    RATE_LIMIT_ENABLED: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_rate_limit_storage(self) -> "Settings":
        if (
            self.RATE_LIMIT_ENABLED
            and self.ENVIRONMENT.lower() == "production"
            and not self.REDIS_URL
        ):
            raise ValueError("REDIS_URL is required when rate limiting is enabled in production.")
        return self

settings = Settings()

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

def get_model() -> genai.GenerativeModel:
    return genai.GenerativeModel(
        model_name="gemini-3.6-flash",
        generation_config={"response_mime_type": "application/json"}
    )
