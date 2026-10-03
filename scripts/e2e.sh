#!/bin/sh
# Base de données dédiée aux tests de bout en bout.
#
# Les scénarios ÉCRIVENT pour de vrai (créneaux, kilomètres, statuts) et suppriment ce qu'ils
# ont créé. Les faire tourner sur la base de travail, c'est risquer les données de dev — et
# c'est surtout laisser un résidu faire échouer l'exécution suivante : un créneau rescapé
# occupe la plage qu'un scénario veut créer, et le serveur répond 409 (chevauchement).
#
# D'où une base À PART, dans le MÊME conteneur Postgres : elle se recrée en quelques secondes,
# sans toucher ni au volume, ni au schéma, ni aux données de la base de travail. Seul le nom
# de la base change (`careplan` → `careplan_e2e`).
#
# Usage :
#   sh scripts/e2e.sh db      recrée la base des tests (schéma + jeu de données)
#   sh scripts/e2e.sh serve   sert l'application sur cette base (3001 par défaut)
#   sh scripts/e2e.sh all     base neuve + serveur + Cypress, en une commande
#
# Surcharges : E2E_DB=careplan_autre  E2E_PORT=3001  E2E_DATABASE_URL=postgresql://…
set -eu

E2E_DB="${E2E_DB:-careplan_e2e}"
E2E_PORT="${E2E_PORT:-3001}"

# Lit une clé dans `.env` sans l'importer : la valeur peut contenir des caractères spéciaux,
# et une base de travail n'a pas à être chargée pour la recréer ailleurs.
read_env() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env 2>/dev/null \
    | tail -1 | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//" | grep . || true
}

work_url="${DATABASE_URL:-$(read_env DATABASE_URL)}"
if [ -z "$work_url" ]; then
  printf '\n  ✗ DATABASE_URL est absente. Copier .env.example en .env.\n\n'
  exit 1
fi

# Même serveur, même utilisateur, même mot de passe : seul le nom de la base diffère.
e2e_url="${E2E_DATABASE_URL:-$(printf '%s' "$work_url" | sed "s#/[^/]*\$#/$E2E_DB#")}"
pg_user="${POSTGRES_USER:-$(read_env POSTGRES_USER)}"
pg_user="${pg_user:-careplan}"

reset() {
  printf '\n  → Base des tests : %s\n' "$E2E_DB"

  docker compose up -d --quiet-pull
  sh scripts/db-wait.sh

  # `WITH (FORCE)` coupe les connexions restantes (un serveur e2e oublié) : sans lui, le DROP
  # échoue et le script s'arrête au milieu du gué, avec une base à moitié neuve.
  docker compose exec -T db psql -U "$pg_user" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$E2E_DB\" WITH (FORCE);" >/dev/null
  docker compose exec -T db psql -U "$pg_user" -d postgres \
    -c "CREATE DATABASE \"$E2E_DB\";" >/dev/null

  # Le schéma vient des migrations, jamais d'un `push` : c'est ce que la production applique.
  DATABASE_URL="$e2e_url" pnpm db:migrate
  DATABASE_URL="$e2e_url" pnpm db:seed

  printf '\n  ✓ Base « %s » remise à neuf.\n\n' "$E2E_DB"
}

serve() {
  printf '\n  → Application sur http://localhost:%s (base %s)\n\n' "$E2E_PORT" "$E2E_DB"
  DATABASE_URL="$e2e_url" exec pnpm dev --port "$E2E_PORT"
}

# Le serveur répond avant d'être prêt à servir une page : on attend une vraie réponse HTTP,
# sinon Cypress démarre sur une connexion refusée.
wait_for_server() {
  elapsed=0
  while ! curl -sf -o /dev/null "http://localhost:$E2E_PORT/login"; do
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -gt 120 ]; then
      printf '\n  ✗ Le serveur e2e n'"'"'a pas répondu en 120 s.\n\n'
      exit 1
    fi
    sleep 1
  done
}

all() {
  reset

  DATABASE_URL="$e2e_url" pnpm dev --port "$E2E_PORT" &
  server_pid=$!
  # Le serveur ne doit pas survivre au script, même en échec : sinon le port reste pris et
  # l'exécution suivante sert une base qui n'existe plus.
  trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

  wait_for_server
  CYPRESS_BASE_URL="http://localhost:$E2E_PORT" pnpm e2e
}

case "${1:-}" in
  db) reset ;;
  serve) serve ;;
  all) all ;;
  *)
    printf '\n  Usage : sh scripts/e2e.sh db | serve | all\n\n'
    printf '    db      recrée la base des tests (schéma + jeu de données)\n'
    printf '    serve   sert l'"'"'application sur cette base (port %s)\n' "$E2E_PORT"
    printf '    all     base neuve + serveur + Cypress, en une commande\n\n'
    exit 1
    ;;
esac
