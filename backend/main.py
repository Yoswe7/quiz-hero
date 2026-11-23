import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.router import api_router
from app.api.dependencies import init_db
from app.core.config import settings
from app.core.exceptions import register_exception_handlers

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="Quiz Hero API",
    version="2.0",
    description="Quiz generation and assessment platform",
    lifespan=lifespan
)

app.add_middleware(SessionMiddleware, secret_key=settings.JWT_SECRET)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(api_router)

@app.get("/")
def root():
    return {"status": "ok", "message": "Quiz Hero API (Refactored) is running"}

@app.get("/health")
def health():
    return {"status": "ok"}