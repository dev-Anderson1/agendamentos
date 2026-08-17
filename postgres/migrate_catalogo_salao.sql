-- Catálogo completo do salão: serviços, profissionais, horários e regras

ALTER TABLE salao.servicos
  ADD COLUMN IF NOT EXISTS preco_apartir BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(40);

ALTER TABLE salao.profissionais
  ADD COLUMN IF NOT EXISTS cargo VARCHAR(80);

CREATE TABLE IF NOT EXISTS salao.configuracoes (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Desativa catálogo antigo
UPDATE salao.servicos SET ativo = FALSE;
UPDATE salao.profissionais SET ativo = FALSE;
DELETE FROM salao.profissional_servicos;
DELETE FROM salao.horarios_trabalho;

-- Serviços novos (upsert por nome)
INSERT INTO salao.servicos (nome, duracao_minutos, preco_centavos, preco_apartir, categoria, ativo) VALUES
  ('Corte feminino', 45, 9000, FALSE, 'cabelo', TRUE),
  ('Escova', 40, 5000, TRUE, 'cabelo', TRUE),
  ('Coloração', 120, 15000, TRUE, 'cabelo', TRUE),
  ('Mechas', 180, 35000, TRUE, 'cabelo', TRUE),
  ('Morena iluminada', 180, 40000, TRUE, 'cabelo', TRUE),
  ('Ruivo', 150, 30000, TRUE, 'cabelo', TRUE),
  ('Selagem', 90, 18000, TRUE, 'cabelo', TRUE),
  ('Tratamentos capilares', 60, 8000, TRUE, 'capilar', TRUE),
  ('Terapia capilar', 60, 12000, TRUE, 'capilar', TRUE),
  ('Spa Capilar', 75, 15000, TRUE, 'capilar', TRUE),
  ('Penteados', 60, 12000, TRUE, 'cabelo', TRUE),
  ('Maquiagem', 60, 15000, TRUE, 'maquiagem', TRUE),
  ('Manicure', 45, 4000, FALSE, 'unhas', TRUE),
  ('Pedicure', 45, 4500, FALSE, 'unhas', TRUE),
  ('Spa dos Pés', 50, 7000, FALSE, 'unhas', TRUE),
  ('Esmaltação', 30, 3000, FALSE, 'unhas', TRUE),
  ('Alongamento de unhas', 90, 15000, TRUE, 'unhas', TRUE),
  ('Blindagem de unhas', 45, 8000, FALSE, 'unhas', TRUE),
  ('Banho de gel', 60, 10000, FALSE, 'unhas', TRUE),
  ('Nail Art', 25, 1000, TRUE, 'unhas', TRUE)
ON CONFLICT DO NOTHING;

-- Se já existiam com nome parecido, reativa/atualiza
UPDATE salao.servicos AS s SET
  nome = v.nome,
  duracao_minutos = v.duracao,
  preco_centavos = v.preco,
  preco_apartir = v.apartir,
  categoria = v.categoria,
  ativo = TRUE
FROM (VALUES
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
  ('Nail Art', 25, 1000, TRUE, 'unhas')
) AS v(nome, duracao, preco, apartir, categoria)
WHERE LOWER(s.nome) = LOWER(v.nome);

-- Garante inserção dos que ainda não existem (case-insensitive)
INSERT INTO salao.servicos (nome, duracao_minutos, preco_centavos, preco_apartir, categoria, ativo)
SELECT v.nome, v.duracao, v.preco, v.apartir, v.categoria, TRUE
FROM (VALUES
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
  ('Nail Art', 25, 1000, TRUE, 'unhas')
) AS v(nome, duracao, preco, apartir, categoria)
WHERE NOT EXISTS (
  SELECT 1 FROM salao.servicos s WHERE LOWER(s.nome) = LOWER(v.nome)
);

-- Profissionais fictícios por função
INSERT INTO salao.profissionais (nome, cargo, ativo)
SELECT v.nome, v.cargo, TRUE
FROM (VALUES
  ('Ana Paula', 'Cabeleireira'),
  ('Beatriz Lima', 'Terapeuta Capilar'),
  ('Carla Souza', 'Manicure e Pedicure'),
  ('Daniela Rocha', 'Designer de Sobrancelhas'),
  ('Eduarda Martins', 'Maquiadora')
) AS v(nome, cargo)
WHERE NOT EXISTS (
  SELECT 1 FROM salao.profissionais p WHERE LOWER(p.nome) = LOWER(v.nome)
);

UPDATE salao.profissionais AS p SET
  cargo = v.cargo,
  ativo = TRUE
FROM (VALUES
  ('Ana Paula', 'Cabeleireira'),
  ('Beatriz Lima', 'Terapeuta Capilar'),
  ('Carla Souza', 'Manicure e Pedicure'),
  ('Daniela Rocha', 'Designer de Sobrancelhas'),
  ('Eduarda Martins', 'Maquiadora')
) AS v(nome, cargo)
WHERE LOWER(p.nome) = LOWER(v.nome);

-- Horário: Terça a Sábado 09:00–18:00 (domingo=0 e segunda=1 fechados)
INSERT INTO salao.horarios_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim)
SELECT p.id, d.dia, '09:00'::time, '18:00'::time
FROM salao.profissionais p
CROSS JOIN (VALUES (2), (3), (4), (5), (6)) AS d(dia)
WHERE p.ativo = TRUE
  AND p.nome IN ('Ana Paula', 'Beatriz Lima', 'Carla Souza', 'Daniela Rocha', 'Eduarda Martins')
ON CONFLICT DO NOTHING;

-- Vínculos profissional ↔ serviço
INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id
FROM salao.profissionais p
JOIN salao.servicos s ON s.ativo
WHERE p.nome = 'Ana Paula'
  AND s.nome IN (
    'Corte feminino', 'Escova', 'Coloração', 'Mechas', 'Morena iluminada',
    'Ruivo', 'Selagem', 'Penteados'
  )
ON CONFLICT DO NOTHING;

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id
FROM salao.profissionais p
JOIN salao.servicos s ON s.ativo
WHERE p.nome = 'Beatriz Lima'
  AND s.nome IN ('Tratamentos capilares', 'Terapia capilar', 'Spa Capilar', 'Selagem')
ON CONFLICT DO NOTHING;

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id
FROM salao.profissionais p
JOIN salao.servicos s ON s.ativo
WHERE p.nome = 'Carla Souza'
  AND s.nome IN (
    'Manicure', 'Pedicure', 'Spa dos Pés', 'Esmaltação',
    'Alongamento de unhas', 'Blindagem de unhas', 'Banho de gel', 'Nail Art'
  )
ON CONFLICT DO NOTHING;

INSERT INTO salao.profissional_servicos (profissional_id, servico_id)
SELECT p.id, s.id
FROM salao.profissionais p
JOIN salao.servicos s ON s.ativo
WHERE p.nome = 'Eduarda Martins'
  AND s.nome IN ('Maquiagem', 'Penteados')
ON CONFLICT DO NOTHING;

-- Regras do salão
INSERT INTO salao.configuracoes (chave, valor) VALUES
  ('horario_funcionamento', '{"domingo":"Fechado","segunda":"Fechado","terca":"09:00-18:00","quarta":"09:00-18:00","quinta":"09:00-18:00","sexta":"09:00-18:00","sabado":"09:00-18:00"}'::jsonb),
  ('almoco', '{"inicio":"12:00","fim":"12:20"}'::jsonb),
  ('feriados', '{"atende":true,"observacao":"O atendimento em feriados está sujeito à disponibilidade e pode haver alterações nos horários."}'::jsonb),
  ('fora_horario', '{"cobra":true,"percentual":30,"observacao":"É cobrado um acréscimo de 30% sobre o valor do serviço para atendimentos fora do horário de funcionamento."}'::jsonb),
  ('nome_salao', '"Studio Erika Thebas"'::jsonb)
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor, atualizado_em = NOW();
