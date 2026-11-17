# LabLens

LabLens is an educational app that helps people read laboratory reports in plain language.
The interface offers English and Roman Urdu explanations, cautious discussion prompts, browser
read-aloud, and a downloadable PDF. It is not a diagnostic or treatment tool.

The repository is split into two independently runnable modules:

- `frontend/` — Next.js App Router, TypeScript, Tailwind CSS.
- `backend/` — FastAPI, Pydantic contracts, a streamed six-agent model pipeline.

No user account, database, report history, or permanent report storage is used. Report contents
are sent to the model provider configured by the operator; review its data-handling terms before
use. Use synthetic data for demos.

## Requirements

- Node.js 20.9 or later and npm.
- Python 3.10 or later.
- An API key for an OpenAI-compatible provider. The default configuration uses xAI.

## Run locally (Windows PowerShell)

In the first terminal:

```powershell
Set-Location .\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
Copy-Item .env.example .env
# Add XAI_API_KEY to backend\.env
py -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```powershell
Set-Location .\frontend
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`. The FastAPI health endpoint is `http://localhost:8000/api/health`.
Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` when the API is hosted elsewhere.

## Model configuration

Copy `backend/.env.example` to `backend/.env`. Configure `XAI_API_KEY` and `XAI_MODEL`.
The server calls an OpenAI-compatible `/chat/completions` endpoint; `XAI_BASE_URL` can be
changed for a compatible provider. An optional fallback is enabled by setting all of
`FALLBACK_API_KEY`, `FALLBACK_BASE_URL`, and `FALLBACK_MODEL`. Secrets remain on the server.

Each agent response is validated against Pydantic contracts. A schema-invalid or failed
primary request is retried once, then the configured fallback is attempted. If no provider is
configured or all attempts fail, the API returns a visible streamed error rather than sample
or fabricated analysis.

PDF uploads are size-limited to 10 MB and parsed for selectable text on the server. Image
uploads require a vision-capable configured model and `MODEL_SUPPORTS_FILES=true`. Scanned
PDFs without selectable text should be re-entered as text or submitted as an image to a
vision-capable model.

## Synthetic demo reports

The four examples are available in the frontend and in `backend/samples/`:

- Sugar-only result.
- Mixed full panel.
- All-normal panel.
- Synthetic urgent-warning example.

These are educational examples, not clinical reference standards.

## Checks

```powershell
# Backend tests
Set-Location .\backend
py -m pip install -r requirements-dev.txt
py -m pytest

# Frontend checks
Set-Location ..\frontend
npm run lint
npx tsc --noEmit
npm run build
```

## Safety and privacy

- The app is for education only and must not diagnose, prescribe, or guide medication changes.
- Report-provided reference ranges take precedence. General adult ranges are disclosed; unknown
  ranges remain unknown.
- Urgency is a cautious prompt to contact a professional, not a clinical classification.
- Nutrition suggestions are suppressed for urgent/severe findings, children, and when pregnancy
  is mentioned.
- No report content is intentionally written to application logs or durable storage. The
  configured external model provider receives the report for analysis.
- The safety review is not a guarantee of accuracy. A clinician should review results.
