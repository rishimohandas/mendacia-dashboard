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
    "False dilemma",
    "Overgeneralization",
    "Cherry-picking",
    "Correlation-causation confusion",
    "Dramatic imagery inflation",
    "Context stripping",
    "Visual-speech mismatch",
    "AI-style phrasing",
    "Script-like repetition",
    "Fake authority cues",
    "Scarcity pressure",
    "Financial miracle claims",
    "Emotional urgency exploitation",
]

CATEGORY_NORMALIZATION = {
    "visual speech mismatch": "Visual-speech mismatch",
    "visual-speech mismatch": "Visual-speech mismatch",
    "visual narrative mismatch": "Visual-speech mismatch",
    "visual narrative escalation mismatch": "Visual-speech mismatch",
    "fear": "Fear amplification",
    "urgency": "Urgency framing",
    "outrage": "Outrage triggering",
    "false dilemma": "False dilemma",
    "overgeneralization": "Overgeneralization",
    "cherry picking": "Cherry-picking",
    "correlation causation confusion": "Correlation-causation confusion",
    "dramatic imagery inflation": "Dramatic imagery inflation",
    "context stripping": "Context stripping",
    "ai phrasing": "AI-style phrasing",
    "ai style phrasing": "AI-style phrasing",
    "script repetition": "Script-like repetition",
    "script like repetition": "Script-like repetition",
    "fake authority cues": "Fake authority cues",
    "scarcity pressure": "Scarcity pressure",
    "financial miracle claims": "Financial miracle claims",
    "emotional urgency exploitation": "Emotional urgency exploitation",
}


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
            module_b=module_b,
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
                "task": "Classify manipulation categories and produce evidence-linked rationales.",
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
                    "Use conservative language: may indicate/suggests.",
                    "Return confidence between 0 and 1.",
                    "If evidence is weak, return an empty category list and empty rationales.",
                ],
            }
        )

        try:
            output = self.llm.generate_json(
                system_prompt,
                user_prompt,
                validator=lambda d: ModuleAResult.model_validate(d),
            )
            output = self._normalize_module_a_output(output)
            ModuleAResult.model_validate(output)
            return output
        except Exception:
            ModuleAResult.model_validate(fallback)
            return fallback

    def _run_module_b(self, transcript: List[Dict[str, Any]], deterministic_mode: bool) -> Dict[str, Any]:
        fallback = self._fallback_module_b(transcript)
        if not transcript:
            ModuleBResult.model_validate(fallback)
            return fallback
        if deterministic_mode or not self.llm.is_configured():
            ModuleBResult.model_validate(fallback)
            return fallback

        system_prompt = (
            "Extract 1 to 8 claims from transcript. Return strict JSON only with a claims array. "
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
                    "Return between 1 and 8 claims.",
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
            if len(claims) < 1:
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
        module_b: Dict[str, Any],
        module_c: Dict[str, Any],
    ) -> Dict[str, Any]:
        scene_models = [SceneMetadata.model_validate(scene) for scene in scenes]
        flags = module_c.get("inconsistency_flags", [])
        categories = module_a.get("manipulation_categories_detected", [])
        rationales = module_a.get("rationales", [])

        classification = self._classify_output(categories, flags)
        confidence = self._score_confidence(flags, module_a)
        human_report = self._generate_human_readable_report(
            video_id=video_id or "unknown-video",
            classification=classification,
            confidence=confidence,
            categories=categories,
            flags=flags,
            scenes=scenes,
            claims=module_b.get("claims", []),
        )

        report_model = ForensicReport(
            video_id=video_id or "unknown-video",
            confidence_score=confidence,
            classification=classification,
            classification_explanation=self._classification_explanation(classification, categories, flags),
            ethical_note=(
                "Decision-support output only. SIREN highlights potential persuasion and inconsistency signals; "
                "it does not determine objective truth."
            ),
            human_readable_report=human_report,
            manipulation_categories_detected=categories,
            manipulation_breakdown=rationales,
            scenes=scene_models,
            inconsistency_flags=flags,
        )
        return report_model.model_dump()

    def _classify_output(self, categories: List[str], flags: List[Dict[str, Any]]) -> str:
        category_set = set(categories)
        severe_count = sum(1 for flag in flags if str(flag.get("severity", "")).lower() == "high")
        medium_count = sum(1 for flag in flags if str(flag.get("severity", "")).lower() == "medium")

        synthetic_cues = {"AI-style phrasing", "Script-like repetition"}
        advertising_cues = {
            "Fake authority cues",
            "Scarcity pressure",
            "Financial miracle claims",
            "Emotional urgency exploitation",
        }

        if synthetic_cues & category_set and (severe_count >= 1 or medium_count >= 2):
            return "manufactured-synthetic"
        if advertising_cues & category_set:
            return "malicious-advertising"
        if severe_count >= 1 or len(flags) >= 2 or len(category_set) >= 3:
            return "propaganda-likely"
        return "low-manipulation"

    def _classification_explanation(
        self,
        classification: str,
        categories: List[str],
        flags: List[Dict[str, Any]],
    ) -> str:
        if classification == "manufactured-synthetic":
            return (
                "Synthetic-style language patterns and cross-modal inconsistencies were detected, "
                "which may indicate manufactured narrative signals."
            )
        if classification == "malicious-advertising":
            return (
                "Advertising-style manipulation cues were detected (authority/scarcity/urgency patterns), "
                "which may indicate persuasive commercial framing."
            )
        if classification == "propaganda-likely":
            return (
                f"Multiple manipulation indicators were detected ({len(categories)} categories, "
                f"{len(flags)} inconsistency flags), suggesting elevated persuasion risk."
            )
        return (
            "Lower-severity signals were detected in this run. This does not verify content as true; "
            "it indicates fewer manipulation patterns were found."
        )

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

        category_bonus = min(len(module_a.get("manipulation_categories_detected", [])) * 4, 24)
        raw_score = 18 + severity_score + int(rationale_conf * 25) + category_bonus
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

        if any(word in text for word in ["fear", "threat", "danger", "panic"]):
            detected.append("Fear amplification")
            rationales.append(
                {
                    "category": "Fear amplification",
                    "evidence": "0:20-0:50",
                    "why": "Language suggests heightened fear framing that may amplify perceived threat.",
                    "confidence": 0.62,
                }
            )
        if any(word in text for word in ["urgent", "now", "immediately", "before it's too late"]):
            detected.append("Urgency framing")
            rationales.append(
                {
                    "category": "Urgency framing",
                    "evidence": "0:40-1:10",
                    "why": "Time-pressure wording may indicate urgency-driven persuasion framing.",
                    "confidence": 0.60,
                }
            )
        if any(word in text for word in ["outrage", "disgrace", "shocking"]):
            detected.append("Outrage triggering")
            rationales.append(
                {
                    "category": "Outrage triggering",
                    "evidence": "0:15-0:35",
                    "why": "Emotionally charged language may be designed to provoke anger responses.",
                    "confidence": 0.58,
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
        if any(word in text for word in ["only", "either", "no choice", "must choose"]):
            detected.append("False dilemma")
            rationales.append(
                {
                    "category": "False dilemma",
                    "evidence": "0:42-1:10",
                    "why": "Binary framing may force a narrow interpretation while omitting alternatives.",
                    "confidence": 0.58,
                }
            )
        if any(word in scene_text for word in ["calm", "organized", "peaceful"]) and any(
            word in text for word in ["riot", "chaos", "violent"]
        ):
            detected.append("Visual-speech mismatch")
            rationales.append(
                {
                    "category": "Visual-speech mismatch",
                    "evidence": "0:34-0:52",
                    "why": "Narrative escalation appears stronger than visible scene intensity.",
                    "confidence": 0.72,
                }
            )
        if any(
            phrase in text
            for phrase in ["limited offer", "act now", "experts agree", "guaranteed return", "once in a lifetime"]
        ):
            detected.append("Emotional urgency exploitation")
            rationales.append(
                {
                    "category": "Emotional urgency exploitation",
                    "evidence": "0:20-0:45",
                    "why": "Urgency-heavy persuasion language can push decisions before verification.",
                    "confidence": 0.63,
                }
            )

        return {
            "manipulation_categories_detected": sorted(set(detected)),
            "rationales": rationales,
        }

    def _normalize_module_a_output(self, output: Dict[str, Any]) -> Dict[str, Any]:
        normalized_rationales: List[Dict[str, Any]] = []
        for rationale in output.get("rationales", []):
            canonical = self._canonical_category(rationale.get("category", ""))
            if not canonical:
                continue
            confidence = float(rationale.get("confidence") or 0.5)
            if confidence < 0.35:
                continue
            normalized_rationales.append(
                {
                    "category": canonical,
                    "evidence": str(rationale.get("evidence") or "0:00-0:20"),
                    "why": str(rationale.get("why") or "Potential persuasion framing signal."),
                    "confidence": confidence,
                }
            )
        normalized_rationales = normalized_rationales[:12]
        normalized_categories = sorted(set(item["category"] for item in normalized_rationales))

        if not normalized_categories:
            # If no evidence-backed rationales are present, be conservative and allow
            # a small set of direct categories from the model response.
            direct_categories: List[str] = []
            for raw_category in output.get("manipulation_categories_detected", []):
                canonical = self._canonical_category(raw_category)
                if canonical:
                    direct_categories.append(canonical)
            normalized_categories = sorted(set(direct_categories))[:3]

        return {
            "manipulation_categories_detected": normalized_categories[:6],
            "rationales": normalized_rationales,
        }

    def _canonical_category(self, category: Any) -> str:
        if not isinstance(category, str):
            return ""
        cleaned = category.replace("–", "-").replace("—", "-").strip()
        if cleaned in MODULE_A_CATEGORIES:
            return cleaned
        normalized = re.sub(r"[^a-z0-9]+", " ", cleaned.lower()).strip()
        if normalized in CATEGORY_NORMALIZATION:
            return CATEGORY_NORMALIZATION[normalized]
        for key, canonical in CATEGORY_NORMALIZATION.items():
            if key in normalized:
                return canonical
        return ""

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
        return {"claims": claims[:8]}

    def _generate_human_readable_report(
        self,
        video_id: str,
        classification: str,
        confidence: int,
        categories: List[str],
        flags: List[Dict[str, Any]],
        scenes: List[Dict[str, Any]],
        claims: List[Dict[str, Any]],
    ) -> str:
        fallback = (
            f"SIREN analyzed video {video_id}. Classification: {classification} "
            f"(confidence {confidence}/100). Detected manipulation categories: "
            f"{', '.join(categories) if categories else 'none'}. "
            f"Cross-modal inconsistency flags: {len(flags)}. "
            "This is a decision-support output, not a truth verdict."
        )
        if not self.llm.is_configured():
            return fallback

        system_prompt = (
            "You are a media forensics assistant writing a concise, neutral human-readable report. "
            "Avoid overclaiming certainty."
        )
        user_prompt = json.dumps(
            {
                "video_id": video_id,
                "classification": classification,
                "confidence_score": confidence,
                "detected_categories": categories,
                "cross_modal_flags": flags,
                "sample_scenes": scenes[:4],
                "sample_claims": claims[:4],
                "instructions": [
                    "Write 2 short paragraphs.",
                    "Explain what was detected and why.",
                    "Mention uncertainty/limitations if evidence is sparse.",
                    "Do not claim objective truth/falsity.",
                ],
            }
        )
        try:
            text = self.llm.generate_text(system_prompt, user_prompt)
            return self._normalize_human_report_text(text)[:2200]
        except Exception:
            return fallback

    def _normalize_human_report_text(self, text: str) -> str:
        cleaned = (text or "").strip()
        if not cleaned:
            return ""
        parsed: Any = None
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start >= 0 and end > start:
                try:
                    parsed = json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    parsed = None
        if not parsed:
            return cleaned
        parts: List[str] = []
        self._collect_text_fragments(parsed, parts)
        if parts:
            return "\n\n".join(parts[:4]).strip()
        return cleaned

    def _collect_text_fragments(self, value: Any, out: List[str]) -> None:
        if isinstance(value, str):
            line = value.strip()
            if line and line not in out:
                out.append(line)
            return
        if isinstance(value, dict):
            for item in value.values():
                self._collect_text_fragments(item, out)
            return
        if isinstance(value, list):
            for item in value:
                self._collect_text_fragments(item, out)

    def _format_range(self, start: float, end: float) -> str:
        return f"{self._to_mmss(start)}-{self._to_mmss(end)}"

    def _to_mmss(self, seconds: float) -> str:
        total = int(max(0, seconds))
        return f"{total // 60}:{total % 60:02d}"
