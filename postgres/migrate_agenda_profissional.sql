ALTER TABLE salao.profissionais
  ADD COLUMN IF NOT EXISTS telefone_whatsapp VARCHAR(32),
  ADD COLUMN IF NOT EXISTS pin_acesso VARCHAR(10) NOT NULL DEFAULT '1234';

-- PINs iniciais (trocar depois em produção)
UPDATE salao.profissionais SET pin_acesso = '1234' WHERE ativo = TRUE;
