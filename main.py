import os
import uuid
import shutil
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

from pydantic_models import (
    QueryInput,
    QueryResponse,
    SourceInfo,
    DocumentInfo,
    DeleteFileRequest,
    ChatMessage,
    SessionInfo,
)
from langchain_utils import run_rag_query
from db_utils import (
    init_db,
    check_db_health,
    insert_application_logs,
    get_chat_history,
    get_session_messages,
    get_sessions,
    delete_session,
    get_all_documents,
    get_document_by_id,
    insert_document_record,
    delete_document_record,
)
from chroma_utils import index_document_to_chroma, delete_doc_from_chroma

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _google_error_response(exc: Exception) -> tuple[int, str] | None:
    """Map common Gemini API failures to actionable HTTP responses."""
    error_text = str(exc)
    if "RESOURCE_EXHAUSTED" in error_text or "429" in error_text:
        return (
            429,
            "Google Gemini quota is exhausted for this API key. "
            "Add a different key in Settings or update GOOGLE_API_KEY in .env.",
        )
    if "UNAVAILABLE" in error_text or "503" in error_text:
        return 503, "Google Gemini is temporarily unavailable. Please try again shortly."
    if "NOT_FOUND" in error_text or "404" in error_text:
        return 400, "The selected Gemini model is unavailable for this API key. Choose another model."
    return None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Document RAG Chatbot API", lifespan=lifespan)

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allow_all_origins = raw_origins.strip() == "*"
origins = ["*"] if allow_all_origins else [
    origin.strip() for origin in raw_origins.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    db_ok = check_db_health()
    env_key = (os.getenv("GOOGLE_API_KEY") or "").strip()
    api_key_configured = bool(env_key and env_key != "your-google-api-key-here")
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "api_key_configured": api_key_configured,
    }


@app.post("/chat", response_model=QueryResponse)
def chat(
    query_input: QueryInput,
    x_google_api_key: Optional[str] = Header(default=None),
):
    session_id = query_input.session_id or str(uuid.uuid4())
    logger.info(
        "Session ID: %s, User Query: %s, Model: %s",
        session_id,
        query_input.question,
        query_input.model.value,
    )

    chat_history = get_chat_history(session_id)

    try:
        result = run_rag_query(
            question=query_input.question,
            chat_history=chat_history,
            model=query_input.model.value,
            file_ids=query_input.file_ids,
            api_key=x_google_api_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        google_error = _google_error_response(exc)
        if google_error:
            status_code, detail = google_error
            logger.warning("Gemini request failed (%d): %s", status_code, exc)
            raise HTTPException(status_code=status_code, detail=detail) from exc
        logger.exception("Error generating RAG response: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {exc}") from exc

    answer = result["answer"]
    docs = result["docs"]

    sources = [
        SourceInfo(
            file_id=doc.metadata.get("file_id"),
            filename=doc.metadata.get("filename", "Document"),
            snippet=doc.page_content[:240].strip(),
        )
        for doc in docs
    ]

    insert_application_logs(session_id, query_input.question, answer, query_input.model.value)
    return QueryResponse(
        answer=answer,
        session_id=session_id,
        model=query_input.model,
        sources=sources,
    )


@app.post("/upload-doc")
def upload_and_index_document(
    file: UploadFile = File(...),
    x_google_api_key: Optional[str] = Header(default=None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    allowed_extensions = [".pdf", ".docx", ".html", ".htm", ".txt", ".md"]
    safe_filename = os.path.basename(file.filename)
    file_extension = os.path.splitext(safe_filename)[1].lower()

    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types are: {', '.join(allowed_extensions)}",
        )

    temp_file_path = f"/tmp/upload_{uuid.uuid4().hex}_{safe_filename}"
    file_id = None

    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_id = insert_document_record(safe_filename)
        chunk_count = index_document_to_chroma(
            temp_file_path,
            file_id,
            safe_filename,
            api_key=x_google_api_key,
        )
        return {
            "message": f"File '{safe_filename}' uploaded and indexed ({chunk_count} chunks).",
            "file_id": file_id,
            "filename": safe_filename,
            "chunks": chunk_count,
        }
    except ValueError as exc:
        if file_id is not None:
            delete_document_record(file_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        if file_id is not None:
            delete_document_record(file_id)
        logger.exception("Error uploading/indexing document %s: %s", safe_filename, exc)
        raise HTTPException(status_code=500, detail=f"Failed to index '{safe_filename}': {exc}") from exc
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@app.get("/list-docs", response_model=list[DocumentInfo])
def list_documents():
    return get_all_documents()


@app.post("/delete-doc")
def delete_document(
    request: DeleteFileRequest,
    x_google_api_key: Optional[str] = Header(default=None),
):
    doc = get_document_by_id(request.file_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {request.file_id} not found.")

    chroma_delete_success = delete_doc_from_chroma(request.file_id, api_key=x_google_api_key)
    if not chroma_delete_success:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete document with file_id {request.file_id} from Chroma.",
        )

    db_delete_success = delete_document_record(request.file_id)
    if not db_delete_success:
        raise HTTPException(
            status_code=500,
            detail=f"Deleted from Chroma but failed to delete file_id {request.file_id} from database.",
        )

    return {"message": f"Successfully deleted '{doc['filename']}'."}


@app.delete("/docs/{file_id}")
def delete_document_by_id(
    file_id: int,
    x_google_api_key: Optional[str] = Header(default=None),
):
    return delete_document(DeleteFileRequest(file_id=file_id), x_google_api_key=x_google_api_key)


@app.get("/sessions", response_model=list[SessionInfo])
def list_sessions():
    return get_sessions()


@app.get("/sessions/{session_id}", response_model=list[ChatMessage])
def get_session(session_id: str):
    return get_session_messages(session_id)


@app.delete("/sessions/{session_id}")
def remove_session(session_id: str):
    delete_session(session_id)
    return {"message": "Session deleted."}
