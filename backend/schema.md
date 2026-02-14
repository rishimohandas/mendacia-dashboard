# TruthLens Backend Schemas

Implementation note:
- All module outputs are strict JSON and validated through Pydantic models.
- If external metadata is sparse, backend preserves schema validity using conservative fallback values.

## Module A: Manipulation Taxonomy Classifier
Input keys:
- `transcript`: array of time-coded transcript chunks
- `scene_summaries`: array of scene objects with `visual_summary`
- `semantic_moments`: array of semantic evidence moments
- `context_text`: optional external context

Output keys:
- `manipulation_categories_detected`: `string[]`
- `rationales`: array of objects:
  - `category`: string
  - `evidence`: timestamp range (`m:ss-m:ss`)
  - `why`: string
  - `confidence`: float `0.0-1.0`

Example:
```json
{
  "manipulation_categories_detected": ["Fear amplification", "Visual–speech mismatch"],
  "rationales": [
    {
      "category": "Fear amplification",
      "evidence": "0:34-0:52",
      "why": "Escalatory wording may indicate emotional amplification.",
      "confidence": 0.71
    }
  ]
}
```

## Module B: Claim Extraction
Input keys:
- `transcript`: array of time-coded transcript chunks

Output keys:
- `claims`: array of objects:
  - `id`: string (`C1`, `C2`, ...)
  - `text`: string
  - `timestamp_range`: string (`m:ss-m:ss`)
  - `confidence`: float `0.0-1.0`

Example:
```json
{
  "claims": [
    {
      "id": "C1",
      "text": "The speaker suggests the city is in widespread crisis.",
      "timestamp_range": "0:20-0:45",
      "confidence": 0.62
    }
  ]
}
```

## Module C: Cross-Modal Consistency
Input keys:
- `claims`: Module B claims
- `scenes`: scene metadata (`visual_summary`, `detected_objects`, timestamps)
- `semantic_moments`: timestamped semantic evidence

Output keys:
- `inconsistency_flags`: array of objects:
  - `timestamp`: float seconds
  - `flag_type`: string
  - `description`: string
  - `severity`: `low|medium|high`

Example:
```json
{
  "inconsistency_flags": [
    {
      "timestamp": 34.0,
      "flag_type": "Visual–Narrative Escalation Mismatch",
      "description": "Claim language suggests escalation while visuals appear calm, which may indicate framing inflation.",
      "severity": "high"
    }
  ]
}
```

## Final Report: `ForensicReport`
Keys (must match `backend/app/models/schemas.py`):
- `video_id`: string
- `confidence_score`: integer `0-100`
- `classification`: `propaganda-likely | manufactured-synthetic | malicious-advertising | low-manipulation`
- `manipulation_categories_detected`: string[]
- `scenes`: `SceneMetadata[]`
  - `scene_number`, `start_time`, `end_time`, `visual_summary`, `spoken_transcript`, `detected_objects`
- `inconsistency_flags`: `MismatchFlag[]`
  - `timestamp`, `flag_type`, `description`, `severity`

Example:
```json
{
  "video_id": "mock-video-001",
  "confidence_score": 68,
  "classification": "propaganda-likely",
  "manipulation_categories_detected": ["Fear amplification", "Visual–speech mismatch"],
  "scenes": [
    {
      "scene_number": 1,
      "start_time": 0.0,
      "end_time": 35.0,
      "visual_summary": "Organized march with calm crowd movement and police vehicle visible.",
      "spoken_transcript": "The city is in total chaos and violence is everywhere according to this report.",
      "detected_objects": ["crowd", "police vehicle", "banners"]
    }
  ],
  "inconsistency_flags": [
    {
      "timestamp": 34.0,
      "flag_type": "Visual–Narrative Escalation Mismatch",
      "description": "Claim language suggests escalation while visuals appear calm, which may indicate framing inflation.",
      "severity": "high"
    }
  ]
}
```
