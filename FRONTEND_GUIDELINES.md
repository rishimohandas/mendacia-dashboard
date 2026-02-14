# Frontend Guidelines (TruthLens)

## Current Backend Readiness
The backend is ready for frontend integration with these stable endpoints:
- `POST /api/upload`
- `GET /api/job/<job_id>`
- `GET /api/report/<job_id>`
- `GET /api/video/<job_id>`

Response format is JSON for all except `/api/video/<job_id>` (mp4 stream).

## Suggested Frontend Flow
1. User uploads MP4 (+ optional context text, optional duration).
2. Call `POST /api/upload`, store `job_id`.
3. Poll `GET /api/job/<job_id>` every 1-2s.
4. When status is `done`, fetch `GET /api/report/<job_id>`.
5. Render report sections and attach video source from `/api/video/<job_id>`.

## Endpoint Contracts

### `POST /api/upload`
Multipart form fields:
- `video` (required, mp4)
- `context_text` (optional)
- `duration_seconds` (optional, default 150)

Response:
```json
{"job_id":"uuid"}
```

### `GET /api/job/<job_id>`
Response:
```json
{
  "status":"queued|processing|done|error",
  "progress": 0,
  "message":"..."
}
```

### `GET /api/report/<job_id>`
Returns final report:
```json
{
  "video_id":"...",
  "confidence_score":0,
  "classification":"propaganda-likely|manufactured-synthetic|malicious-advertising|low-manipulation",
  "manipulation_categories_detected":[],
  "scenes":[],
  "inconsistency_flags":[]
}
```

## Recommended UI Sections
- Upload panel (file, context text, duration)
- Processing state (status + progress + message)
- Video player (`/api/video/<job_id>`)
- Classification + confidence badge
- Manipulation categories list
- Scene timeline/cards
- Inconsistency flags table (timestamp, type, severity, description)

## UX States You Must Handle
- `uploading`
- `queued/processing`
- `done`
- `error`
- `report not ready` (`202` from `/api/report/...`)
- empty/sparse report (possible in fallback metadata scenarios)

## Frontend Data Assumptions
- `scenes` may be auto-generated fallback chunks.
- `inconsistency_flags` can be empty.
- `manipulation_categories_detected` may contain only 1 category.
- Always render safely when arrays are empty.

## Local Dev Defaults
Backend runs on: `http://localhost:8000`
CORS is enabled for localhost dev.

## Practical Implementation Notes
- Keep `job_id` in React state/router query so page refresh can resume polling.
- Stop polling once status is `done` or `error`.
- Add a max poll timeout (for example 5 minutes) with retry CTA.
- Convert flag timestamps from seconds to `mm:ss` for readability.

## What Is Already Good Enough To Build Frontend Now
- API surface is stable.
- End-to-end pipeline is running.
- Gemini + TwelveLabs paths are wired.
- Mock mode exists for deterministic UI development.

## Known Backend Caveat (for UI expectations)
In some real runs, TwelveLabs can return sparse metadata; backend falls back to generic scene segmentation. UI should still present report structure gracefully rather than failing.
