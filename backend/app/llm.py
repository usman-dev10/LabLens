import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import TypeVar

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError

# Always load the backend-specific file, even when Uvicorn is started from the
# repository root instead of the backend directory.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

T = TypeVar("T", bound=BaseModel)
MODEL_TIMEOUT_SECONDS = 45.0


class ModelCallError(RuntimeError):
    pass


@dataclass(frozen=True)
class Provider:
    name: str
    api_key: str
    base_url: str
    model: str


def _providers() -> list[Provider]:
    candidates = [
        Provider(
            name="Groq",
            api_key=os.getenv("GROQ_API_KEY", "").strip(),
            base_url=os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/"),
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip(),
        ),
        Provider(
            name="fallback",
            api_key=os.getenv("FALLBACK_API_KEY", "").strip(),
            base_url=os.getenv("FALLBACK_BASE_URL", "").rstrip("/"),
            model=os.getenv("FALLBACK_MODEL", "").strip(),
        ),
    ]
    return [provider for provider in candidates if provider.api_key and provider.base_url and provider.model]


async def _request(
    provider: Provider,
    system_prompt: str,
    user_prompt: str,
    image_data_url: str | None,
) -> str:
    user_content: str | list[dict[str, object]] = user_prompt
    if image_data_url:
        user_content = [
            {"type": "text", "text": user_prompt},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ]
    payload = {
        "model": provider.model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=MODEL_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{provider.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {provider.api_key}"},
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise ModelCallError(f"{provider.name} model request timed out.") from exc
    except httpx.HTTPError as exc:
        raise ModelCallError(f"{provider.name} model request could not be completed.") from exc

    if response.is_error:
        raise ModelCallError(f"{provider.name} model returned HTTP {response.status_code}.")
    try:
        body = response.json()
        content = body["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ModelCallError(f"{provider.name} model returned an invalid response.") from exc
    if not isinstance(content, str) or not content.strip():
        raise ModelCallError(f"{provider.name} model returned an empty response.")
    return content


async def call_json(
    agent: str,
    system_prompt: str,
    user_prompt: str,
    output_model: type[T],
    image_data_url: str | None = None,
) -> T:
    providers = _providers()
    if not providers:
        raise ModelCallError(
            "No model provider is configured. Set GROQ_API_KEY and GROQ_MODEL, "
            "or configure all FALLBACK_* values."
        )

    schema = json.dumps(output_model.model_json_schema(), ensure_ascii=True)
    full_system_prompt = (
        f"{system_prompt}\n\nReturn only a JSON object matching this JSON schema:\n{schema}"
    )
    failures: list[str] = []
    for provider_index, provider in enumerate(providers):
        attempts = 2 if provider_index == 0 else 1
        feedback = ""
        for attempt in range(attempts):
            prompt = user_prompt
            if feedback:
                prompt = f"{user_prompt}\n\nYour previous response failed validation: {feedback}"
            try:
                raw = await _request(provider, full_system_prompt, prompt, image_data_url)
                return output_model.model_validate_json(raw)
            except ValidationError as exc:
                feedback = str(exc)
                failures.append(f"{provider.name} returned schema-invalid JSON.")
            except ModelCallError as exc:
                feedback = str(exc)
                failures.append(str(exc))
                if attempt + 1 == attempts:
                    break

    raise ModelCallError(
        f"{agent} could not produce a valid response after retries and configured fallback."
        + (f" Details: {' '.join(failures)}" if failures else "")
    )
