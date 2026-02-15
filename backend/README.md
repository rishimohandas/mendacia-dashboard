# TruthLens Backend (Flask MVP)

## Setup
1. `cd backend`
2. Create `.env` in the repo root (or backend) with required keys.
3. Install dependencies:
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r requirements.txt`
4. Run server:
   - `python main.py`

Backend-only one-command start:
- `./scripts/start_backend.sh`

Server runs at `http://localhost:8000`.

## Environment Variables
Required:
- `TWELVELABS_API_KEY`
- `LLM_API_KEY`

Optional:
- `TWELVELABS_INDEX_ID` (if missing, backend creates an index)
- `LLM_PROVIDER` = `openai` or `gemini` (default: `gemini`)
- `MOCK_MODE` = `true` or `false` (default: `false`)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `GEMINI_MODEL` (default: `gemini-2.5-flash-lite`)
- `TWELVELABS_TIMEOUT` seconds (default: `300`)

Example `.env`:
```env
TWELVELABS_API_KEY=...
TWELVELABS_INDEX_ID=
LLM_API_KEY=...
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash-lite
MOCK_MODE=true
```

## API Endpoints

### `POST /api/upload`
Multipart fields:
- `video` (mp4, optional)
- `document` (txt/pdf, optional)
- `text_content` (raw text string, optional)
- `context_text` (optional)
- `duration_seconds` (optional, default `150`)

Provide exactly one primary input: `video`, `document`, or `text_content`.

Video example:
```bash
curl -X POST http://localhost:8000/api/upload \
  -F "video=@/absolute/path/video.mp4" \
  -F "context_text=Optional article context" \
  -F "duration_seconds=150"
```

Document example:
```bash
curl -X POST http://localhost:8000/api/upload \
  -F "document=@/absolute/path/article.pdf" \
  -F "context_text=Optional context" \
  -F "duration_seconds=150"
```

Inline text example:
```bash
curl -X POST http://localhost:8000/api/upload \
  -F "text_content=The speaker claims the situation is in total chaos." \
  -F "context_text=Optional context"
```

Response:
```json
{"job_id":"<uuid>"}
```

### `GET /api/job/<job_id>`
Returns processing status.

```bash
curl http://localhost:8000/api/job/<job_id>
```

### `GET /api/report/<job_id>`
Returns validated `ForensicReport` JSON when done.

```bash
curl http://localhost:8000/api/report/<job_id>
```

### `GET /api/video/<job_id>`
Streams uploaded mp4 when the job input was a video.

```bash
curl -L http://localhost:8000/api/video/<job_id> -o out.mp4
```

## Notes
- Jobs are stored in-memory and processed with background threads.
- `MOCK_MODE=true` or missing `TWELVELABS_API_KEY` uses `mock/sample_metadata.json` for deterministic demos.
- All endpoint responses are JSON except `/api/video/<job_id>` which serves mp4 bytes.
- Gemini calls use Vertex endpoint first (`aiplatform.googleapis.com`) with AI Studio fallback.
- Real pipeline is verified, but some videos can return sparse TwelveLabs metadata; fallback scene chunking keeps report output valid.

## API Smoke Test
After server is running:
```bash
./scripts/smoke_test.sh http://localhost:8000
```
Optional video path:
```bash
./scripts/smoke_test.sh http://localhost:8000 /absolute/path/video.mp4
```
