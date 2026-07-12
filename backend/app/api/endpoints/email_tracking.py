from typing import Any, Dict, List, Optional
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import enforce_general_rate_limit
from app.db.database import get_db
from app.models.user import User
from app.models.oauth import OAuthAccount
from app.models.email_tracking import SentEmail
from app.core.config import settings

router = APIRouter()

class EmailResponse(BaseModel):
    id: str
    recipient: str
    subject: Optional[str]
    body: Optional[str]
    sent_at: str
    thread_id: Optional[str]
    message_id: str
    has_replies: bool = False

@router.get("/", response_model=List[EmailResponse])
async def list_sent_emails(
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
):
    """Get all sent emails tracked by the AI agent for the current user."""
    stmt = select(SentEmail).where(SentEmail.user_id == current_user.id).order_by(desc(SentEmail.sent_at))
    result = await db.execute(stmt)
    emails = result.scalars().all()
    
    
    replied_thread_ids = set()
    
    # Efficiently batch check for replies using Gmail API search
    if emails:
        oauth = await db.scalar(select(OAuthAccount).where(OAuthAccount.user_id == current_user.id, OAuthAccount.provider == "google"))
        if oauth and oauth.access_token:
            thread_ids = [e.thread_id for e in emails if e.thread_id]
            if thread_ids:
                # Check the 50 most recent threads to stay within reasonable query lengths
                recent_threads = thread_ids[:50]
                # A thread has a reply if it contains a message that is in the inbox (i.e. received)
                q = "in:inbox {" + " ".join([f"thread:{tid}" for tid in recent_threads]) + "}"
                try:
                    async with httpx.AsyncClient() as client:
                        res = await client.get(
                            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                            headers={"Authorization": f"Bearer {oauth.access_token}"},
                            params={"q": q, "fields": "messages(threadId)"}
                        )
                        if res.status_code == 200:
                            data = res.json()
                            for msg in data.get("messages", []):
                                replied_thread_ids.add(msg.get("threadId"))
                except Exception as e:
                    pass # Silently fail on Gmail query error, has_replies will just default to False

    return [
        EmailResponse(
            id=str(e.id),
            recipient=e.recipient,
            subject=e.subject,
            body=e.body,
            sent_at=e.sent_at.isoformat(),
            thread_id=e.thread_id,
            message_id=e.message_id,
            has_replies=(e.thread_id in replied_thread_ids)
        )
        for e in emails
    ]

@router.get("/{thread_id}/replies")
async def get_email_thread(
    thread_id: str,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
):
    """Fetch the thread from Gmail API to see replies."""
    stmt = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.provider == "google"
    )
    result = await db.execute(stmt)
    oauth = result.scalar_one_or_none()
    
    if not oauth or not oauth.access_token:
        raise HTTPException(status_code=401, detail="Google Account not connected.")
        
    async with httpx.AsyncClient() as client:
        url = f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{thread_id}"
        headers = {"Authorization": f"Bearer {oauth.access_token}"}
        res = await client.get(url, headers=headers)
        
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=f"Gmail API error: {res.text}")
            
        data = res.json()
        
        # parse messages
        messages = []
        for msg in data.get("messages", []):
            payload = msg.get("payload", {})
            headers_list = payload.get("headers", [])
            
            from_addr = next((h["value"] for h in headers_list if h["name"].lower() == "from"), "")
            date_str = next((h["value"] for h in headers_list if h["name"].lower() == "date"), "")
            snippet = msg.get("snippet", "")
            
            # Simple body extraction
            body_data = ""
            if "parts" in payload:
                for part in payload["parts"]:
                    if part.get("mimeType") == "text/plain":
                        import base64
                        body_data = base64.urlsafe_b64decode(part["body"].get("data", "")).decode("utf-8")
                        break
            else:
                import base64
                body_data = base64.urlsafe_b64decode(payload.get("body", {}).get("data", "")).decode("utf-8")
                
            messages.append({
                "id": msg["id"],
                "from": from_addr,
                "date": date_str,
                "snippet": snippet,
                "body": body_data or snippet
            })
            
        return {"thread_id": thread_id, "messages": messages}

class SuggestReplyRequest(BaseModel):
    thread_context: str
    custom_prompt: Optional[str] = None

@router.post("/suggest_reply")
async def suggest_email_reply(
    request: SuggestReplyRequest,
    current_user: User = Depends(enforce_general_rate_limit)
):
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import SystemMessage, HumanMessage
    llm = ChatOpenAI(model=settings.OPENAI_MODEL, temperature=0.7)
    
    sys_prompt = "You are an AI assistant helping a job seeker write professional, direct, and concise email replies to recruiters or hiring managers. Do NOT include markdown headers like 'Subject:' or 'Body:'. Just output the raw email reply text. Be polite and enthusiastic."
    if request.custom_prompt:
        sys_prompt += f" The user has a specific instruction for tweaking the reply: {request.custom_prompt}"
        
    messages = [
        SystemMessage(content=sys_prompt),
        HumanMessage(content=f"Here is the email thread context:\n\n{request.thread_context}\n\nPlease generate an appropriate reply.")
    ]
    res = await llm.ainvoke(messages)
    return {"suggested_reply": res.content}

class ReplyRequest(BaseModel):
    text: str
    refine_with_ai: bool = False
    prompt_context: Optional[str] = None
    to: str
    subject: str
    message_id: str # The message ID of the last email in the thread to reply to

@router.post("/{thread_id}/reply")
async def send_email_reply(
    thread_id: str,
    request: ReplyRequest,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
):
    """Send a reply to a thread, optionally refining it with AI."""
    stmt = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.provider == "google"
    )
    result = await db.execute(stmt)
    oauth = result.scalar_one_or_none()
    
    if not oauth or not oauth.access_token:
        raise HTTPException(status_code=401, detail="Google Account not connected.")
        
    final_text = request.text
    if request.refine_with_ai:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage
        llm = ChatOpenAI(model=settings.OPENAI_MODEL, temperature=0.7)
        sys_prompt = "You are an AI assistant helping a job seeker write professional, direct, and concise email replies. Do NOT include markdown headers. Just output the refined email."
        if request.prompt_context:
            sys_prompt += f" Context/instructions: {request.prompt_context}"
        
        messages = [
            SystemMessage(content=sys_prompt),
            HumanMessage(content=f"Please refine this draft email reply:\n\n{request.text}")
        ]
        res = await llm.ainvoke(messages)
        final_text = res.content
        
    import base64
    from email.message import EmailMessage
    
    msg = EmailMessage()
    msg['To'] = request.to
    
    # Ensure subject starts with Re:
    subject = request.subject if request.subject.lower().startswith("re:") else f"Re: {request.subject}"
    msg['Subject'] = subject
    msg['In-Reply-To'] = request.message_id
    msg['References'] = request.message_id
    msg.set_content(final_text)
    
    encoded_message = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    
    async with httpx.AsyncClient() as client:
        url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
        payload = {
            "raw": encoded_message,
            "threadId": thread_id
        }
        headers = {"Authorization": f"Bearer {oauth.access_token}"}
        res = await client.post(url, headers=headers, json=payload)
        
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=f"Gmail API error: {res.text}")
            
        data = res.json()
        
        # Log to DB
        sent_email = SentEmail(
            user_id=current_user.id,
            recipient=request.to,
            subject=subject,
            body=final_text,
            message_id=data.get("id"),
            thread_id=thread_id
        )
        db.add(sent_email)
        await db.commit()
        
        return {"status": "ok", "message_id": data.get("id"), "sent_text": final_text}
