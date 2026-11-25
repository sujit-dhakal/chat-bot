from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
from typing import Optional


class ModelName(str, Enum):
    GEMINI_3_5_FLASH_LITE = "gemini-3.5-flash-lite"
    GEMINI_3_6_FLASH = "gemini-3.6-flash"
    GEMINI_3_5_FLASH = "gemini-3.5-flash"
    GEMINI_3_8_FLASH = "gemini-3.8-flash"
    GEMINI_3_7_FLASH = "gemini-3.7-flash"


class QueryInput(BaseModel):
    question: str = Field(..., min_length=1)
    session_id: Optional[str] = Field(default=None)
    model: ModelName = Field(default=ModelName.GEMINI_3_5_FLASH_LITE)
    file_ids: Optional[list[int]] = Field(default=None)


class SourceInfo(BaseModel):
    file_id: Optional[int] = None
    filename: str
    snippet: str


class QueryResponse(BaseModel):
    answer: str
    session_id: str
    model: ModelName
    sources: list[SourceInfo] = Field(default_factory=list)


class DocumentInfo(BaseModel):
    id: int
    filename: str
    upload_timestamp: datetime


class DeleteFileRequest(BaseModel):
    file_id: int


class ChatMessage(BaseModel):
    role: str
    content: str
    model: Optional[str] = None
    created_at: Optional[datetime] = None


class SessionInfo(BaseModel):
    session_id: str
    title: str
    last_updated: datetime
    message_count: int
