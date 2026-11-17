from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_analyze_rejects_empty_input() -> None:
    response = client.post("/api/analyze", data={"text": ""})

    assert response.status_code == 400
    assert "laboratory results" in response.json()["detail"]


def test_analyze_rejects_unsupported_upload_type() -> None:
    response = client.post(
        "/api/analyze",
        data={"text": ""},
        files={"file": ("report.txt", b"not a supported file", "text/plain")},
    )

    assert response.status_code == 415


def test_unconfigured_model_returns_streamed_error_without_mock_result(monkeypatch) -> None:
    for key in (
        "XAI_API_KEY",
        "FALLBACK_API_KEY",
        "FALLBACK_BASE_URL",
        "FALLBACK_MODEL",
    ):
        monkeypatch.delenv(key, raising=False)

    response = client.post("/api/analyze", data={"text": "Glucose: 90 mg/dL"})

    assert response.status_code == 200
    assert "event\":\"error\"" in response.text
    assert "event\":\"final\"" not in response.text
    assert "No model provider is configured" in response.text
