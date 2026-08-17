# Sistema de Agendamento de Salão via WhatsApp + n8n

MVP de automação: cliente agenda pelo WhatsApp → Evolution API recebe → n8n processa → grava no Postgres → responde no WhatsApp.

## Arquitetura

```
Cliente WhatsApp
      │
      ▼
Evolution API  ──webhook──►  n8n  ──SQL──►  Postgres (schema salao)
      ▲                         │
      └──────── resposta ───────┘
```

| Serviço        | URL                    | Função                          |
|----------------|------------------------|---------------------------------|
| n8n            | http://localhost:5678  | Automações / fluxo de conversa  |
| Evolution API  | http://localhost:8080  | Conexão WhatsApp (QR Code)      |
| Postgres       | localhost:5433         | Dados do n8n, Evolution e salão |

## É possível com n8n?

Sim. O n8n orquestra o fluxo:

1. Recebe mensagem (webhook da Evolution)
2. Interpreta intenção (menu, serviços, agendar, cancelar)
3. Consulta/grava horários no Postgres
4. Responde no WhatsApp via API da Evolution

Depois dá para evoluir com IA (OpenAI/Gemini), lembretes e painel web.

## Subir a stack

```bash
cd projeto_agendamento
cp .env.example .env   # se ainda não tiver .env
docker compose up -d
```

Aguarde ~30s e abra:

- **n8n:** http://localhost:5678  
  Login: `admin` / `admin123` (veja `.env`)
- **Evolution:** http://localhost:8080  
  API Key: valor de `EVOLUTION_API_KEY` no `.env`
- **Postgres (host):** `localhost:5433` (user/db do `.env`)

## Conectar o WhatsApp

1. Crie a instância na Evolution:

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: salao_evolution_key" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "salao",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true
  }'
```

2. Pegue o QR Code:

```bash
curl -X GET http://localhost:8080/instance/connect/salao \
  -H "apikey: salao_evolution_key"
```

3. Escaneie com o WhatsApp do salão (Aparelhos conectados).

4. Configure o webhook da instância para o n8n (já vem no `docker-compose`, path `whatsapp-salao`).

## Importar o fluxo no n8n

1. Abra o n8n → **Workflows** → **Import from File**
2. Importe `n8n/workflows/whatsapp-agendamento-salao.json`
3. Crie credencial **Postgres**:
   - Host: `postgres`
   - Database: `salao`
   - User/Password: do `.env`
   - Schema: `salao` (quando aplicável)
4. No nó HTTP Request, confira a `apikey` da Evolution
5. Ative o workflow (toggle Active)

## Banco do salão

Schema `salao` criado em `postgres/init.sql`:

- `servicos`
- `profissionais`
- `horarios_trabalho`
- `agendamentos`

Seeds: Corte Feminino/Masculino, Escova, Coloração, Manicure + profissionais Ana e Bruno.

## Fluxo do cliente (guiado por números)

Sem digitar com `|`. A pessoa só responde com números:

```
oi
  → 1 Ver serviços
  → 2 Agendar horário
       → escolhe serviço (número)
       → escolhe profissional (número)
       → digita dia (hoje / amanha / 10/08)
       → escolhe horário livre (número)
       → confirma nome
       → confirma agendamento (1 Sim / 2 Não)
  → 3 Meus horários
  → 4 Cancelar horário (escolhe pelo número da lista)
```

A lógica fica no serviço `bot-api` (porta 3001). O n8n só recebe o WhatsApp e encaminha.

## Comandos úteis

```bash
docker compose ps
docker compose logs -f n8n
docker compose logs -f evolution-api
docker compose down
docker compose down -v   # apaga volumes (cuidado)
```

## Próximos passos

1. Conectar WhatsApp (QR) e testar menu
2. Ajustar validação de conflitos de horário no n8n
3. Lembretes automáticos (cron no n8n)
4. Painel web simples para o salão ver a agenda
5. Em produção: HTTPS, senhas fortes, e avaliar Meta Cloud API oficial

## Aviso

A Evolution API usa conexão não oficial (Baileys). Serve bem para MVP. Para escala/produção estável, considere a **WhatsApp Cloud API (Meta)**.
