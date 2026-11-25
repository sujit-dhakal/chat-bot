import os
import time
import logging
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


def _get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "chatbot")
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "postgres")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


@contextmanager
def get_db_connection():
    conn = psycopg2.connect(_get_database_url(), cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(max_retries: int = 10, retry_delay: float = 2.0):
    """Initialize PostgreSQL tables with startup retries for container readiness."""
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS application_logs (
                            id SERIAL PRIMARY KEY,
                            session_id TEXT NOT NULL,
                            user_query TEXT NOT NULL,
                            gpt_response TEXT NOT NULL,
                            model TEXT NOT NULL,
                            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                    cur.execute(
                        """
                        CREATE INDEX IF NOT EXISTS idx_application_logs_session_id
                        ON application_logs (session_id, created_at)
                        """
                    )
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS document_store (
                            id SERIAL PRIMARY KEY,
                            filename TEXT NOT NULL,
                            upload_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
            logger.info("PostgreSQL database initialized successfully.")
            return
        except psycopg2.OperationalError as exc:
            last_error = exc
            logger.warning(
                "Waiting for PostgreSQL (attempt %d/%d): %s",
                attempt,
                max_retries,
                exc,
            )
            time.sleep(retry_delay)
    raise RuntimeError(f"Could not connect to PostgreSQL after {max_retries} attempts: {last_error}")


def check_db_health() -> bool:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return True
    except Exception:
        return False


def insert_application_logs(session_id: str, user_query: str, gpt_response: str, model: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO application_logs (session_id, user_query, gpt_response, model)
                VALUES (%s, %s, %s, %s)
                """,
                (session_id, user_query, gpt_response, model),
            )


def get_chat_history(session_id: str) -> list[dict]:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_query, gpt_response
                FROM application_logs
                WHERE session_id = %s
                ORDER BY created_at ASC, id ASC
                """,
                (session_id,),
            )
            rows = cur.fetchall()

    messages = []
    for row in rows:
        messages.extend(
            [
                {"role": "human", "content": row["user_query"]},
                {"role": "ai", "content": row["gpt_response"]},
            ]
        )
    return messages


def get_session_messages(session_id: str) -> list[dict]:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_query, gpt_response, model, created_at
                FROM application_logs
                WHERE session_id = %s
                ORDER BY created_at ASC, id ASC
                """,
                (session_id,),
            )
            rows = cur.fetchall()

    messages = []
    for row in rows:
        messages.append(
            {
                "role": "user",
                "content": row["user_query"],
                "model": row["model"],
                "created_at": row["created_at"],
            }
        )
        messages.append(
            {
                "role": "assistant",
                "content": row["gpt_response"],
                "model": row["model"],
                "created_at": row["created_at"],
            }
        )
    return messages


def get_sessions() -> list[dict]:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    session_id,
                    (ARRAY_AGG(user_query ORDER BY created_at ASC, id ASC))[1] AS title,
                    MAX(created_at) AS last_updated,
                    COUNT(*)::int AS message_count
                FROM application_logs
                GROUP BY session_id
                ORDER BY MAX(created_at) DESC
                LIMIT 50
                """
            )
            return [dict(row) for row in cur.fetchall()]


def delete_session(session_id: str) -> bool:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM application_logs WHERE session_id = %s",
                (session_id,),
            )
            return cur.rowcount > 0


def insert_document_record(filename: str) -> int:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO document_store (filename) VALUES (%s) RETURNING id",
                (filename,),
            )
            return cur.fetchone()["id"]


def delete_document_record(file_id: int) -> bool:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM document_store WHERE id = %s", (file_id,))
            return cur.rowcount > 0


def get_all_documents() -> list[dict]:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, filename, upload_timestamp
                FROM document_store
                ORDER BY upload_timestamp DESC, id DESC
                """
            )
            return [dict(doc) for doc in cur.fetchall()]


def get_document_by_id(file_id: int) -> dict | None:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, filename, upload_timestamp FROM document_store WHERE id = %s",
                (file_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
