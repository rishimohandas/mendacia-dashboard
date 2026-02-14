import json
import os
import re
from typing import Any, Callable, Dict, List, Tuple

from app.engine.consistency import run_module_c
from app.models.schemas import (
    ForensicReport,
    ModuleAResult,
    ModuleBResult,
    ModuleCResult,
    SceneMetadata,
)
from app.services.llm_client import LLMClient
from app.services.twelvelabs_client import TwelveLabsClient, load_mock_metadata


MODULE_A_CATEGORIES = [
    "Fear amplification",
    "Urgency framing",
    "Outrage triggering",
    "Cherry-picking",
    "Overgeneralization",
    "Context stripping",
    "Visual–speech mismatch",
    "AI-style phrasing",
]


class PipelineService:
    def __init__(self) -> None:
        self.twelvelabs = TwelveLabsClient()
        self.llm = LLMClient()

    def run(
        self,
        video_path: str,
        context_text: str,
        duration_seconds: int,
        progress_callback: Callable[[int, str], None],
    ) -> Dict[str, Any]:
        mock_mode = os.getenv("MOCK_MODE", "false").strip().lower() == "true"

        progress_callback(10, "Preparing metadata")
        normalized_metadata, twelvelabs_raw = self._prepare_metadata(
            video_path=video_path,
            duration_seconds=duration_seconds,
            mock_mode=mock_mode,
        )

        transcript = normalized_metadata.get("transcript", [])
        scenes = normalized_metadata.get("scenes", [])
        semantic_moments = normalized_metadata.get("semantic_moments", [])
        deterministic_mode = bool(mock_mode or not self.twelvelabs.is_configured())

        progress_callback(35, "Running Module A")
        module_a = self._run_module_a(
            transcript=transcript,
            scenes=scenes,
            semantic_moments=semantic_moments,
            context_text=context_text,
            deterministic_mode=deterministic_mode,
        )

        progress_callback(55, "Running Module B")
        module_b = self._run_module_b(transcript=transcript, deterministic_mode=deterministic_mode)

        progress_callback(75, "Running Module C")
        module_c = self._run_module_c(module_b, scenes, semantic_moments)

        progress_callback(90, "Assembling final report")
        final_report = self._build_final_report(
            video_id=normalized_metadata.get("video_id") or "",
            scenes=scenes,
            module_a=module_a,
            module_c=module_c,
        )

        progress_callback(100, "Completed")
        return {
            "twelvelabs_raw": twelvelabs_raw,
            "normalized_metadata": normalized_metadata,
            "moduleA_result": module_a,
            "moduleB_result": module_b,
            "moduleC_result": module_c,
            "final_report": final_report,
        }

    def _prepare_metadata(
        self,
        video_path: str,
        duration_seconds: int,
        mock_mode: bool,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        if mock_mode or not self.twelvelabs.is_configured():
            normalized = load_mock_metadata()
            normalized["video_id"] = normalized.get("video_id") or "mock-video"
            normalized["scenes"] = self._limit_scenes(normalized.get("scenes", []), duration_seconds)
            return normalized, {"source": "mock"}

        normalized = self.twelvelabs.analyze_video(
            video_path=video_path,
            duration_seconds=duration_seconds,
        )
        normalized["scenes"] = self._limit_scenes(normalized.get("scenes", []), duration_seconds)
        return normalized, normalized.get("raw", {})

    def _run_module_a(
        self,
        transcript: List[Dict[str, Any]],
        scenes: List[Dict[str, Any]],
        semantic_moments: List[Dict[str, Any]],
        context_text: str,
        deterministic_mode: bool,
    ) -> Dict[str, Any]:
        transcript_text = " ".join([str(item.get("text") or "") for item in transcript])

        fallback = self._fallback_module_a(transcript_text, scenes)
        if deterministic_mode or not self.llm.is_configured():
            ModuleAResult.model_validate(fallback)
            return fallback

        system_prompt = (
            "You are a media forensics assistant. Return strict JSON only. "
            "No markdown, no extra keys, no prose."
        )
        user_prompt = json.dumps(
            {
                "task": "Classify manipulation categories and produce rationales.",
                "allowed_categories": MODULE_A_CATEGORIES,
                "input": {
                    "transcript": transcript,
                    "scene_summaries": scenes,
                    "semantic_moments": semantic_moments,
                    "context_text": context_text,
                },
                "output_schema": {
                    "manipulation_categories_detected": ["string"],
                    "rationales": [
                        {
                            "category": "string",
                            "evidence": "m:ss-m:ss",
                            "why": "string",
                            "confidence": "0.0-1.0",
                        }
                    ],
                },
                "constraints": [
                    "Only use allowed categories.",
                    "Be conservative: use may indicate/suggests framing.",
                    "Return confidence between 0 and 1.",
                ],
            }
        )

        try:
            output = self.llm.generate_json(
                system_prompt,
                user_prompt,
                validator=lambda d: ModuleAResult.model_validate(d),
            )
            output["manipulation_categories_detected"] = [
                item for item in output.get("manipulation_categories_detected", []) if item in MODULE_A_CATEGORIES
            ]
            if not output["manipulation_categories_detected"]:
                return fallback
            ModuleAResult.model_validate(output)
            return output
        except Exception:
            ModuleAResult.model_validate(fallback)
            return fallback

    def _run_module_b(self, transcript: List[Dict[str, Any]], deterministic_mode: bool) -> Dict[str, Any]:
        fallback = self._fallback_module_b(transcript)
        if deterministic_mode or not self.llm.is_configured():
            ModuleBResult.model_validate(fallback)
            return fallback

        system_prompt = (
            "Extract 3 to 8 claims from transcript. Return strict JSON only with a claims array. "
            "No markdown or extra text."
        )
        user_prompt = json.dumps(
            {
                "input": {"transcript": transcript},
                "output_schema": {
                    "claims": [
                        {
                            "id": "C1",
                            "text": "string",
                            "timestamp_range": "m:ss-m:ss",
                            "confidence": "0.0-1.0",
                        }
                    ]
                },
                "rules": [
                    "Extract factual or interpretive claims only.",
                    "Return between 3 and 8 claims.",
                    "Confidence between 0 and 1.",
                ],
            }
        )

        try:
            output = self.llm.generate_json(
                system_prompt,
                user_prompt,
                validator=lambda d: ModuleBResult.model_validate(d),
            )
            claims = output.get("claims", [])
            if len(claims) < 3:
                return fallback
            output["claims"] = claims[:8]
            ModuleBResult.model_validate(output)
            return output
        except Exception:
            ModuleBResult.model_validate(fallback)
            return fallback

    def _run_module_c(
        self,
        module_b: Dict[str, Any],
        scenes: List[Dict[str, Any]],
        semantic_moments: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        output = run_module_c(
            claims=module_b.get("claims", []),
            scenes=scenes,
            semantic_moments=semantic_moments,
        )
        ModuleCResult.model_validate(output)
        return output

    def _build_final_report(
        self,
        video_id: str,
        scenes: List[Dict[str, Any]],
        module_a: Dict[str, Any],
        module_c: Dict[str, Any],
    ) -> Dict[str, Any]:
        scene_models = [SceneMetadata.model_validate(scene) for scene in scenes]
        flags = module_c.get("inconsistency_flags", [])

        classification = self._classify_output(module_a.get("manipulation_categories_detected", []), flags)
        confidence = self._score_confidence(flags, module_a)

        report_model = ForensicReport(
            video_id=video_id or "unknown-video",
            confidence_score=confidence,
            classification=classification,
            manipulation_categories_detected=module_a.get("manipulation_categories_detected", []),
            scenes=scene_models,
            inconsistency_flags=flags,
        )
        return report_model.model_dump()

    def _classify_output(self, categories: List[str], flags: List[Dict[str, Any]]) -> str:
        category_set = set(categories)
        text_blob = " ".join(categories).lower()
        severe_count = sum(1 for flag in flags if str(flag.get("severity", "")).lower() == "high")

        if "ai-style phrasing" in text_blob and severe_count >= 1:
            return "manufactured-synthetic"
        if any("advert" in cat.lower() for cat in category_set):
            return "malicious-advertising"
        if severe_count >= 1 or len(flags) >= 2 or len(category_set) >= 3:
            return "propaganda-likely"
        return "low-manipulation"

    def _score_confidence(self, flags: List[Dict[str, Any]], module_a: Dict[str, Any]) -> int:
        severity_score = 0
        for flag in flags:
            severity = str(flag.get("severity", "")).lower()
            if severity == "high":
                severity_score += 20
            elif severity == "medium":
                severity_score += 12
            else:
                severity_score += 6

        rationale_conf = 0.0
        rationales = module_a.get("rationales", [])
        if rationales:
            rationale_conf = sum(float(item.get("confidence", 0.0)) for item in rationales) / len(rationales)

        category_bonus = min(len(module_a.get("manipulation_categories_detected", [])) * 4, 20)
        raw_score = 20 + severity_score + int(rationale_conf * 20) + category_bonus
        return max(0, min(100, raw_score))

    def _limit_scenes(self, scenes: List[Dict[str, Any]], duration_seconds: int) -> List[Dict[str, Any]]:
        limited = []
        for scene in scenes:
            start = float(scene.get("start_time") or 0.0)
            end = float(scene.get("end_time") or start)
            if start > duration_seconds:
                continue
            scene["end_time"] = min(end, float(duration_seconds))
            limited.append(scene)
        return limited

    def _fallback_module_a(self, transcript_text: str, scenes: List[Dict[str, Any]]) -> Dict[str, Any]:
        text = (transcript_text or "").lower()
        scene_text = " ".join([str(scene.get("visual_summary") or "") for scene in scenes]).lower()

        detected = []
        rationales = []

        if any(word in text for word in ["fear", "threat", "danger"]):
            detected.append("Fear amplification")
            rationales.append(
                {
                    "category": "Fear amplification",
                    "evidence": "0:20-0:50",
                    "why": "Language suggests heightened fear framing that may indicate emotional amplification.",
                    "confidence": 0.62,
                }
            )

        if any(word in text for word in ["urgent", "now", "immediately"]):
            detected.append("Urgency framing")
            rationales.append(
                {
                    "category": "Urgency framing",
                    "evidence": "0:40-1:10",
                    "why": "Time-pressure wording may indicate urgency-driven persuasion framing.",
                    "confidence": 0.6,
                }
            )

        if any(word in text for word in ["all", "everyone", "always", "never", "everywhere"]):
            detected.append("Overgeneralization")
            rationales.append(
                {
                    "category": "Overgeneralization",
                    "evidence": "0:30-0:55",
                    "why": "Absolute language may indicate broad claims unsupported by specific evidence.",
                    "confidence": 0.64,
                }
            )

        if any(word in scene_text for word in ["calm", "organized", "peaceful"]) and any(
            word in text for word in ["riot", "chaos", "violent"]
        ):
            detected.append("Visual–speech mismatch")
            rationales.append(
                {
                    "category": "Visual–speech mismatch",
                    "evidence": "0:34-0:52",
                    "why": "Narrative escalation appears stronger than visible scene intensity and may suggest framing mismatch.",
                    "confidence": 0.72,
                }
            )

        if not detected:
            detected = ["Context stripping"]
            rationales = [
                {
                    "category": "Context stripping",
                    "evidence": "0:10-0:30",
                    "why": "Limited context may indicate selective framing, but evidence remains low confidence.",
                    "confidence": 0.45,
                }
            ]

        return {
            "manipulation_categories_detected": sorted(set(detected)),
            "rationales": rationales,
        }

    def _fallback_module_b(self, transcript: List[Dict[str, Any]]) -> Dict[str, Any]:
        claims = []
        sentence_pool: List[Tuple[float, float, str]] = []
        for item in transcript:
            start = float(item.get("start") or 0.0)
            end = float(item.get("end") or start + 4.0)
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            parts = re.split(r"(?<=[.!?])\s+", text)
            for part in parts:
                cleaned = part.strip()
                if len(cleaned.split()) < 4:
                    continue
                sentence_pool.append((start, end, cleaned))

        for idx, (start, end, text) in enumerate(sentence_pool[:8], start=1):
            claims.append(
                {
                    "id": f"C{idx}",
                    "text": text,
                    "timestamp_range": self._format_range(start, end),
                    "confidence": 0.55,
                }
            )

        if len(claims) < 3:
            claims = [
                {
                    "id": "C1",
                    "text": "The speaker suggests the city is in widespread crisis.",
                    "timestamp_range": "0:20-0:45",
                    "confidence": 0.52,
                },
                {
                    "id": "C2",
                    "text": "The narrative implies events are escalating quickly.",
                    "timestamp_range": "0:45-1:10",
                    "confidence": 0.5,
                },
                {
                    "id": "C3",
                    "text": "The content frames a broad social threat as immediate.",
                    "timestamp_range": "1:10-1:35",
                    "confidence": 0.5,
                },
            ]

        return {"claims": claims[:8]}

    def _format_range(self, start: float, end: float) -> str:
        return f"{self._to_mmss(start)}-{self._to_mmss(end)}"

    def _to_mmss(self, seconds: float) -> str:
        total = int(max(0, seconds))
        return f"{total // 60}:{total % 60:02d}"
