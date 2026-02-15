from typing import List

from pydantic import BaseModel, Field


class SceneMetadata(BaseModel):
    scene_number: int
    start_time: float
    end_time: float
    visual_summary: str
    spoken_transcript: str
    detected_objects: List[str]


class MismatchFlag(BaseModel):
    timestamp: float
    flag_type: str
    description: str
    severity: str


class ModuleARationale(BaseModel):
    category: str
    evidence: str
    why: str
    confidence: float = Field(ge=0.0, le=1.0)


class ModuleAResult(BaseModel):
    manipulation_categories_detected: List[str]
    rationales: List[ModuleARationale]


class ForensicReport(BaseModel):
    video_id: str
    confidence_score: int
    classification: str
    classification_explanation: str
    ethical_note: str
    human_readable_report: str
    manipulation_categories_detected: List[str]
    manipulation_breakdown: List[ModuleARationale]
    scenes: List[SceneMetadata]
    inconsistency_flags: List[MismatchFlag]


class ClaimItem(BaseModel):
    id: str
    text: str
    timestamp_range: str
    confidence: float = Field(ge=0.0, le=1.0)


class ModuleBResult(BaseModel):
    claims: List[ClaimItem]


class ModuleCResult(BaseModel):
    inconsistency_flags: List[MismatchFlag]
