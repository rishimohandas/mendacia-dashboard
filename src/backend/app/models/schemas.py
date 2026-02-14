from pydantic import BaseModel
from typing import List, Optional

# 1. The data extracted per scene by TwelveLabs
class SceneMetadata(BaseModel):
    scene_number: int
    start_time: float
    end_time: float
    visual_summary: str
    spoken_transcript: str
    detected_objects: List[str]

# 2. Specific manipulation flags caught by your Cross-Modal Engine
class MismatchFlag(BaseModel):
    timestamp: float
    flag_type: str # e.g., "Visual-Narrative Escalation Mismatch"
    description: str
    severity: str # "High", "Medium", "Low"

# 3. The final payload sent to the React Frontend
class ForensicReport(BaseModel):
    video_id: str
    confidence_score: int # 0-100
    classification: str # e.g., "Propaganda-Likely"
    manipulation_categories_detected: List[str] # e.g., ["Fear Amplification", "Context Stripping"]
    scenes: List[SceneMetadata]
    inconsistency_flags: List[MismatchFlag]