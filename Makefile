# CarePlan — raccourcis de développement.
#
# CE FICHIER N'EST QU'UN CONFORT. La source de vérité est `package.json` : toute
# commande disponible ici existe aussi en `pnpm <script>`. Rien n'est défini
# uniquement dans le Makefile, pour qu'on ne cherche pas une commande au mauvais
# endroit. `pnpm` seul suffit à travailler sur ce projet.

SHELL := /bin/sh
.DEFAULT_GOAL := help

# Version de Node attendue, lue depuis package.json.
NODE_REQUIRED := $(shell node -p "require('./package.json').engines.node.replace(/[^0-9.]/g,'')" 2>/dev/null)

PORT ?= 3000

# corepack écrit son cache dans ~/.cache ; si l'emplacement n'est pas inscriptible,
# pnpm échoue avec « EPERM: mkdir ». On bascule alors sur /tmp.
export COREPACK_HOME ?= $(shell \
	if mkdir -p "$${XDG_CACHE_HOME:-$$HOME/.cache}/node/corepack/v1" 2>/dev/null; then \
		echo "$${XDG_CACHE_HOME:-$$HOME/.cache}/node/corepack"; \
	else \
		echo "/tmp/careplan-toolcache/corepack"; \
	fi)

PNPM := corepack pnpm

# Lit une clé dans .env sans l'importer (les valeurs peuvent contenir des caractères
# spéciaux) : $(call read_env,POSTGRES_PORT,5432)
read_env = $(shell \
	sed -n 's/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p' .env 2>/dev/null \
	| tail -1 | sed 's/^"//;s/"$$//' | sed "s/^'//;s/'$$//" \
	| grep . || echo "$2")


.PHONY: help
help: ## Affiche cette aide
	@printf '\n  CarePlan — commandes Make (équivalents pnpm entre parenthèses)\n\n'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk -F':.*?## ' '{ printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2 }'
	@printf '\n  Tout le reste est dans package.json : pnpm test, pnpm build, pnpm db-reset…\n'
	@printf '  Surcharges : make start PORT=3001  |  make start COREPACK_HOME=/autre/chemin\n\n'


.PHONY: start
start: _install _db-up _dev ## Base Docker + application (le cas d'usage courant)

.PHONY: stop
stop: ## Arrête la base (les données sont conservées)
	@docker compose down
	@printf '  ✓ Base arrêtée. Données conservées dans le volume careplan-pgdata.\n'

.PHONY: verify
verify: ## Vérifie tout : types + tests + lint + code mort + build + CSS
	@$(PNPM) verify

.PHONY: status
status: ## Affiche l'état de l'environnement et de la base
	@printf '\n  Environnement\n'
	@printf '    node           %s   (requis >= %s)\n' "$$(node --version 2>/dev/null || echo absent)" "$(NODE_REQUIRED)"
	@printf '    pnpm           %s\n' "$$($(PNPM) --version 2>/dev/null || echo absent)"
	@printf '    .env           %s\n' "$$([ -f .env ] && echo présent || echo absent)"
	@printf '    COREPACK_HOME  %s\n' "$(COREPACK_HOME)"
	@printf '\n  Base de données\n'
	@docker compose ps 2>/dev/null || printf '    Docker non disponible\n'
	@printf '\n'


# --- Étapes internes de `start` : hors de l'aide, car elles ne se lancent pas seules.

.PHONY: _install
_install:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		printf '  → .env créé à partir de .env.example\n'; \
	fi
	@if [ ! -d node_modules ]; then \
		printf '  → Installation des dépendances…\n'; \
		$(PNPM) install; \
	fi

.PHONY: _db-up
_db-up:
	@printf '  → Démarrage de la base…\n'
	@docker compose up -d --quiet-pull
	@sh scripts/db-wait.sh

.PHONY: _dev
_dev:
	@printf '\n  → Application sur http://localhost:%s   (Ctrl-C pour arrêter)\n' "$(PORT)"
	@printf '    La base reste démarrée : « make stop » pour l arrêter.\n\n'
	@$(PNPM) dev --port $(PORT)
