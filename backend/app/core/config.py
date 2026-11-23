import secrets
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from google import genai

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
    GEMINI_MAX_CONCURRENT_PER_USER: int = 2
    GEMINI_GENERATION_MODEL: str = "gemini-3.8-flash"
    GEMINI_GRADING_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_CHAT_MODEL: str = "gemini-3.1-flash-lite-preview"
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    CLOUDFLARE_ACCOUNT_ID: str = ""
    CLOUDFLARE_API_TOKEN: str = ""
    GEMINI_GENERATION_MODELS: list[str] = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]
    GEMINI_GRADING_MODELS: list[str] = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite-preview"]
    GEMINI_CHAT_MODELS: list[str] = ["gemini-3.1-flash-lite-preview", "gemini-3.5-flash-lite"]
    GROQ_GENERATION_MODELS: list[str] = [
        "openai/gpt-oss-120b",
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-20b",
    ]
    GROQ_GRADING_MODELS: list[str] = [
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-120b",
    ]
    GROQ_CHAT_MODELS: list[str] = [
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-120b",
    ]
    OPENROUTER_GENERAL_MODELS: list[str] = ["openrouter/free"]
    OPENROUTER_VISION_MODELS: list[str] = [
        "nvidia/nemotron-3.5-super-vl:free",
        "openrouter/free",
    ]

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

GENERATION_MODEL = settings.GEMINI_GENERATION_MODEL
GRADING_MODEL = settings.GEMINI_GRADING_MODEL
CHAT_MODEL = settings.GEMINI_CHAT_MODEL

# Back-compat/profile aliases. The multi-provider router is the source of
# truth; these expose the ordered model lists for each provider and task.
GEMINI_MODELS = {
    "generation": settings.GEMINI_GENERATION_MODELS,
    "grading": settings.GEMINI_GRADING_MODELS,
    "chat": settings.GEMINI_CHAT_MODELS,
}
GROQ_MODELS = {
    "generation": settings.GROQ_GENERATION_MODELS,
    "grading": settings.GROQ_GRADING_MODELS,
    "chat": settings.GROQ_CHAT_MODELS,
}
OPENROUTER_MODELS = {
    "general": settings.OPENROUTER_GENERAL_MODELS,
    "vision": settings.OPENROUTER_VISION_MODELS,
}

# Client setup is lazy per call site; nothing runs at import time except the
# Settings parse above.
def get_client() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=settings.GEMINI_API_KEY)

