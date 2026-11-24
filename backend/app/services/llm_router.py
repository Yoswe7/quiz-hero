from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, Type

import pypdf
from google import genai
from google.genai import types
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.config import GONKARO_MODELS, NVIDIA_MODELS, settings

logger = logging.getLogger("quiz_hero.llm")
logger.setLevel(logging.INFO)

if not logger.handlers:
    _console = logging.StreamHandler()
    _console.setFormatter(logging.Formatter("%(levelname)s quiz_hero.llm: %(message)s"))
    logger.addHandler(_console)
    logger.propagate = False

GEN_TIMEOUT = 25.0
GRADE_TIMEOUT = 12.0
CHAT_TIMEOUT = 10.0


def _timeout_for(provider: str, task: str) -> float:
    """Per-provider request deadline. NVIDIA's free hosted endpoints run large
    reasoning models and measured 30-40s even for a two-item completion, so
    they get generous budgets instead of starving under the Groq/Gemini limits."""
    if provider == "nvidia":
        return {"generation": 90.0, "grading": 45.0, "chat": 30.0}.get(task, GEN_TIMEOUT)
    if provider == "gonkaro":
        # GLM-5.3-Flash on Gonkaro measured ~77s for 20 questions: a short
        # deadline would always abort before the response arrives.
        return {"generation": 120.0, "grading": 45.0, "chat": 30.0}.get(task, GEN_TIMEOUT)
    return GEN_TIMEOUT if task == "generation" else (GRADE_TIMEOUT if task == "grading" else CHAT_TIMEOUT)
PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOCX_TEXT_MAX_CHARS = 25_000
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_TEXT_CHARS_ROUTING = 24_000
DAILY_COOLDOWN = 60 * 60  # suspected daily (RPD) quota exhaustion
DEFAULT_COOLDOWN = 15 * 60

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


class LLMRouterError(RuntimeError):
    """Raised when every candidate provider failed for a request."""


# ---------------------------------------------------------------- cooldowns
_cooldowns: dict[str, datetime] = {}
_cooldown_lock = asyncio.Lock()
_redis_client = None
_redis_attempted = False


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _redis():
    global _redis_client, _redis_attempted
    if _redis_attempted:
        return _redis_client
    _redis_attempted = True
    try:
        if settings.REDIS_URL:
            import redis.asyncio as redis_asyncio
            _redis_client = redis_asyncio.from_url(
                settings.REDIS_URL, decode_responses=True, socket_timeout=3
            )
    except Exception as exc:  # pragma: no cover - redis optional path
        logger.warning("Redis unavailable for LLM cooldowns: %s", type(exc).__name__)
        _redis_client = None
    return _redis_client


def _cooldown_key(provider: str, model: str) -> str:
    return f"{provider}:{model}".strip()


def _classify(exc: BaseException) -> str:
    code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "timeout"
    text = str(exc).lower()
    if code in (401, 403):
        return "auth"
    if code == 429 or "resource_exhausted" in text or "rate limit" in text:
        return "rate_limit"
    if code in (502, 503, 504):
        return "unavailable"
    if code == 400:
        return "bad_request"
    if code is not None:
        return f"http_{code}"
    return "error"


def _rejects_response_format(exc: BaseException) -> bool:
    """True when a provider refused response_format/json mode rather than the
    request itself. Used to retry once without structured mode."""
    code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if code not in (None, 400, 422):
        return False
    text = str(exc).lower()
    return any(
        token in text
        for token in ("response_format", "json mode", "json_object", "guided", "structured output")
    )


_RETRY_PATTERNS = [    re.compile(r"retryDelay[\"']?\s*[:=]\s*[\"']?(\d+)\s*s"),
    re.compile(r"[Rr]etry[-_ ][Aa]fter[\"'\s:=]*(\d+)"),
    re.compile(r"retry in\s+(\d+)\s*s"),
]


def _cooldown_seconds(exc: BaseException) -> int:
    text = str(exc)
    for pattern in _RETRY_PATTERNS:
        match = pattern.search(text)
        if match:
            return max(60, min(6 * 3600, int(match.group(1)) + 5))
    lowered = text.lower()
    if "perday" in lowered or "per day" in lowered or "rpd" in lowered or "day" in lowered:
        return DAILY_COOLDOWN
    return DEFAULT_COOLDOWN


async def _is_cooldown(provider: str, model: str) -> bool:
    key = _cooldown_key(provider, model)
    async with _cooldown_lock:
        until = _cooldowns.get(key)
        if until and until > _utcnow():
            return True
        _cooldowns.pop(key, None)
    client = _redis()
    if client:
        try:
            value = await client.get(f"quiz-hero:llm-cooldown:{key}")
            if value and float(value) > time.time():
                return True
        except Exception:
            pass
    return False


def _should_set_cooldown(exc: BaseException) -> bool:
    return _classify(exc) in {"rate_limit", "unavailable", "timeout"}


async def _mark_cooldown(provider: str, model: str, exc: BaseException) -> None:
    secs = _cooldown_seconds(exc)
    async with _cooldown_lock:
        _cooldowns[_cooldown_key(provider, model)] = _utcnow() + timedelta(seconds=secs)
    client = _redis()
    if client:
        try:
            await client.setex(
                f"quiz-hero:llm-cooldown:{_cooldown_key(provider, model)}",
                secs,
                str(time.time() + secs),
            )
        except Exception:
            pass
    logger.warning(
        "llm_router cooldown %s (%ss) classifier=%s",
        _cooldown_key(provider, model),
        secs,
        _classify(exc),
    )


# ------------------------------------------------------------- schemas
def _normalize_strict(node: object) -> None:
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict):
            node["additionalProperties"] = False
            node["required"] = list(props.keys())
        for value in list(node.values()):
            _normalize_strict(value)
    elif isinstance(node, list):
        for item in node:
            _normalize_strict(item)


def strict_json_schema(schema: Type[BaseModel]) -> dict:
    """Build a strict (additionalProperties:false, all-required) JSON schema."""
    schema_dict = schema.model_json_schema()
    _normalize_strict(schema_dict)
    return schema_dict


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _strip_fences(text: str) -> str:
    cleaned = _FENCE_RE.sub("", (text or "").strip()).strip()
    return cleaned


def _schema_instruction(schema: Type[BaseModel]) -> str:
    return (
        "\n\nRespond with ONLY a single valid JSON object (no markdown fences) "
        "matching this JSON schema:\n" + json.dumps(schema.model_json_schema())
    )


def _content_parts(prompt: str, file_bytes: Optional[bytes], mime_type: Optional[str]) -> list:
    parts: list[dict] = [{"type": "text", "text": prompt}]
    if file_bytes and mime_type in IMAGE_MIMES:
        b64 = base64.b64encode(file_bytes).decode()
        parts.append(
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}}
        )
    return parts


# ---------------------------------------------------------- extraction
def _extract_docx_text(file_bytes: bytes) -> str:
    """Extract text from a .docx (python-docx), capped like PDF text."""
    try:
        from docx import Document
        document = Document(io.BytesIO(file_bytes))
        text = "\n".join(p.text for p in document.paragraphs)
    except Exception as exc:
        logger.warning("docx extraction failed (%s)", type(exc).__name__)
        return ""
    return text.strip()[:DOCX_TEXT_MAX_CHARS]


def _extract_pdf_text(file_bytes: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        pages = [(page.extract_text() or "") for page in reader.pages]
        return "\n".join(pages).strip()
    except Exception as exc:
        logger.warning("pypdf extraction failed: %s", type(exc).__name__)
        return ""


# ----------------------------------------------------------- providers
def _gemini_config(
    task: Literal["generation", "grading", "chat"],
    schema: Optional[Type[BaseModel]] = None,
    system_prompt: Optional[str] = None,
    max_output_tokens: Optional[int] = None,
) -> types.GenerateContentConfig:
    kwargs: dict = dict(temperature=0 if task != "chat" else 0.7)
    if system_prompt is not None:
        kwargs["system_instruction"] = system_prompt
    if max_output_tokens is not None:
        kwargs["max_output_tokens"] = max_output_tokens
    if task == "chat":
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
    else:
        thinking = types.ThinkingLevel.MINIMAL if task == "grading" else types.ThinkingLevel.LOW
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=thinking)
    if schema is not None:
        kwargs["response_mime_type"] = "application/json"
        kwargs["response_schema"] = schema
    return types.GenerateContentConfig(**kwargs)


async def _call_gemini(
    provider_model: str,
    task: Literal["generation", "grading", "chat"],
    *,
    prompt: Optional[str] = None,
    schema: Optional[Type[BaseModel]] = None,
    file_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None,
    system_prompt: Optional[str] = None,
    messages: Optional[list[dict]] = None,
    max_output_tokens: Optional[int] = None,
    timeout: float,
):
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = _gemini_config(task, schema, system_prompt, max_output_tokens)

    if messages is not None:
        contents = [
            types.Content(
                role=("user" if m["role"].lower() == "user" else "model"),
                parts=[types.Part(text=m["content"])],
            )
            for m in messages
        ]
    elif file_bytes:
        contents = [
            types.Part.from_bytes(data=file_bytes, mime_type=mime_type or PDF_MIME),
            types.Part.from_text(text=prompt or ""),
        ]
    else:
        contents = prompt or ""

    def _invoke():
        return client.models.generate_content(
            model=provider_model, contents=contents, config=config
        )

    response = await asyncio.wait_for(asyncio.to_thread(_invoke), timeout=timeout)

    if schema is None:
        return response.text or ""
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, schema):
        return parsed
    return schema.model_validate_json(response.text or "")


def _openai_client(provider: str, timeout: float) -> AsyncOpenAI:
    if provider == "groq":
        base_url, api_key = "https://api.groq.com/openai/v1", settings.GROQ_API_KEY
    elif provider == "nvidia":
        base_url, api_key = "https://integrate.api.nvidia.com/v1", settings.NVIDIA_API_KEY
    elif provider == "gonkaro":
        base_url, api_key = "https://api.gonkarouter.io/v1", settings.GONKARO_API_KEY
    else:
        base_url, api_key = "https://openrouter.ai/api/v1", settings.OPENROUTER_API_KEY
    return AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=timeout, max_retries=0)


def _is_strict_model(provider: str, model: str, task: str = "generation") -> bool:
    if provider == "groq":
        # Groq's strict json_schema grammar measurably inflates output (~1,300
        # vs ~780 completion tokens on a 15-question quiz) and was ~40% slower
        # than json_object in repeated trials. Generation uses the loose path
        # (schema instruction + existing validation/retry); grading keeps
        # strict because its output is tiny and correctness matters more.
        if task == "generation":
            return False
        return model.startswith(("openai/gpt-oss-120b", "openai/gpt-oss-20b"))
    return provider == "openrouter"


def _chat_messages(
    prompt: Optional[str],
    system_prompt: Optional[str],
    history: Optional[list[dict]],
    file_bytes: Optional[bytes],
    mime_type: Optional[str],
    json_object_only: bool = False,
    schema_instruction: Optional[str] = None,
) -> list[dict]:
    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if history:
        for m in history:
            role = "assistant" if m["role"].lower() == "model" else "user"
            messages.append({"role": role, "content": m["content"]})
    if prompt is not None:
        text = prompt + (schema_instruction or "")
        if file_bytes and mime_type in IMAGE_MIMES:
            messages.append({"role": "user", "content": _content_parts(text, file_bytes, mime_type)})
        else:
            messages.append({"role": "user", "content": text})
    return messages


async def _call_openai_compatible(
    provider: str,
    model: str,
    task: Literal["generation", "grading", "chat"],
    *,
    prompt: Optional[str] = None,
    schema: Optional[Type[BaseModel]] = None,
    file_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None,
    system_prompt: Optional[str] = None,
    messages: Optional[list[dict]] = None,
    max_output_tokens: Optional[int] = None,
    timeout: float,
):
    client = _openai_client(provider, timeout)
    is_vision = bool(file_bytes) and mime_type in IMAGE_MIMES
    # gpt-oss on Groq defaults to a "medium" reasoning budget. For schema-
    # constrained tasks that reasoning is wasted: measured on a 15-question
    # generation it added ~850 output tokens and doubled latency (4.2s -> 2.2s).
    reasoning_kwargs = (
        {"reasoning_effort": "low"}
        if provider == "groq" and model.startswith("openai/gpt-oss")
        else {}
    )

    if schema is not None:
        max_output_tokens = max_output_tokens if max_output_tokens is not None else (
            8192 if task == "generation" else 1024
        )
        if is_vision:
            response_format = {"type": "json_object"}
            instruction = _schema_instruction(schema)
            request_messages = _chat_messages(
                prompt, system_prompt, messages, file_bytes, mime_type, False, instruction
            )
            extra_body = (
                {"provider": {"require_parameters": True}} if provider == "openrouter" else None
            )
            response = await client.chat.completions.create(
                model=model,
                messages=request_messages,
                response_format=response_format,
                temperature=0,
                max_tokens=max_output_tokens,
                extra_body=extra_body,
                **reasoning_kwargs,
            )
            text = _strip_fences(response.choices[0].message.content or "")
            return schema.model_validate_json(text)

        if _is_strict_model(provider, model, task):
            strict_schema = strict_json_schema(schema)
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "strict": True,
                    "schema": strict_schema,
                },
            }
            extra_body = (
                {"provider": {"require_parameters": True}} if provider == "openrouter" else None
            )
            request_messages = _chat_messages(
                prompt, system_prompt, messages, None, None
            )
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=request_messages,
                    response_format=response_format,
                    temperature=0,
                    max_tokens=max_output_tokens,
                    extra_body=extra_body,
                    **reasoning_kwargs,
                )
                return schema.model_validate_json(_strip_fences(response.choices[0].message.content or ""))
            except Exception as exc:
                message = str(exc).lower()
                if "json_schema" not in message and "structured" not in message and not isinstance(exc, ValueError):
                    # Not a format rejection; do not burn a fallback call.
                    raise
                # fall through to json_object below
                logger.info("openrouter/%s rejected json_schema; falling back to json_object", model)

        # json_object + schema instruction fallback path
        response_format = {"type": "json_object"}
        instruction = _schema_instruction(schema)
        request_messages = _chat_messages(
            prompt, system_prompt, messages, None, None, True, instruction
        )
        extra_body = (
            {"provider": {"require_parameters": True}} if provider == "openrouter" else None
        )
        request_kwargs = dict(
            model=model,
            messages=request_messages,
            response_format=response_format,
            temperature=0,
            max_tokens=max_output_tokens,
            extra_body=extra_body,
            **reasoning_kwargs,
        )
        try:
            response = await client.chat.completions.create(**request_kwargs)
        except Exception as exc:
            # Some hosts (notably individual NVIDIA NIM models) reject
            # json_object mode. Retry once without response_format; the schema
            # instruction embedded in the prompt still constrains the output.
            if not _rejects_response_format(exc):
                raise
            logger.info(
                "%s/%s rejected json_object; retrying without response_format",
                provider,
                model,
            )
            request_kwargs.pop("response_format", None)
            response = await client.chat.completions.create(**request_kwargs)
        return schema.model_validate_json(_strip_fences(response.choices[0].message.content or ""))
    # chat path: free-form, no structured mode
    request_messages = _chat_messages(
        prompt, system_prompt, messages, file_bytes, mime_type, False, None
    )
    response = await client.chat.completions.create(
        model=model,
        messages=request_messages,
        temperature=0.7,
        max_tokens=max_output_tokens if max_output_tokens is not None else 1024,
        **reasoning_kwargs,
    )
    return (response.choices[0].message.content or "").strip()


# --------------------------------------------------------- routing
def _route_order(is_large_text: bool, is_image: bool, is_pdf: bool) -> list[str]:
    # gonkaro is always last: its GLM model works but is much slower than the
    # other providers, so it is a genuine fallback rather than a peer.
    if is_pdf:
        return ["gemini", "nvidia", "groq", "openrouter", "gonkaro"]
    if is_image:
        return ["gemini", "nvidia", "openrouter"]
    if is_large_text:
        return ["nvidia", "gemini", "openrouter", "groq", "gonkaro"]
    # Generation gets an OpenRouter fallback right after Groq: measured
    # `openrouter/free` at 4.7s (5q) and 8.1s (15q), comparable to Groq's
    # own numbers, with independent rate limits.
    return ["groq", "openrouter", "gemini", "nvidia", "gonkaro"]


async def _attempt_provider(
    provider: str,
    task: Literal["generation", "grading", "chat"],
    *,
    prompt: Optional[str] = None,
    schema: Optional[Type[BaseModel]] = None,
    file_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None,
    system_prompt: Optional[str] = None,
    messages: Optional[list[dict]] = None,
    max_output_tokens: Optional[int] = None,
    pdf_text: Optional[str] = None,
):
    is_image = bool(file_bytes) and mime_type in IMAGE_MIMES

    def _prompt_for(provider_name: str) -> str:
        if task == "chat":
            return prompt or ""
        if mime_type == PDF_MIME and pdf_text is not None:
            return f"{prompt}\n\nSOURCE MATERIAL:\n{pdf_text}"
        return prompt or ""

    if provider == "gemini":
        if not settings.GEMINI_API_KEY:
            logger.info("llm_router skip gemini: GEMINI_API_KEY not configured")
            return None, "gemini key not configured"
        models = GEMINI_MODELS[task]
        timeout = _timeout_for(provider, task)
        return (
            lambda model: _call_gemini(
                model,
                task,
                prompt=prompt,
                schema=schema,
                file_bytes=file_bytes,
                mime_type=mime_type,
                system_prompt=system_prompt,
                messages=messages,
                max_output_tokens=max_output_tokens,
                timeout=timeout,
            ),
            models,
        )

    if provider == "groq":
        if not settings.GROQ_API_KEY:
            logger.info("llm_router skip groq: GROQ_API_KEY not configured")
            return None, "groq key not configured"
        if is_image:
            return None, "groq models do not support this image input"
        if mime_type == PDF_MIME and not pdf_text:
            return None, "pdf requires native document support"
        models = GROQ_MODELS[task]
        timeout = _timeout_for(provider, task)
        effective_prompt = _prompt_for("groq")
        return (
            lambda model: _call_openai_compatible(
                provider,
                model,
                task,
                prompt=effective_prompt if task != "chat" else None,
                schema=schema,
                file_bytes=None,
                mime_type=None,
                system_prompt=system_prompt,
                messages=messages,
                max_output_tokens=max_output_tokens,
                timeout=timeout,
            ),
            models,
        )

    if provider == "nvidia":
        if not settings.NVIDIA_API_KEY:
            logger.info("llm_router skip nvidia: NVIDIA_API_KEY not configured")
            return None, "nvidia key not configured"
        if mime_type == PDF_MIME and not pdf_text:
            return None, "pdf requires native document support"
        models = NVIDIA_MODELS["vision"] if is_image else NVIDIA_MODELS[task]
        timeout = _timeout_for(provider, task)
        effective_prompt = _prompt_for("nvidia")
        return (
            lambda model: _call_openai_compatible(
                provider,
                model,
                task,
                prompt=effective_prompt if task != "chat" else None,
                schema=schema,
                file_bytes=file_bytes if is_image else None,
                mime_type=mime_type if is_image else None,
                system_prompt=system_prompt,
                messages=messages,
                max_output_tokens=max_output_tokens,
                timeout=timeout,
            ),
            models,
        )

    if provider == "gonkaro":
        if not settings.GONKARO_API_KEY:
            logger.info("llm_router skip gonkaro: GONKARO_API_KEY not configured")
            return None, "gonkaro key not configured"
        if mime_type == PDF_MIME and not pdf_text:
            return None, "pdf requires native document support"
        models = GONKARO_MODELS[task]
        timeout = _timeout_for(provider, task)
        effective_prompt = _prompt_for("gonkaro")
        return (
            lambda model: _call_openai_compatible(
                provider,
                model,
                task,
                prompt=effective_prompt if task != "chat" else None,
                schema=schema,
                file_bytes=file_bytes if is_image else None,
                mime_type=mime_type if is_image else None,
                system_prompt=system_prompt,
                messages=messages,
                max_output_tokens=max_output_tokens,
                timeout=timeout,
            ),
            models,
        )

    if provider == "openrouter":
        if not settings.OPENROUTER_API_KEY:
            logger.info("llm_router skip openrouter: OPENROUTER_API_KEY not configured")
            return None, "openrouter key not configured"
        if mime_type == PDF_MIME and not pdf_text:
            return None, "pdf requires native document support"
        models = OPENROUTER_MODELS["vision"] if is_image else OPENROUTER_MODELS["general"]
        timeout = _timeout_for(provider, task)
        effective_prompt = _prompt_for("openrouter")
        return (
            lambda model: _call_openai_compatible(
                provider,
                model,
                task,
                prompt=effective_prompt if task != "chat" else None,
                schema=schema,
                file_bytes=file_bytes,
                mime_type=mime_type,
                system_prompt=system_prompt,
                messages=messages,
                max_output_tokens=max_output_tokens,
                timeout=timeout,
            ),
            models,
        )

    return None, f"unknown provider {provider}"


async def generate_structured(
    prompt: str,
    schema: Type[BaseModel],
    *,
    task: Literal["generation", "grading"],
    file_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> BaseModel:
    if not isinstance(schema, type) or not issubclass(schema, BaseModel):
        raise TypeError("schema must be a Pydantic BaseModel subclass")

    is_image = bool(file_bytes) and mime_type in IMAGE_MIMES
    is_pdf = bool(file_bytes) and mime_type == PDF_MIME
    is_word = bool(file_bytes) and mime_type == DOCX_MIME
    is_large_text = (not file_bytes) and len(prompt) > MAX_TEXT_CHARS_ROUTING

    pdf_text: Optional[str] = None
    if is_word:
        # .docx is text-based: extract it once and take the same fast
        # plain-text route as text PDFs (Groq first).
        docx_text = _extract_docx_text(file_bytes)
        logger.info("llm_router docx text extracted (%d chars)", len(docx_text))
        if docx_text:
            prompt = f"SOURCE MATERIAL:\n{docx_text}\n\n--- END OF SOURCE MATERIAL ---\n\n{prompt}"
        file_bytes = None
        mime_type = None
        is_word = False
        is_large_text = False
    if is_pdf:
        pdf_text = _extract_pdf_text(file_bytes)
        if pdf_text and len(pdf_text.strip()) >= 500:
            # Text-based PDFs are far faster as plain text: Groq/Gemini can
            # read the extracted text directly, and we avoid shipping the
            # binary document to every provider (Gemini re-parses it each time).
            prompt = f"{prompt}\n\nSOURCE MATERIAL:\n{pdf_text.strip()}"
            file_bytes = None
            mime_type = None
            is_pdf = False
            is_large_text = False
        else:
            # Scanned/image-only PDF: only Gemini can read the raw document.
            pdf_text = None

    notes: list[str] = []
    last_error: Optional[BaseException] = None

    if pdf_text is not None and not is_pdf:
        logger.info(
            "llm_router pdf text extracted (%d chars) -> routing as plain text",
            len(pdf_text),
        )

    for provider in _route_order(is_large_text, is_image, is_pdf):
        attempt, models = await _attempt_provider(
            provider,
            task,
            prompt=prompt,
            schema=schema,
            file_bytes=file_bytes,
            mime_type=mime_type,
            system_prompt=system_prompt,
            pdf_text=pdf_text,
        )
        if attempt is None:
            continue
        for model in models:
            if await _is_cooldown(provider, model):
                logger.info("llm_router skip %s:%s (on cooldown)", provider, model)
                notes.append(f"{provider}:{model} cooldown")
                continue
            try:
                logger.info("llm_router attempt %s:%s (task=%s)", provider, model, task)
                started = time.perf_counter()
                result = await attempt(model)
                logger.info(
                    "llm_router success %s:%s (task=%s) in %.1fs",
                    provider, model, task, time.perf_counter() - started,
                )
                return result
            except asyncio.TimeoutError as exc:
                last_error = exc
                await _mark_cooldown(provider, model, exc)
                notes.append(f"{provider}:{model} timeout")
            except Exception as exc:
                last_error = exc
                if _should_set_cooldown(exc):
                    await _mark_cooldown(provider, model, exc)
                notes.append(f"{provider}:{model} failed ({_classify(exc)})")

    logger.warning("llm_router exhausted for task=%s; notes=%s", task, notes)
    raise LLMRouterError(
        f"All providers failed to produce a response for task '{task}'. "
        + ("; ".join(notes) if notes else "no configured provider keys.")
    ) from last_error


async def generate_chat(
    messages: list[dict],
    *,
    system_prompt: str,
    max_output_tokens: int = 1024,
) -> str:
    total_chars = sum(len(str(m.get("content", ""))) for m in messages) + len(system_prompt)
    is_large_text = total_chars > MAX_TEXT_CHARS_ROUTING

    last_error: Optional[BaseException] = None
    notes: list[str] = []

    for provider in _route_order(is_large_text, False, False):
        attempt, models = await _attempt_provider(
            provider,
            "chat",
            prompt=None,
            messages=messages,
            system_prompt=system_prompt,
            max_output_tokens=max_output_tokens,
        )
        if attempt is None:
            continue
        for model in models:
            if await _is_cooldown(provider, model):
                logger.info("llm_router chat skip %s:%s (on cooldown)", provider, model)
                notes.append(f"{provider}:{model} cooldown")
                continue
            try:
                logger.info("llm_router chat attempt %s:%s", provider, model)
                started = time.perf_counter()
                reply = await attempt(model)
                logger.info(
                    "llm_router chat success %s:%s in %.1fs",
                    provider, model, time.perf_counter() - started,
                )
                return reply
            except asyncio.TimeoutError as exc:
                last_error = exc
                await _mark_cooldown(provider, model, exc)
                notes.append(f"{provider}:{model} timeout")
            except Exception as exc:
                last_error = exc
                await _mark_cooldown(provider, model, exc)
                notes.append(f"{provider}:{model} failed ({_classify(exc)})")

    logger.warning("llm_router chat exhausted; notes=%s", notes)
    raise LLMRouterError(
        "Hero Bot could not reach any LLM provider. " + ("; ".join(notes) if notes else "no keys configured.")
    ) from last_error
