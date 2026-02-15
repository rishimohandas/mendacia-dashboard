import re
from typing import Any, Dict, List, Optional

from app.models.schemas import MismatchFlag, ModuleCResult

ESCALATION_TERMS = {
    "riot",
    "riots",
    "chaos",
    "violent",
    "violence",
    "everywhere",
    "burning",
    "collapse",
    "crisis",
}

CALM_TERMS = {
    "calm",
    "organized",
    "peaceful",
    "orderly",
    "normal",
    "stable",
    "march",
    "gathering",
}

INTENSE_VISUAL_TERMS = {
    "fire",
    "burning",
    "explosion",
    "smoke",
    "destruction",
    "blood",
    "panic",
    "running",
    "screaming",
    "violent",
    "riot",
}

NEUTRAL_CLAIM_TERMS = {
    "today",
    "report",
    "said",
    "states",
    "announced",
    "update",
    "information",
}


def run_module_c(
    claims: List[Dict[str, Any]],
    scenes: List[Dict[str, Any]],
    semantic_moments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    flags: List[Dict[str, Any]] = []
    sparse_visual_metadata = _is_sparse_visual_metadata(scenes)

    for claim in claims:
        claim_text = (claim.get("text") or "").lower()
        claim_time = _timestamp_from_claim(claim)
        scene = _find_scene_for_time(scenes, claim_time)
        scene_text = ((scene or {}).get("visual_summary") or "").lower()

        if _contains_any(claim_text, ESCALATION_TERMS) and _contains_any(scene_text, CALM_TERMS):
            flags.append(
                {
                    "timestamp": float(claim_time),
                    "flag_type": "Visual-Narrative Escalation Mismatch",
                    "description": "Claim language suggests high escalation while visuals appear relatively calm, which may indicate narrative inflation.",
                    "severity": "high",
                }
            )

        if _contains_any(scene_text, INTENSE_VISUAL_TERMS) and _is_neutral_claim(claim_text):
            flags.append(
                {
                    "timestamp": float(claim_time),
                    "flag_type": "Emotional Imagery Amplification",
                    "description": "Visual intensity appears stronger than spoken claim tone, which may increase emotional impact beyond narration.",
                    "severity": "medium",
                }
            )

        if _contains_any(claim_text, ESCALATION_TERMS) and (
            "auto-generated fallback segment summary" in scene_text
            or "transcript-derived fallback segment" in scene_text
            or not scene_text.strip()
        ):
            flags.append(
                {
                    "timestamp": float(claim_time),
                    "flag_type": "Insufficient Visual Corroboration",
                    "description": "Claim uses escalation language but available visual metadata is sparse, limiting corroboration confidence.",
                    "severity": "low",
                }
            )

    if sparse_visual_metadata and claims:
        flags.append(
            {
                "timestamp": 0.0,
                "flag_type": "Limited Scene Evidence",
                "description": "Scene-level visual descriptors are sparse, so cross-modal verification confidence is reduced for this report.",
                "severity": "low",
            }
        )

    for moment in semantic_moments:
        query = (moment.get("query") or "").lower()
        if "urgent" in query or "fear" in query:
            ts = float(moment.get("start") or 0.0)
            scene = _find_scene_for_time(scenes, ts)
            scene_text = ((scene or {}).get("visual_summary") or "").lower()
            if _contains_any(scene_text, CALM_TERMS):
                flags.append(
                    {
                        "timestamp": ts,
                        "flag_type": "Visual-Speech Mismatch",
                        "description": "Detected urgency/fear cue is not strongly supported by nearby visuals and may suggest framing mismatch.",
                        "severity": "low",
                    }
                )

    deduped = _dedupe_flags(flags)
    ModuleCResult.model_validate({"inconsistency_flags": deduped})
    return {"inconsistency_flags": deduped}


def _contains_any(text: str, terms: set[str]) -> bool:
    if not text:
        return False
    return any(term in text for term in terms)


def _is_neutral_claim(claim_text: str) -> bool:
    if not claim_text:
        return True
    has_intense = _contains_any(claim_text, ESCALATION_TERMS)
    has_neutral = _contains_any(claim_text, NEUTRAL_CLAIM_TERMS)
    return has_neutral and not has_intense


def _timestamp_from_claim(claim: Dict[str, Any]) -> float:
    timestamp_range = claim.get("timestamp_range") or ""
    match = re.search(r"(\d+):(\d+)", str(timestamp_range))
    if match:
        minutes = int(match.group(1))
        seconds = int(match.group(2))
        return float(minutes * 60 + seconds)
    return 0.0


def _find_scene_for_time(scenes: List[Dict[str, Any]], timestamp: float) -> Optional[Dict[str, Any]]:
    for scene in scenes:
        start = float(scene.get("start_time") or 0.0)
        end = float(scene.get("end_time") or 0.0)
        if start <= timestamp <= end:
            return scene
    return scenes[0] if scenes else None


def _dedupe_flags(flags: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    deduped = []
    for flag in flags:
        key = (round(float(flag["timestamp"]), 1), flag["flag_type"], flag["severity"])
        if key in seen:
            continue
        seen.add(key)
        validated = MismatchFlag.model_validate(flag)
        deduped.append(validated.model_dump())
    return deduped


def _is_sparse_visual_metadata(scenes: List[Dict[str, Any]]) -> bool:
    if not scenes:
        return True
    populated = 0
    for scene in scenes:
        summary = str(scene.get("visual_summary") or "").strip().lower()
        objects = scene.get("detected_objects") or []
        if (
            summary
            and "auto-generated fallback segment summary" not in summary
            and "transcript-derived fallback segment" not in summary
        ):
            populated += 1
            continue
        if isinstance(objects, list) and len(objects) >= 2:
            populated += 1
    return populated < max(1, len(scenes) // 2)
