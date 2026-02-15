import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from app.services.pipeline import PipelineService

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
for env_path in (BASE_DIR / ".env", BASE_DIR.parent / ".env"):
    if env_path.exists():
        load_dotenv(env_path, override=False)

ALLOWED_EXTENSIONS = {"mp4"}
DEFAULT_DURATION_SECONDS = 150
MAX_DURATION_SECONDS = 180

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024  # 1GB
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ]
        }
    },
)

jobs: Dict[str, Dict[str, Any]] = {}
jobs_lock = threading.Lock()
pipeline_service = PipelineService()


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _new_job_record(video_path: str) -> Dict[str, Any]:
    return {
        "status": "queued",
        "progress": 0,
        "message": "Queued for processing",
        "video_path": video_path,
        "twelvelabs_raw": None,
        "normalized_metadata": None,
        "moduleA_result": None,
        "moduleB_result": None,
        "moduleC_result": None,
        "final_report": None,
        "error": None,
    }


def _set_job(job_id: str, **kwargs: Any) -> None:
    with jobs_lock:
        if job_id not in jobs:
            jobs[job_id] = {}
        jobs[job_id].update(kwargs)


def _job_progress_callback(job_id: str) -> Callable[[int, str], None]:
    def _callback(progress: int, message: str) -> None:
        _set_job(job_id, progress=max(0, min(100, int(progress))), message=message)

    return _callback


def _process_job(job_id: str, context_text: str, duration_seconds: int) -> None:
    try:
        _set_job(job_id, status="processing", progress=5, message="Job started")
        with jobs_lock:
            video_path = jobs[job_id]["video_path"]

        result = pipeline_service.run(
            video_path=video_path,
            context_text=context_text,
            duration_seconds=duration_seconds,
            progress_callback=_job_progress_callback(job_id),
        )

        _set_job(
            job_id,
            status="done",
            progress=100,
            message="Job completed successfully",
            twelvelabs_raw=result.get("twelvelabs_raw"),
            normalized_metadata=result.get("normalized_metadata"),
            moduleA_result=result.get("moduleA_result"),
            moduleB_result=result.get("moduleB_result"),
            moduleC_result=result.get("moduleC_result"),
            final_report=result.get("final_report"),
        )
    except Exception as exc:  # noqa: BLE001
        _set_job(
            job_id,
            status="error",
            progress=100,
            message="Job failed",
            error=str(exc),
        )


@app.route("/api/upload", methods=["POST"])
def upload_video():
    if "video" not in request.files:
        return jsonify({"error": "Missing video file"}), 400

    video = request.files["video"]
    if not video or not video.filename:
        return jsonify({"error": "Invalid video file"}), 400

    if not _allowed_file(video.filename):
        return jsonify({"error": "Only mp4 files are supported"}), 400

    context_text = request.form.get("context_text", "")
    try:
        duration_seconds = int(request.form.get("duration_seconds", DEFAULT_DURATION_SECONDS))
    except ValueError:
        return jsonify({"error": "duration_seconds must be an integer"}), 400
    if duration_seconds <= 0:
        return jsonify({"error": "duration_seconds must be positive"}), 400
    duration_seconds = min(duration_seconds, MAX_DURATION_SECONDS)

    job_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    safe_name = secure_filename(video.filename)
    filename = f"{job_id}_{timestamp}_{safe_name}"
    video_path = str((UPLOAD_DIR / filename).resolve())
    video.save(video_path)

    with jobs_lock:
        jobs[job_id] = _new_job_record(video_path)

    worker = threading.Thread(
        target=_process_job,
        args=(job_id, context_text, duration_seconds),
        daemon=True,
    )
    worker.start()

    return jsonify({"job_id": job_id}), 202


@app.route("/api/job/<job_id>", methods=["GET"])
def get_job_status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"status": "error", "progress": 100, "message": "Job not found"}), 404

    message = job.get("message") or ""
    if job.get("status") == "error" and job.get("error"):
        message = f"{message}: {job['error']}"

    return jsonify(
        {
            "status": job.get("status", "queued"),
            "progress": int(job.get("progress", 0)),
            "message": message,
        }
    )


@app.route("/api/report/<job_id>", methods=["GET"])
def get_report(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if job.get("status") == "error":
        return jsonify({"error": "Job failed", "message": job.get("error", "Unknown error")}), 500

    report = job.get("final_report")
    if not report:
        return jsonify({"error": "Report not ready", "status": job.get("status")}), 202

    return jsonify(report)


@app.route("/api/video/<job_id>", methods=["GET"])
def get_uploaded_video(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    video_path = job.get("video_path")
    if not video_path or not Path(video_path).exists():
        return jsonify({"error": "Video not found"}), 404

    return send_file(video_path, mimetype="video/mp4")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
