from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import init_database
from app.llm import _providers
from app.main import app

client = TestClient(app)


def auth_headers() -> dict[str, str]:
    init_database()
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Test User",
            "email": f"test-{uuid4().hex}@example.com",
            "password": "safe-test-password",
        },
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_groq_provider_uses_local_configuration(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-20b")
    monkeypatch.delenv("FALLBACK_API_KEY", raising=False)
    monkeypatch.delenv("FALLBACK_BASE_URL", raising=False)
    monkeypatch.delenv("FALLBACK_MODEL", raising=False)

    providers = _providers()

    assert len(providers) == 1
    assert providers[0].name == "Groq"
    assert providers[0].base_url == "https://api.groq.com/openai/v1"
    assert providers[0].model == "openai/gpt-oss-20b"


def test_analyze_rejects_empty_input() -> None:
    response = client.post("/api/analyze", data={"text": ""}, headers=auth_headers())

    assert response.status_code == 400
    assert "laboratory results" in response.json()["detail"]


def test_report_history_requires_an_authenticated_account() -> None:
    assert client.get("/api/reports").status_code == 401

    response = client.get("/api/reports", headers=auth_headers())

    assert response.status_code == 200
    assert response.json()["reports"] == []


def test_analyze_rejects_unsupported_upload_type() -> None:
    response = client.post(
        "/api/analyze",
        data={"text": ""},
        files={"file": ("report.txt", b"not a supported file", "text/plain")},
        headers=auth_headers(),
    )

    assert response.status_code == 415


def test_unconfigured_model_returns_streamed_error_without_mock_result(monkeypatch) -> None:
    for key in (
        "GROQ_API_KEY",
        "FALLBACK_API_KEY",
        "FALLBACK_BASE_URL",
        "FALLBACK_MODEL",
    ):
        monkeypatch.delenv(key, raising=False)

    response = client.post(
        "/api/analyze",
        data={"text": "Glucose: 90 mg/dL"},
        headers=auth_headers(),
    )

    assert response.status_code == 200
    assert "event\":\"error\"" in response.text
    assert "event\":\"final\"" not in response.text
    assert "No model provider is configured" in response.text
