# Project Structure

## Root Directory
- `backend/` API server and AI processing pipeline
- `frontend/` React dashboard UI
- `.env` and `backend/.env` environment variables (gitignored)
- `README.md` project status
- `TEAM_HANDOFF.md` teammate handoff notes
- `FRONTEND_GUIDELINES.md` frontend implementation guidance

---

## Backend (`/backend`)

The backend handles uploads, multimodal analysis orchestration, and forensic report generation.

```text
backend/
├── main.py                      # Flask entry point + endpoints + job store
├── requirements.txt             # Python dependencies
├── README.md                    # Backend run/setup docs
├── schema.md                    # Module I/O and final report schema docs
├── app/
│   ├── main.py                  # App import compatibility wrapper
│   ├── engine/
│   │   └── consistency.py       # Module C heuristics
│   ├── models/
│   │   └── schemas.py           # Pydantic output and module schemas
│   └── services/
│       ├── twelvelabs_client.py # TwelveLabs v1.3 integration + normalization
│       ├── llm_client.py        # Gemini/OpenAI abstraction (Vertex-first for Gemini)
│       └── pipeline.py          # Module A -> B -> C orchestration
├── mock/
│   └── sample_metadata.json     # Deterministic mock pipeline input
├── uploads/                     # Uploaded mp4 files (runtime)
└── scripts/
    └── smoke_test.sh            # Endpoint smoke test helper
```

### Backend Responsibilities
- Accept video upload requests.
- Process jobs asynchronously with progress updates.
- Query TwelveLabs for metadata (or fallback in mock/sparse modes).
- Run manipulation taxonomy and claim extraction.
- Run cross-modal consistency checks.
- Return strict JSON forensic report output.

---

## Frontend (`/frontend`)

The frontend should integrate using backend job endpoints, polling, and report rendering.

### Frontend Responsibilities
- Upload MP4 and optional context.
- Poll job status until done/error.
- Render classification, confidence, scenes, and inconsistency flags.
- Play uploaded video using `/api/video/<job_id>`.
