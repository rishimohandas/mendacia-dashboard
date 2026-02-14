import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


class TwelveLabsClient:
    BASE_URL_V13 = "https://api.twelvelabs.io/v1.3"
    BASE_URL_V12 = "https://api.twelvelabs.io/v1.2"

    def __init__(self) -> None:
        self.api_key = os.getenv("TWELVELABS_API_KEY", "").strip()
        self.index_id = os.getenv("TWELVELABS_INDEX_ID", "").strip()
        self.timeout_seconds = int(os.getenv("TWELVELABS_TIMEOUT", "300"))

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def analyze_video(self, video_path: str, duration_seconds: int = 150) -> Dict[str, Any]:
        if not self.is_configured():
            raise RuntimeError("TWELVELABS_API_KEY is missing")

        index_id = self.index_id or self._ensure_index()
        task_id = self._upload_video_for_index(index_id=index_id, video_path=video_path)
        task_data = self._poll_task(task_id)

        video_id = (
            task_data.get("video_id")
            or task_data.get("video", {}).get("id")
            or task_data.get("id")
            or ""
        )

        transcript = self._fetch_transcript(index_id=index_id, video_id=video_id, duration_seconds=duration_seconds)
        scenes = self._fetch_scenes(index_id=index_id, video_id=video_id, duration_seconds=duration_seconds)
        semantic_moments = self._fetch_semantic_moments(index_id=index_id, video_id=video_id)

        return self._normalize(
            video_id=video_id,
            transcript=transcript,
            scenes=scenes,
            semantic_moments=semantic_moments,
            duration_seconds=duration_seconds,
        )

    def _headers(self) -> Dict[str, str]:
        return {"x-api-key": self.api_key}

    def _json_headers(self) -> Dict[str, str]:
        headers = self._headers().copy()
        headers["Content-Type"] = "application/json"
        return headers

    def _ensure_index(self) -> str:
        # Prefer v1.3 payload from current docs, then fallback to v1.2-compatible shape.
        payload_v13 = {
            "index_name": "truthlens-default-index",
            "models": [
                {
                    "model_name": "marengo2.7",
                    "model_options": ["visual", "audio"],
                }
            ],
            "addons": ["thumbnail"],
        }
        response = requests.post(
            f"{self.BASE_URL_V13}/indexes",
            headers=self._json_headers(),
            json=payload_v13,
            timeout=60,
        )
        if response.status_code == 409:
            existing = self._find_existing_index("truthlens-default-index")
            if existing:
                return existing
        if response.status_code >= 400:
            payload_v12 = {
                "index_name": "truthlens-default-index",
                "models": [{"name": "marengo2.7", "options": ["visual", "conversation", "text_in_video"]}],
                "addons": ["thumbnail"],
            }
            response = requests.post(
                f"{self.BASE_URL_V12}/indexes",
                headers=self._json_headers(),
                json=payload_v12,
                timeout=60,
            )
            if response.status_code == 409:
                existing = self._find_existing_index("truthlens-default-index")
                if existing:
                    return existing
        response.raise_for_status()
        data = response.json()
        index_id = data.get("id") or data.get("_id")
        if not index_id:
            raise RuntimeError("Failed to create TwelveLabs index")
        return index_id

    def _upload_video_for_index(self, index_id: str, video_path: str) -> str:
        with open(video_path, "rb") as video_file:
            files = {"video_file": (Path(video_path).name, video_file, "video/mp4")}
            data = {"index_id": index_id}
            response = requests.post(
                f"{self.BASE_URL_V13}/tasks",
                headers=self._headers(),
                files=files,
                data=data,
                timeout=120,
            )
        if response.status_code >= 400:
            raise RuntimeError(f"TwelveLabs task upload failed ({response.status_code}): {response.text[:500]}")
        task_data = response.json()
        task_id = task_data.get("id") or task_data.get("_id")
        if not task_id:
            raise RuntimeError("TwelveLabs task id not returned")
        return task_id

    def _poll_task(self, task_id: str) -> Dict[str, Any]:
        start_time = time.time()
        while time.time() - start_time < self.timeout_seconds:
            response = requests.get(
                f"{self.BASE_URL_V13}/tasks/{task_id}",
                headers=self._headers(),
                timeout=30,
            )
            if response.status_code >= 400:
                raise RuntimeError(f"TwelveLabs task poll failed ({response.status_code}): {response.text[:500]}")
            task_data = response.json()
            status = (task_data.get("status") or "").lower()
            if status in {"ready", "completed", "done"}:
                return task_data
            if status in {"failed", "error"}:
                raise RuntimeError(f"TwelveLabs task failed: {task_data}")
            time.sleep(3)

        raise TimeoutError("Timed out waiting for TwelveLabs task completion")

    def _fetch_transcript(self, index_id: str, video_id: str, duration_seconds: int) -> List[Dict[str, Any]]:
        if not video_id:
            return []

        # v1.3 docs support retrieving a video with transcription=true.
        response = requests.get(
            f"{self.BASE_URL_V13}/indexes/{index_id}/videos/{video_id}",
            headers=self._headers(),
            params={"transcription": "true"},
            timeout=60,
        )
        if response.status_code >= 400:
            response = requests.get(
                f"{self.BASE_URL_V12}/indexes/{index_id}/videos/{video_id}",
                headers=self._headers(),
                params={"transcription": "true"},
                timeout=60,
            )
        if response.status_code >= 400:
            return []

        data = response.json()
        if isinstance(data, list):
            results = data
        else:
            transcription = data.get("transcription") or {}
            if isinstance(transcription, list):
                results = transcription
            else:
                results = (
                    transcription.get("chunks")
                    or transcription.get("segments")
                    or data.get("transcript")
                    or []
                )
        transcript = []
        for item in results:
            start = float(item.get("start") or item.get("start_time") or 0.0)
            end = float(item.get("end") or item.get("end_time") or start + 4.0)
            if start > duration_seconds:
                continue
            transcript.append(
                {
                    "start": start,
                    "end": min(end, float(duration_seconds)),
                    "text": item.get("text") or item.get("transcript") or "",
                }
            )
        return transcript

    def _fetch_scenes(self, index_id: str, video_id: str, duration_seconds: int) -> List[Dict[str, Any]]:
        if not video_id:
            return []

        data = self._search(index_id=index_id, video_id=video_id, query="scene segmentation with objects and context")
        if not data:
            return []
        results = data.get("data") or data.get("results") or []
        scenes: List[Dict[str, Any]] = []
        for idx, item in enumerate(results, start=1):
            start = float(item.get("start") or item.get("start_time") or 0.0)
            end = float(item.get("end") or item.get("end_time") or start + 10.0)
            if start > duration_seconds:
                continue
            scenes.append(
                {
                    "scene_number": idx,
                    "start_time": start,
                    "end_time": min(end, float(duration_seconds)),
                    "visual_summary": item.get("text") or item.get("summary") or "",
                    "spoken_transcript": item.get("transcript") or "",
                    "detected_objects": self._extract_objects(item),
                }
            )
        return scenes

    def _fetch_semantic_moments(self, index_id: str, video_id: str) -> List[Dict[str, Any]]:
        queries = [
            "Where does the speaker make a strong claim?",
            "Where does the tone become urgent or fearful?",
            "Where are crowds, police, or conflict visible?",
            "Where is on-screen text reinforcing a message?",
        ]

        moments: List[Dict[str, Any]] = []
        if not video_id:
            return moments

        for query in queries:
            data = self._search(index_id=index_id, video_id=video_id, query=query)
            if not data:
                continue

            results = data.get("data") or data.get("results") or []
            for item in results[:3]:
                start = float(item.get("start") or item.get("start_time") or 0.0)
                end = float(item.get("end") or item.get("end_time") or start + 5.0)
                moments.append(
                    {
                        "query": query,
                        "start": start,
                        "end": end,
                        "text": item.get("text") or item.get("summary") or "",
                    }
                )
        return moments

    def _normalize(
        self,
        video_id: str,
        transcript: List[Dict[str, Any]],
        scenes: List[Dict[str, Any]],
        semantic_moments: List[Dict[str, Any]],
        duration_seconds: int,
    ) -> Dict[str, Any]:
        transcript_sorted = sorted(transcript, key=lambda x: float(x.get("start") or 0.0))

        if not scenes:
            scenes = self._fallback_scenes_from_transcript(transcript_sorted, duration_seconds)

        scenes_sorted = sorted(scenes, key=lambda x: float(x.get("start_time") or 0.0))
        for scene in scenes_sorted:
            scene["spoken_transcript"] = self._collect_transcript_for_scene(scene, transcript_sorted)
            scene["scene_number"] = int(scene.get("scene_number") or 1)
            scene["detected_objects"] = list(scene.get("detected_objects") or [])

        for moment in semantic_moments:
            moment["scene_number"] = self._resolve_scene_number(scenes_sorted, float(moment.get("start") or 0.0))

        return {
            "video_id": video_id,
            "transcript": transcript_sorted,
            "scenes": scenes_sorted,
            "semantic_moments": semantic_moments,
            "raw": {
                "transcript": transcript,
                "scenes": scenes,
                "semantic_moments": semantic_moments,
            },
        }

    def _collect_transcript_for_scene(self, scene: Dict[str, Any], transcript: List[Dict[str, Any]]) -> str:
        start = float(scene.get("start_time") or 0.0)
        end = float(scene.get("end_time") or start)
        lines = [
            str(item.get("text") or "").strip()
            for item in transcript
            if float(item.get("start") or 0.0) <= end and float(item.get("end") or 0.0) >= start
        ]
        return " ".join([line for line in lines if line]).strip()

    def _resolve_scene_number(self, scenes: List[Dict[str, Any]], timestamp: float) -> int:
        for scene in scenes:
            if float(scene.get("start_time") or 0.0) <= timestamp <= float(scene.get("end_time") or 0.0):
                return int(scene.get("scene_number") or 1)
        return int(scenes[0].get("scene_number") or 1) if scenes else 1

    def _fallback_scenes_from_transcript(self, transcript: List[Dict[str, Any]], duration_seconds: int) -> List[Dict[str, Any]]:
        if not transcript:
            return [
                {
                    "scene_number": 1,
                    "start_time": 0.0,
                    "end_time": float(duration_seconds),
                    "visual_summary": "Limited scene metadata available from provider.",
                    "spoken_transcript": "",
                    "detected_objects": [],
                }
            ]

        scenes = []
        chunk_size = 30.0
        current_start = 0.0
        scene_number = 1
        while current_start < duration_seconds:
            current_end = min(current_start + chunk_size, float(duration_seconds))
            text_parts = [
                str(item.get("text") or "")
                for item in transcript
                if float(item.get("start") or 0.0) <= current_end and float(item.get("end") or 0.0) >= current_start
            ]
            scenes.append(
                {
                    "scene_number": scene_number,
                    "start_time": current_start,
                    "end_time": current_end,
                    "visual_summary": "Auto-generated fallback segment summary.",
                    "spoken_transcript": " ".join([t for t in text_parts if t]).strip(),
                    "detected_objects": [],
                }
            )
            current_start = current_end
            scene_number += 1
        return scenes

    def _extract_objects(self, source: Dict[str, Any]) -> List[str]:
        objects: List[str] = []
        candidate_fields = ["detected_objects", "objects", "tags", "keywords"]
        for field in candidate_fields:
            value = source.get(field)
            if isinstance(value, list):
                objects.extend([str(item) for item in value if item])
            elif isinstance(value, str) and value.strip():
                objects.extend([part.strip() for part in value.split(",") if part.strip()])

        # Stable order and dedupe for deterministic outputs.
        return sorted(set(objects))

    def _search(self, index_id: str, video_id: str, query: str) -> Dict[str, Any]:
        payload_v13 = {
            "query_text": query,
            "search_options": ["visual", "audio"],
            "index_id": index_id,
            "video_id": video_id,
        }
        response = requests.post(
            f"{self.BASE_URL_V13}/search",
            headers=self._json_headers(),
            json=payload_v13,
            timeout=60,
        )
        if response.status_code < 400:
            return response.json()

        payload_v12 = {
            "query": query,
            "search_options": ["visual", "conversation", "text_in_video"],
            "index_id": index_id,
            "video_id": video_id,
            "group_by": "clip",
        }
        response = requests.post(
            f"{self.BASE_URL_V12}/search",
            headers=self._json_headers(),
            json=payload_v12,
            timeout=60,
        )
        if response.status_code < 400:
            return response.json()
        return {}

    def _find_existing_index(self, index_name: str) -> Optional[str]:
        for base in (self.BASE_URL_V13, self.BASE_URL_V12):
            response = requests.get(f"{base}/indexes", headers=self._headers(), timeout=60)
            if response.status_code >= 400:
                continue
            data = response.json()
            records = data.get("data") or data.get("indexes") or []
            for item in records:
                if item.get("index_name") == index_name:
                    return item.get("id") or item.get("_id")
        return None


def load_mock_metadata(path: Optional[str] = None) -> Dict[str, Any]:
    default_path = Path(__file__).resolve().parents[2] / "mock" / "sample_metadata.json"
    mock_path = Path(path) if path else default_path
    if not mock_path.exists():
        raise FileNotFoundError(f"Mock metadata file not found: {mock_path}")
    return json.loads(mock_path.read_text(encoding="utf-8"))
