# AI Resume Builder & JD Optimizer

An AI-powered platform to optimize your resume against job descriptions using LangGraph, FastAPI, PostgreSQL, and React.

## Features

- **JWT Authentication**: Secure user login and management.
- **Resume Parsing**: Extract and structure data from raw text/PDF using AI and OCR.
- **JD Analysis**: Extract keywords and requirements from job descriptions to maximize ATS scores.
- **Manual Job Description Input**: Paste the target job description text for tailoring. The job description link field is currently shown as **Coming Soon** in the frontend and is intentionally disabled.
- **Custom AI Instructions Pipeline**: Allows users to explicitly guide the AI's tone, focus, and structural rewrites securely without prompt injection risks.
- **AI Optimization**: Matches and optimizes the resume specifically for the JD using LLMs (OpenAI, Anthropic, Gemini) via a resilient LangGraph workflow.
- **CV Library**: Saves generated resumes with the job description link/text, ATS score, creation time, search, JD filtering, and timespan filtering.
- **Agentic AI Workspace**: A dedicated chat-based workspace where an autonomous LLM agent (powered by LangChain) uses custom MCP tools to manage jobs, write drafts, and automate cold outreach.
- **Google Workspace Integration**: Connect securely via Google OAuth to allow the AI Agent to seamlessly read/write Google Docs and draft/send emails via the Gmail API directly from the dashboard.
- **Email Outreach Tracking**: An automated CRM-style dashboard that logs all cold emails sent by the agent, fetches active threads/replies via the Gmail API, and allows for one-click, AI-refined follow-ups to recruiters.
- **Private S3 Resume Storage**: Uploads generated PDFs to a private S3 bucket using short object keys and stores only durable object metadata in Postgres.
- **Lazy Presigned Downloads**: List/history APIs return short app links only. A fresh S3 presigned URL is generated only when a user clicks one specific resume.
- **Redis Rate Limiting**: Protects auth, general API, and LLM/PDF generation endpoints with separate Redis-backed limits.
- **Redis LLM Cache**: Caches repeated JSON LLM calls for resume parsing, JD analysis, and resume optimization to reduce repeated provider usage.
- **Premium Full-Screen UI**: An edge-to-edge, responsive React dashboard with asynchronous loading states and saved-resume history.
- **Advanced LaTeX PDF Generation**: Outputs a pixel-perfect, ATS-friendly PDF, dynamically generating bullet points (`\begin{itemize}`) for clarity and cleanly formatted interactive hyperlinks.
- **Dockerized Architecture**: Easy setup and deployment with centralized `.env` management.

## Architecture

The project uses a clean architecture backend (FastAPI) and a modern frontend (Vite React + TailwindCSS).
It utilizes `asyncio` subprocesses to handle OCR (`tesseract`) and PDF generation (`xelatex`) locally to keep the setup simple for solo usage without needing a heavy Celery queue system initially. All system prompts are centralized for rapid engineering.

Generated PDF flow:

1. The backend generates a PDF locally.
2. If S3 is configured, the PDF is uploaded to a private bucket with a short key like `r/<random>.pdf`.
3. Postgres stores the generated resume, job description metadata, S3 object key, and a short download token.
4. The frontend history view receives only short app links like `/api/v1/resume/d/<token>`.
5. When the user clicks one resume, the backend creates one fresh presigned URL for that object and redirects the browser.

Agent Workflow:
1. The user connects their Google Account in the frontend, storing the `access_token` securely.
2. The user chats with the AI Agent in the Agent Workspace.
3. The backend executes a React/LangChain agent loop, spawning a local FastMCP server as a subprocess.
4. The FastMCP server dynamically receives the user's `access_token` and `USER_ID` via environment variables.
5. The agent calls tools (e.g., `send_email`, `read_google_doc`) securely on behalf of the user, logging interactions automatically to the PostgreSQL database for the Email Tracker.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy (Async), PostgreSQL, LangGraph, LangChain, Tesseract OCR, XeLaTeX
- **Frontend**: React 18, Vite, TailwindCSS (with backdrop-blur and responsive grid layouts)
- **Infrastructure**: Docker & Docker Compose

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ if running the frontend outside Docker
- Python 3.11 if running the backend outside Docker
- A reachable PostgreSQL database
- Redis, provided by `docker-compose.yml` during Docker runs
- At least one supported AI provider key: OpenAI, Anthropic, or Gemini
- Optional AWS S3 bucket for private generated PDF storage

> Note: The `docker-compose.yml` provides a completely localized stack including Redis, Postgres, Backend, and Frontend. You can choose to run Postgres locally or connect to a cloud database (like Neon, AWS RDS) by configuring your `.env`.

### Environment

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in the required application settings:
   ```env
   SECRET_KEY=replace_with_a_secure_random_secret
   VITE_API_URL=http://localhost:8000/api/v1
   DOCS_USERNAME=admin
   DOCS_PASSWORD=admin
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
   ```

3. Configure Postgres Database:
   
   **Option A: Local Docker Postgres (Recommended for Dev)**
   ```env
   POSTGRES_SERVER=db
   POSTGRES_PORT=5432
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=resume_builder
   POSTGRES_SSLMODE=
   ```
   *Note: Set `POSTGRES_SERVER=db` so the backend container can talk to the local Postgres container.*

   **Option B: Cloud Postgres (e.g. Neon, RDS)**
   ```env
   POSTGRES_SERVER=your-cloud-host.aws.neon.tech
   POSTGRES_PORT=5432
   POSTGRES_USER=neondb_owner
   POSTGRES_PASSWORD=your_password
   POSTGRES_DB=neondb
   POSTGRES_SSLMODE=require
   ```

4. Configure one AI provider:
   ```env
   DEFAULT_AI_PROVIDER=openai
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_LATEX_MODEL=gpt-4.1-mini
   ```

   Alternative providers can be configured with `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` or `GEMINI_API_KEY`.

5. For S3-backed private resume storage, set:
   ```env
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=ap-south-1
   AWS_S3_BUCKET=your-private-bucket
   ```

6. Redis is required for rate limiting and cache:
   ```env
   REDIS_URL=redis://redis:6379/0
   RATE_LIMIT_ENABLED=true
   RATE_LIMIT_LLM_REQUESTS=10
   RATE_LIMIT_LLM_WINDOW_SECONDS=3600
   RATE_LIMIT_GENERAL_REQUESTS=120
   RATE_LIMIT_GENERAL_WINDOW_SECONDS=60
   RATE_LIMIT_AUTH_REQUESTS=10
   RATE_LIMIT_AUTH_WINDOW_SECONDS=300
   CACHE_ENABLED=true
   CACHE_LLM_TTL_SECONDS=86400
   ```

### Run With Docker Compose

1. Build and start the services:
   ```bash
   docker compose up --build
   ```

2. Apply database migrations:
   ```bash
   docker compose exec backend alembic upgrade head
   ```

### Accessing the apps

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Backend health check**: http://localhost:8000/health
- **Protected Swagger UI**: http://localhost:8000/docs
- **Protected OpenAPI JSON**: http://localhost:8000/api/v1/openapi.json

The API docs use HTTP Basic auth. Credentials come from `DOCS_USERNAME` and `DOCS_PASSWORD`.

## Development

Use the included `Makefile` for quick commands, or standard `docker compose` commands.

### Frontend

```bash
cd frontend
npm install
npm run dev
npm run build
```

The frontend reads `VITE_API_URL`; locally it should usually be `http://localhost:8000/api/v1`.

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend requires the system tools installed in `backend/Dockerfile` for full resume processing:

- `tesseract-ocr` for OCR
- `pdftotext` from XPDF for PDF text extraction
- `xelatex` from TeX Live for PDF generation

### Backend Migrations

Apply migrations:

```bash
docker compose exec backend alembic upgrade head
```

Create a new migration after model changes:

```bash
docker compose exec backend alembic revision --autogenerate -m "Describe change"
```

Current migration chain includes resume/JD link fields, generated PDF S3 object keys, and compact resume download tokens.

### S3 Download Behavior

The app intentionally does not generate presigned URLs during resume history/list requests. This keeps the list response small and avoids creating many temporary links when the user may open only one resume.

- `GET /api/v1/resume/history` returns saved resume metadata and short app download links.
- `GET /api/v1/resume/d/{download_token}` signs one S3 object on demand and redirects to the fresh presigned URL.
- New S3 object keys are short and unique, for example `r/8f3a91c0d8b245f1a2b3.pdf`.
- Rotate AWS access keys immediately if they are exposed in logs, screenshots, commits, or chat.

### Redis Rate Limits And Cache

Redis is used for abuse protection and caching:

- Auth endpoints use an IP-based limit to slow login/register abuse.
- General authenticated endpoints use a broader per-user limit.
- Expensive LLM/PDF endpoints use a stricter per-user limit.
- JSON LLM calls are cached by provider/model/prompt digest with `CACHE_LLM_TTL_SECONDS`.

Default limits can be adjusted in `.env`. If Redis is temporarily unavailable, limiter/cache failures are logged and the app fails open so users are not blocked by a cache outage.

### Useful Commands

```bash
make help
make install-backend
make format
make lint
make type-check
make test
make ci
make deploy
docker compose build backend
docker compose up --build
docker compose ps
docker compose logs -f backend
docker compose exec backend alembic current
docker compose exec backend alembic upgrade head
cd frontend && npm run build
```

### Key API Routes

- `POST /api/v1/auth/register`: create an account.
- `POST /api/v1/auth/login`: login and receive an access token.
- `GET /api/v1/auth/me`: return the current authenticated user.
- `POST /api/v1/resume/extract`: upload a resume file and extract text.
- `POST /api/v1/resume/optimize`: optimize extracted resume text against pasted JD text and optional custom instructions.
- `GET /api/v1/resume/history`: list saved optimized resumes.
- `GET /api/v1/resume/d/{download_token}`: open a generated resume download link.
- `POST /api/v1/agent/execute`: Execute a chat message through the LangChain AI Agent.
- `GET /api/v1/emails`: List all cold emails sent by the AI Agent.
- `GET /api/v1/emails/{thread_id}/replies`: Fetch the thread context and replies from Gmail API.
- `POST /api/v1/emails/{thread_id}/reply`: Reply to an email thread directly, optionally using AI to refine the draft.
- `POST /api/v1/emails/suggest_reply`: Automatically generate a suggested response based on thread context.

### Current Product Notes

- The **Job Description Link** field is intentionally disabled in the UI and marked **Coming Soon**.
- To tailor a resume today, paste the full job description into the **Job Description** textarea.
- Resume history can still display saved JD source URLs from older data if they exist.
- Generated PDFs are served either from local paths or private S3 objects depending on environment and storage configuration.

## CI/CD Pipeline

This repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) to automatically lint and test both the backend and frontend code on every push or pull request to the `main` or `development` branches.

Currently, the deployment step in the workflow is commented out. Once you have a server ready, you can uncomment it and configure your GitHub Secrets (`SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`) to enable automated deployments.

## Disclaimer

This is a comprehensive boilerplate for a scalable AI system built for ease of local development and solo maintainability.
