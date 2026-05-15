# AI Resume Builder & JD Optimizer

An AI-powered platform to optimize your resume against job descriptions using LangGraph, FastAPI, PostgreSQL, and React.

## Features

- **JWT Authentication**: Secure user login and management.
- **Resume Parsing**: Extract and structure data from raw text/PDF using AI and OCR.
- **JD Analysis**: Extract keywords and requirements from job descriptions.
- **AI Optimization**: Matches and optimizes the resume specifically for the JD using LLMs (OpenAI, Anthropic, Gemini).
- **LaTeX PDF Generation**: Outputs a pixel-perfect, ATS-friendly PDF.
- **LangGraph**: Orchestrates the multi-agent AI workflows.
- **Dockerized**: Easy setup and deployment.

## Architecture

The project uses a clean architecture backend (FastAPI) and a modern frontend (Vite React + TailwindCSS).
It utilizes `asyncio` subprocesses to handle OCR (`tesseract`) and PDF generation (`xelatex`) locally to keep the setup simple for solo usage without needing a heavy Celery queue system initially.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy (Async), PostgreSQL, LangGraph, LangChain, Tesseract OCR, XeLaTeX
- **Frontend**: React 18, Vite, TailwindCSS, Zustand
- **Infrastructure**: Docker & Docker Compose

## Getting Started

1. Clone the repository.
2. Copy the `.env.example` to `.env` and fill in your keys (OpenAI API Key, etc.)
   ```bash
   cp .env.example .env
   ```
3. Run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

### Accessing the apps

- **Frontend**: http://localhost:5173
- **Backend Swagger UI**: http://localhost:8000/docs

## Development

Use the included `Makefile` (if provided) for quick commands, or standard docker-compose commands.

### Backend Migrations

```bash
docker-compose exec backend alembic revision --autogenerate -m "Initial schema"
docker-compose exec backend alembic upgrade head
```

## CI/CD Pipeline

This repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) to automatically lint and test both the backend and frontend code on every push or pull request to the `main` or `development` branches.

Currently, the deployment step in the workflow is commented out. Once you have a server ready, you can uncomment it and configure your GitHub Secrets (`SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`) to enable automated deployments.

## Disclaimer

This is a comprehensive boilerplate for a scalable AI system built for ease of local development and solo maintainability.
