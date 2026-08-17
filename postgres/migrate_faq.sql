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
