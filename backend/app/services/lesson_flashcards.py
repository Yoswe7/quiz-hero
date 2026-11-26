from __future__ import annotations

import base64
import binascii
import re
from typing import Optional

from pydantic import BaseModel, Field

from app.services.llm_router import (
    _extract_docx_text,
    _extract_pdf_text,
    generate_structured,
)

MAX_SECTION_CHARS = 2200
TARGET_CHUNK_CHARS = 1200

_HEADING_PATTERN = re.compile(
    r"^(?:"
    r"#{1,4}\s+.+|"
    r"(?:chapter|unit|module|lesson|part|section|topic)\s+(?:\d+|[ivxlcdm]+)\b.*|"
    r"\d+(?:\.\d+){0,2}[.)]\s+[A-Z].+|"
    r"[A-Z][A-Z0-9\s,&:/-]{3,60}"
    r")$",
    re.IGNORECASE,
)


class GeneratedFlashcardItem(BaseModel):
    prompt: str = Field(min_length=1)
    correct_answer: str = Field(min_length=1)
    explanation: str = Field(default="")
    section_title: str = Field(default="")


class GeneratedFlashcards(BaseModel):
    cards: list[GeneratedFlashcardItem] = Field(default_factory=list)


def decode_and_extract_lesson_text(
    file_base64: str,
    filename: str,
    mime_type: Optional[str] = None,
) -> str:
    """Decode a base64 lesson file (PDF, DOCX, or plain text) and extract its text."""
    encoded = file_base64.strip()
    if encoded.startswith("data:"):
        _, separator, encoded = encoded.partition(",")
        if not separator:
            raise ValueError("Invalid data URL.")
    try:
        raw_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 file payload.") from exc

    mime = (mime_type or "").lower()
    name = (filename or "").lower()

    if mime == "application/pdf" or name.endswith(".pdf"):
        text = _extract_pdf_text(raw_bytes)
    elif (
        mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or name.endswith(".docx")
    ):
        text = _extract_docx_text(raw_bytes)
    elif mime.startswith("text/") or name.endswith((".txt", ".md", ".csv")):
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = raw_bytes.decode("latin-1", errors="replace")
    else:
        raise ValueError("Unsupported file type. Upload a PDF, DOCX, TXT, or MD file.")

    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("No readable text could be extracted from that file.")
    return cleaned


def _is_heading(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 90:
        return False
    if stripped.endswith((".", "?", "!", ";", ",")) and not re.match(
        r"^(?:chapter|unit|module|lesson|part|section|\d+\.)", stripped, re.IGNORECASE
    ):
        return False
    if stripped.startswith("#"):
        return True
    if re.match(
        r"^(?:chapter|unit|module|lesson|part|section|topic)\s+(?:\d+|[ivxlcdm]+)\b",
        stripped,
        re.IGNORECASE,
    ):
        return True
    if re.match(r"^\d+(?:\.\d+){0,2}[.)]\s+\S+", stripped) and len(stripped.split()) <= 12:
        return True
    if stripped.isupper() and 2 <= len(stripped.split()) <= 10:
        return True
    return False


def _chunk_long_text(title: str, body: str) -> list[tuple[str, str]]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if not paragraphs:
        return []
    chunks: list[tuple[str, str]] = []
    current: list[str] = []
    current_len = 0

    for para in paragraphs:
        if current and current_len + len(para) > TARGET_CHUNK_CHARS:
            part_num = len(chunks) + 1
            chunk_title = title if part_num == 1 else f"{title} (Part {part_num})"
            chunks.append((chunk_title, "\n\n".join(current)))
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += len(para) + 2

    if current:
        part_num = len(chunks) + 1
        chunk_title = title if part_num == 1 else f"{title} (Part {part_num})"
        chunks.append((chunk_title, "\n\n".join(current)))
    return chunks


def split_lesson_into_sections(text: str) -> list[dict]:
    """Split lesson text into selectable sections by headings or paragraph chunks."""
    normalized = (text or "").replace("\r\n", "\n").strip()
    if not normalized:
        return []

    raw_sections: list[tuple[str, list[str]]] = []
    current_title = "Overview"
    current_lines: list[str] = []

    for line in normalized.split("\n"):
        if _is_heading(line):
            body = "\n".join(current_lines).strip()
            if body:
                raw_sections.append((current_title, current_lines))
            current_title = re.sub(r"^#{1,4}\s*", "", line.strip())
            current_lines = []
        else:
            current_lines.append(line)

    if "\n".join(current_lines).strip():
        raw_sections.append((current_title, current_lines))

    final_sections: list[tuple[str, str]] = []
    for title, lines in raw_sections:
        body = "\n".join(lines).strip()
        if not body:
            continue
        if len(body) > MAX_SECTION_CHARS:
            final_sections.extend(_chunk_long_text(title, body))
        else:
            final_sections.append((title, body))

    if len(final_sections) == 1 and len(final_sections[0][1]) > TARGET_CHUNK_CHARS:
        final_sections = _chunk_long_text(final_sections[0][0], final_sections[0][1])

    result: list[dict] = []
    for idx, (title, content) in enumerate(final_sections):
        one_line = " ".join(content.split())
        preview = one_line[:180] + ("..." if len(one_line) > 180 else "")
        result.append(
            {
                "index": idx,
                "title": title[:200],
                "preview": preview,
                "content": content,
                "char_count": len(content),
            }
        )
    return result


async def generate_flashcards_from_sections(
    topic: str,
    sections: list[dict],
    card_count: int = 8,
) -> list[dict]:
    """Generate study flashcards strictly from the user-selected lesson sections."""
    combined_parts = []
    for sec in sections:
        title = (sec.get("title") or "Section").strip()
        content = (sec.get("content") or "").strip()
        if content:
            combined_parts.append(f"### {title}\n{content}")

    source_block = "\n\n".join(combined_parts)[:22000]
    if not source_block.strip():
        raise ValueError("Selected lesson sections contain no readable text.")

    prompt = (
        f"Topic: {topic.strip()}\n"
        f"Create EXACTLY {card_count} high-yield spaced-repetition flashcards strictly from the selected lesson sections below.\n"
        "Rules:\n"
        "- Each card must test one clear concept, definition, formula, or distinction found ONLY in the provided text.\n"
        "- 'prompt': A concise, unambiguous question or active-recall prompt for the front of the card.\n"
        "- 'correct_answer': A crisp, accurate answer for the back of the card.\n"
        "- 'explanation': 1-2 sentences explaining why or giving key context from the lesson.\n"
        "- 'section_title': The exact section heading this card came from.\n\n"
        f"--- SELECTED LESSON SECTIONS ---\n{source_block}\n--- END ---"
    )

    generated = await generate_structured(
        prompt=prompt,
        schema=GeneratedFlashcards,
        task="generation",
        system_prompt=(
            "You are an expert academic study-card author. Return strictly valid JSON matching the requested schema."
        ),
        generation_mode="fast",
    )

    cards = [
        {
            "prompt": c.prompt.strip(),
            "correct_answer": c.correct_answer.strip(),
            "explanation": c.explanation.strip() or None,
            "section_title": c.section_title.strip() or None,
        }
        for c in (generated.cards or [])
        if c.prompt.strip() and c.correct_answer.strip()
    ]
    if not cards:
        raise ValueError("AI did not return any valid flashcards from the selected sections.")
    return cards[:card_count]
