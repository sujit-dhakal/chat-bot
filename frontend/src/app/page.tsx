"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  ArrowUp,
  FileText,
  Trash2,
  Settings,
  Bot,
  User,
  Plus,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  MessageSquare,
  RefreshCw,
  X,
  FileUp,
} from "lucide-react";

interface DocumentItem {
  id: number;
  filename: string;
  upload_timestamp: string;
}

interface MessageSource {
  file_id?: number;
  filename: string;
  snippet: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: MessageSource[];
  timestamp?: string;
  model?: string;
}

interface SessionItem {
  session_id: string;
  title: string;
  last_updated: string;
  message_count: number;
}

interface HealthState {
  status: string;
  database: string;
  api_key_configured: boolean;
}

export default function DocumentChatPage() {
  const [apiKey, setApiKey] = useState<string>("");
  const [savedApiKey, setSavedApiKey] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthState | null>(null);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuery, setInputQuery] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.8-flash");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load API key from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("gemini_api_key") || "";
    if (storedKey) {
      setApiKey(storedKey);
      setSavedApiKey(storedKey);
    }
  }, []);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    if (savedApiKey.trim()) {
      headers["x-google-api-key"] = savedApiKey.trim();
    }
    return headers;
  }, [savedApiKey]);

  // Fetch health status
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/backend/health", { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      setHealth(null);
    }
  }, [getHeaders]);

  // Fetch documents list
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/backend/list-docs", { headers: getHeaders() });
      if (res.ok) {
        const data: DocumentItem[] = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    }
  }, [getHeaders]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/backend/sessions", { headers: getHeaders() });
      if (res.ok) {
        const data: SessionItem[] = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to load sessions", err);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchHealth();
    fetchDocuments();
    fetchSessions();
  }, [fetchHealth, fetchDocuments, fetchSessions]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  // Adjust textarea height dynamically
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputQuery(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  // Handle Save API Key
  const handleSaveApiKey = () => {
    const trimmed = apiKey.trim();
    localStorage.setItem("gemini_api_key", trimmed);
    setSavedApiKey(trimmed);
    setIsSettingsOpen(false);
    fetchHealth();
  };

  // Switch or create session
  const startNewChat = () => {
    const newId = crypto.randomUUID();
    setCurrentSessionId(newId);
    setMessages([]);
    setInputQuery("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  };

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    try {
      const res = await fetch(`/api/backend/sessions/${sessionId}`, { headers: getHeaders() });
      if (res.ok) {
        const chatLogs: Array<{ role: "user" | "assistant"; content: string; model?: string; created_at?: string }> =
          await res.json();
        setMessages(
          chatLogs.map((log, idx) => ({
            id: `${sessionId}-${idx}`,
            role: log.role,
            content: log.content,
            model: log.model,
            timestamp: log.created_at,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load session history", err);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/backend/sessions/${sessionId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      if (currentSessionId === sessionId) {
        startNewChat();
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  // Upload file
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadFeedback(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/backend/upload-doc", {
        method: "POST",
        headers: getHeaders(),
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to upload document");
      }

      setUploadFeedback({
        type: "success",
        text: `Indexed "${file.name}" (${data.chunks ?? "multiple"} chunks).`,
      });
      fetchDocuments();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload error";
      setUploadFeedback({ type: "error", text: msg });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDeleteDocument = async (fileId: number) => {
    if (!confirm("Are you sure you want to remove this document?")) return;

    try {
      const res = await fetch("/api/backend/delete-doc", {
        method: "POST",
        headers: {
          ...getHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_id: fileId }),
      });

      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== fileId));
        setSelectedFileIds((prev) => prev.filter((id) => id !== fileId));
      } else {
        const err = await res.json();
        alert(err.detail || err.error || "Failed to delete file");
      }
    } catch (err) {
      alert(`Error deleting document: ${String(err)}`);
    }
  };

  // Toggle filter to specific files
  const toggleFileSelection = (fileId: number) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  // Submit Query to RAG Chatbot
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputQuery.trim();
    if (!query || isGenerating) return;

    if (!health?.api_key_configured && !savedApiKey) {
      setIsSettingsOpen(true);
      setUploadFeedback({
        type: "error",
        text: "Please provide your Google API key in Settings to chat with documents.",
      });
      return;
    }

    const sessionId = currentSessionId || crypto.randomUUID();
    if (!currentSessionId) {
      setCurrentSessionId(sessionId);
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setIsGenerating(true);

    try {
      const res = await fetch("/api/backend/chat", {
        method: "POST",
        headers: {
          ...getHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: query,
          session_id: sessionId,
          model: selectedModel,
          file_ids: selectedFileIds.length > 0 ? selectedFileIds : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to generate answer");
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        model: data.model,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      fetchSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${msg}. Check your Google API key in Settings.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  // IME-safe enter-to-submit handler per web guidance
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.nativeEvent.isComposing || (e as unknown as { keyCode: number }).keyCode === 229) {
        return;
      }
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-[#171717]">
      {/* SIDEBAR: Monochromatic #F9F9F9 with #E5E5E5 subtle border */}
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-[#E5E5E5] bg-[#F9F9F9] transition-all">
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-[#E5E5E5] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#171717] flex items-center justify-center text-white">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-tight text-[#171717]">DocuChat</h1>
              <p className="text-[11px] text-[#737373]">by Sujit Ram Dhakal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Settings"
            className="p-1.5 text-[#737373] hover:text-[#171717] hover:bg-[#F0F0F0] rounded-md transition-colors relative"
          >
            <Settings className="w-4 h-4" />
            {!health?.api_key_configured && !savedApiKey && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-[#171717] rounded-full" />
            )}
          </button>
        </div>

        {/* New Chat Button: Minimal outline / soft hover */}
        <div className="p-3">
          <button
            type="button"
            onClick={startNewChat}
            className="w-full flex items-center justify-between py-2 px-3 bg-white hover:bg-[#F0F0F0] text-[#171717] border border-[#E5E5E5] rounded-lg text-xs font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5" />
              New chat
            </span>
          </button>
        </div>

        {/* Scrollable Document & Session management */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          {/* Document Management */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-medium tracking-wide uppercase text-[#737373]">
                Documents ({documents.length})
              </span>
              <button
                type="button"
                onClick={fetchDocuments}
                className="text-[#737373] hover:text-[#171717] transition-colors"
                title="Refresh documents"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {/* Document Upload Area */}
            <label
              htmlFor="doc-upload"
              className={`flex items-center justify-center gap-2 p-2.5 bg-white border border-[#E5E5E5] rounded-lg cursor-pointer transition-colors hover:bg-[#F0F0F0] ${
                isUploading ? "opacity-70 pointer-events-none" : ""
              }`}
            >
              <input
                id="doc-upload"
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt,.md,.html"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#171717]" />
                  <span className="text-xs text-[#737373]">Indexing chunks...</span>
                </>
              ) : (
                <>
                  <FileUp className="w-3.5 h-3.5 text-[#171717]" />
                  <span className="text-xs font-medium text-[#171717]">Upload Document</span>
                </>
              )}
            </label>

            {uploadFeedback && (
              <div
                className={`mt-2 p-2 rounded-md text-xs flex items-start gap-1.5 border ${
                  uploadFeedback.type === "success"
                    ? "bg-white text-[#171717] border-[#E5E5E5]"
                    : "bg-[#F4F4F4] text-[#171717] border-[#E5E5E5]"
                }`}
              >
                {uploadFeedback.type === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                )}
                <span className="text-[11px] leading-snug">{uploadFeedback.text}</span>
              </div>
            )}

            {/* Document Items List */}
            <div className="mt-2 space-y-1 max-h-44 overflow-y-auto pr-0.5">
              {documents.length === 0 ? (
                <p className="text-[11px] text-[#737373] p-2 text-center">
                  No documents uploaded yet.
                </p>
              ) : (
                documents.map((doc) => {
                  const isSelected = selectedFileIds.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => toggleFileSelection(doc.id)}
                      className={`group flex items-center justify-between p-2 rounded-md text-xs cursor-pointer border transition-colors ${
                        isSelected
                          ? "bg-white border-[#171717] text-[#171717] font-medium"
                          : "bg-white border-[#E5E5E5] text-[#171717] hover:bg-[#F0F0F0]"
                      }`}
                      title="Click to toggle filter to this document"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleFileSelection(doc.id)}
                          aria-label={`Select document ${doc.filename}`}
                          className="accent-[#171717] rounded cursor-pointer"
                        />
                        <span className="truncate">{doc.filename}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-[#737373] hover:text-[#171717] transition-opacity"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            {selectedFileIds.length > 0 && (
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#737373] px-1">
                <span>Filtering to {selectedFileIds.length} doc(s)</span>
                <button
                  type="button"
                  onClick={() => setSelectedFileIds([])}
                  className="hover:text-[#171717] underline"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>

          {/* Chat History Section */}
          <div>
            <div className="text-[11px] font-medium tracking-wide uppercase text-[#737373] mb-2 px-1">
              Chat History
            </div>
            <div className="space-y-1">
              {sessions.length === 0 ? (
                <p className="text-[11px] text-[#737373] p-2 text-center">No previous sessions.</p>
              ) : (
                sessions.map((sess) => (
                  <div
                    key={sess.session_id}
                    onClick={() => loadSession(sess.session_id)}
                    className={`group flex items-center justify-between p-2 rounded-md text-xs cursor-pointer border transition-colors ${
                      currentSessionId === sess.session_id
                        ? "bg-white border-[#171717] text-[#171717] font-medium"
                        : "bg-transparent border-transparent text-[#737373] hover:bg-[#F0F0F0] hover:text-[#171717]"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate max-w-[190px]">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{sess.title || "Untitled Chat"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(sess.session_id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-[#737373] hover:text-[#171717] transition-opacity"
                      title="Delete session"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Status Footer */}
        <div className="p-3 border-t border-[#E5E5E5] text-[11px] text-[#737373] bg-[#F9F9F9] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-[#171717]" />
            <span>Postgres:</span>
            <span className={health?.database === "connected" ? "text-[#171717] font-medium" : "text-[#737373]"}>
              {health?.database === "connected" ? "Ready" : "Offline"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                health?.api_key_configured || savedApiKey ? "bg-[#171717]" : "bg-[#737373]"
              }`}
            />
            <span>{health?.api_key_configured || savedApiKey ? "API Connected" : "No Key"}</span>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT AREA: Pure White (#FFFFFF) */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        {/* Top Minimal Bar */}
        <header className="h-12 border-b border-[#E5E5E5] flex items-center justify-between px-6 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[#171717] tracking-tight">DocuChat</span>
            {selectedFileIds.length > 0 && (
              <span className="text-[11px] bg-[#F4F4F4] text-[#171717] border border-[#E5E5E5] px-2 py-0.5 rounded-full">
                {selectedFileIds.length} doc{selectedFileIds.length > 1 ? "s" : ""} selected
              </span>
            )}
          </div>

          {/* Model Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="model-select" className="text-xs text-[#737373]">
              Model:
            </label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-white border border-[#E5E5E5] text-xs rounded-md px-2.5 py-1 text-[#171717] focus:outline-none focus:border-[#171717] transition-colors"
            >
              <option value="gemini-3.8-flash">Gemini 3.8 Flash (Fast)</option>
              <option value="gemini-3.7-flash">Gemini 3.7 Flash</option>
            </select>
          </div>
        </header>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 ? (
              <div className="h-full py-16 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-[#171717] flex items-center justify-center mb-4 text-white">
                  <Bot className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-semibold text-[#171717] tracking-tight">
                  What can I help you find today?
                </h2>
                <p className="text-xs text-[#737373] mt-1 font-medium">
                  Created by Sujit Ram Dhakal
                </p>
                <p className="text-xs text-[#737373] mt-2 max-w-md">
                  Upload PDF, Word, Markdown, or text files to chat with them.
                  Your questions are answered using vector search grounded in your documents.
                </p>

                {(!health?.api_key_configured && !savedApiKey) && (
                  <div className="mt-6 p-4 rounded-lg border border-[#E5E5E5] bg-[#F9F9F9] text-left w-full max-w-md">
                    <div className="flex items-center gap-2 text-[#171717] font-medium text-xs mb-1">
                      <KeyRound className="w-4 h-4" />
                      <span>Google Gemini API Key Needed</span>
                    </div>
                    <p className="text-xs text-[#737373] mb-3">
                      Add your API key in Settings or set it in the `.env` file to enable vector indexing and chat.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen(true)}
                      className="text-xs px-3 py-1.5 rounded-md bg-[#171717] hover:bg-[#333333] text-white font-medium transition-colors"
                    >
                      Open Settings
                    </button>
                  </div>
                )}

                {documents.length > 0 && (
                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                    {[
                      "Summarize the key findings in this document.",
                      "What are the main requirements and objectives?",
                      "Are there critical dates or deadlines mentioned?",
                      "List the core action items.",
                    ].map((prompt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setInputQuery(prompt);
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                          }
                        }}
                        className="p-3 text-left bg-white border border-[#E5E5E5] hover:bg-[#F0F0F0] rounded-lg text-xs text-[#171717] transition-colors"
                      >
                        &ldquo;{prompt}&rdquo;
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 text-sm ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-[#171717] flex items-center justify-center flex-shrink-0 text-white mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`leading-relaxed max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-[#F4F4F4] text-[#171717] px-4 py-2.5 rounded-2xl rounded-tr-sm"
                        : "bg-white text-[#171717] py-1"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>

                    {/* Sources Badge */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#E5E5E5] space-y-1.5">
                        <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wider block">
                          Document Sources:
                        </span>
                        <div className="space-y-1">
                          {msg.sources.map((src, idx) => (
                            <div
                              key={idx}
                              className="text-xs bg-[#F9F9F9] border border-[#E5E5E5] p-2.5 rounded-md text-[#171717]"
                            >
                              <div className="font-medium text-[11px] flex items-center gap-1.5 text-[#171717]">
                                <FileText className="w-3 h-3 text-[#737373]" />
                                {src.filename}
                              </div>
                              <p className="text-[#737373] text-[11px] mt-1 line-clamp-2 italic">
                                &ldquo;{src.snippet}&rdquo;
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-[#E5E5E5] flex items-center justify-center flex-shrink-0 text-[#171717] mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))
            )}

            {isGenerating && (
              <div className="flex gap-3 items-center text-xs text-[#737373]">
                <div className="w-7 h-7 rounded-full bg-[#171717] flex items-center justify-center text-white">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#171717]" />
                  <span>Searching documents and generating response...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area: Minimal, spacious, ChatGPT-style rounded box */}
        <div className="p-4 bg-white border-t border-[#E5E5E5]">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={handleSendMessage}
              className="relative flex items-center bg-white border border-[#E5E5E5] rounded-2xl px-3 py-2 shadow-sm focus-within:border-[#171717] transition-all"
            >
              <label htmlFor="chat-input" className="sr-only">
                Ask a question about your documents
              </label>
              <textarea
                id="chat-input"
                ref={textareaRef}
                rows={1}
                value={inputQuery}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  documents.length === 0
                    ? "Upload a document in the sidebar to start asking questions..."
                    : "Message DocuChat..."
                }
                className="flex-1 bg-transparent px-2 py-1 text-sm text-[#171717] placeholder-[#737373] focus:outline-none resize-none max-h-40 min-h-[36px]"
              />
              <button
                type="submit"
                disabled={!inputQuery.trim() || isGenerating}
                className="w-8 h-8 rounded-full bg-[#171717] hover:bg-[#333333] text-white disabled:bg-[#E5E5E5] disabled:text-[#A3A3A3] flex items-center justify-center transition-colors flex-shrink-0"
                title="Send message"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </form>
            <p className="text-[11px] text-center text-[#737373] mt-2">
              DocuChat by Sujit Ram Dhakal · Retrieves context from indexed documents.
            </p>
          </div>
        </div>
      </main>

      {/* SETTINGS MODAL: Monochromatic minimal design */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E5] rounded-xl max-w-md w-full p-6 shadow-xl relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#171717] flex items-center justify-center text-white">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-[#171717]">Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 text-[#737373] hover:text-[#171717] hover:bg-[#F0F0F0] rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#737373] mb-4">
              Enter your Google API Key below. It will be stored in your browser session and forwarded securely to the backend.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="api-key-input" className="block text-xs font-medium text-[#171717] mb-1.5">
                  Google Gemini API Key
                </label>
                <input
                  id="api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-white border border-[#E5E5E5] rounded-lg px-3 py-2 text-xs text-[#171717] placeholder-[#737373] focus:outline-none focus:border-[#171717] transition-colors"
                />
              </div>

              <div className="p-3 bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg space-y-1 text-xs text-[#737373]">
                <div className="flex justify-between">
                  <span>Backend .env key:</span>
                  <span className={health?.api_key_configured ? "text-[#171717] font-medium" : "text-[#737373]"}>
                    {health?.api_key_configured ? "Configured" : "Not set"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>PostgreSQL:</span>
                  <span className={health?.database === "connected" ? "text-[#171717] font-medium" : "text-[#737373]"}>
                    {health?.database || "Unknown"}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-3 py-1.5 text-xs text-[#737373] hover:text-[#171717] hover:bg-[#F0F0F0] rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className="px-3.5 py-1.5 text-xs bg-[#171717] hover:bg-[#333333] text-white rounded-md font-medium transition-colors"
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
