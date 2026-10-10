#!/bin/bash
# Deploy para VPS Hostinger — studioerikatebas.tech
# Execute no seu terminal local: bash scripts/deploy-vps.sh

VPS_IP="2.25.83.243"
VPS_USER="root"
VPS_PASS="Discipulo123@"
REMOTE_DIR="/opt/salao"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Deploy Studio Erika Thebas ==="
echo "VPS: $VPS_IP"
echo "Projeto local: $PROJECT_DIR"
echo ""

# Verifica dependências
command -v sshpass >/dev/null 2>&1 || { echo "Instale sshpass: sudo apt install sshpass"; exit 1; }
command -v rsync   >/dev/null 2>&1 || { echo "Instale rsync: sudo apt install rsync";   exit 1; }

SSH_OPTS="-o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no"
SSH="sshpass -p '$VPS_PASS' ssh $SSH_OPTS $VPS_USER@$VPS_IP"
RSYNC="sshpass -p '$VPS_PASS' rsync -az -e 'ssh $SSH_OPTS'"

# 1. Cria diretório remoto
echo "[1/5] Preparando diretório na VPS..."
sshpass -p "$VPS_PASS" ssh $SSH_OPTS $VPS_USER@$VPS_IP "mkdir -p $REMOTE_DIR"

# 2. Sincroniza arquivos
echo "[2/5] Enviando arquivos (exclui node_modules e .git)..."
sshpass -p "$VPS_PASS" rsync -az --progress \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='painel/node_modules' \
  --exclude='bot-api/node_modules' \
  --exclude='.env' \
  --exclude='.env.production' \
  --exclude='*.log' \
  -e "ssh $SSH_OPTS" \
  "$PROJECT_DIR/" "$VPS_USER@$VPS_IP:$REMOTE_DIR/"

# 3. Envia .env de produção como .env
echo "[3/5] Enviando .env de produção..."
sshpass -p "$VPS_PASS" scp $SSH_OPTS \
  "$PROJECT_DIR/.env.production" \
  "$VPS_USER@$VPS_IP:$REMOTE_DIR/.env"

# 4. Build e sobe containers na VPS
echo "[4/5] Build e subindo containers..."
sshpass -p "$VPS_PASS" ssh $SSH_OPTS $VPS_USER@$VPS_IP "
  cd $REMOTE_DIR
  docker compose -f docker-compose.prod.yml pull --quiet 2>/dev/null || true
  docker compose -f docker-compose.prod.yml build bot-api
  docker compose -f docker-compose.prod.yml up -d
  echo 'Containers:'
  docker compose -f docker-compose.prod.yml ps
"

# 5. Configura Nginx
echo "[5/5] Configurando Nginx..."
sshpass -p "$VPS_PASS" ssh $SSH_OPTS $VPS_USER@$VPS_IP "
cat > /etc/nginx/sites-available/salao << 'NGINX'
server {
    listen 80;
    server_name studioerikatebas.tech www.studioerikatebas.tech;

    # Painel (React build estático)
    location /painel {
        alias /opt/salao/painel/dist;
        try_files \$uri \$uri/ /painel/index.html;
    }

    # Bot API
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }

    # Evolution API (WhatsApp)
    location /evolution/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/salao /etc/nginx/sites-enabled/salao
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo 'Nginx OK'
"

echo ""
echo "=== Deploy concluído! ==="
echo "Bot API:      http://$VPS_IP"
echo "Painel:       http://$VPS_IP/painel"
echo "Evolution:    http://$VPS_IP/evolution"
echo ""
echo "Próximo passo: apontar DNS do domínio para $VPS_IP"
echo "Depois: certbot --nginx -d studioerikatebas.tech -d www.studioerikatebas.tech"
