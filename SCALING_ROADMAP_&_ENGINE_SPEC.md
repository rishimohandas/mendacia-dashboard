# Mendacia Backend Handoff (Hackathon Team)

## Purpose
This file is a quick handoff to continue backend work safely and consistently.

## Current Backend Flow
1. `POST /api/upload` accepts one MP4 and creates an in-memory `job_id`.
2. Background worker runs pipeline in order:
   - TwelveLabs ingestion + metadata normalization
   - Module A: manipulation category detection
   - Module B: claim extraction
   - Module C: cross-modal inconsistency flags
3. Final output is validated with `ForensicReport` (Pydantic) and stored in job state.
4. `GET /api/job/<job_id>` returns status/progress.
5. `GET /api/report/<job_id>` returns final forensic JSON.
6. `GET /api/video/<job_id>` streams uploaded MP4.

## Key Files
- `backend/main.py`: Flask app, routes, in-memory job store, background thread.
- `backend/app/services/pipeline.py`: orchestrates A -> B -> C -> final report.
- `backend/app/services/twelvelabs_client.py`: TwelveLabs integration and normalization.
- `backend/app/services/llm_client.py`: provider abstraction (`openai` or `gemini`).
- `backend/app/engine/consistency.py`: Module C heuristic logic.
- `backend/app/models/schemas.py`: output schemas (`SceneMetadata`, `MismatchFlag`, `ForensicReport`) + module schemas.

## Environment Setup (VSCode/Codex friendly)
From repo root:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` in repo root or `backend/.env`:
```env
TWELVELABS_API_KEY=...
TWELVELABS_INDEX_ID=
LLM_API_KEY=...
LLM_PROVIDER=gemini
MOCK_MODE=true
```

Run:
```bash
cd backend
source .venv/bin/activate
python main.py
```

## Testing Modes
- `MOCK_MODE=true`: deterministic demo path using `backend/mock/sample_metadata.json`.
- `MOCK_MODE=false`: real TwelveLabs + LLM path.

Smoke test script:
```bash
./backend/scripts/smoke_test.sh http://localhost:8000 /absolute/path/video.mp4
```

## Important Implementation Notes
- TwelveLabs task/index/search path now prefers `v1.3` API.
- Index creation handles duplicate-name conflict by reusing existing index ID.
- Task upload requires a real playable MP4. Fake bytes renamed to `.mp4` fail with `video_file_broken`.
- Gemini currently works through Vertex endpoint (`aiplatform.googleapis.com`) with current team key setup.
- Jobs are in-memory only. Restarting the server loses job state.
- CORS is enabled for localhost frontend dev.

## Known Risks / Limitations
- No persistent DB (intentionally deferred for MVP/hackathon speed).
- No queue durability; thread jobs can be lost on crash.
- Real LLM and TwelveLabs behavior depends on API quota/key validity.
- Some videos may produce sparse metadata from TwelveLabs; backend falls back to generic scene chunks.

## SQLite Feasibility
SQLite is feasible if needed later, but currently deferred:
- Keep same API contract.
- Persist `jobs` + module outputs + final report JSON.
- Preserve status/progress across app restarts.

## Example Final Report Shape
This is the expected output contract from `GET /api/report/<job_id>`:
```json
{
  "video_id": "mock-video-001",
  "confidence_score": 68,
  "classification": "propaganda-likely",
  "manipulation_categories_detected": [
    "Fear amplification",
    "Visual–speech mismatch"
  ],
  "scenes": [
    {
      "scene_number": 1,
      "start_time": 0.0,
      "end_time": 35.0,
      "visual_summary": "Organized march with calm crowd movement and police vehicle visible.",
      "spoken_transcript": "The city is in total chaos...",
      "detected_objects": ["crowd", "police vehicle", "banners"]
    }
  ],
  "inconsistency_flags": [
    {
      "timestamp": 34.0,
      "flag_type": "Visual–Narrative Escalation Mismatch",
      "description": "Claim language suggests high escalation while visuals appear relatively calm, which may indicate narrative inflation.",
      "severity": "high"
    }
  ]
}
```

## Why This Aligns with Problem Statement
- Not just "fake/not fake": outputs structured manipulation evidence.
- Includes scene-level evidence and cross-modal mismatch flags.
- Keeps language conservative ("may indicate", "suggests") to match ethical framing.

## Team Checklist Before Demo
1. Add real keys in `.env`.
2. Ensure `LLM_PROVIDER=gemini` and `LLM_API_KEY` are set in `.env` (Gemini is current default).
3. Use a real MP4 in `backend/mock/` or any local path.
4. Run smoke test and verify `classification`, `scenes`, and `inconsistency_flags` are populated.
