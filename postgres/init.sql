-- Schemas separados: n8n, evolution e domínio do salão
CREATE SCHEMA IF NOT EXISTS n8n;
CREATE SCHEMA IF NOT EXISTS evolution;
CREATE SCHEMA IF NOT EXISTS salao;

CREATE TABLE IF NOT EXISTS salao.servicos (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(120) NOT NULL,
    duracao_minutos INTEGER NOT NULL DEFAULT 30,
    preco_centavos  INTEGER NOT NULL DEFAULT 0,
    preco_apartir   BOOLEAN NOT NULL DEFAULT FALSE,
    categoria       VARCHAR(40),
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salao.profissionais (
    id         SERIAL PRIMARY KEY,
    nome       VARCHAR(120) NOT NULL,
    cargo      VARCHAR(80),
    telefone_whatsapp VARCHAR(32),
    pin_acesso VARCHAR(10) NOT NULL DEFAULT '1234',
    ativo      BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salao.horarios_trabalho (
    id              SERIAL PRIMARY KEY,
    profissional_id INTEGER NOT NULL REFERENCES salao.profissionais(id) ON DELETE CASCADE,
    dia_semana      SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio     TIME NOT NULL,
    hora_fim        TIME NOT NULL,
    UNIQUE (profissional_id, dia_semana, hora_inicio, hora_fim)
);

CREATE TABLE IF NOT EXISTS salao.agendamentos (
    id               SERIAL PRIMARY KEY,
    cliente_nome     VARCHAR(120) NOT NULL,
    cliente_telefone VARCHAR(32) NOT NULL,
    servico_id       INTEGER NOT NULL REFERENCES salao.servicos(id),
    profissional_id  INTEGER REFERENCES salao.profissionais(id),
    inicio_em        TIMESTAMPTZ NOT NULL,
    fim_em           TIMESTAMPTZ NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'confirmado'
                     CHECK (status IN ('pendente', 'confirmado', 'cancelado', 'concluido', 'faltou')),
    origem           VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    observacoes      TEXT,
    google_event_id  TEXT,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_inicio ON salao.agendamentos (inicio_em);
CREATE INDEX IF NOT EXISTS idx_agendamentos_telefone ON salao.agendamentos (cliente_telefone);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON salao.agendamentos (status);

CREATE TABLE IF NOT EXISTS salao.conversas (
    telefone      VARCHAR(32) PRIMARY KEY,
    estado        VARCHAR(40) NOT NULL DEFAULT 'idle',
    dados         JSONB NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salao.mensagens_conversa (
    id          BIGSERIAL PRIMARY KEY,
    telefone    VARCHAR(32) NOT NULL,
    papel       VARCHAR(16) NOT NULL CHECK (papel IN ('user', 'assistant')),
    conteudo    TEXT NOT NULL,
    metadados   JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_telefone_criado
    ON salao.mensagens_conversa (telefone, criado_em DESC);

CREATE TABLE IF NOT EXISTS salao.faq_servicos (
    servico_id INTEGER NOT NULL REFERENCES salao.servicos(id) ON DELETE CASCADE,
    topico     VARCHAR(64) NOT NULL,
    resposta  TEXT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (servico_id, topico)
);

CREATE TABLE IF NOT EXISTS salao.faq_geral (
    topico     VARCHAR(64) PRIMARY KEY,
    resposta  TEXT NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salao.profissional_servicos (
    profissional_id INTEGER NOT NULL REFERENCES salao.profissionais(id) ON DELETE CASCADE,
    servico_id      INTEGER NOT NULL REFERENCES salao.servicos(id) ON DELETE CASCADE,
    PRIMARY KEY (profissional_id, servico_id)
);

CREATE TABLE IF NOT EXISTS salao.configuracoes (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO salao.servicos (nome, duracao_minutos, preco_centavos, preco_apartir, categoria) VALUES
  ('Corte feminino', 45, 9000, FALSE, 'cabelo'),
  ('Escova', 40, 5000, TRUE, 'cabelo'),
  ('Coloração', 120, 15000, TRUE, 'cabelo'),
  ('Mechas', 180, 35000, TRUE, 'cabelo'),
  ('Morena iluminada', 180, 40000, TRUE, 'cabelo'),
  ('Ruivo', 150, 30000, TRUE, 'cabelo'),
  ('Selagem', 90, 18000, TRUE, 'cabelo'),
  ('Tratamentos capilares', 60, 8000, TRUE, 'capilar'),
  ('Terapia capilar', 60, 12000, TRUE, 'capilar'),
  ('Spa Capilar', 75, 15000, TRUE, 'capilar'),
  ('Penteados', 60, 12000, TRUE, 'cabelo'),
  ('Maquiagem', 60, 15000, TRUE, 'maquiagem'),
  ('Manicure', 45, 4000, FALSE, 'unhas'),
  ('Pedicure', 45, 4500, FALSE, 'unhas'),
  ('Spa dos Pés', 50, 7000, FALSE, 'unhas'),
  ('Esmaltação', 30, 3000, FALSE, 'unhas'),
  ('Alongamento de unhas', 90, 15000, TRUE, 'unhas'),
  ('Blindagem de unhas', 45, 8000, FALSE, 'unhas'),
  ('Banho de gel', 60, 10000, FALSE, 'unhas'),
  ('Nail Art', 25, 1000, TRUE, 'unhas');

INSERT INTO salao.profissionais (nome, cargo) VALUES
  ('Ana Paula', 'Cabeleireira'),
  ('Beatriz Lima', 'Terapeuta Capilar'),
  ('Carla Souza', 'Manicure e Pedicure'),
  ('Daniela Rocha', 'Designer de Sobrancelhas'),
  ('Eduarda Martins', 'Maquiadora');

-- Terça a sábado 09:00–18:00
INSERT INTO salao.horarios_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim)
SELECT p.id, d.dia, '09:00'::time, '18:00'::time
FROM salao.profissionais p
CROSS JOIN (VALUES (2), (3), (4), (5), (6)) AS d(dia);

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id FROM salao.profissionais p
JOIN salao.servicos s ON s.nome IN (
  'Corte feminino', 'Escova', 'Coloração', 'Mechas', 'Morena iluminada', 'Ruivo', 'Selagem', 'Penteados'
) WHERE p.nome = 'Ana Paula';

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id FROM salao.profissionais p
JOIN salao.servicos s ON s.nome IN (
  'Tratamentos capilares', 'Terapia capilar', 'Spa Capilar', 'Selagem'
) WHERE p.nome = 'Beatriz Lima';

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id FROM salao.profissionais p
JOIN salao.servicos s ON s.nome IN (
  'Manicure', 'Pedicure', 'Spa dos Pés', 'Esmaltação',
  'Alongamento de unhas', 'Blindagem de unhas', 'Banho de gel', 'Nail Art'
) WHERE p.nome = 'Carla Souza';

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id FROM salao.profissionais p
JOIN salao.servicos s ON s.nome IN ('Maquiagem', 'Penteados')
WHERE p.nome = 'Eduarda Martins';

INSERT INTO salao.configuracoes (chave, valor) VALUES
  ('horario_funcionamento', '{"domingo":"Fechado","segunda":"Fechado","terca":"09:00-18:00","quarta":"09:00-18:00","quinta":"09:00-18:00","sexta":"09:00-18:00","sabado":"09:00-18:00"}'::jsonb),
  ('almoco', '{"inicio":"12:00","fim":"12:20"}'::jsonb),
  ('feriados', '{"atende":true,"observacao":"O atendimento em feriados está sujeito à disponibilidade e pode haver alterações nos horários."}'::jsonb),
  ('fora_horario', '{"cobra":true,"percentual":30,"observacao":"É cobrado um acréscimo de 30% sobre o valor do serviço para atendimentos fora do horário de funcionamento."}'::jsonb),
  ('nome_salao', '"Studio Erika Thebas"'::jsonb);
