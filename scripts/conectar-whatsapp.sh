#!/usr/bin/env bash
set -euo pipefail

API_KEY="${EVOLUTION_API_KEY:-salao_evolution_key}"
BASE="${EVOLUTION_SERVER_URL:-http://localhost:8080}"
INSTANCE="${1:-salao}"

echo "==> Criando instância '$INSTANCE'..."
curl -sS -X POST "$BASE/instance/create" \
  -H "apikey: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"$INSTANCE\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" \
  | tee /tmp/evolution-create.json

echo
echo "==> Buscando QR / status de conexão..."
curl -sS -X GET "$BASE/instance/connect/$INSTANCE" \
  -H "apikey: $API_KEY" \
  | tee /tmp/evolution-connect.json

echo
echo "Pronto. Abra o JSON acima ou a UI da Evolution em $BASE"
echo "Escaneie o QR Code com o WhatsApp do salão."
