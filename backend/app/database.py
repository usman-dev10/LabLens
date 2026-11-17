"""Small, dependency-free persistence layer for LabLens local development."""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request, status

from .schemas import FinalResult

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", Path(__file__).resolve().parents[1] / "lablens.db"))
SESSION_DAYS = 7


def _connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_database() -> None:
    with _connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                patient_name TEXT,
                summary TEXT NOT NULL,
                result_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS reports_user_created ON reports(user_id, created_at DESC);
            """
        )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    rounds = 310_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return f"{rounds}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        rounds_text, salt_hex, digest_hex = stored.split("$", 2)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds_text)
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def _user_dto(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def create_user(name: str, email: str, password: str) -> dict[str, Any]:
    normalized_email = email.strip().lower()
    now = _now().isoformat()
    try:
        with _connection() as connection:
            cursor = connection.execute(
                "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (name.strip(), normalized_email, _password_hash(password), now),
            )
            user_id = cursor.lastrowid
            row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="An account already exists with this email.") from exc
    if row is None:
        raise RuntimeError("New user could not be loaded.")
    return _user_dto(row)


def authenticate_user(email: str, password: str) -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
        ).fetchone()
    if row is None or not _verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return _user_dto(row)


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = _now()
    with _connection() as connection:
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (token_hash, user_id, (now + timedelta(days=SESSION_DAYS)).isoformat(), now.isoformat()),
        )
    return token


def delete_session(token: str) -> None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _connection() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def current_user_from_token(token: str) -> dict[str, Any]:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT users.id, users.name, users.email, sessions.expires_at
            FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
        if row is None or datetime.fromisoformat(row["expires_at"]) <= _now():
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired.")
    return _user_dto(row)


def require_user(request: Request) -> dict[str, Any]:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in first.")
    return current_user_from_token(token.strip())


def save_report(user_id: int, result: FinalResult) -> str:
    report_id = secrets.token_urlsafe(12)
    created_at = _now().isoformat()
    summary = result.summary_english.overview[:280] or "Lab report explanation ready."
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO reports (id, user_id, created_at, patient_name, summary, result_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                user_id,
                created_at,
                result.patient.name,
                summary,
                result.model_dump_json(),
            ),
        )
    return report_id


def list_reports(user_id: int) -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = connection.execute(
            "SELECT id, created_at, patient_name, summary FROM reports WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def load_report(user_id: int, report_id: str) -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute(
            "SELECT id, created_at, result_json FROM reports WHERE id = ? AND user_id = ?",
            (report_id, user_id),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Saved report not found.")
    return {"id": row["id"], "created_at": row["created_at"], "result": json.loads(row["result_json"])}
