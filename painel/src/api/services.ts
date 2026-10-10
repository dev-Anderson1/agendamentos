import type {
  AgendaResp,
  AgendamentoCriado,
  Consentimento,
  ConversaResumo,
  ConsumoResp,
  DashboardResumo,
  LgpdExport,
  MensagemChat,
  MensalPonto,
  MetodosResp,
  Pagamento,
  PerfilResp,
  PrevisaoResp,
  Produto,
  Profissional,
  RelatorioDiario,
  Servico,
  ServicoRelatorio,
  Slot,
  UsuarioPainel,
  WhatsAppQr,
  WhatsAppStatus,
} from '../types';
import { api } from './client';

export const painelApi = {
  me: () => api<PerfilResp>('/me'),

  aceitarLgpd: (versao = '1.0') =>
    api<{ ok: boolean }>('/me/lgpd-aceite', {
      method: 'POST',
      body: JSON.stringify({ versao }),
    }),

  usuarios: () => api<{ usuarios: UsuarioPainel[] }>('/usuarios'),

  profissionaisOpcoes: () =>
    api<{ profissionais: Array<{ id: number; nome: string; cargo?: string }> }>(
      '/usuarios/profissionais-opcoes',
    ),

  criarUsuario: (payload: Record<string, unknown>) =>
    api<{ ok: boolean; usuario: UsuarioPainel }>('/usuarios', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  atualizarUsuario: (id: number, payload: Record<string, unknown>) =>
    api<{ ok: boolean; usuario: UsuarioPainel }>(`/usuarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  consumo: (dias = 30) => api<ConsumoResp>(`/consumo?dias=${dias}`),

  dashboard: () => api<DashboardResumo>('/dashboard'),

  agenda: (periodo: string) => api<AgendaResp>(`/agenda?periodo=${encodeURIComponent(periodo)}`),

  avisarCliente: (id: number, texto: string) =>
    api<{ mensagem: string }>(`/agenda/${id}/avisar`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    }),

  cancelarRemarcar: (id: number) =>
    api<{ mensagem: string }>(`/agenda/${id}/cancelar-remarcar`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  servicos: () => api<{ servicos: Servico[] }>('/servicos'),

  profissionais: (servicoId: string) =>
    api<{ profissionais: Profissional[] }>(`/profissionais?servico_id=${encodeURIComponent(servicoId)}`),

  slots: (params: { data: string; servicoId: string; profissionalId?: string }) => {
    const q = new URLSearchParams({ data: params.data, servico_id: params.servicoId });
    if (params.profissionalId) q.set('profissional_id', params.profissionalId);
    return api<{ slots: Slot[]; erro?: string }>(`/slots?${q}`);
  },

  criarAgendamento: (payload: {
    cliente_nome: string;
    cliente_telefone: string;
    servico_id: number;
    profissional_id: number | null;
    data: string;
    hora: string;
    avisar_cliente: boolean;
  }) =>
    api<AgendamentoCriado>('/agendamentos', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  whatsappStatus: () => api<WhatsAppStatus>('/whatsapp/status'),

  whatsappQr: () => api<WhatsAppQr>('/whatsapp/qr'),

  consentimentos: (limite = 100) =>
    api<{ consentimentos: Consentimento[] }>(`/lgpd/consentimentos?limite=${limite}`),

  exportarLgpd: (telefone: string) =>
    api<LgpdExport>(`/lgpd/exportar?telefone=${encodeURIComponent(telefone)}`),

  excluirLgpd: (telefone: string, confirmar: string) =>
    api<{
      ok: boolean;
      agendamentos_anonimizados: number;
      mensagens_removidas: number;
      conversas_removidas: number;
    }>('/lgpd/excluir', {
      method: 'POST',
      body: JSON.stringify({ telefone, confirmar }),
    }),

  retencaoLgpd: () =>
    api<{ removidas: number; dias: number }>('/lgpd/retencao', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  pagamentos: (filtro: { status: string; metodo: string; limite?: number }) => {
    const q = new URLSearchParams();
    if (filtro.status) q.set('status', filtro.status);
    if (filtro.metodo) q.set('metodo', filtro.metodo);
    q.set('limite', String(filtro.limite ?? 80));
    return api<{ pagamentos: Pagamento[] }>(`/financeiro/pagamentos?${q}`);
  },

  metodosPagamento: (mes: string) => {
    const q = mes ? `?mes=${encodeURIComponent(mes)}` : '';
    return api<MetodosResp>(`/financeiro/metodos${q}`);
  },

  registrarPagamento: (id: number, valorReais: number, metodo: string) =>
    api(`/financeiro/pagamentos/${id}/pagar`, {
      method: 'POST',
      body: JSON.stringify({ valor_reais: valorReais, metodo }),
    }),

  relatorioServicos: (dias = 90) =>
    api<{ servicos: ServicoRelatorio[] }>(`/relatorios/servicos?dias=${dias}`),

  previsao: (dias: number) => api<PrevisaoResp>(`/relatorios/previsao?dias=${dias}`),

  receitaMensal: (meses: number) => api<{ meses: MensalPonto[] }>(`/relatorios/mensal?meses=${meses}`),

  relatorioDiario: (mes: string) =>
    api<RelatorioDiario>(`/relatorios/diario?mes=${encodeURIComponent(mes)}`),

  produtos: () => api<{ produtos: Produto[] }>('/estoque/produtos'),

  criarProduto: (nome: string, categoria: string | null) =>
    api('/estoque/produtos', {
      method: 'POST',
      body: JSON.stringify({ nome, categoria }),
    }),

  movimentarEstoque: (produtoId: number, tipo: string, quantidade: number) =>
    api('/estoque/movimentos', {
      method: 'POST',
      body: JSON.stringify({ produtoId, tipo, quantidade }),
    }),

  whatsappConversas: (limite = 50) =>
    api<{ conversas: ConversaResumo[] }>(`/whatsapp/conversas?limite=${limite}`),

  whatsappMensagens: (telefone: string, limite = 60) =>
    api<{ telefone: string; mensagens: MensagemChat[] }>(
      `/whatsapp/conversas/${encodeURIComponent(telefone)}?limite=${limite}`,
    ),

  whatsappEnviar: (telefone: string, texto: string) =>
    api<{ ok: boolean }>(`/whatsapp/conversas/${encodeURIComponent(telefone)}/enviar`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    }),
};
