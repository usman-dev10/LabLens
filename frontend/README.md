# LabLens frontend

The Next.js App Router client for LabLens. It supports text entry, PDF and image uploads,
streamed FastAPI progress, English/Roman Urdu results, browser speech, and PDF export.

## Local development

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

The API defaults to `http://localhost:8000`. Set `NEXT_PUBLIC_API_URL` in `.env.local`
if the FastAPI service uses a different address.

Users sign in before analysis. Completed explanations are stored by the backend in the signed-in
user's private history. The report is also sent to the configured model provider for analysis.
Do not use real or sensitive reports in demos.
