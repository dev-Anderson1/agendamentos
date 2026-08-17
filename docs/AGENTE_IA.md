# Recepcionista IA (profissional) — Studio Erika Thebas

O bot entende perguntas naturais e **só responde com dados do Postgres**, via tools. Nada de inventar horário ou preço.

## Como funciona

```
WhatsApp → Evolution → bot-api /webhook/whatsapp
                              ├─ saudação / menu / 1–5 → menu clássico
                              ├─ perguntas importantes → RAG (salao.conhecimento)
                              ├─ linguagem natural → classificador / agente IA + tools
                              └─ resposta → Evolution sendText
```

## RAG (perguntas e situações importantes)

Base: tabela `salao.conhecimento` (`postgres/migrate_rag.sql`).

- Busca lexical (full-text PT) + overlap; embeddings opcionais via Ollama (`nomic-embed-text`).
- Perguntas/situações importantes (`precisaRag`) injetam trechos no contexto e/ou usam a tool `buscar_conhecimento`.
- Preço/horário vivo continuam nas tools de catálogo e disponibilidade.

Teste:

```bash
curl -X POST http://localhost:3001/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"pergunta":"aceita pix?"}'
```

## Classificador de intenções

`POST /classify` body `{ "texto": "tem horário pra escova amanhã?" }`

Retorna:

```json
{
  "intencao": "ver_disponibilidade",
  "servico": "escova",
  "data": "amanhã",
  "fonte": "rules"
}
```

Intenções: `ver_disponibilidade` | `listar_servicos` | `agendar` | `meus_horarios` | `cancelar` | `info` | `equipe` | `outro`.

## Ativar

No `.env`:

```env
AI_API_KEY=sk-...sua_chave...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Compatível com APIs no formato OpenAI (OpenAI, Groq, Ollama). Neste projeto o padrão é **Ollama no Docker**:

```env
AI_API_KEY=ollama
AI_BASE_URL=http://ollama:11434/v1
AI_MODEL=llama3.2:3b
```

Subir o stack (baixa o modelo na 1ª vez se ainda não tiver):

```bash
docker compose up -d
docker exec salao_ollama ollama pull llama3.2:3b
```

Outros exemplos:

```env
# Groq
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile
AI_API_KEY=gsk_...
```

Depois:

```bash
docker compose up -d --build bot-api
curl http://localhost:3001/health
# { "ok": true, "agent": true, ... }
```

## Nomes exatos das tools

Use estes nomes no System Message / n8n Agent:

| Tool | O que faz |
|------|-----------|
| `listar_servicos` | Serviços e preços do banco |
| `listar_profissionais` | Equipe / quem faz cada serviço |
| `verificar_disponibilidade` | Horários livres reais (duração + conflitos + almoço) |
| `listar_agendamentos_cliente` | Agenda do cliente |
| `criar_agendamento` | Grava só após confirmação |
| `cancelar_agendamento` | Cancela pelo código |
| `info_salao` | Horário, almoço, feriados, +30% |

Endpoints HTTP (se quiser AI Agent no n8n):

```text
POST http://bot-api:3000/tools/listar_servicos
POST http://bot-api:3000/tools/verificar_disponibilidade
POST http://bot-api:3000/tools/listar_profissionais
POST http://bot-api:3000/tools/listar_agendamentos_cliente
POST http://bot-api:3000/tools/criar_agendamento
POST http://bot-api:3000/tools/cancelar_agendamento
POST http://bot-api:3000/tools/info_salao
```

Body JSON = argumentos da tool. Ex.:

```json
{ "servico": "Escova", "data": "amanha" }
```

## Exemplos de conversa

- "tem horário pra fazer o cabelo?" → pergunta qual serviço → `verificar_disponibilidade`
- "quais horários tem pra escova?" → `verificar_disponibilidade`
- "quanto custa coloração?" → `listar_servicos`
- "quero marcar amanhã 15h escova" → verifica → confirma → `criar_agendamento`

## Google Agenda

Cada agendamento confirmado também cria um evento no Google Calendar de `andiscipulo@gmail.com`.
O convite/e-mail sai com título **TESTE · serviço · cliente**. Cancelar no bot cancela o evento.

1. Google Cloud → ative **Google Calendar API** → crie OAuth **Web**  
   Redirect: `http://localhost:3001/oauth/google/callback`
2. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env` e recrie o bot
3. Abra http://localhost:3001/oauth/google e entre com **andiscipulo@gmail.com**

## Área da profissional

Continua com `equipe` + PIN (fluxo clássico), separado do agente do cliente.
