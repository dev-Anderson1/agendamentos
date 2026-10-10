import express from 'express';
import { painelAuthMiddleware, requireAdmin, isAdmin } from './auth.js';
import {
  listarAgendaSalao,
  buscarAgendamento,
  cancelarHorarioEAvisar,
} from '../admin.js';
import { enviarAvisoComRemarcacao, prepararRemarcacao } from '../remarcar.js';
import { resumoDashboard, relatorioPorServico, previsaoEntradas, historicoMensal, relatorioDiarioMes } from './dashboard.js';
import { listarPagamentos, registrarPagamento, historicoPorMetodo } from './financeiro.js';
import { listarProdutos, criarProduto, registrarMovimento, listarMovimentos } from './estoque.js';
import {
  listarServicosAtivos,
  listarProfissionaisDoServico,
  listarSlotsPainel,
  criarAgendamentoPainel,
} from './agendar.js';
import {
  evolutionConnectionState,
  evolutionConnectQr,
  evolutionManagerUrl,
} from '../evolution.js';
import {
  exportarDadosTitular,
  excluirDadosTitular,
  limparMensagensAntigas,
  listarConsentimentos,
} from '../lgpd/titular.js';

export function registerPainelRoutes(app) {
  app.post('/api/painel/login', async (req, res) => {
    try {
      // Garante tabelas de usuários (idempotente) antes do primeiro login
      const { ensurePainelSchema } = await import('./migrate.js');
      await ensurePainelSchema();

      const pin = String(req.body?.pin || '');
      const login = String(req.body?.login || req.body?.usuario || '').trim();
      const { loginPainel } = await import('./auth.js');
      const result = await loginPainel({ login, pin });
      if (!result) return res.status(401).json({ erro: 'pin_invalido' });
      return res.json({ ok: true, token: result.token, usuario: result.usuario });
    } catch (err) {
      return res.status(500).json({ erro: String(err.message || err) });
    }
  });

  const api = express.Router();
  api.use(painelAuthMiddleware);

  function escopoProfissional(req) {
    if (isAdmin(req.user)) return null;
    return req.user?.profissional_id ? Number(req.user.profissional_id) : null;
  }

  async function assertAcessoAgendamento(req, agendamentoId) {
    const ag = await buscarAgendamento(agendamentoId);
    if (!ag) return { ok: false, status: 404, erro: 'nao_encontrado' };
    const pid = escopoProfissional(req);
    if (pid && Number(ag.profissional_id) !== pid) {
      return { ok: false, status: 403, erro: 'acesso_negado' };
    }
    return { ok: true, ag };
  }

  api.get('/me', async (req, res) => {
    try {
      const { perfilComResumo } = await import('./usuarios.js');
      res.json(await perfilComResumo(req.user));
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/me/lgpd-aceite', async (req, res) => {
    try {
      if (!req.user?.uid) return res.status(400).json({ erro: 'usuario_invalido' });
      const { registrarAceiteLgpd, auditoriaLgpd } = await import('./usuarios.js');
      await registrarAceiteLgpd(req.user.uid, String(req.body?.versao || '1.0'));
      await auditoriaLgpd({
        usuarioId: req.user.uid,
        acao: 'aceite_politica',
        detalhe: `versão ${req.body?.versao || '1.0'}`,
        ip: req.ip,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/usuarios', requireAdmin, async (_req, res) => {
    try {
      const { listarUsuarios } = await import('./usuarios.js');
      res.json({ usuarios: await listarUsuarios() });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/usuarios/profissionais-opcoes', requireAdmin, async (_req, res) => {
    try {
      const { listarProfissionaisAtivos } = await import('./usuarios.js');
      res.json({ profissionais: await listarProfissionaisAtivos() });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/usuarios', requireAdmin, async (req, res) => {
    try {
      const { criarUsuario, auditoriaLgpd } = await import('./usuarios.js');
      const u = await criarUsuario(req.body || {});
      await auditoriaLgpd({
        usuarioId: req.user?.uid,
        acao: 'criar_usuario',
        detalhe: `${u.login} (${u.role})`,
        ip: req.ip,
      });
      res.json({ ok: true, usuario: u });
    } catch (err) {
      res.status(err.status || 500).json({ erro: String(err.message || err) });
    }
  });

  api.put('/usuarios/:id', requireAdmin, async (req, res) => {
    try {
      const { atualizarUsuario, auditoriaLgpd } = await import('./usuarios.js');
      const u = await atualizarUsuario(Number(req.params.id), req.body || {});
      await auditoriaLgpd({
        usuarioId: req.user?.uid,
        acao: 'atualizar_usuario',
        detalhe: `id=${u.id} login=${u.login}`,
        ip: req.ip,
      });
      res.json({ ok: true, usuario: u });
    } catch (err) {
      res.status(err.status || 500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/consumo', requireAdmin, async (req, res) => {
    try {
      const { resumoConsumo, sincronizarMetaDoHistorico } = await import('./consumo.js');
      await sincronizarMetaDoHistorico();
      const dias = Number(req.query.dias) || 30;
      res.json(await resumoConsumo({ dias }));
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/dashboard', async (req, res) => {
    try {
      const profissionalId = escopoProfissional(req);
      if (profissionalId) {
        const { perfilComResumo } = await import('./usuarios.js');
        const me = await perfilComResumo(req.user);
        return res.json({
          hoje: {
            agendamentos: me.resumo.hoje,
            previsto_reais: me.resumo.previsto_reais,
            recebido_reais: 0,
          },
          mes: {
            recebido_reais: me.resumo.recebido_mes_reais,
            previsto_futuro_reais: me.resumo.previsto_reais,
            agendamentos_futuros: me.resumo.futuros,
          },
          estoque: { produtos_baixo: 0 },
          escopo: 'profissional',
        });
      }
      res.json(await resumoDashboard());
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/agenda', async (req, res) => {
    try {
      const periodo = req.query.periodo || 'hoje';
      const profissionalId = escopoProfissional(req);
      res.json(await listarAgendaSalao(periodo, { profissionalId }));
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/agenda/:id/avisar', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const access = await assertAcessoAgendamento(req, id);
      if (!access.ok) return res.status(access.status).json({ erro: access.erro });
      const ag = access.ag;
      const texto = req.body?.texto || req.body?.mensagem || '';
      const instance = req.body?.instance || process.env.EVOLUTION_INSTANCE || 'salao2';
      const oferta = await enviarAvisoComRemarcacao({
        telefoneCliente: ag.cliente_telefone,
        clienteNome: ag.cliente_nome,
        servicoId: ag.servico_id,
        profissionalId: ag.profissional_id,
        quando: ag.quando,
        servicoNome: ag.servico,
        agendamentoId: ag.id,
        textoAviso: texto,
        instance,
      });
      res.json({
        ok: true,
        slots: oferta.slots?.length || 0,
        mensagem: oferta.erro_envio
          ? `Não consegui enviar o WhatsApp: ${oferta.erro_envio}`
          : `Aviso enviado para ${ag.cliente_nome}`,
        erro_envio: oferta.erro_envio || null,
      });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/agenda/:id/cancelar-remarcar', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const access = await assertAcessoAgendamento(req, id);
      if (!access.ok) return res.status(access.status).json({ erro: access.erro });
      const instance = req.body?.instance || process.env.EVOLUTION_INSTANCE || 'salao2';
      const r = await cancelarHorarioEAvisar({ id, instance, enviarAviso: false });
      if (!r.ok) return res.status(404).json({ erro: 'nao_encontrado' });
      const oferta = await prepararRemarcacao({
        telefoneCliente: r.horario.cliente_telefone,
        clienteNome: r.horario.cliente_nome,
        servicoId: r.horario.servico_id,
        profissionalId: r.horario.profissional_id,
        quandoCancelado: r.horario.quando,
        agendamentoId: r.horario.id,
        instance,
        origem: 'dono',
        enviarWhatsApp: true,
      });
      res.json({
        ok: true,
        id: r.horario.id,
        cliente: r.horario.cliente_nome,
        slots: oferta.slots?.length || 0,
        mensagem: oferta.slots?.length
          ? `Cancelado. Enviamos ${oferta.slots.length} horário(s) para remarcar.`
          : `Cancelado. Sem vagas nos próximos 14 dias.`,
        erro_envio: oferta.erro_envio || null,
      });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/financeiro/pagamentos', requireAdmin, async (req, res) => {
    try {
      const status = req.query.status || null;
      const metodo = req.query.metodo || null;
      const limite = Number(req.query.limite) || 50;
      res.json({ pagamentos: await listarPagamentos({ status, metodo, limite }) });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/financeiro/metodos', requireAdmin, async (req, res) => {
    try {
      const mes = req.query.mes ? String(req.query.mes) : null;
      res.json(await historicoPorMetodo({ mes }));
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/financeiro/pagamentos/:id/pagar', requireAdmin, async (req, res) => {
    try {
      const pagamentoId = Number(req.params.id);
      const valorCentavos =
        req.body?.valor_centavos != null
          ? Number(req.body.valor_centavos)
          : req.body?.valor_reais != null
            ? Math.round(Number(req.body.valor_reais) * 100)
            : undefined;
      const r = await registrarPagamento({
        pagamentoId,
        valorCentavos,
        metodo: req.body?.metodo,
        observacoes: req.body?.observacoes,
      });
      if (!r.ok) return res.status(404).json({ erro: r.erro });
      res.json(r);
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/relatorios/servicos', requireAdmin, async (req, res) => {
    try {
      const dias = Number(req.query.dias) || 90;
      res.json({ servicos: await relatorioPorServico({ dias }) });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/relatorios/previsao', async (req, res) => {
    try {
      const dias = Number(req.query.dias) || 30;
      const profissionalId = escopoProfissional(req);
      if (!isAdmin(req.user) && !profissionalId) {
        return res.json({ dias: [], total_previsto_reais: 0 });
      }
      res.json(await previsaoEntradas({ dias, profissionalId }));
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/relatorios/mensal', requireAdmin, async (req, res) => {
    try {
      const meses = Number(req.query.meses) || 6;
      res.json({ meses: await historicoMensal({ meses }) });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/relatorios/diario', requireAdmin, async (req, res) => {
    try {
      const mes = req.query.mes ? String(req.query.mes) : null;
      res.json(await relatorioDiarioMes({ mes }));
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/estoque/produtos', requireAdmin, async (_req, res) => {
    try {
      res.json({ produtos: await listarProdutos() });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/estoque/produtos', requireAdmin, async (req, res) => {
    try {
      if (!req.body?.nome) return res.status(400).json({ erro: 'informe_nome' });
      const produto = await criarProduto(req.body);
      res.json({ ok: true, produto });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/estoque/movimentos', requireAdmin, async (req, res) => {
    try {
      const r = await registrarMovimento(req.body);
      if (!r.ok) return res.status(400).json({ erro: r.erro });
      res.json(r);
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/estoque/movimentos', requireAdmin, async (req, res) => {
    try {
      const produtoId = req.query.produto_id ? Number(req.query.produto_id) : null;
      res.json({ movimentos: await listarMovimentos(produtoId) });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/servicos', async (_req, res) => {
    try {
      res.json({ servicos: await listarServicosAtivos() });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/profissionais', async (req, res) => {
    try {
      const servicoId = Number(req.query.servico_id);
      if (!servicoId) return res.status(400).json({ erro: 'informe_servico_id' });
      res.json({ profissionais: await listarProfissionaisDoServico(servicoId) });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/slots', async (req, res) => {
    try {
      const dataIso = String(req.query.data || '');
      const servicoId = Number(req.query.servico_id);
      let profissionalId = req.query.profissional_id
        ? Number(req.query.profissional_id)
        : null;
      const escopo = escopoProfissional(req);
      if (escopo) profissionalId = escopo;
      if (!dataIso || !servicoId) {
        return res.status(400).json({ erro: 'informe_data_e_servico_id' });
      }
      const r = await listarSlotsPainel({ dataIso, servicoId, profissionalId });
      if (r.erro) return res.status(404).json(r);
      res.json(r);
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/agendamentos', async (req, res) => {
    try {
      const body = req.body || {};
      const escopo = escopoProfissional(req);
      let profissionalId = body.profissional_id ? Number(body.profissional_id) : null;
      if (escopo) profissionalId = escopo;
      if (!isAdmin(req.user) && !profissionalId) {
        return res.status(403).json({ erro: 'sem_profissional_vinculado' });
      }
      const r = await criarAgendamentoPainel({
        clienteNome: body.cliente_nome || body.nome,
        clienteTelefone: body.cliente_telefone || body.telefone,
        servicoId: Number(body.servico_id),
        profissionalId,
        dataIso: body.data,
        hora: body.hora,
        avisarCliente: Boolean(body.avisar_cliente),
        instance: body.instance || process.env.EVOLUTION_INSTANCE || 'salao2',
      });
      if (!r.ok) {
        const status = r.erro === 'horario_indisponivel' ? 409 : 400;
        return res.status(status).json(r);
      }
      res.json(r);
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/whatsapp/status', requireAdmin, async (_req, res) => {
    try {
      const instance = process.env.EVOLUTION_INSTANCE || 'salao2';
      const state = await evolutionConnectionState(instance);
      res.json({
        ...state,
        manager_url: evolutionManagerUrl(),
        painel_url: process.env.PAINEL_PUBLIC_URL || 'http://localhost:3001/painel',
      });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/whatsapp/qr', requireAdmin, async (_req, res) => {
    try {
      const instance = process.env.EVOLUTION_INSTANCE || 'salao2';
      const state = await evolutionConnectionState(instance);
      if (state.state === 'open') {
        return res.json({ conectado: true, state: state.state, base64: null });
      }
      const qr = await evolutionConnectQr(instance);
      res.json({
        conectado: false,
        state: state.state,
        base64: qr.base64,
        pairingCode: qr.pairingCode,
        manager_url: evolutionManagerUrl(),
      });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/lgpd/exportar', requireAdmin, async (req, res) => {
    try {
      const tel = String(req.query.telefone || '');
      const r = await exportarDadosTitular(tel);
      if (!r.ok) return res.status(400).json(r);
      res.json(r);
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/lgpd/consentimentos', requireAdmin, async (req, res) => {
    try {
      const limite = Number(req.query.limite) || 100;
      res.json({ consentimentos: await listarConsentimentos({ limite }) });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/lgpd/excluir', requireAdmin, async (req, res) => {
    try {
      const tel = String(req.body?.telefone || '');
      const confirmar = String(req.body?.confirmar || '');
      if (confirmar !== 'EXCLUIR') {
        return res.status(400).json({ erro: 'digite_EXCLUIR_para_confirmar' });
      }
      const r = await excluirDadosTitular(tel);
      if (!r.ok) return res.status(400).json(r);
      res.json(r);
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/lgpd/retencao', requireAdmin, async (req, res) => {
    try {
      const dias = Number(req.body?.dias) || Number(process.env.LGPD_RETENCAO_DIAS) || 180;
      res.json(await limparMensagensAntigas({ dias }));
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  // === Chat WhatsApp ===
  api.get('/whatsapp/conversas', requireAdmin, async (req, res) => {
    try {
      const limite = Math.min(Number(req.query.limite) || 50, 200);
      const { rows } = await import('../db.js').then(m =>
        m.query(
          `SELECT
             mc.telefone,
             MAX(mc.criado_em) AS ultima_msg,
             COUNT(*) FILTER (WHERE mc.papel = 'user') AS total_user,
             (SELECT conteudo FROM salao.mensagens_conversa
              WHERE telefone = mc.telefone ORDER BY criado_em DESC, id DESC LIMIT 1) AS ultimo_texto,
             (SELECT papel FROM salao.mensagens_conversa
              WHERE telefone = mc.telefone ORDER BY criado_em DESC, id DESC LIMIT 1) AS ultimo_papel,
             COALESCE(
               (SELECT dados->>'push_name' FROM salao.conversas WHERE telefone = mc.telefone LIMIT 1),
               (SELECT metadados->>'pushName' FROM salao.mensagens_conversa
                WHERE telefone = mc.telefone AND papel = 'user' AND metadados->>'pushName' != ''
                ORDER BY criado_em DESC LIMIT 1)
             ) AS push_name
           FROM salao.mensagens_conversa mc
           GROUP BY mc.telefone
           ORDER BY ultima_msg DESC
           LIMIT $1`,
          [limite],
        )
      );
      res.json({ conversas: rows });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.get('/whatsapp/conversas/:telefone', requireAdmin, async (req, res) => {
    try {
      const tel = String(req.params.telefone || '').replace(/\D/g, '');
      if (!tel) return res.status(400).json({ erro: 'telefone_invalido' });
      const limite = Math.min(Number(req.query.limite) || 60, 200);
      const { rows } = await import('../db.js').then(m =>
        m.query(
          `SELECT papel, conteudo, metadados, criado_em
           FROM salao.mensagens_conversa
           WHERE telefone = $1
           ORDER BY criado_em ASC, id ASC
           LIMIT $2`,
          [tel, limite],
        )
      );
      res.json({ telefone: tel, mensagens: rows });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  api.post('/whatsapp/conversas/:telefone/enviar', requireAdmin, async (req, res) => {
    try {
      const tel = String(req.params.telefone || '').replace(/\D/g, '');
      const texto = String(req.body?.texto || '').trim();
      if (!tel || !texto) return res.status(400).json({ erro: 'telefone_ou_texto_vazio' });
      const instance = process.env.EVOLUTION_INSTANCE || 'salao2';
      const { sendWhatsAppText } = await import('../evolution.js');
      await sendWhatsAppText({ instance, telefone: tel, texto });
      const { registrarMensagem } = await import('../history.js');
      await registrarMensagem({ telefone: tel, papel: 'assistant', conteudo: texto, metadados: { origem: 'painel' } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: String(err.message || err) });
    }
  });

  app.use('/api/painel', api);
}
