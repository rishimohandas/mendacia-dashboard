# Mendacia Dashboard

Mendacia (SIREN) is a multimodal media forensics dashboard.
Current repo status: backend MVP is implemented and frontend can now integrate against stable endpoints.

## Current State
- Backend framework: Flask
- Processing model: in-memory async job pipeline
- Pipeline order: TwelveLabs normalize -> Module A -> Module B -> Module C -> Final ForensicReport
- LLM provider default: Gemini (Vertex endpoint first)
- Persistence: none (in-memory only, by design for MVP speed)

## Repository Layout
- `backend/` API server, AI pipeline, schemas, docs, scripts
- `frontend/` UI app (next stage)
- `TEAM_HANDOFF.md` teammate onboarding and caveats
- `FRONTEND_GUIDELINES.md` frontend integration contract

## Backend Endpoints
- `POST /api/upload`
- `GET /api/job/<job_id>`
- `GET /api/report/<job_id>`
- `GET /api/video/<job_id>`

## What Is Verified
- Mock mode end-to-end works (`MOCK_MODE=true`).
- Real non-mock pipeline runs with sample MP4 and returns a valid report shape.
- Gemini key path works via Vertex endpoint.

## Current Caveat
In real runs, TwelveLabs may return sparse metadata for some videos; backend then falls back to generic scene chunks so report output remains valid but less detailed.

## Quick Start
See `backend/README.md` for setup, env vars, and test commands.
