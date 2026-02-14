#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
VIDEO_PATH="${2:-backend/mock/demo.mp4}"

if [[ ! -f "$VIDEO_PATH" ]]; then
  mkdir -p "$(dirname "$VIDEO_PATH")"
  printf 'mock mp4 payload' > "$VIDEO_PATH"
fi

echo "Uploading video..."
JOB_ID=$(curl -sS -X POST "$BASE_URL/api/upload" \
  -F "video=@${VIDEO_PATH};type=video/mp4" \
  -F "context_text=Smoke test context" \
  -F "duration_seconds=120" | python3 -c 'import json,sys; print(json.load(sys.stdin)["job_id"])')

echo "job_id=${JOB_ID}"

STATUS="queued"
for _ in $(seq 1 30); do
  RESP=$(curl -sS "$BASE_URL/api/job/$JOB_ID")
  STATUS=$(echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status",""))')
  PROGRESS=$(echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("progress",0))')
  echo "status=${STATUS} progress=${PROGRESS}"
  if [[ "$STATUS" == "done" || "$STATUS" == "error" ]]; then
    break
  fi
  sleep 1
done

if [[ "$STATUS" != "done" ]]; then
  echo "Job did not complete successfully"
  curl -sS "$BASE_URL/api/job/$JOB_ID"
  exit 1
fi

echo "Fetching report..."
curl -sS "$BASE_URL/api/report/$JOB_ID" | python3 -m json.tool | sed -n '1,80p'

echo "Checking video endpoint..."
HTTP_CODE=$(curl -sS -o /tmp/truthlens_smoke_video.mp4 -w "%{http_code}" "$BASE_URL/api/video/$JOB_ID")
echo "video_status=${HTTP_CODE} saved=/tmp/truthlens_smoke_video.mp4"
