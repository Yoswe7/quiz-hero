from pydantic import BaseModel, Field
from typing import Optional


class StudentAnswerOverride(BaseModel):
    """Single answer override from faculty grading interface."""
    answer_index: int = Field(
        description="Index of the answer in the submission's answers list",
        ge=0,
    )
    is_overridden: bool = Field(
        default=False,
        description="Whether the faculty is overriding this answer",
    )
    awarded_points: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Points awarded for this answer (0.0 to 1.0 per question)",
    )


class StudentAnswerOverrideResponse(BaseModel):
    """Response schema for a single overridden answer."""
    answer_index: int
    is_overridden: bool
    awarded_points: float