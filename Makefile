.PHONY: up down restart build logs logs-api logs-web sync sync-jira sync-calendar studio psql reset-db status shell-api

HTTPS_PORT ?= $(shell grep -E '^PROXY_HTTPS_PORT=' .env 2>/dev/null | cut -d= -f2)
HTTPS_PORT := $(if $(HTTPS_PORT),$(HTTPS_PORT),8443)
URL_SUFFIX := $(if $(filter 443,$(HTTPS_PORT)),,:$(HTTPS_PORT))
CERT := proxy/certs/weekplan.localhost.pem

up: certs
	docker compose up -d --build
	@echo ""
	@echo "  ➜  https://weekplan.localhost$(URL_SUFFIX)"
	@echo ""

certs: $(CERT)

$(CERT):
	@command -v mkcert >/dev/null || { echo "Chybí mkcert: brew install mkcert && mkcert -install"; exit 1; }
	@mkdir -p proxy/certs
	mkcert -cert-file proxy/certs/weekplan.localhost.pem \
	       -key-file proxy/certs/weekplan.localhost-key.pem \
	       weekplan.localhost localhost 127.0.0.1 ::1
	@echo "Pokud prohlížeč certifikátu nevěří, spusť jednorázově: mkcert -install"

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
