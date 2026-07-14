# Project memory — ResumeAlign / resume_builder

Last reviewed: 2026-07-14

AI resume optimizer + Google Workspace outreach agent. Paste resume + JD → LangGraph tailor → LaTeX PDF; also cold email (draft → review → draft/send), Docs, and email reply tracking.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, Tailwind, `@react-oauth/google` |
| Backend | Python 3.11, FastAPI, SQLAlchemy async, LangGraph, LangChain, FastMCP |
| DB | PostgreSQL (`pgvector` for agent memory embeddings) |
| Cache / limits | Redis 7 |
| Files | AWS S3 or local MinIO |
| Local binaries | Tesseract OCR, `pdftotext`, XeLaTeX |
| Ops | Docker Compose, GitHub Actions CI + EC2 deploy |

---

## Layout

| Path | Role |
|------|------|
| `frontend/` | Vite React UI |
| `backend/app/api/endpoints/` | auth, resume, agent, docs, emails |
| `backend/app/graph/` | LangGraph resume pipeline |
| `backend/app/mcp_servers/google_workspace.py` | Gmail / Calendar / Drive / Docs MCP tools |
| `backend/app/models/` | User, OAuth, Resume, SentEmail, AgentMemory |
| `backend/app/services/` | S3, Redis, LLM, auth, memory |
| `backend/app/latex/` | TeX templates + PDF |
| `backend/app/core/prompts.py` | Centralized system prompts |
| `.github/workflows/` | `ci.yml`, `deploy-to-ec2.yml` |
| `docker-compose.yml` | redis, backend, frontend, db, minio |
| `.env` / `.env.example` | Shared config |

---

## Dashboard tabs (`Dashboard.jsx`)

| Tab | Key | Notes |
|-----|-----|--------|
| Resume Optimizer | `optimizer` | Upload + paste JD (+ custom instructions) → `POST /resume/optimize` |
| CV Library | `library` | History / filters; download via `/resume/d/{token}` |
| AI Agent | `agent` | `AgentChatBox` → `POST /agent/execute` |
| Manage Docs | `docs` | `DocsManager` — REST `/docs/*` (not MCP) |
| Email Outreach | `emails` | `EmailTracker` — sent pitches, replies, AI follow-ups |

JD **link** field is disabled (Coming Soon); paste JD text only.

---

## Auth & Google

**App auth:** JWT — register / login (form username=email) / forgot-password (sets password by email match — **no reset email**) / me.

**Google Workspace:**
1. Sidebar `GoogleConnect` → scopes: `gmail.compose`, `gmail.readonly`, `calendar`, `drive`, `documents`.
2. Tokens stored in `oauth_accounts` (~1h `expires_at`); UI polls status (`ok` / `expiring` ≤10m / `expired`).
3. Agent spawn injects `GOOGLE_ACCESS_TOKEN` + `USER_ID`; Docs REST uses same stored token.
4. Needs `VITE_GOOGLE_CLIENT_ID`. After scope changes, user must reconnect.
5. **No automatic refresh** on agent path — user refreshes connection when expired.

---

## AI Agent email flow (important)

Email-like prompts take the **review** path; calendar/inbox take **ask now** (read-only tools).

### Phase 1 — in-app draft
`handleDraftEmail` → agent “do NOT send; draft for review”.  
Copy lives only in React `draftResult` — **not** in Gmail yet.

### Phase 2 — review buttons (`AgentChatBox.jsx`)

| Button | Handler | Behavior |
|--------|---------|----------|
| **Discard** | `handleDiscard` | Clear local state; no API / no Gmail |
| **Save as draft** | `handleSaveAsDraft` | Agent must call MCP `draft_email` → Gmail `POST .../drafts`. Bulk → one draft per recipient. Does **not** send |
| **Send** | `handleSave` (name is legacy) | Agent must call `send_email` or `send_bulk_emails`. Prompt forbids `draft_email` |

### Gmail MCP reality
- `draft_email` → creates Gmail draft; optional `attachment_url` (Docker rewrites `localhost:9000` → `minio:9000`).
- `send_email` / `send_bulk_emails` → `messages/send`; on success `_log_sent_email` → Postgres `sent_emails` (needs `USER_ID`).
- **Neither deletes nor undrafts** existing Gmail drafts. Send always creates a **new** sent message. No `drafts.send` / `drafts.delete` yet.

### Email Outreach CRM
- `GET /emails` — list `SentEmail` + reply detection  
- `GET /emails/{thread_id}/replies`  
- `POST /emails/suggest_reply`  
- `POST /emails/{thread_id}/reply` — optional AI refine → Gmail send + log

---

## MCP tools (`google_workspace.py`)

| Tool | Domain |
|------|--------|
| `search_emails` | Gmail |
| `draft_email` | Gmail drafts |
| `send_email` | Gmail send + DB log |
| `send_bulk_emails` | Per-recipient send + DB log |
| `list_calendar_events` / `create_calendar_event` | Calendar |
| `search_drive_files` | Drive |
| `list_google_docs` / `create_google_doc` / `read_google_doc` / `update_google_doc` / `append_to_google_doc` | Docs |

Agent: FastMCP stdio, ReAct loop in `/agent/execute` (max ~5 steps, OpenAI `bind_tools`). Profile `AgentMemory` + optional resume JSON injected into system prompt.

**Not MCP:** Docs UI uses REST `/docs/*`; attachments via `POST /agent/upload`.

---

## Resume / JD pipeline (`graph/workflow.py`)

`parse_resume` → `analyze_jd` → `optimize_resume` → `generate_pdf` → END

- LLM JSON steps use Redis cache where configured.
- PDF: `LatexGenerator` (XeLaTeX) → S3 key `r/<hex>.pdf`.
- History APIs return short app links only; click generates a fresh presigned URL.

---

## Storage & models

**Objects:** resumes `r/<20hex>.pdf`; agent uploads `agent-attachments/{user_id}/...`.

**Postgres (notable):** `User`, `OAuthAccount`, `Resume` / versions / JD / `OptimizationHistory`, `SentEmail`, `AgentMemory` (optional `Vector(1536)`).

---

## Deploy / local run

- Full stack: `make deploy` → clean + `docker compose up -d --build`.
- **Backend on host:** `make install-backend` once, then `make local`  
  - Starts Redis via Compose (`local-deps`)  
  - Runs `uvicorn app.main:app --app-dir backend --reload` on `:8000`  
  - Loads root `.env`; forces `REDIS_URL=redis://localhost:6379/0` (docker hostname `redis` does not resolve on host)  
  - Postgres/S3 must be reachable from the host (current cloud Neon/S3 works; pure-Docker `POSTGRES_SERVER=db` does not without publishing db ports)
- EC2 (`.github/workflows/deploy-to-ec2.yml`): push/`merged` PR to `main` → SSH → `~/apps/resumeai` → clone/pull `ResumeAlign` → `make deploy`.
- After compose: `alembic upgrade head`.

---

## Gotchas

- Agent `/execute` needs `OPENAI_API_KEY` even if other providers are used for resume optimize.
- Forgot-password is immediate set-by-email, not email OTP.
- Redis failure: rate limit / cache fail **open** (log, don’t hard-block).
- Compose MinIO setup may set bucket public for dev; production S3 should stay private + presigned downloads.
- `POSTGRES_SERVER=db` inside Compose; cloud DBs need SSL.
- System deps (tesseract, texlive, xpdf) live in `backend/Dockerfile`.

---

## Hot files

- Agent review UX: `frontend/src/components/AgentChatBox.jsx`
- Google connect: `frontend/src/components/GoogleConnect.jsx`
- Agent + OAuth API: `backend/app/api/endpoints/agent.py`
- MCP Gmail/Cal/Docs: `backend/app/mcp_servers/google_workspace.py`
- Email CRM: `backend/app/api/endpoints/email_tracking.py`, `EmailTracker.jsx`
- Resume graph: `backend/app/graph/workflow.py`, `nodes.py`
- Docs REST: `backend/app/api/endpoints/docs.py`
- Config: `backend/app/core/config.py`, `.env.example`
- Deploy: `.github/workflows/deploy-to-ec2.yml`, `Makefile`
