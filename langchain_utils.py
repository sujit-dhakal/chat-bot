from typing import Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.documents import Document
from chroma_utils import get_vectorstore, resolve_google_api_key

contextualize_q_system_prompt = (
    "Given a chat history and the latest user question "
    "which might reference context in the chat history, "
    "formulate a standalone question which can be understood "
    "without the chat history. Do NOT answer the question, "
    "just reformulate it if needed and otherwise return it as is."
)

contextualize_q_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", contextualize_q_system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ]
)

qa_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a helpful AI assistant. Use the following retrieved document context "
            "to answer the user's question accurately and concisely. "
            "If the context does not contain the answer, say so clearly rather than inventing facts.\n\n"
            "Context:\n{context}",
        ),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ]
)


def _to_langchain_messages(chat_history: list[dict]) -> list:
    messages = []
    for msg in chat_history:
        role = msg.get("role")
        content = msg.get("content", "")
        if role in ("human", "user"):
            messages.append(HumanMessage(content=content))
        else:
            messages.append(AIMessage(content=content))
    return messages


def _format_docs(docs: list[Document]) -> str:
    if not docs:
        return "No relevant document context was found."
    formatted = []
    for i, doc in enumerate(docs, start=1):
        filename = doc.metadata.get("filename", "Unknown document")
        page = doc.metadata.get("page")
        page_label = f" (page {page + 1})" if isinstance(page, int) else ""
        formatted.append(f"[{i}] Source: {filename}{page_label}\n{doc.page_content}")
    return "\n\n---\n\n".join(formatted)


def run_rag_query(
    question: str,
    chat_history: list[dict],
    model: str = "gemini-3.8-flash",
    file_ids: Optional[list[int]] = None,
    api_key: Optional[str] = None,
) -> dict:
    resolved_key = resolve_google_api_key(api_key)
    llm = ChatGoogleGenerativeAI(
        model=model,
        google_api_key=resolved_key,
        temperature=0.2,
        retries=0,
    )
    vectorstore = get_vectorstore(api_key=resolved_key)

    search_kwargs: dict = {"k": 4}
    if file_ids:
        if len(file_ids) == 1:
            search_kwargs["filter"] = {"file_id": file_ids[0]}
        else:
            search_kwargs["filter"] = {"file_id": {"$in": file_ids}}

    retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
    lc_history = _to_langchain_messages(chat_history)
    parser = StrOutputParser()

    standalone_question = question
    if lc_history:
        rephrase_chain = contextualize_q_prompt | llm | parser
        standalone_question = rephrase_chain.invoke(
            {"chat_history": lc_history, "input": question}
        ).strip() or question

    docs = retriever.invoke(standalone_question)
    context_text = _format_docs(docs)

    answer_chain = qa_prompt | llm | parser
    answer = answer_chain.invoke(
        {
            "context": context_text,
            "chat_history": lc_history,
            "input": question,
        }
    )

    return {"answer": answer, "docs": docs}
