FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY main.py pydantic_models.py db_utils.py chroma_utils.py langchain_utils.py ./

RUN mkdir -p /app/chroma_db

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
