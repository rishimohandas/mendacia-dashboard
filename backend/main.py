import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional

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

ALLOWED_VIDEO_EXTENSIONS = {"mp4"}
ALLOWED_DOCUMENT_EXTENSIONS = {"txt", "pdf"}
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


def _file_extension(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


def _allowed_video_file(filename: str) -> bool:
    return _file_extension(filename) in ALLOWED_VIDEO_EXTENSIONS


def _allowed_document_file(filename: str) -> bool:
    return _file_extension(filename) in ALLOWED_DOCUMENT_EXTENSIONS


def _new_job_record(input_type: str, input_path: Optional[str]) -> Dict[str, Any]:
    return {
        "status": "queued",
        "progress": 0,
        "message": "Queued for processing",
        "input_type": input_type,
        "input_path": input_path,
        "video_path": input_path if input_type == "video" else None,
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
            input_type = str(jobs[job_id].get("input_type") or "video")
            input_path = jobs[job_id].get("input_path")

        result = pipeline_service.run(
            input_type=input_type,
            input_path=input_path,
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
    context_text = request.form.get("context_text", "")
    text_content = request.form.get("text_content", "")
    try:
        duration_seconds = int(request.form.get("duration_seconds", DEFAULT_DURATION_SECONDS))
    except ValueError:
        return jsonify({"error": "duration_seconds must be an integer"}), 400
    if duration_seconds <= 0:
        return jsonify({"error": "duration_seconds must be positive"}), 400
    duration_seconds = min(duration_seconds, MAX_DURATION_SECONDS)

    job_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    input_type = ""
    input_path: Optional[str] = None

    video = request.files.get("video")
    if video and video.filename:
        if not _allowed_video_file(video.filename):
            return jsonify({"error": "Only mp4 files are supported for video uploads"}), 400
        safe_name = secure_filename(video.filename)
        filename = f"{job_id}_{timestamp}_{safe_name}"
        saved_path = (UPLOAD_DIR / filename).resolve()
        video.save(str(saved_path))
        input_type = "video"
        input_path = str(saved_path)
    else:
        document = request.files.get("document")
        if document and document.filename:
            if not _allowed_document_file(document.filename):
                return jsonify({"error": "Only txt and pdf files are supported for document uploads"}), 400
            safe_name = secure_filename(document.filename)
            filename = f"{job_id}_{timestamp}_{safe_name}"
            saved_path = (UPLOAD_DIR / filename).resolve()
            document.save(str(saved_path))
            input_type = "pdf" if _file_extension(safe_name) == "pdf" else "text"
            input_path = str(saved_path)
        elif text_content.strip():
            filename = f"{job_id}_{timestamp}_inline.txt"
            saved_path = (UPLOAD_DIR / filename).resolve()
            saved_path.write_text(text_content.strip(), encoding="utf-8")
            input_type = "text"
            input_path = str(saved_path)
        else:
            return jsonify({"error": "Provide one of: video (mp4), document (txt/pdf), or text_content"}), 400

    with jobs_lock:
        jobs[job_id] = _new_job_record(input_type=input_type, input_path=input_path)

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

    if job.get("input_type") != "video":
        return jsonify({"error": "No uploaded video for this job"}), 404

    video_path = job.get("video_path")
    if not video_path or not Path(video_path).exists():
        return jsonify({"error": "Video not found"}), 404

    return send_file(video_path, mimetype="video/mp4")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
