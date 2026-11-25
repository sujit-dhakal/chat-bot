import os
import logging
import hashlib
import math
import re
from typing import List, Optional
from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    BSHTMLLoader,
    TextLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

logger = logging.getLogger(__name__)

CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "documents_local")
LOCAL_EMBEDDING_DIMENSIONS = 384

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    length_function=len,
)


class LocalHashEmbeddings(Embeddings):
    """Small deterministic embeddings that do not call an external API.

    This keeps document upload and retrieval independent of Gemini embedding
    quotas. Hashing makes the vectors stable across container restarts and
    avoids adding a large ML model to the Docker image.
    """

    _token_pattern = re.compile(r"(?u)\b\w\w+\b")

    @staticmethod
    def _embed(text: str) -> list[float]:
        vector = [0.0] * LOCAL_EMBEDDING_DIMENSIONS
        tokens = LocalHashEmbeddings._token_pattern.findall(text.lower())

        for token in tokens:
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "little") % LOCAL_EMBEDDING_DIMENSIONS
            vector[index] += 1.0 if digest[4] & 1 else -1.0

        norm = math.sqrt(sum(value * value for value in vector))
        if norm:
            vector = [value / norm for value in vector]
        return vector

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


def resolve_google_api_key(api_key: Optional[str] = None) -> str:
    key = (api_key or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key or key == "your-google-api-key-here":
        raise ValueError(
            "GOOGLE_API_KEY is not configured. Please set it in .env or provide it in the settings panel."
        )
    return key


def _migrate_legacy_embeddings() -> None:
    """Copy old Gemini-embedded chunks into the local embedding collection."""
    import chromadb

    client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
    collection_names = {collection.name for collection in client.list_collections()}
    if "langchain" not in collection_names or CHROMA_COLLECTION_NAME == "langchain":
        return

    legacy = client.get_collection("langchain")
    if not legacy.count():
        return

    target = client.get_or_create_collection(CHROMA_COLLECTION_NAME)
    existing_ids = set(target.get(include=["metadatas"]).get("ids", []))
    legacy_data = legacy.get(include=["documents", "metadatas"])
    documents = legacy_data.get("documents") or []
    metadatas = legacy_data.get("metadatas") or [{} for _ in documents]
    ids = legacy_data.get("ids") or []

    embeddings = LocalHashEmbeddings()
    new_ids = []
    new_documents = []
    new_metadatas = []
    for chunk_id, document, metadata in zip(ids, documents, metadatas):
        if chunk_id not in existing_ids and document:
            new_ids.append(chunk_id)
            new_documents.append(document)
            new_metadatas.append(metadata or {})

    if new_ids:
        target.add(
            ids=new_ids,
            documents=new_documents,
            metadatas=new_metadatas,
            embeddings=embeddings.embed_documents(new_documents),
        )
        logger.info("Migrated %d legacy document chunks to local embeddings.", len(new_ids))


def get_vectorstore(api_key: Optional[str] = None) -> Chroma:
    del api_key  # Kept for compatibility with the API-key-aware call sites.
    _migrate_legacy_embeddings()
    return Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        collection_name=CHROMA_COLLECTION_NAME,
        embedding_function=LocalHashEmbeddings(),
    )


def load_and_split_document(file_path: str) -> List[Document]:
    lower_path = file_path.lower()
    if lower_path.endswith(".pdf"):
        loader = PyPDFLoader(file_path)
    elif lower_path.endswith(".docx"):
        loader = Docx2txtLoader(file_path)
    elif lower_path.endswith(".html") or lower_path.endswith(".htm"):
        loader = BSHTMLLoader(file_path, open_encoding="utf-8")
    elif lower_path.endswith(".txt") or lower_path.endswith(".md"):
        loader = TextLoader(file_path, encoding="utf-8", autodetect_encoding=True)
    else:
        raise ValueError(f"Unsupported file type: {file_path}")

    documents = loader.load()
    return text_splitter.split_documents(documents)


def index_document_to_chroma(
    file_path: str,
    file_id: int,
    filename: str,
    api_key: Optional[str] = None,
) -> int:
    splits = load_and_split_document(file_path)
    if not splits:
        raise ValueError(f"No readable text content found in '{filename}'.")

    for split in splits:
        split.metadata["file_id"] = file_id
        split.metadata["filename"] = filename

    vectorstore = get_vectorstore(api_key=api_key)
    vectorstore.add_documents(splits)
    return len(splits)


def delete_doc_from_chroma(file_id: int, api_key: Optional[str] = None) -> bool:
    try:
        vectorstore = get_vectorstore(api_key=api_key)
        collection = vectorstore._collection

        docs = collection.get(where={"file_id": file_id})
        ids = docs.get("ids", [])
        logger.info("Found %d document chunks for file_id %d", len(ids), file_id)
        if ids:
            collection.delete(where={"file_id": file_id})
        return True
    except Exception as exc:
        logger.exception("Error deleting document with file_id %d from Chroma: %s", file_id, exc)
        return False
