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
    resume_url: Optional[str] = None

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

@router.post("/upload")
async def upload_agent_attachment(
    file: UploadFile = File(...),
    current_user: User = Depends(enforce_general_rate_limit),
    db: AsyncSession = Depends(get_db)
):
    """Upload a file, parse its contents, and save it as a Resume in the database so the Agent can access its structured data."""
    from app.services.s3_service import S3PresignedUrlService
    from app.parsers.document_parser import DocumentParserFactory
    from app.services.llm_factory import LLMProviderFactory
    from app.core.prompts import PARSE_RESUME_PROMPT
    from app.models.resume import Resume, ResumeVersion, OptimizationHistory
    from app.api.endpoints.resume import _create_download_token
    import boto3
    import secrets
    import json
    
    file_content = await file.read()
    
    # 1. Upload Original to S3
    s3_client = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )
    object_key = f"agent-attachments/{current_user.id}/{secrets.token_urlsafe(8)}_{file.filename}"
    
    try:
        s3_client.put_object(
            Bucket=settings.AWS_S3_BUCKET,
            Key=object_key,
            Body=file_content,
            ContentType=file.content_type or "application/octet-stream"
        )
    except Exception as e:
        logger.error(f"Failed to upload agent attachment: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file")
        
    # 2. Extract Text
    try:
        parser = DocumentParserFactory.get_parser(file.filename)
        text = parser.extract_text(file_content)
    except Exception as e:
        logger.warning(f"Could not parse uploaded attachment: {e}")
        text = ""

    structured_data = {}
    if text.strip():
        # 3. Extract JSON via LLM
        try:
            llm = LLMProviderFactory.create()
            prompt = PARSE_RESUME_PROMPT.format(raw_text=text[:15000]) # cap length just in case
            response_text = await llm.generate(prompt)
            
            cleaned = response_text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            elif cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
                
            structured_data = json.loads(cleaned.strip())
        except Exception as e:
            logger.warning(f"Failed to extract structured data from attachment: {e}")

    # 4. Save to Database
    resume = Resume(
        user_id=current_user.id,
        title=file.filename
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    version = ResumeVersion(
        resume_id=resume.id,
        content=text,
        structured_data=structured_data,
        version_number=1
    )
    db.add(version)
    
    token = await _create_download_token(db)
    
    history = OptimizationHistory(
        user_id=current_user.id,
        resume_id=resume.id,
        jd_id=None,
        ats_score_before=0.0,
        ats_score_after=0.0,
        download_token=token,
        original_pdf_s3_key=object_key,
        generated_pdf_s3_key=object_key # Just use the original file as the download
    )
    db.add(history)
    await db.commit()
    
    # Return standard download token URL
    return {"url": f"/resume/d/{token}"}


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
            memory_context_lines = [f"- {m.key}: {m.value}" for m in raw_memories]
            
            if request.resume_url and "/resume/d/" in request.resume_url:
                try:
                    from app.models.resume import OptimizationHistory, ResumeVersion
                    token_str = request.resume_url.split("/resume/d/")[-1].split("?")[0]
                    hist_stmt = select(OptimizationHistory).where(OptimizationHistory.download_token == token_str)
                    hist_res = await db.execute(hist_stmt)
                    history = hist_res.scalar_one_or_none()
                    if history:
                        ver_stmt = select(ResumeVersion).where(ResumeVersion.resume_id == history.resume_id).order_by(ResumeVersion.created_at.desc())
                        ver_res = await db.execute(ver_stmt)
                        version = ver_res.scalars().first()
                        if version and version.structured_data:
                            memory_context_lines.append("\n--- FULL RESUME PROFILE ---")
                            import json
                            # We dump the entire structured JSON (personal info, experience, skills, projects, etc)
                            # so the LLM can use this to draft highly personalized emails and pitches.
                            memory_context_lines.append(json.dumps(version.structured_data, indent=2))
                            memory_context_lines.append("---------------------------")
                except Exception as ex:
                    logger.warning(f"Failed to fetch parsed resume details for agent context: {ex}")
                    
            memory_context = "\n".join(memory_context_lines)
            
            if memory_context:
                memory_prompt = f"\n\nHere is what you know about the user based on their saved profile/resume:\n{memory_context}\n\nUse these details if you need to fill out forms, signatures, emails, or personal information. DO NOT use generic bracketed placeholders like [Your Name] or [Your Phone Number]."
            else:
                memory_prompt = "\n\nYou do not have the user's profile memory saved. DO NOT use bracketed placeholders like [Your Name]. Simply sign off generically or ask the user for their name if strictly required."

            messages = [
                SystemMessage(content=f"You are a highly capable executive AI assistant with direct access to the user's Google Workspace via the Model Context Protocol (MCP). You have tools available to interact with the Gmail API, Google Drive API, and Google Calendar API. Use these tools seamlessly to help the user schedule meetings, draft and send emails, organize files, and more. When instructed to use an attached link (like a resume), use your tools to access and read the file to execute the task smoothly.\n\nCRITICAL: If any tool returns an error about authentication (e.g., 401 Unauthorized, token expired, etc.), DO NOT try to fulfill the request manually or fallback to generic placeholders. Instead, stop immediately and explicitly tell the user: 'Your Google Account connection has expired. Please click the \"Refresh Connection\" button in the sidebar to re-authenticate.'{memory_prompt}"),
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

