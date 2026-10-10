export type Role = 'admin' | 'funcionario' | 'usuario';

export type ConversaResumo = {
  telefone: string;
  ultima_msg: string;
  total_user: number;
  ultimo_texto: string;
  ultimo_papel: 'user' | 'assistant';
  push_name: string | null;
};

export type MensagemChat = {
  papel: 'user' | 'assistant';
  conteudo: string;
  metadados: Record<string, unknown>;
  criado_em: string;
};

export type UsuarioPainel = {
  id: number;
  nome: string;
  login: string;
  email?: string | null;
  telefone?: string | null;
  role: Role;
  profissional_id?: number | null;
  profissional_nome?: string | null;
  ativo?: boolean;
  lgpd_aceite_em?: string | null;
  lgpd_politica_ver?: string | null;
  ultimo_acesso_em?: string | null;
  criado_em?: string | null;
};

export type Servico = {
  id: number;
  nome: string;
  categoria: string;
  duracao_minutos: number;
  preco_centavos: number;
};

export type Profissional = {
  id: number;
  nome: string;
  cargo?: string;
};

export type Slot = {
  hora: string;
  profissionalId: number;
  profissionalNome: string;
  label: string;
};

export type HorarioAgenda = {
  id: number;
  cliente_nome: string;
  servico: string;
  profissional: string;
  quando: string;
  fim?: string;
};

export type AgendaResp = {
  titulo: string;
  itens: HorarioAgenda[];
};

export type DashboardResumo = {
  hoje: { agendamentos: number; previsto_reais: number; recebido_reais: number };
  mes: { recebido_reais: number; previsto_futuro_reais: number; agendamentos_futuros: number };
  estoque: { produtos_baixo: number };
  escopo?: string;
};

export type MensalPonto = {
  mes: string;
  recebido_reais: number;
  pagamentos: number;
};

export type PrevisaoPonto = {
  dia: string;
  agendamentos: number;
  previsto_reais: number;
};

export type PrevisaoResp = {
  total_previsto_reais: number;
  dias: PrevisaoPonto[];
};

export type Pagamento = {
  id: number;
  agendamento_id: number;
  valor_centavos: number;
  valor_previsto_centavos: number;
  status: string;
  metodo: string | null;
  metodo_label?: string;
  cliente_nome: string;
  servico: string;
  quando: string;
  pago_em_br?: string;
};

export type MetodoItem = {
  metodo: string;
  metodo_label: string;
  quantidade: number;
  total_reais: number;
};

export type HistoricoPagamento = {
  id: number;
  cliente_nome: string;
  servico: string;
  quando: string;
  pago_em_br: string;
  metodo_label: string;
  valor_reais: number;
};

export type MetodosResp = {
  mes: string | null;
  resumo: { total_pagamentos: number; total_reais: number };
  por_metodo: MetodoItem[];
  historico: HistoricoPagamento[];
};

export type Produto = {
  id: number;
  nome: string;
  categoria: string | null;
  unidade: string;
  estoque_atual: number;
  estoque_minimo: number;
  custo_centavos: number;
  baixo: boolean;
};

export type WhatsAppStatus = {
  instance: string;
  state: string;
  manager_url: string;
  painel_url: string;
};

export type WhatsAppQr = {
  conectado: boolean;
  state: string;
  base64: string | null;
  pairingCode?: string | null;
  manager_url?: string;
  erro?: string;
};

export type LgpdExport = {
  ok: boolean;
  exportado_em: string;
  titular: { telefones_encontrados: string[] };
  agendamentos: unknown[];
  pagamentos: unknown[];
  conversas: unknown[];
  mensagens: unknown[];
};

export type Consentimento = {
  telefone: string;
  telefone_tail: string;
  aceito_em: string;
  aceito_em_br: string | null;
  politica_versao: string;
  canal: string;
  resposta: string | null;
  politica_url: string | null;
};

export type ServicoRelatorio = {
  nome: string;
  categoria: string;
  total_agendamentos: number;
  recebido_reais: number;
  previsto_reais: number;
};

export type DiaRelatorio = {
  dia: string;
  label: string;
  dow: number;
  atendimentos: number;
  cancelados: number;
  previsto_reais: number;
  recebido_reais: number;
  lucro_reais: number;
};

export type RelatorioDiario = {
  mes: string;
  resumo: {
    atendimentos: number;
    previsto_reais: number;
    recebido_reais: number;
    dias_com_movimento: number;
    media_atendimentos: number;
    media_recebido_reais: number;
  };
  destaques: {
    maior_atendimento: DiaRelatorio | null;
    menor_atendimento: DiaRelatorio | null;
    maior_lucro: DiaRelatorio | null;
    menor_lucro: DiaRelatorio | null;
  };
  ranking_atendimento: DiaRelatorio[];
  ranking_lucro: DiaRelatorio[];
  dias: DiaRelatorio[];
};

export type AgendamentoCriado = {
  id: number;
  quando: string;
  servico: string;
  profissional: string;
  aviso_cliente?: { ok: boolean; erro?: string };
};

export type PerfilResp = {
  usuario: UsuarioPainel;
  resumo: {
    hoje: number;
    futuros: number;
    previsto_reais: number;
    recebido_mes_reais: number;
  };
};

export type ConsumoMetrica = {
  quantidade: number;
  custo_centavos: number;
  custo_reais: number;
};

export type ConsumoResp = {
  dias: number;
  precos_referencia: {
    openai: {
      modelo: string;
      input_usd_por_1m: number;
      output_usd_por_1m: number;
      nota: string;
    };
    meta: {
      conversa_usd: number;
      mensagem_usd: number;
      nota: string;
    };
    usd_brl: number;
  };
  total: {
    custo_centavos: number;
    custo_reais: number;
    projecao_mes_reais: number;
  };
  por_provedor: Record<
    string,
    {
      custo_centavos: number;
      custo_reais: number;
      metricas: Record<string, ConsumoMetrica>;
    }
  >;
  diario: Array<{
    dia: string;
    provedor: string;
    quantidade: number;
    custo_reais: number;
  }>;
};
