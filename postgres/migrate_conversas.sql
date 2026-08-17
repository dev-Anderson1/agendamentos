CREATE TABLE IF NOT EXISTS salao.conversas (
    telefone     VARCHAR(32) PRIMARY KEY,
    estado       VARCHAR(40) NOT NULL DEFAULT 'idle',
    dados        JSONB NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salao.profissional_servicos (
    profissional_id INTEGER NOT NULL REFERENCES salao.profissionais(id) ON DELETE CASCADE,
    servico_id      INTEGER NOT NULL REFERENCES salao.servicos(id) ON DELETE CASCADE,
    PRIMARY KEY (profissional_id, servico_id)
);

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id
FROM salao.profissionais p
CROSS JOIN salao.servicos s
WHERE p.nome = 'Ana'
  AND s.nome IN ('Corte Feminino', 'Escova', 'Coloração')
ON CONFLICT DO NOTHING;

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id
FROM salao.profissionais p
CROSS JOIN salao.servicos s
WHERE p.nome = 'Bruno'
  AND s.nome IN ('Corte Masculino', 'Manicure')
ON CONFLICT DO NOTHING;
