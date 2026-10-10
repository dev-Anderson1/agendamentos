#!/usr/bin/env bash
# Aplica migration de usuários/consumo no Postgres do Docker e reinicia o bot-api.
set -euo pipefail
cd "$(dirname "$0")/.."

# Carrega .env se existir
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PGUSER="${POSTGRES_USER:-salao}"
PGDB="${POSTGRES_DB:-salao}"

echo ">> Aplicando migrate_usuarios_consumo.sql em ${PGDB}..."
docker compose exec -T postgres \
  psql -U "$PGUSER" -d "$PGDB" \
  < postgres/migrate_usuarios_consumo.sql

echo ">> Rebuild bot-api..."
docker compose up -d --build bot-api

echo ""
echo "Pronto. Entre no painel com:"
echo "  login: admin"
echo "  PIN:   ${OWNER_PIN:-1234}"
