import secrets
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from groq import AsyncGroq

GROQ_MAX_IMAGE_BYTES = 14 * 1024 * 1024

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    ENABLE_LOCAL_TEST_AUTH: bool = False
    DATABASE_URL: str = "sqlite+aiosqlite:///./quiz_hero.db"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "qwen/qwen3.8-27b"
    GROQ_CHAT_MODEL: str = "qwen/qwen3.8-27b"
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
    AI_MAX_CONCURRENT_PER_USER: int = 2

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

def get_groq_client() -> AsyncGroq:
    api_key = settings.GROQ_API_KEY.strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured on the server.")
    return AsyncGroq(api_key=api_key, timeout=60, max_retries=2)
