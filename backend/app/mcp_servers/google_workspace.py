import os
import json
import base64
import httpx
from datetime import datetime, timedelta, timezone
from mcp.server.fastmcp import FastMCP

import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import app.db.base  # Import base to load all models including User
from app.models.email_tracking import SentEmail
from app.core.config import settings

_async_session_maker = None

def _get_session_maker():
    global _async_session_maker
    if _async_session_maker is None:
        engine = create_async_engine(settings.DATABASE_URI)
        _async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return _async_session_maker

async def _log_sent_email(to: str, subject: str, body: str, msg_id: str, thread_id: str = None):
    import sys
    user_id_str = os.environ.get("USER_ID")
    if not user_id_str:
        print("Warning: USER_ID not found in env, skipping DB logging", file=sys.stderr)
        return
    try:
        session_maker = _get_session_maker()
        async with session_maker() as session:
            sent_email = SentEmail(
                user_id=uuid.UUID(user_id_str),
                recipient=to,
                subject=subject,
                body=body,
                message_id=msg_id,
                thread_id=thread_id or msg_id
            )
            session.add(sent_email)
            await session.commit()
    except Exception as e:
        print(f"Failed to log sent email to DB: {e}", file=sys.stderr)

# Create a FastMCP server instance
mcp = FastMCP("Google Workspace Local")

def get_token():
    token = os.environ.get("GOOGLE_ACCESS_TOKEN")
    if not token:
        raise ValueError("GOOGLE_ACCESS_TOKEN environment variable is required.")
    return token

def get_headers():
    return {
        "Authorization": f"Bearer {get_token()}",
        "Content-Type": "application/json"
    }

# ====================
# GMAIL TOOLS
# ====================

@mcp.tool()
async def search_emails(query: str, max_results: int = 5) -> str:
    """Search for emails in the user's Gmail account."""
    async with httpx.AsyncClient() as client:
        url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
        params = {"q": query, "maxResults": max_results}
        response = await client.get(url, headers=get_headers(), params=params)
        
        if response.status_code != 200:
            return f"Error: {response.status_code} - {response.text}"
            
        data = response.json()
        messages = data.get("messages", [])
        if not messages:
            return "No emails found matching the query."
            
        results = []
        for msg in messages:
            msg_id = msg['id']
            msg_res = await client.get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}", headers=get_headers())
            if msg_res.status_code == 200:
                msg_data = msg_res.json()
                headers = msg_data.get("payload", {}).get("headers", [])
                subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "No Subject")
                from_email = next((h["value"] for h in headers if h["name"].lower() == "from"), "Unknown")
                snippet = msg_data.get("snippet", "")
                results.append(f"ID: {msg_id}\nFrom: {from_email}\nSubject: {subject}\nSnippet: {snippet}\n---")
                
        return "\n".join(results)

from email.message import EmailMessage

async def _build_email_payload(to: str, subject: str, body: str, attachment_url: str = None) -> str:
    msg = EmailMessage()
    msg['To'] = to
    msg['Subject'] = subject
    msg.set_content(body)
    
    if attachment_url:
        try:
            async with httpx.AsyncClient() as client:
                # Manually follow redirects to rewrite hostnames for Docker networking
                res = await client.get(attachment_url, follow_redirects=False)
                while res.status_code in (301, 302, 303, 307, 308):
                    next_url = res.headers["Location"]
                    # If the backend redirected us to localhost:9000 (which works for browsers),
                    # we must rewrite it to minio:9000 because we are inside the Docker network.
                    if "localhost:9000" in next_url:
                        next_url = next_url.replace("localhost:9000", "minio:9000")
                    # Also, if the original attachment url was a relative path or missing host, httpx handles it, 
                    # but here next_url is fully qualified from our backend.
                    res = await client.get(next_url, follow_redirects=False)
                    
                if res.status_code == 200:
                    content_type = res.headers.get("content-type", "application/pdf")
                    maintype, subtype = content_type.split("/", 1) if "/" in content_type else ("application", "octet-stream")
                    
                    filename = "attachment.pdf"
                    cd = res.headers.get("content-disposition", "")
                    if "filename=" in cd:
                        filename = cd.split("filename=")[-1].strip('"').strip("'")
                    
                    msg.add_attachment(res.content, maintype=maintype, subtype=subtype, filename=filename)
        except Exception as e:
            print(f"Warning: Failed to fetch attachment from {attachment_url}: {e}")
            
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

@mcp.tool()
async def draft_email(to: str, subject: str, body: str, attachment_url: str = None) -> str:
    """Draft an email in the user's Gmail account without sending it. You can optionally attach a file by providing a direct URL."""
    async with httpx.AsyncClient() as client:
        encoded_message = await _build_email_payload(to, subject, body, attachment_url)
        
        url = "https://gmail.googleapis.com/gmail/v1/users/me/drafts"
        payload = {
            "message": {
                "raw": encoded_message
            }
        }
        
        response = await client.post(url, headers=get_headers(), json=payload)
        
        if response.status_code == 200:
            data = response.json()
            return f"Draft created successfully. Draft ID: {data.get('id')}"
        else:
            return f"Failed to create draft: {response.status_code} - {response.text}"

@mcp.tool()
async def send_email(to: str, subject: str, body: str, attachment_url: str = None) -> str:
    """Send an email directly from the user's Gmail account. Use this during execution mode. You can optionally attach a file by providing a direct URL."""
    async with httpx.AsyncClient() as client:
        encoded_message = await _build_email_payload(to, subject, body, attachment_url)
        
        url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
        payload = {
            "raw": encoded_message
        }
        
        response = await client.post(url, headers=get_headers(), json=payload)
        
        if response.status_code == 200:
            data = response.json()
            msg_id = data.get('id')
            thread_id = data.get('threadId')
            await _log_sent_email(to, subject, body, msg_id, thread_id)
            return f"Email sent successfully. Message ID: {msg_id}"
        else:
            return f"Failed to send email: {response.status_code} - {response.text}"

@mcp.tool()
async def send_bulk_emails(to_emails: str, subject: str, body: str, attachment_url: str = None) -> str:
    """Send the exact same email individually to a comma-separated list of email addresses. Use this for mass outreach campaigns."""
    import asyncio
    emails = [e.strip() for e in to_emails.replace('\n', ',').split(",") if e.strip()]
    if not emails:
        return "No valid email addresses provided."
        
    success_count = 0
    errors = []
    
    async with httpx.AsyncClient() as client:
        for to in emails:
            encoded_message = await _build_email_payload(to, subject, body, attachment_url)
            url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
            payload = {"raw": encoded_message}
            
            response = await client.post(url, headers=get_headers(), json=payload)
            if response.status_code == 200:
                success_count += 1
                data = response.json()
                await _log_sent_email(to, subject, body, data.get('id'), data.get('threadId'))
            else:
                errors.append(f"{to}: {response.status_code}")
                
            await asyncio.sleep(0.5) # rate limit protection
            
    if errors:
        return f"Sent to {success_count} emails. Errors: {', '.join(errors)}"
    return f"Successfully sent bulk emails to {success_count} recipients."

# ====================
# GOOGLE CALENDAR TOOLS
# ====================

@mcp.tool()
async def list_calendar_events(max_results: int = 5) -> str:
    """List upcoming events on the user's primary calendar."""
    async with httpx.AsyncClient() as client:
        now = datetime.now(timezone.utc).isoformat()
        url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        params = {
            "timeMin": now,
            "maxResults": max_results,
            "singleEvents": "true",
            "orderBy": "startTime"
        }
        
        response = await client.get(url, headers=get_headers(), params=params)
        
        if response.status_code != 200:
            return f"Error fetching calendar: {response.status_code} - {response.text}"
            
        data = response.json()
        events = data.get("items", [])
        if not events:
            return "No upcoming events found."
            
        results = []
        for event in events:
            start = event["start"].get("dateTime", event["start"].get("date"))
            summary = event.get("summary", "No Title")
            event_id = event["id"]
            results.append(f"Time: {start} | Title: {summary} | ID: {event_id}")
            
        return "\n".join(results)

@mcp.tool()
async def create_calendar_event(summary: str, description: str, start_iso: str, end_iso: str) -> str:
    """Create a new event on the user's primary calendar. Start and end times must be in ISO format (e.g., '2026-07-13T09:00:00Z')."""
    async with httpx.AsyncClient() as client:
        url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        payload = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_iso},
            "end": {"dateTime": end_iso}
        }
        
        response = await client.post(url, headers=get_headers(), json=payload)
        
        if response.status_code == 200:
            data = response.json()
            return f"Event created successfully. Event Link: {data.get('htmlLink')}"
        else:
            return f"Failed to create event: {response.status_code} - {response.text}"


# ====================
# GOOGLE DRIVE TOOLS
# ====================

@mcp.tool()
async def search_drive_files(query: str, max_results: int = 5) -> str:
    """Search the user's Google Drive for files matching the query (e.g. name contains 'resume')."""
    async with httpx.AsyncClient() as client:
        url = "https://www.googleapis.com/drive/v3/files"
        params = {
            "q": query,
            "pageSize": max_results,
            "fields": "files(id, name, mimeType, webViewLink)"
        }
        
        response = await client.get(url, headers=get_headers(), params=params)
        
        if response.status_code != 200:
            return f"Error fetching from Drive: {response.status_code} - {response.text}"
            
        data = response.json()
        files = data.get("files", [])
        if not files:
            return "No files found matching the query."
            
        results = []
        for f in files:
            results.append(f"Name: {f.get('name')} | ID: {f.get('id')} | Type: {f.get('mimeType')} | Link: {f.get('webViewLink')}")
            
        return "\n".join(results)


# ====================
# GOOGLE DOCS TOOLS
# ====================

@mcp.tool()
async def create_google_doc(title: str, content: str = "") -> str:
    """Create a new Google Doc with the specified title and initial content."""
    async with httpx.AsyncClient() as client:
        url = "https://docs.googleapis.com/v1/documents"
        payload = {"title": title}
        res = await client.post(url, headers=get_headers(), json=payload)
        
        if res.status_code != 200:
            return f"Failed to create Google Doc: {res.status_code} - {res.text}"
            
        doc_id = res.json().get("documentId")
        
        if content:
            update_url = f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate"
            update_payload = {
                "requests": [
                    {
                        "insertText": {
                            "location": {"index": 1},
                            "text": content
                        }
                    }
                ]
            }
            await client.post(update_url, headers=get_headers(), json=update_payload)
            
        return f"Successfully created Google Doc. Link: https://docs.google.com/document/d/{doc_id}/edit"

@mcp.tool()
async def read_google_doc(doc_id: str) -> str:
    """Read the plain text content of a Google Doc given its document ID (the long string in the URL)."""
    async with httpx.AsyncClient() as client:
        url = f"https://docs.googleapis.com/v1/documents/{doc_id}"
        res = await client.get(url, headers=get_headers())
        
        if res.status_code != 200:
            return f"Failed to read Google Doc: {res.status_code} - {res.text}"
            
        doc_data = res.json()
        text = ""
        for element in doc_data.get("body", {}).get("content", []):
            if "paragraph" in element:
                for p_elem in element["paragraph"].get("elements", []):
                    if "textRun" in p_elem:
                        text += p_elem["textRun"]["content"]
                        
        return text

if __name__ == "__main__":
    mcp.run(transport='stdio')
