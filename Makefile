PYTHON ?= python
BACKEND_DIR := backend
PYTHON_PATHS := $(BACKEND_DIR)/app $(BACKEND_DIR)/alembic
PYTHON_FILES := $(shell find $(PYTHON_PATHS) -type f -name '*.py')
BLACK_FLAGS := --workers 1 --quiet
COMPOSE_CONTAINERS := rb_frontend rb_backend rb_redis

.PHONY: help install-backend format format-check lint type-check test ci deploy deploy-clean

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
	@echo "  deploy-clean     Remove stale Docker Compose containers"

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

deploy-clean:
	docker compose down --remove-orphans || true
	docker rm -f $(COMPOSE_CONTAINERS) 2>/dev/null || true

deploy:
	$(MAKE) deploy-clean
	docker compose up -d --build
	docker image prune -f
