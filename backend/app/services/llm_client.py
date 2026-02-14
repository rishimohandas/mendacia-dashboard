import json
import os
from typing import Any, Callable, Dict, Optional

import requests


class LLMClient:
    def __init__(self) -> None:
        self.provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
        self.api_key = os.getenv("LLM_API_KEY", "").strip()
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        validator: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured():
            raise RuntimeError("LLM_API_KEY is not configured")

        last_error: Optional[Exception] = None
        for _ in range(2):
            try:
                if self.provider == "gemini":
                    raw = self._call_gemini(system_prompt, user_prompt)
                else:
                    raw = self._call_openai(system_prompt, user_prompt)

                parsed = self._parse_json(raw)
                if validator:
                    validator(parsed)
                return parsed
            except Exception as exc:  # noqa: BLE001
                last_error = exc

        raise RuntimeError(f"Failed to produce valid JSON from LLM: {last_error}")

    def _call_openai(self, system_prompt: str, user_prompt: str) -> str:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.openai_model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        response = requests.post(url, headers=headers, json=payload, timeout=90)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]

    def _call_gemini(self, system_prompt: str, user_prompt: str) -> str:
        model_name = self.gemini_model.strip()
        if model_name.startswith("models/"):
            model_name = model_name.split("/", 1)[1]

        # Prefer Vertex endpoint because hackathon keys may be provisioned for aiplatform.
        vertex_url = (
            "https://aiplatform.googleapis.com/v1/publishers/google/models/"
            f"{model_name}:streamGenerateContent?key={self.api_key}"
        )
        vertex_headers = {"Content-Type": "application/json"}
        payload = {
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}],
                }
            ],
        }
        vertex_response = requests.post(vertex_url, headers=vertex_headers, json=payload, timeout=90)
        if vertex_response.status_code < 400:
            return self._extract_text_from_gemini_response(vertex_response.json())

        # Fallback for AI Studio style keys.
        ai_studio_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        ai_studio_headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        ai_studio_response = requests.post(ai_studio_url, headers=ai_studio_headers, json=payload, timeout=90)
        ai_studio_response.raise_for_status()
        return self._extract_text_from_gemini_response(ai_studio_response.json())

    def _extract_text_from_gemini_response(self, data: Any) -> str:
        # Vertex streamGenerateContent may return an array of chunk objects.
        if isinstance(data, list):
            chunks = data
        else:
            chunks = [data]

        parts: list[str] = []
        for chunk in chunks:
            candidates = chunk.get("candidates") or []
            if not candidates:
                continue
            content = candidates[0].get("content") or {}
            for item in content.get("parts") or []:
                text = item.get("text")
                if text:
                    parts.append(text)

        merged = "".join(parts).strip()
        if not merged:
            raise ValueError(f"Gemini response did not contain text payload: {data}")
        return merged

    def _parse_json(self, raw_text: str) -> Dict[str, Any]:
        text = (raw_text or "").strip()
        if not text:
            raise ValueError("Empty LLM response")

        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:].strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                return json.loads(text[start : end + 1])
            raise
