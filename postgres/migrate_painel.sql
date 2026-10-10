-- Painel administrativo: financeiro, estoque, pagamentos ligados ao agendamento

CREATE TABLE IF NOT EXISTS salao.pagamentos (
    id                  SERIAL PRIMARY KEY,
    agendamento_id      INTEGER REFERENCES salao.agendamentos(id) ON DELETE SET NULL,
    valor_centavos      INTEGER NOT NULL DEFAULT 0,
    valor_previsto_centavos INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'pago', 'parcial', 'cancelado', 'cortesia')),
    metodo              VARCHAR(20),
    pago_em             TIMESTAMPTZ,
    observacoes         TEXT,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_agendamento ON salao.pagamentos (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON salao.pagamentos (status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pago_em ON salao.pagamentos (pago_em);

CREATE TABLE IF NOT EXISTS salao.produtos (
    id                  SERIAL PRIMARY KEY,
    nome                VARCHAR(120) NOT NULL,
    sku                 VARCHAR(40),
    categoria           VARCHAR(60),
    unidade             VARCHAR(20) NOT NULL DEFAULT 'un',
    estoque_atual       NUMERIC(12, 3) NOT NULL DEFAULT 0,
    estoque_minimo      NUMERIC(12, 3) NOT NULL DEFAULT 0,
    custo_centavos      INTEGER NOT NULL DEFAULT 0,
    preco_venda_centavos INTEGER,
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salao.estoque_movimentos (
    id                  SERIAL PRIMARY KEY,
    produto_id          INTEGER NOT NULL REFERENCES salao.produtos(id) ON DELETE CASCADE,
    tipo                VARCHAR(20) NOT NULL
                        CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'uso_servico', 'venda', 'perda')),
    quantidade          NUMERIC(12, 3) NOT NULL,
    custo_unitario_centavos INTEGER,
    agendamento_id      INTEGER REFERENCES salao.agendamentos(id) ON DELETE SET NULL,
    observacoes         TEXT,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_produto ON salao.estoque_movimentos (produto_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS salao.servico_insumos (
    servico_id          INTEGER NOT NULL REFERENCES salao.servicos(id) ON DELETE CASCADE,
    produto_id          INTEGER NOT NULL REFERENCES salao.produtos(id) ON DELETE CASCADE,
    quantidade          NUMERIC(12, 3) NOT NULL DEFAULT 1,
    PRIMARY KEY (servico_id, produto_id)
);

-- Pagamentos pendentes para agendamentos futuros sem registro financeiro
INSERT INTO salao.pagamentos (agendamento_id, valor_centavos, valor_previsto_centavos, status)
SELECT a.id, 0, s.preco_centavos, 'pendente'
FROM salao.agendamentos a
JOIN salao.servicos s ON s.id = a.servico_id
WHERE a.status IN ('confirmado', 'pendente')
  AND a.inicio_em >= NOW()
  AND NOT EXISTS (
    SELECT 1 FROM salao.pagamentos p WHERE p.agendamento_id = a.id
  );

-- Seed produtos exemplo (estoque futuro / site)
INSERT INTO salao.produtos (nome, categoria, unidade, estoque_atual, estoque_minimo, custo_centavos, preco_venda_centavos)
SELECT v.nome, v.categoria, v.unidade, v.estoque, v.minimo, v.custo, v.preco
FROM (VALUES
  ('Pó descolorante 500g', 'coloração', 'g', 2500, 500, 4500, NULL),
  ('Oxigenada 20 vol', 'coloração', 'ml', 5000, 1000, 2800, NULL),
  ('Esmalte gel premium', 'unhas', 'un', 24, 6, 1200, 3500),
  ('Shampoo profissional 1L', 'capilar', 'ml', 3000, 500, 3200, NULL)
) AS v(nome, categoria, unidade, estoque, minimo, custo, preco)
WHERE NOT EXISTS (SELECT 1 FROM salao.produtos LIMIT 1);
