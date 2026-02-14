from pydantic import BaseModel
from typing import List, Optional

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

class ForensicReport(BaseModel):
    video_id: str
    confidence_score: int 
    classification: str 
    manipulation_categories_detected: List[str] 
    scenes: List[SceneMetadata]
    inconsistency_flags: List[MismatchFlag]