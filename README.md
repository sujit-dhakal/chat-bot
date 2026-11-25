# DocuChat AI — Document RAG with Google Gemini & PostgreSQL

A full-stack Retrieval-Augmented Generation (RAG) platform to upload documents (PDF, DOCX, TXT, Markdown, HTML) and chat with them using Google Gemini models, ChromaDB vector store, and PostgreSQL for chat & document metadata persistence.

## 🚀 Architecture

- **Frontend**: Next.js 16 (App Router, Tailwind CSS, Lucide Icons, IME-safe chat input)
- **Backend**: FastAPI, LangChain, `langchain-google-genai` (Gemini 3.8 / 3.7 Flash)
- **Vector Database**: ChromaDB with local embeddings (document upload does not consume Gemini quota)
- **Relational Database**: PostgreSQL 16 (chat logs, sessions, document tracking)
- **Orchestration**: Docker Compose

---

## 🛠️ Quick Start

### 1. Configure Your Google API Key
Create or edit `.env` in the root folder:

```bash
cp .env.example .env
```

Add your Google Gemini API key:
```env
GOOGLE_API_KEY=AIzaSy...
```
*(You can also input your API key dynamically via the frontend Settings modal anytime without restarting Docker!)*

### 2. Start the Stack with Docker Compose
```bash
docker compose up -d
```

This starts 3 containers:
1. **Frontend**: http://localhost:3001 (configurable via `FRONTEND_BIND_HOST` and `FRONTEND_PORT`)
2. **FastAPI Backend**: http://localhost:8000 (API docs at http://localhost:8000/docs; configurable via `BACKEND_BIND_HOST` and `BACKEND_HOST_PORT`)
3. **PostgreSQL**: `localhost:5433` (configurable via `POSTGRES_HOST_PORT`)

To use a different local interface or port, set these values in `.env`, for example:

```env
BACKEND_BIND_HOST=127.0.0.1
BACKEND_HOST_PORT=8000
BACKEND_URL=http://backend:8080
```

`BACKEND_URL` is the URL used by the frontend container and should remain `http://backend:8080` with Docker Compose. `BACKEND_BIND_HOST` controls where the backend is exposed on the host; use `0.0.0.0` to expose it on all interfaces.

Set `CORS_ORIGINS=*` for local development to allow requests from any origin. Restrict this to your frontend URL before deploying publicly.

---

## 📖 Usage Guide

1. **Open the App**: Navigate to [http://localhost:3001](http://localhost:3001).
2. **Settings**: If you didn't add your Google API key to `.env`, click the gear icon in the top left and paste your key.
3. **Upload Documents**: In the left sidebar, click the upload box to upload PDF, Word (`.docx`), Markdown, or text files. The backend splits them into chunks and indexes them into ChromaDB using local embeddings, so uploading documents does not consume Gemini API quota.
4. **Chat & Retrieve**: Ask questions about your uploaded documents in the main chat interface. Responses cite relevant document context sources.
5. **Filter by Document**: Click on any document in the list to restrict queries only to that specific document, or ask across your entire uploaded knowledge base.
6. **Chat History**: Previous sessions are automatically saved in PostgreSQL and can be resumed or deleted from the sidebar.

---

## 🛑 Stopping the Stack
```bash
docker compose down
```
To also remove stored database volumes:
```bash
docker compose down -v
```
