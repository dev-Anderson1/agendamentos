export const STUDIO_NOME = 'Studio Erika Thebas';

export const TIMEZONE = 'America/Sao_Paulo';

export const STORAGE_KEYS = {
  token: 'salao_painel_token',
  usuario: 'salao_painel_usuario',
  sidebarCollapsed: 'salao_sidebar_collapsed',
} as const;

export const AVISO_REMARCAR_PADRAO =
  'Olá! Aqui é do Studio Erika Thebas. Precisamos remarcar o seu horário. Responda com o número do horário que preferir.';

export const METODOS_PAGAMENTO = [
  { id: 'pix', label: 'PIX' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao', label: 'Cartão' },
  { id: 'transferencia', label: 'Transferência' },
] as const;

export const PERIODOS_AGENDA = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'amanha', label: 'Amanhã' },
  { id: 'semana', label: '7 dias' },
  { id: 'futuros', label: 'Futuros' },
] as const;

export const STATUS_PAGAMENTO = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'pago', label: 'Pago' },
  { id: 'cancelado', label: 'Cancelado' },
  { id: '', label: 'Todos' },
] as const;
