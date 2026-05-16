PYTHON ?= python
BACKEND_DIR := backend
PYTHON_PATHS := $(BACKEND_DIR)/app $(BACKEND_DIR)/alembic
PYTHON_FILES := $(shell find $(PYTHON_PATHS) -type f -name '*.py')
BLACK_FLAGS := --workers 1 --quiet

.PHONY: help install-backend format format-check lint type-check test ci deploy

help:
	@echo "Available targets:"
	@echo "  install-backend  Install backend dependencies"
	@echo "  format           Format Python code with isort and black"
	@echo "  format-check     Check Python formatting without writing changes"
	@echo "  lint             Run Ruff linting"
	@echo "  type-check       Run mypy type checking"
	@echo "  test             Run backend tests"
	@echo "  ci               Run format checks, linting, and tests"
	@echo "  deploy           Rebuild and restart Docker Compose services"

install-backend:
	$(PYTHON) -m pip install -r $(BACKEND_DIR)/requirements.txt

format:
	$(PYTHON) -m isort $(PYTHON_PATHS)
	@for file in $(PYTHON_FILES); do \
		$(PYTHON) -m black $(BLACK_FLAGS) "$$file" || exit $$?; \
	done

format-check:
	$(PYTHON) -m isort --check-only --diff $(PYTHON_PATHS)
	@for file in $(PYTHON_FILES); do \
		$(PYTHON) -m black $(BLACK_FLAGS) --check "$$file" || exit $$?; \
	done

lint:
	$(PYTHON) -m ruff check $(PYTHON_PATHS)

type-check:
	MYPYPATH=$(BACKEND_DIR) $(PYTHON) -m mypy --explicit-package-bases $(BACKEND_DIR)/app

test:
	$(PYTHON) -m pytest $(BACKEND_DIR) || test $$? -eq 5

ci: format-check lint type-check test

deploy:
	docker compose down || true
	docker compose up -d --build
	docker image prune -f
