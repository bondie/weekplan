.PHONY: up down restart build logs logs-api logs-web sync sync-jira sync-calendar studio psql reset-db status shell-api

PROXY_PORT ?= $(shell grep -E '^PROXY_PORT=' .env 2>/dev/null | cut -d= -f2)
PROXY_PORT := $(if $(PROXY_PORT),$(PROXY_PORT),8090)

up:
	docker compose up -d --build
	@echo ""
	@echo "  ➜  http://weekplan.localhost:$(PROXY_PORT)"
	@echo ""

down:
	docker compose down

restart:
	docker compose restart api web

build:
	docker compose build --no-cache

logs:
	docker compose logs -f --tail=100

logs-api:
	docker compose logs -f --tail=100 api

logs-web:
	docker compose logs -f --tail=100 web

status:
	docker compose ps
	@curl -s http://localhost:3010/api/sync/status | python3 -m json.tool || true

sync: sync-jira sync-calendar

sync-jira:
	curl -sS -X POST http://localhost:3010/api/sync/jira | python3 -m json.tool

sync-calendar:
	curl -sS -X POST http://localhost:3010/api/sync/calendar | python3 -m json.tool

studio:
	docker compose exec api npx prisma studio --port 5555 --hostname 0.0.0.0

psql:
	docker compose exec db psql -U weekplan -d weekplan

shell-api:
	docker compose exec api sh

reset-db:
	docker compose down -v
	docker compose up -d --build
