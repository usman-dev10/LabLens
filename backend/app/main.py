import base64
import os
from collections.abc import AsyncIterator
from io import BytesIO

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .pipeline import run_analysis
from .schemas import PatientMetadata

load_dotenv()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
IMAGE_MIME_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}

app = FastAPI(title="LabLens API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").rstrip("/"),
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _extract_pdf_text(raw: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except (PdfReadError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="This PDF could not be read.") from exc
    if not text:
        raise HTTPException(
            status_code=400,
            detail=(
                "No selectable text was found in this PDF. Please type the results or use "
                "a vision-capable model with an image upload."
            ),
        )
    return text


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze(
    text: str = Form(default=""),
    file: UploadFile | None = File(default=None),
    name: str | None = Form(default=None),
    age: int | None = Form(default=None, ge=0, le=130),
    gender: str | None = Form(default=None),
) -> StreamingResponse:
    report_text = text.strip()
    image_data_url = None
    if file is not None and file.filename:
        extension = os.path.splitext(file.filename)[1].lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=415, detail="Upload a PDF, PNG, or JPG file.")
        raw = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="The report must be 10 MB or smaller.")
        if extension == ".pdf":
            report_text = _extract_pdf_text(raw)
        else:
            if os.getenv("MODEL_SUPPORTS_FILES", "false").strip().lower() != "true":
                raise HTTPException(
                    status_code=415,
                    detail="Image analysis requires a vision-capable model. Configure "
                    "MODEL_SUPPORTS_FILES=true or enter the results as text.",
                )
            image_data_url = (
                f"data:{IMAGE_MIME_TYPES[extension]};base64,"
                f"{base64.b64encode(raw).decode('ascii')}"
            )
    if not report_text and image_data_url is None:
        raise HTTPException(
            status_code=400,
            detail="Enter laboratory results or choose a PDF, PNG, or JPG report.",
        )

    patient = PatientMetadata(name=name or None, age=age, gender=gender or None)

    async def stream() -> AsyncIterator[str]:
        async for message in run_analysis(report_text, image_data_url, patient):
            yield message

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
