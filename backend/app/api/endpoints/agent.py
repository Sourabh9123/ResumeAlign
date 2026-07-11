from typing import Any, Dict, Optional
import os
from contextlib import AsyncExitStack

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, ToolMessage, SystemMessage
from mcp.client.stdio import stdio_client, StdioServerParameters
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


@router.get("/oauth/status")
async def check_oauth_status(
    provider: str = "google",
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
):
    """Check if the user has an active OAuth connection for the given provider."""
    stmt = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.provider == provider
    )
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()
    
    is_connected = account is not None and account.access_token is not None
    return {"connected": is_connected}


@router.post("/execute")
async def execute_agent_action(
    request: AgentRequest,
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Execute a generic action on behalf of the user using a local MCP server.
    
    This endpoint spawns a local Google Managed MCP server 
    using the user's provided credentials to act on their behalf.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API Key not configured")

    # Fetch user credentials from database
    stmt = select(OAuthAccount).where(
        OAuthAccount.user_id == current_user.id,
        OAuthAccount.provider == "google"
    )
    result = await db.execute(stmt)
    oauth_account = result.scalar_one_or_none()

    if not oauth_account or not oauth_account.access_token:
        raise HTTPException(status_code=401, detail="Google OAuth credentials not found for user. Please authenticate first.")

    logger.info(f"Executing local MCP agent action for user {current_user.email}")

    try:
        # We start the local python MCP server process, passing the token via env
        env = os.environ.copy()
        env["GOOGLE_ACCESS_TOKEN"] = oauth_account.access_token
        
        server_params = StdioServerParameters(
            command="python",
            args=["-m", "app.mcp_servers.google_workspace"],
            env=env
        )
        
        async with AsyncExitStack() as stack:
            # 1. Open the Stdio connection to the local MCP server
            read, write = await stack.enter_async_context(
                stdio_client(server_params)
            )
            
            # 2. Initialize the MCP session
            session = await stack.enter_async_context(
                ClientSession(read, write)
            )
            await session.initialize()
            
            # 3. Load the tools provided by the MCP server
            tools = await load_mcp_tools(session)
            
            if not tools:
                return {"result": "No tools were returned by the MCP server."}

            # 4. Bind the remote tools to the Langchain LLM
            llm = ChatOpenAI(model=settings.OPENAI_MODEL, temperature=0).bind_tools(tools)
            
            # Fetch User Profile Memories
            from app.services.memory_service import MemoryService
            memory_service = MemoryService(db)
            raw_memories = await memory_service.list_memories(str(current_user.id), category="Profile")
            memory_context = "\n".join([f"- {m.key}: {m.value}" for m in raw_memories])
            
            if memory_context:
                memory_prompt = f"\n\nHere is what you know about the user based on their saved profile/resume:\n{memory_context}\n\nUse these details if you need to fill out forms, signatures, emails, or personal information. DO NOT use generic bracketed placeholders like [Your Name] or [Your Phone Number]."
            else:
                memory_prompt = "\n\nYou do not have the user's profile memory saved. DO NOT use bracketed placeholders like [Your Name]. Simply sign off generically or ask the user for their name if strictly required."

            messages = [
                SystemMessage(content=f"You are a highly capable executive AI assistant with direct access to the user's Google Workspace via the Model Context Protocol (MCP). You have tools available to interact with the Gmail API, Google Drive API, and Google Calendar API. Use these tools seamlessly to help the user schedule meetings, draft and send emails, organize files, and more. When instructed to use an attached link (like a resume), use your tools to access and read the file to execute the task smoothly.{memory_prompt}"),
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
        logger.error(f"Local MCP Agent execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

