import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import requests


class TwelveLabsClient:
    BASE_URL_V13 = "https://api.twelvelabs.io/v1.3"
    BASE_URL_V12 = "https://api.twelvelabs.io/v1.2"

    def __init__(self) -> None:
        self.api_key = os.getenv("TWELVELABS_API_KEY", "").strip()
        self.index_id = os.getenv("TWELVELABS_INDEX_ID", "").strip()
        self.timeout_seconds = int(os.getenv("TWELVELABS_TIMEOUT", "300"))
        self.enable_generate = os.getenv("TWELVELABS_ENABLE_GENERATE", "false").strip().lower() == "true"
        self.require_generate_index = os.getenv("TWELVELABS_REQUIRE_GENERATE_INDEX", "true").strip().lower() == "true"

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def analyze_video(self, video_path: str, duration_seconds: int = 150) -> Dict[str, Any]:
        if not self.is_configured():
            raise RuntimeError("TWELVELABS_API_KEY is missing")

        index_id = self._resolve_index_id(require_generate=self.enable_generate and self.require_generate_index)
        task_id = self._upload_video_for_index(index_id=index_id, video_path=video_path)
        task_data = self._poll_task(task_id)
        video_id = (
            task_data.get("video_id")
            or task_data.get("video", {}).get("id")
            or task_data.get("id")
            or ""
        )

        transcript = self._fetch_transcript(index_id=index_id, video_id=video_id, duration_seconds=duration_seconds)
        scene_search_results = self._fetch_scene_candidates(
            index_id=index_id,
            video_id=video_id,
            duration_seconds=duration_seconds,
        )
        semantic_moments = self._fetch_semantic_moments(
            index_id=index_id,
            video_id=video_id,
            duration_seconds=duration_seconds,
        )

        scenes = scene_search_results
        if self.enable_generate:
            analyze_pack = self._fetch_analyze_pack(video_id=video_id, duration_seconds=duration_seconds)
            scenes = analyze_pack.get("scenes") or scene_search_results
            if analyze_pack.get("semantic_moments"):
                semantic_moments.extend(analyze_pack["semantic_moments"])

        return self._normalize(
            video_id=video_id,
            transcript=transcript,
            scenes=scenes,
            semantic_moments=semantic_moments,
            duration_seconds=duration_seconds,
        )

    def _resolve_index_id(self, require_generate: bool) -> str:
        if self.index_id:
            if require_generate and not self._index_supports_generate(self.index_id):
                return self._ensure_index(require_generate=True)
            return self.index_id
        return self._ensure_index(require_generate=require_generate)

    def _headers(self) -> Dict[str, str]:
        return {"x-api-key": self.api_key}

    def _json_headers(self) -> Dict[str, str]:
        headers = self._headers().copy()
        headers["Content-Type"] = "application/json"
        return headers

    def _ensure_index(self, require_generate: bool = False) -> str:
        index_name = "truthlens-generate-index" if require_generate else "truthlens-default-index"
        models = [{"model_name": "marengo3.0", "model_options": ["visual", "audio"]}]
        if require_generate:
            models.append({"model_name": "pegasus1.2", "model_options": ["visual", "audio"]})
        payload = {"index_name": index_name, "models": models, "addons": ["thumbnail"]}
        response = requests.post(
            f"{self.BASE_URL_V13}/indexes",
            headers=self._json_headers(),
            json=payload,
            timeout=60,
        )
        if response.status_code == 409:
            existing = self._find_existing_index(index_name, require_generate=require_generate)
            if existing:
                return existing
        if response.status_code >= 400:
            response = requests.post(
                f"{self.BASE_URL_V12}/indexes",
                headers=self._json_headers(),
                json={
                    "index_name": "truthlens-default-index",
                    "models": [{"name": "marengo2.7", "options": ["visual", "conversation", "text_in_video"]}],
                    "addons": ["thumbnail"],
                },
                timeout=60,
            )
            if response.status_code == 409:
                existing = self._find_existing_index(index_name, require_generate=require_generate)
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
            status = str(task_data.get("status") or "").lower()
            if status in {"ready", "completed", "done"}:
                return task_data
            if status in {"failed", "error"}:
                raise RuntimeError(f"TwelveLabs task failed: {task_data}")
            time.sleep(3)
        raise TimeoutError("Timed out waiting for TwelveLabs task completion")

    def _fetch_transcript(self, index_id: str, video_id: str, duration_seconds: int) -> List[Dict[str, Any]]:
        if not video_id:
            return []
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

        payload = response.json()
        chunks = self._extract_transcription_chunks(payload)
        transcript: List[Dict[str, Any]] = []
        for item in chunks:
            start = float(item.get("start") or item.get("start_time") or 0.0)
            end = float(item.get("end") or item.get("end_time") or start + 4.0)
            if start > duration_seconds:
                continue
            text = str(item.get("text") or item.get("transcript") or "").strip()
            if not text:
                text = str(item.get("value") or item.get("content") or "").strip()
            if not text:
                continue
            transcript.append(
                {
                    "start": start,
                    "end": min(end, float(duration_seconds)),
                    "text": text,
                }
            )
        return transcript

    def _extract_transcription_chunks(self, payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []

        transcription = payload.get("transcription")
        if isinstance(transcription, list):
            return [item for item in transcription if isinstance(item, dict)]
        if isinstance(transcription, dict):
            for key in ("chunks", "segments", "data"):
                value = transcription.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]

        for key in ("transcript", "segments", "chunks"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    def _fetch_scene_candidates(self, index_id: str, video_id: str, duration_seconds: int) -> List[Dict[str, Any]]:
        if not video_id:
            return []

        scene_queries = [
            "Describe visible subjects, setting, and actions in each clip.",
            "Find notable objects, animals, people, or vehicles in the scene.",
            "Describe any conflict, danger, urgency, or emotionally intense visuals.",
        ]

        merged: Dict[str, Dict[str, Any]] = {}
        for query in scene_queries:
            search_data = self._search(index_id=index_id, video_id=video_id, query=query, limit=24)
            for clip in self._extract_search_results(search_data):
                start = float(clip.get("start") or clip.get("start_time") or 0.0)
                end = float(clip.get("end") or clip.get("end_time") or start + 8.0)
                if start > duration_seconds:
                    continue
                key = f"{round(start, 1)}-{round(end, 1)}"
                if key not in merged:
                    merged[key] = {
                        "start_time": start,
                        "end_time": min(end, float(duration_seconds)),
                        "visual_summary_parts": [],
                        "detected_objects": set(),
                    }
                text = str(clip.get("text") or clip.get("summary") or "").strip()
                if text:
                    merged[key]["visual_summary_parts"].append(text)
                for obj in self._extract_objects(clip):
                    merged[key]["detected_objects"].add(obj)

        scenes: List[Dict[str, Any]] = []
        for idx, item in enumerate(sorted(merged.values(), key=lambda x: x["start_time"]), start=1):
            summary = " ".join(item["visual_summary_parts"]).strip()
            if not summary:
                continue
            scenes.append(
                {
                    "scene_number": idx,
                    "start_time": float(item["start_time"]),
                    "end_time": float(item["end_time"]),
                    "visual_summary": summary[:600],
                    "spoken_transcript": "",
                    "detected_objects": sorted(item["detected_objects"]),
                }
            )
        return scenes[:10]

    def _fetch_semantic_moments(self, index_id: str, video_id: str, duration_seconds: int) -> List[Dict[str, Any]]:
        if not video_id:
            return []

        queries = [
            "Find clips where narration or text implies urgency, fear, or threat.",
            "Find clips where visuals appear calm or routine.",
            "Find clips that show animals, wildlife, pets, or nature.",
            "Find clips with crowds, conflict, destruction, police, or emergency activity.",
        ]

        moments: List[Dict[str, Any]] = []
        for query in queries:
            data = self._search(index_id=index_id, video_id=video_id, query=query, limit=8)
            for item in self._extract_search_results(data)[:4]:
                start = float(item.get("start") or item.get("start_time") or 0.0)
                end = float(item.get("end") or item.get("end_time") or start + 5.0)
                if start > duration_seconds:
                    continue
                moments.append(
                    {
                        "query": query,
                        "start": start,
                        "end": min(end, float(duration_seconds)),
                        "text": str(item.get("text") or item.get("summary") or "").strip(),
                    }
                )
        return moments

    def _fetch_analyze_pack(self, video_id: str, duration_seconds: int) -> Dict[str, Any]:
        if not video_id:
            return {}

        prompt = (
            "You are generating scene-level metadata for media forensics. "
            f"Use only the first {duration_seconds} seconds. "
            "Return scene_summaries and semantic_moments."
        )
        schema = {
            "type": "object",
            "properties": {
                "scene_summaries": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "start_time": {"type": "number"},
                            "end_time": {"type": "number"},
                            "visual_summary": {"type": "string"},
                            "detected_objects": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["start_time", "end_time", "visual_summary"],
                    },
                },
                "semantic_moments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "start": {"type": "number"},
                            "end": {"type": "number"},
                            "text": {"type": "string"},
                        },
                        "required": ["query", "start", "end", "text"],
                    },
                },
            },
            "required": ["scene_summaries", "semantic_moments"],
        }
        payload = {
            "video_id": video_id,
            "prompt": prompt,
            "stream": False,
            "temperature": 0.1,
            "response_format": {"type": "json_schema", "json_schema": {"name": "scene_forensics", "schema": schema}},
        }
        response = requests.post(
            f"{self.BASE_URL_V13}/analyze",
            headers=self._json_headers(),
            json=payload,
            timeout=120,
        )
        if response.status_code >= 400:
            return {}

        parsed = self._extract_analyze_json(response.json())
        if not parsed:
            return {}

        scenes: List[Dict[str, Any]] = []
        for idx, scene in enumerate(parsed.get("scene_summaries", []), start=1):
            start = float(scene.get("start_time") or 0.0)
            end = float(scene.get("end_time") or start + 8.0)
            if start > duration_seconds:
                continue
            scenes.append(
                {
                    "scene_number": idx,
                    "start_time": start,
                    "end_time": min(end, float(duration_seconds)),
                    "visual_summary": str(scene.get("visual_summary") or "").strip(),
                    "spoken_transcript": "",
                    "detected_objects": sorted(set(scene.get("detected_objects") or [])),
                }
            )

        semantic_moments: List[Dict[str, Any]] = []
        for moment in parsed.get("semantic_moments", []):
            start = float(moment.get("start") or 0.0)
            end = float(moment.get("end") or start + 5.0)
            if start > duration_seconds:
                continue
            semantic_moments.append(
                {
                    "query": str(moment.get("query") or "").strip(),
                    "start": start,
                    "end": min(end, float(duration_seconds)),
                    "text": str(moment.get("text") or "").strip(),
                }
            )

        return {"scenes": scenes, "semantic_moments": semantic_moments}

    def _extract_analyze_json(self, payload: Any) -> Dict[str, Any]:
        strings = list(self._collect_strings(payload))
        for text in sorted(strings, key=len, reverse=True):
            text = text.strip()
            if not text:
                continue
            candidate = self._parse_json_fragment(text)
            if candidate and isinstance(candidate, dict) and "scene_summaries" in candidate:
                return candidate
        if isinstance(payload, dict) and "scene_summaries" in payload:
            return payload
        return {}

    def _collect_strings(self, value: Any) -> Iterable[str]:
        if isinstance(value, str):
            yield value
            return
        if isinstance(value, dict):
            for item in value.values():
                yield from self._collect_strings(item)
            return
        if isinstance(value, list):
            for item in value:
                yield from self._collect_strings(item)

    def _parse_json_fragment(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    parsed = json.loads(text[start : end + 1])
                    return parsed if isinstance(parsed, dict) else None
                except json.JSONDecodeError:
                    return None
        return None

    def _normalize(
        self,
        video_id: str,
        transcript: List[Dict[str, Any]],
        scenes: List[Dict[str, Any]],
        semantic_moments: List[Dict[str, Any]],
        duration_seconds: int,
    ) -> Dict[str, Any]:
        transcript_sorted = sorted(transcript, key=lambda x: float(x.get("start") or 0.0))
        scenes = self._dedupe_and_clip_scenes(scenes, duration_seconds=duration_seconds)
        if not scenes:
            scenes = self._fallback_scenes_from_transcript(transcript_sorted, duration_seconds)

        for scene in scenes:
            scene["spoken_transcript"] = self._collect_transcript_for_scene(scene, transcript_sorted)
            scene["scene_number"] = int(scene.get("scene_number") or 1)
            scene["detected_objects"] = list(scene.get("detected_objects") or [])

        moments: List[Dict[str, Any]] = []
        for moment in semantic_moments:
            start = float(moment.get("start") or 0.0)
            if start > duration_seconds:
                continue
            cleaned = {
                "query": str(moment.get("query") or "").strip(),
                "start": start,
                "end": min(float(moment.get("end") or start + 5.0), float(duration_seconds)),
                "text": str(moment.get("text") or "").strip(),
            }
            cleaned["scene_number"] = self._resolve_scene_number(scenes, cleaned["start"])
            moments.append(cleaned)

        return {
            "video_id": video_id,
            "transcript": transcript_sorted,
            "scenes": scenes,
            "semantic_moments": moments,
            "raw": {
                "transcript": transcript_sorted,
                "scenes": scenes,
                "semantic_moments": moments,
            },
        }

    def _dedupe_and_clip_scenes(self, scenes: List[Dict[str, Any]], duration_seconds: int) -> List[Dict[str, Any]]:
        deduped: Dict[str, Dict[str, Any]] = {}
        for scene in scenes:
            start = float(scene.get("start_time") or 0.0)
            end = float(scene.get("end_time") or start + 8.0)
            if start > duration_seconds:
                continue
            key = f"{round(start,1)}-{round(end,1)}"
            summary = str(scene.get("visual_summary") or "").strip()
            if not summary:
                continue
            if key not in deduped:
                deduped[key] = {
                    "start_time": start,
                    "end_time": min(end, float(duration_seconds)),
                    "visual_summary": summary,
                    "spoken_transcript": "",
                    "detected_objects": sorted(set(scene.get("detected_objects") or [])),
                }
            else:
                existing = deduped[key]
                if len(summary) > len(str(existing.get("visual_summary") or "")):
                    existing["visual_summary"] = summary
                existing["detected_objects"] = sorted(set(existing.get("detected_objects", [])) | set(scene.get("detected_objects") or []))

        ordered = sorted(deduped.values(), key=lambda x: float(x.get("start_time") or 0.0))
        for idx, scene in enumerate(ordered, start=1):
            scene["scene_number"] = idx
        return ordered[:10]

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
                    "visual_summary": "Limited scene metadata available from TwelveLabs.",
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
                    "visual_summary": "Transcript-derived fallback segment (visual metadata unavailable).",
                    "spoken_transcript": " ".join([t for t in text_parts if t]).strip(),
                    "detected_objects": [],
                }
            )
            current_start = current_end
            scene_number += 1
        return scenes

    def _extract_objects(self, source: Dict[str, Any]) -> List[str]:
        objects: List[str] = []
        for field in ("detected_objects", "objects", "tags", "keywords"):
            value = source.get(field)
            if isinstance(value, list):
                objects.extend([str(item).strip() for item in value if str(item).strip()])
            elif isinstance(value, str) and value.strip():
                objects.extend([part.strip() for part in re.split(r"[,;/]", value) if part.strip()])
        return sorted(set(objects))

    def _search(self, index_id: str, video_id: str, query: str, limit: int = 12) -> Dict[str, Any]:
        multipart_fields: List[tuple[str, tuple[None, str]]] = [
            ("index_id", (None, index_id)),
            ("query_text", (None, query)),
            ("group_by", (None, "clip")),
            ("page_limit", (None, str(limit))),
            ("filter", (None, json.dumps({"id": [video_id]}))),
            ("search_options", (None, "visual")),
            ("search_options", (None, "audio")),
        ]
        response = requests.post(
            f"{self.BASE_URL_V13}/search",
            headers=self._headers(),
            files=multipart_fields,
            timeout=60,
        )
        if response.status_code < 400:
            return response.json()

        payload_v12 = {
            "index_id": index_id,
            "query": query,
            "search_options": ["visual", "conversation", "text_in_video"],
            "group_by": "clip",
            "page_limit": limit,
            "video_id": video_id,
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

    def _extract_search_results(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not isinstance(payload, dict):
            return []
        for key in ("data", "results", "clips"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    def _index_supports_generate(self, index_id: str) -> bool:
        response = requests.get(f"{self.BASE_URL_V13}/indexes/{index_id}", headers=self._headers(), timeout=60)
        if response.status_code >= 400:
            return False
        payload = response.json()
        models = payload.get("models") or []
        for model in models:
            model_name = str(model.get("model_name") or model.get("name") or "").lower()
            if model_name.startswith("pegasus"):
                return True
        return False

    def _find_existing_index(self, index_name: str, require_generate: bool = False) -> Optional[str]:
        for base in (self.BASE_URL_V13, self.BASE_URL_V12):
            response = requests.get(f"{base}/indexes", headers=self._headers(), timeout=60)
            if response.status_code >= 400:
                continue
            data = response.json()
            records = data.get("data") or data.get("indexes") or []
            for item in records:
                if item.get("index_name") != index_name:
                    continue
                if require_generate:
                    model_records = item.get("models") or []
                    has_pegasus = any(
                        str(model.get("model_name") or model.get("name") or "").lower().startswith("pegasus")
                        for model in model_records
                    )
                    if not has_pegasus:
                        continue
                return item.get("id") or item.get("_id")
        return None


def load_mock_metadata(path: Optional[str] = None) -> Dict[str, Any]:
    default_path = Path(__file__).resolve().parents[2] / "mock" / "sample_metadata.json"
    mock_path = Path(path) if path else default_path
    if not mock_path.exists():
        raise FileNotFoundError(f"Mock metadata file not found: {mock_path}")
    return json.loads(mock_path.read_text(encoding="utf-8"))
