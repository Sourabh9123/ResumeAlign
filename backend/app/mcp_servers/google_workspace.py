import os
import json
import base64
import httpx
from datetime import datetime, timedelta, timezone
from mcp.server.fastmcp import FastMCP

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

@mcp.tool()
async def draft_email(to: str, subject: str, body: str) -> str:
    """Draft an email in the user's Gmail account without sending it."""
    async with httpx.AsyncClient() as client:
        message = f"To: {to}\r\nSubject: {subject}\r\n\r\n{body}"
        encoded_message = base64.urlsafe_b64encode(message.encode("utf-8")).decode("utf-8")
        
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
async def send_email(to: str, subject: str, body: str) -> str:
    """Send an email directly from the user's Gmail account. Use this during execution mode."""
    async with httpx.AsyncClient() as client:
        message = f"To: {to}\r\nSubject: {subject}\r\n\r\n{body}"
        encoded_message = base64.urlsafe_b64encode(message.encode("utf-8")).decode("utf-8")
        
        url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
        payload = {
            "raw": encoded_message
        }
        
        response = await client.post(url, headers=get_headers(), json=payload)
        
        if response.status_code == 200:
            data = response.json()
            return f"Email sent successfully. Message ID: {data.get('id')}"
        else:
            return f"Failed to send email: {response.status_code} - {response.text}"


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


if __name__ == "__main__":
    mcp.run(transport='stdio')
