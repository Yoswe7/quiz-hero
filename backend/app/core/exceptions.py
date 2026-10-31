import logging
import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("quiz_hero")

class QuizGenerationError(Exception):
    pass

class AIGradingError(Exception):
    pass

class AuthenticationError(Exception):
    pass

def _cors_headers(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin")
    if origin:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    return {}

def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(QuizGenerationError)
    async def quiz_generation_exception_handler(request: Request, exc: QuizGenerationError) -> JSONResponse:
        logger.error(f"QuizGenerationError: {exc}")
        return JSONResponse(
            status_code=500,
            content={"message": f"Quiz generation failed: {str(exc)}", "detail": str(exc)},
            headers=_cors_headers(request),
        )

    @app.exception_handler(AIGradingError)
    async def ai_grading_exception_handler(request: Request, exc: AIGradingError) -> JSONResponse:
        logger.error(f"AIGradingError: {exc}")
        return JSONResponse(
            status_code=500,
            content={"message": f"AI grading failed: {str(exc)}", "detail": str(exc)},
            headers=_cors_headers(request),
        )

    @app.exception_handler(AuthenticationError)
    async def authentication_exception_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={"message": f"Authentication failed: {str(exc)}", "detail": str(exc)},
            headers=_cors_headers(request),
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(f"Unhandled Exception: {exc}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"message": "Internal server error", "detail": str(exc)},
            headers=_cors_headers(request),
        )
