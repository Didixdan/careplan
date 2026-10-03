#!/bin/sh
# Attend que le conteneur Postgres accepte réellement des requêtes : `docker compose up -d`
# rend la main avant la fin de l'initialisation.
# Usage : pnpm db:wait — sortie 0 si la base est prête, 1 après expiration du délai.
set -eu

COMPOSE_FILE="${1:-docker-compose.yml}"
TIMEOUT="${DB_WAIT_TIMEOUT:-60}"
INTERVAL=2

# Sans conteneur existant, inutile d'attendre un état de santé.
container_id="$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)"

if [ -z "$container_id" ]; then
  printf '\n  ✗ Aucun conteneur « db » en cours.\n'
  printf '    Démarrer la base avec :  docker compose up -d\n\n'
  exit 1
fi

printf '\n  Attente de PostgreSQL'

elapsed=0
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || echo unknown)"

  if [ "$status" = "healthy" ]; then
    printf '\n\n  ✓ PostgreSQL est prêt (après %ss)\n\n' "$elapsed"
    exit 0
  fi

  if [ "$status" = "unhealthy" ]; then
    printf '\n\n  ✗ PostgreSQL est en échec.\n'
    printf '    Journaux :  docker compose logs db\n\n'
    exit 1
  fi

  printf '.'
  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

printf '\n\n  ✗ Délai de %ss dépassé.\n' "$TIMEOUT"
printf '    Journaux :  docker compose logs db\n\n'
exit 1
