import os
import json
import base64
import httpx
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
            return "No emails found."
            
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

if __name__ == "__main__":
    mcp.run(transport='stdio')
