from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import enforce_general_rate_limit, enforce_llm_rate_limit
from app.core.config import settings
from app.db.database import get_db
from app.models.oauth import OAuthAccount
from app.models.user import User

router = APIRouter()


class DocListItem(BaseModel):
    id: str
    name: str
    modified_time: Optional[str] = None
    web_view_link: Optional[str] = None


class DocContentResponse(BaseModel):
    id: str
    title: str
    content: str
    web_view_link: str


class UpdateDocRequest(BaseModel):
    content: str
    mode: str = "replace"


class CreateDocRequest(BaseModel):
    title: str = Field(min_length=1)
    content: str = ""


class AiRewriteRequest(BaseModel):
    content: str
    instruction: str = Field(min_length=1)


async def _get_google_token(current_user: User, db: AsyncSession) -> str:
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id,
            OAuthAccount.provider == "google",
        )
    )
    oauth = result.scalar_one_or_none()
    if not oauth or not oauth.access_token:
        raise HTTPException(
            status_code=401,
            detail="Google Account not connected. Connect Google in the sidebar first.",
        )
    return oauth.access_token


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _extract_doc_text(doc_data: dict) -> str:
    text = ""
    for element in doc_data.get("body", {}).get("content", []):
        if "paragraph" in element:
            for p_elem in element["paragraph"].get("elements", []):
                if "textRun" in p_elem:
                    text += p_elem["textRun"]["content"]
    return text


def _doc_end_index(doc_data: dict) -> int:
    content = doc_data.get("body", {}).get("content", [])
    if not content:
        return 1
    return content[-1].get("endIndex", 1)


@router.get("/", response_model=List[DocListItem])
async def list_docs(
    query: str = Query("", description="Optional name filter"),
    max_results: int = Query(25, ge=1, le=50),
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """List the user's Google Docs, newest first."""
    token = await _get_google_token(current_user, db)
    mime = "application/vnd.google-apps.document"
    q_parts = [f"mimeType='{mime}'", "trashed=false"]
    if query.strip():
        safe = query.replace("'", "\\'")
        q_parts.append(f"name contains '{safe}'")

    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            "https://www.googleapis.com/drive/v3/files",
            headers=_headers(token),
            params={
                "q": " and ".join(q_parts),
                "pageSize": max_results,
                "orderBy": "modifiedTime desc",
                "fields": "files(id, name, modifiedTime, webViewLink)",
            },
        )
        if res.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail="Google connection expired. Click Refresh Connection in the sidebar.",
            )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)

        files = res.json().get("files", [])
        return [
            DocListItem(
                id=f["id"],
                name=f.get("name") or "Untitled",
                modified_time=f.get("modifiedTime"),
                web_view_link=f.get("webViewLink"),
            )
            for f in files
        ]


@router.post("/ai/rewrite")
async def ai_rewrite_doc(
    body: AiRewriteRequest,
    current_user: User = Depends(enforce_llm_rate_limit),
):
    """Rewrite document text with AI based on a user instruction."""
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model=settings.OPENAI_MODEL, temperature=0.4)
    messages = [
        SystemMessage(
            content=(
                "You help a job seeker improve Google Docs content (resumes, cover letters, notes). "
                "Return ONLY the full rewritten document text. No markdown fences, no commentary."
            )
        ),
        HumanMessage(
            content=(
                f"Instruction:\n{body.instruction}\n\n"
                f"Current document:\n{body.content or '(empty document)'}"
            )
        ),
    ]
    result = await llm.ainvoke(messages)
    return {"content": result.content}


@router.get("/{doc_id}", response_model=DocContentResponse)
async def read_doc(
    doc_id: str,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Read plain text content of a Google Doc."""
    token = await _get_google_token(current_user, db)
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            f"https://docs.googleapis.com/v1/documents/{doc_id}",
            headers=_headers(token),
        )
        if res.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail="Google connection expired. Click Refresh Connection in the sidebar.",
            )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)

        data = res.json()
        return DocContentResponse(
            id=doc_id,
            title=data.get("title") or "Untitled",
            content=_extract_doc_text(data),
            web_view_link=f"https://docs.google.com/document/d/{doc_id}/edit",
        )


@router.put("/{doc_id}")
async def update_doc(
    doc_id: str,
    body: UpdateDocRequest,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Replace or append content in an existing Google Doc."""
    mode = (body.mode or "replace").strip().lower()
    if mode not in ("replace", "append"):
        raise HTTPException(status_code=400, detail="mode must be 'replace' or 'append'")
    if not body.content.strip() and mode == "append":
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    token = await _get_google_token(current_user, db)
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            f"https://docs.googleapis.com/v1/documents/{doc_id}",
            headers=_headers(token),
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)

        doc_data = res.json()
        end_index = _doc_end_index(doc_data)
        requests = []

        if mode == "replace":
            if end_index > 2:
                requests.append(
                    {
                        "deleteContentRange": {
                            "range": {"startIndex": 1, "endIndex": end_index - 1}
                        }
                    }
                )
            text = body.content if body.content.endswith("\n") else body.content + "\n"
            requests.append({"insertText": {"location": {"index": 1}, "text": text}})
        else:
            insert_at = max(end_index - 1, 1)
            prefix = "\n" if end_index > 2 else ""
            requests.append(
                {
                    "insertText": {
                        "location": {"index": insert_at},
                        "text": prefix + body.content,
                    }
                }
            )

        update_res = await client.post(
            f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate",
            headers=_headers(token),
            json={"requests": requests},
        )
        if update_res.status_code != 200:
            raise HTTPException(status_code=update_res.status_code, detail=update_res.text)

        return {
            "message": f"Document updated ({mode})",
            "web_view_link": f"https://docs.google.com/document/d/{doc_id}/edit",
        }


@router.post("/", response_model=DocContentResponse)
async def create_doc(
    body: CreateDocRequest,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Google Doc with optional initial content."""
    token = await _get_google_token(current_user, db)
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            "https://docs.googleapis.com/v1/documents",
            headers=_headers(token),
            json={"title": body.title},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)

        doc_id = res.json().get("documentId")
        content = body.content or ""
        if content:
            text = content if content.endswith("\n") else content + "\n"
            await client.post(
                f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate",
                headers=_headers(token),
                json={
                    "requests": [
                        {"insertText": {"location": {"index": 1}, "text": text}}
                    ]
                },
            )

        return DocContentResponse(
            id=doc_id,
            title=body.title,
            content=content,
            web_view_link=f"https://docs.google.com/document/d/{doc_id}/edit",
        )
