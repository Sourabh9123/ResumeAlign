from typing import Any, Dict, Optional
from contextlib import AsyncExitStack

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, ToolMessage, SystemMessage
from mcp.client.sse import sse_client
from mcp.client.session import ClientSession
from langchain_mcp_adapters.tools import load_mcp_tools

from app.api.deps import enforce_general_rate_limit
from app.core.config import settings
from app.core.logging import logger
from app.models.user import User
from app.models.oauth import OAuthAccount
from app.db.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

router = APIRouter()


class AgentRequest(BaseModel):
    prompt: str
    mcp_server_url: str = "https://mcp.googleapis.com/v1/workspace" # Example Google MCP URL

class OAuthSaveRequest(BaseModel):
    provider: str
    access_token: str
    refresh_token: Optional[str] = None

@router.post("/oauth")
async def save_oauth_credentials(
    request: OAuthSaveRequest,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
):
    """Save or update OAuth credentials for a user."""
    stmt = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.provider == request.provider
    )
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()

    if account:
        account.access_token = request.access_token
        account.refresh_token = request.refresh_token
    else:
        account = OAuthAccount(
            user_id=current_user.id,
            provider=request.provider,
            access_token=request.access_token,
            refresh_token=request.refresh_token,
        )
        db.add(account)

    await db.commit()
    return {"status": "ok"}


@router.post("/execute")
async def execute_agent_action(
    request: AgentRequest,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Execute a generic action on behalf of the user using a remote MCP server URL.
    
    This endpoint connects to a Google Managed MCP server (or any SSE MCP endpoint)
    using the user's provided credentials to act on their behalf.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API Key not configured")

    if not request.mcp_server_url:
        raise HTTPException(status_code=400, detail="mcp_server_url is required.")

    # Fetch user credentials from database
    stmt = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.provider == "google"
    )
    result = await db.execute(stmt)
    oauth_account = result.scalar_one_or_none()

    if not oauth_account or not oauth_account.access_token:
        raise HTTPException(status_code=401, detail="Google OAuth credentials not found for user. Please authenticate first.")

    logger.info(f"Executing remote MCP agent action for user {current_user.email} at {request.mcp_server_url}")

    try:
        # Connect to the remote Google MCP server via Server-Sent Events (SSE)
        # Passing the user's OAuth token in the Authorization header
        headers = {
            "Authorization": f"Bearer {oauth_account.access_token}"
        }
        
        async with AsyncExitStack() as stack:
            # 1. Open the SSE connection to the remote MCP server
            read, write = await stack.enter_async_context(
                sse_client(request.mcp_server_url, headers=headers)
            )
            
            # 2. Initialize the MCP session
            session = await stack.enter_async_context(
                ClientSession(read, write)
            )
            await session.initialize()
            
            # 3. Load the tools provided by the remote MCP server
            tools = await load_mcp_tools(session)
            
            if not tools:
                return {"result": "No tools were returned by the MCP server."}

            # 4. Bind the remote tools to the Langchain LLM
            llm = ChatOpenAI(model=settings.OPENAI_MODEL, temperature=0).bind_tools(tools)
            
            messages = [
                SystemMessage(content="You are a highly capable executive AI assistant with direct access to the user's Google Workspace via the Model Context Protocol (MCP). You have tools available to interact with the Gmail API, Google Drive API, and Google Calendar API. Use these tools seamlessly to help the user schedule meetings, draft and send emails, organize files, and more. When instructed to use an attached link (like a resume), use your tools to access and read the file to execute the task smoothly."),
                HumanMessage(content=request.prompt)
            ]

            # 5. Execute the ReAct loop
            for _ in range(5): # Max 5 steps
                response = await llm.ainvoke(messages)
                messages.append(response)
                
                if not response.tool_calls:
                    # The LLM has finished and gave a final response
                    return {"result": response.content}
                
                # Execute tools and append ToolMessages
                for tool_call in response.tool_calls:
                    # Execute the tool on the remote MCP server
                    tool_result = await session.call_tool(
                        tool_call["name"], tool_call["args"]
                    )
                    
                    # tool_result.content is a list of content parts
                    result_text = "\n".join([c.text for c in tool_result.content if getattr(c, "text", None)])
                    
                    messages.append(
                        ToolMessage(
                            content=result_text,
                            tool_call_id=tool_call["id"],
                        )
                    )

            return {"result": "Agent reached maximum steps without finishing."}

    except Exception as e:
        logger.error(f"Remote MCP Agent execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

