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
