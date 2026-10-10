import { query } from './db.js';
import { buscarConhecimento, formatarContextoRag } from './rag.js';
import { sincronizarNovoAgendamento, cancelarEventoGoogle } from './google-calendar.js';
import { avisarDonoNovoAgendamento } from './admin.js';
import { criarPagamentoPendente } from './pagamentos.js';
import { prepararRemarcacao } from './remarcar.js';
import { formatDiaBr, listarHorariosLivres, parseDia, parseDiaHoraNatural } from './slots.js';

function phoneTail(telefone) {
  return String(telefone || '').replace(/\D/g, '').slice(-8);
}

function formatPreco(s) {
  const valor = (Number(s.preco_centavos) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return s.preco_apartir ? `a partir de ${valor}` : valor;
}

/** Tool definitions for the LLM (OpenAI function-calling format) */
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'listar_servicos',
      description:
        'Lista serviços reais do salão com preço, duração e categoria. Use para dúvidas sobre o que oferecem, preços ou "serviços de cabelo/unhas".',
      parameters: {
        type: 'object',
        properties: {
          categoria: {
            type: 'string',
            description: 'Opcional: cabelo, capilar, maquiagem, unhas',
          },
          termo: {
            type: 'string',
            description: 'Opcional: filtro por nome (ex: escova, coloração, manicure)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_profissionais',
      description:
        'Lista profissionais ativos e, se informado servico, quais atendem aquele serviço.',
      parameters: {
        type: 'object',
        properties: {
          servico: {
            type: 'string',
            description: 'Nome do serviço para filtrar profissionais (opcional)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificar_disponibilidade',
      description:
        'Consulta horários LIVRES no banco, considerando duração do serviço, almoço e conflitos. Nunca invente horários — use só o retorno desta tool.',
      parameters: {
        type: 'object',
        properties: {
          servico: { type: 'string', description: 'Nome do serviço (obrigatório)' },
          data: {
            type: 'string',
            description: 'Data: hoje, amanha, terça, 12/08, 12/08/2026',
          },
          profissional: {
            type: 'string',
            description: 'Nome do profissional (opcional)',
          },
          hora: {
            type: 'string',
            description: 'Horário desejado opcional (ex: 10:00, 14h)',
          },
        },
        required: ['servico'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_agendamentos_cliente',
      description: 'Lista agendamentos futuros do cliente pelo telefone do WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          telefone: {
            type: 'string',
            description: 'Telefone do cliente (use o telefone da conversa se não informado)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_agendamento',
      description:
        'Cria agendamento no banco SOMENTE após confirmação explícita do cliente. Valida disponibilidade antes de gravar.',
      parameters: {
        type: 'object',
        properties: {
          telefone: { type: 'string' },
          cliente_nome: { type: 'string' },
          servico: { type: 'string' },
          profissional: { type: 'string', description: 'Opcional' },
          data: { type: 'string', description: 'hoje, amanha, 12/08, terça...' },
          hora: { type: 'string', description: '10:00 ou 10h' },
        },
        required: ['telefone', 'cliente_nome', 'servico', 'data', 'hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_agendamento',
      description:
        'Cancela agendamento do cliente pelo código (#id) no banco e devolve horários livres reais para remarcar. Nunca invente horário: use só a lista retornada.',
      parameters: {
        type: 'object',
        properties: {
          telefone: { type: 'string' },
          codigo: { type: 'integer', description: 'ID do agendamento' },
        },
        required: ['telefone', 'codigo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'info_salao',
      description:
        'Retorna regras reais do salão: funcionamento, almoço, feriados, acréscimo fora do horário e equipe.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_conhecimento',
      description:
        'RAG obrigatório para perguntas e situações importantes: políticas, preparo, contraindicações, pagamento, endereço, cuidados, garantia, reclamações, dúvidas gerais. Busca trechos oficiais na base de conhecimento. Nunca invente — use o retorno.',
      parameters: {
        type: 'object',
        properties: {
          pergunta: {
            type: 'string',
            description: 'A dúvida ou situação do cliente, em português',
          },
        },
        required: ['pergunta'],
      },
    },
  },
];

async function findServico(nome) {
  const r = await query(
    `SELECT id, nome, duracao_minutos, preco_centavos, COALESCE(preco_apartir,false) AS preco_apartir, categoria
     FROM salao.servicos
     WHERE ativo AND LOWER(nome) LIKE LOWER($1)
     ORDER BY CASE WHEN LOWER(nome) = LOWER($2) THEN 0 ELSE 1 END, id
     LIMIT 5`,
    [`%${nome}%`, nome],
  );
  return r.rows;
}

async function findProfissional(nome) {
  if (!nome) return null;
  const r = await query(
    `SELECT id, nome, cargo FROM salao.profissionais
     WHERE ativo AND LOWER(nome) LIKE LOWER($1)
     ORDER BY id LIMIT 1`,
    [`%${nome}%`],
  );
  return r.rows[0] || null;
}

function resolveDataIso(dataTexto) {
  if (!dataTexto) return null;
  const natural = parseDiaHoraNatural(String(dataTexto));
  if (natural?.dataIso) return natural.dataIso;
  return parseDia(String(dataTexto));
}

function resolveHora(horaTexto, dataTexto) {
  if (horaTexto) {
    const t = String(horaTexto).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    let m = t.match(/(\d{1,2})[:h](\d{2})/);
    if (m) return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
    m = t.match(/(\d{1,2})\s*h?/);
    if (m) return `${String(Number(m[1])).padStart(2, '0')}:00`;
  }
  const natural = parseDiaHoraNatural(String(dataTexto || ''));
  return natural?.hora || null;
}

export async function executeTool(name, args = {}, context = {}) {
  const telefoneCtx = context.telefone || args.telefone;

  switch (name) {
    case 'listar_servicos': {
      const params = [];
      let sql = `SELECT id, nome, duracao_minutos, preco_centavos, COALESCE(preco_apartir,false) AS preco_apartir, categoria
                 FROM salao.servicos WHERE ativo = TRUE`;
      if (args.categoria) {
        params.push(args.categoria);
        sql += ` AND categoria = $${params.length}`;
      }
      if (args.termo) {
        params.push(`%${args.termo}%`);
        sql += ` AND LOWER(nome) LIKE LOWER($${params.length})`;
      }
      sql += ` ORDER BY id`;
      const { rows } = await query(sql, params);
      return {
        total: rows.length,
        servicos: rows.map((s) => ({
          id: s.id,
          nome: s.nome,
          duracao_minutos: s.duracao_minutos,
          preco: formatPreco(s),
          categoria: s.categoria,
        })),
      };
    }

    case 'listar_profissionais': {
      if (args.servico) {
        const servicos = await findServico(args.servico);
        if (!servicos.length) return { erro: 'servico_nao_encontrado', servico: args.servico };
        const s = servicos[0];
        const { rows } = await query(
          `SELECT p.id, p.nome, p.cargo
           FROM salao.profissionais p
           JOIN salao.profissional_servicos ps ON ps.profissional_id = p.id
           WHERE p.ativo AND ps.servico_id = $1
           ORDER BY p.nome`,
          [s.id],
        );
        return { servico: s.nome, profissionais: rows };
      }
      const { rows } = await query(
        `SELECT id, nome, cargo FROM salao.profissionais WHERE ativo ORDER BY nome`,
      );
      return { profissionais: rows };
    }

    case 'verificar_disponibilidade': {
      if (!args.servico) return { erro: 'informe_servico' };
      const servicos = await findServico(args.servico);
      if (!servicos.length) return { erro: 'servico_nao_encontrado', servico: args.servico };
      if (servicos.length > 1 && !servicos.some((s) => s.nome.toLowerCase() === String(args.servico).toLowerCase())) {
        return {
          precisa_esclarecer: true,
          mensagem: 'Encontrei mais de um serviço parecido. Qual deles?',
          opcoes: servicos.map((s) => s.nome),
        };
      }
      const servico = servicos.find((s) => s.nome.toLowerCase() === String(args.servico).toLowerCase()) || servicos[0];

      const dataIso = resolveDataIso(args.data || 'hoje');
      if (!dataIso) return { erro: 'data_invalida', data: args.data };

      const prof = args.profissional ? await findProfissional(args.profissional) : null;
      if (args.profissional && !prof) return { erro: 'profissional_nao_encontrado', profissional: args.profissional };

      const dow = new Date(`${dataIso}T12:00:00`).getDay();
      if (dow === 0 || dow === 1) {
        return {
          data: formatDiaBr(dataIso),
          fechado: true,
          mensagem: 'Salão fechado neste dia (domingo e segunda). Funciona terça a sábado, 09:00–18:00.',
        };
      }

      const slots = await listarHorariosLivres({
        dataIso,
        servicoId: servico.id,
        duracaoMinutos: servico.duracao_minutos,
        profissionalId: prof?.id || null,
      });

      const hora = resolveHora(args.hora, args.data);
      let horario_solicitado = null;
      if (hora) {
        const match = slots.find((s) => s.hora === hora);
        horario_solicitado = {
          hora,
          disponivel: Boolean(match),
          profissional: match?.profissionalNome || null,
        };
      }

      return {
        servico: servico.nome,
        duracao_minutos: servico.duracao_minutos,
        preco: formatPreco(servico),
        data: formatDiaBr(dataIso),
        data_iso: dataIso,
        profissional_filtro: prof?.nome || null,
        horario_solicitado,
        horarios_livres: slots.slice(0, 12).map((s) => ({
          hora: s.hora,
          profissional: s.profissionalNome,
          profissional_id: s.profissionalId,
        })),
        total_livres: slots.length,
      };
    }

    case 'listar_agendamentos_cliente': {
      const tel = telefoneCtx || args.telefone;
      if (!tel) return { erro: 'telefone_obrigatorio' };
      const { rows } = await query(
        `SELECT a.id, a.cliente_nome, s.nome AS servico, COALESCE(p.nome,'A definir') AS profissional,
                to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
                to_char(a.fim_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS fim,
                a.status
         FROM salao.agendamentos a
         JOIN salao.servicos s ON s.id = a.servico_id
         LEFT JOIN salao.profissionais p ON p.id = a.profissional_id
         WHERE a.status IN ('confirmado','pendente')
           AND RIGHT(regexp_replace(a.cliente_telefone,'\\D','','g'),8) = $1
         ORDER BY a.inicio_em ASC
         LIMIT 15`,
        [phoneTail(tel)],
      );
      return { telefone: tel, agendamentos: rows };
    }

    case 'criar_agendamento': {
      const tel = args.telefone || telefoneCtx;
      if (!tel || !args.cliente_nome || !args.servico || !args.data || !args.hora) {
        return { erro: 'dados_incompletos', obrigatorio: ['cliente_nome', 'servico', 'data', 'hora', 'telefone'] };
      }
      const servicos = await findServico(args.servico);
      if (!servicos.length) return { erro: 'servico_nao_encontrado' };
      const servico = servicos[0];
      const dataIso = resolveDataIso(args.data);
      const hora = resolveHora(args.hora, args.data);
      if (!dataIso || !hora) return { erro: 'data_ou_hora_invalida' };

      const prof = args.profissional ? await findProfissional(args.profissional) : null;
      const slots = await listarHorariosLivres({
        dataIso,
        servicoId: servico.id,
        duracaoMinutos: servico.duracao_minutos,
        profissionalId: prof?.id || null,
      });
      const slot = slots.find((s) => s.hora === hora);
      if (!slot) {
        return {
          erro: 'horario_indisponivel',
          alternativas: slots.slice(0, 5).map((s) => ({ hora: s.hora, profissional: s.profissionalNome })),
        };
      }

      const r = await query(
        `INSERT INTO salao.agendamentos (
           cliente_nome, cliente_telefone, servico_id, profissional_id,
           inicio_em, fim_em, status, origem
         ) VALUES (
           $1, $2, $3, $4,
           ($5::date + $6::time) AT TIME ZONE 'America/Sao_Paulo',
           (($5::date + $6::time) AT TIME ZONE 'America/Sao_Paulo')
             + make_interval(mins => $7::int),
           'confirmado', 'whatsapp'
         )
         RETURNING id,
           to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
           to_char(fim_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS fim,
           to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS inicio_local,
           to_char(fim_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS fim_local`,
        [
          args.cliente_nome,
          tel,
          servico.id,
          slot.profissionalId,
          dataIso,
          slot.hora,
          servico.duracao_minutos,
        ],
      );
      const row = r.rows[0];
      await sincronizarNovoAgendamento({
        id: row.id,
        cliente: args.cliente_nome,
        telefone: tel,
        servico: servico.nome,
        profissional: slot.profissionalNome,
        inicioLocal: row.inicio_local,
        fimLocal: row.fim_local,
      });
      await criarPagamentoPendente(row.id, servico.id);
      await avisarDonoNovoAgendamento({
        id: row.id,
        cliente: args.cliente_nome,
        telefoneCliente: tel,
        servico: servico.nome,
        profissional: slot.profissionalNome,
        quando: row.quando,
      });
      return {
        ok: true,
        codigo: row.id,
        cliente: args.cliente_nome,
        servico: servico.nome,
        profissional: slot.profissionalNome,
        quando: row.quando,
        fim: row.fim,
        preco: formatPreco(servico),
      };
    }

    case 'cancelar_agendamento': {
      const tel = args.telefone || telefoneCtx;
      const codigo = Number(args.codigo);
      if (!tel || !codigo) return { erro: 'informe_telefone_e_codigo' };
      const r = await query(
        `UPDATE salao.agendamentos
         SET status = 'cancelado', atualizado_em = NOW()
         WHERE id = $1
           AND status IN ('confirmado','pendente')
           AND RIGHT(regexp_replace(cliente_telefone,'\\D','','g'),8) = $2
         RETURNING id, google_event_id, servico_id, profissional_id, cliente_nome, cliente_telefone,
           to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando`,
        [codigo, phoneTail(tel)],
      );
      if (!r.rows.length) return { ok: false, erro: 'agendamento_nao_encontrado' };
      await cancelarEventoGoogle(r.rows[0].google_event_id);
      const row = r.rows[0];
      const oferta = await prepararRemarcacao({
        telefoneCliente: tel,
        clienteNome: row.cliente_nome,
        servicoId: row.servico_id,
        profissionalId: row.profissional_id,
        quandoCancelado: row.quando,
        origem: 'cliente',
        enviarWhatsApp: false,
      });
      return {
        ok: true,
        codigo: row.id,
        quando: row.quando,
        remarcacao: {
          texto_para_cliente: oferta.texto,
          horarios_livres: (oferta.slots || []).map((s, i) => ({
            numero: i + 1,
            quando: s.label,
            data: s.dataIso,
            hora: s.hora,
            profissional: s.profissionalNome,
          })),
        },
        instrucao:
          'Mostre SOMENTE os horarios_livres acima. Peça o número. Não invente outra data/hora.',
      };
    }

    case 'info_salao': {
      const { rows } = await query(`SELECT chave, valor FROM salao.configuracoes`);
      const map = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
      return {
        nome: map.nome_salao || 'Studio Erika Thebas',
        funcionamento: map.horario_funcionamento || {
          domingo: 'Fechado',
          segunda: 'Fechado',
          terca: '09:00-18:00',
          quarta: '09:00-18:00',
          quinta: '09:00-18:00',
          sexta: '09:00-18:00',
          sabado: '09:00-18:00',
        },
        almoco: map.almoco || { inicio: '12:00', fim: '12:20' },
        feriados: map.feriados || {
          atende: true,
          observacao: 'Sujeito à disponibilidade',
        },
        fora_horario: map.fora_horario || { cobra: true, percentual: 30 },
        equipe: (
          await query(`SELECT nome, cargo FROM salao.profissionais WHERE ativo ORDER BY nome`)
        ).rows,
      };
    }

    case 'buscar_conhecimento': {
      const pergunta = String(args.pergunta || '').trim();
      const hits = await buscarConhecimento(pergunta, { topK: 5 });
      return {
        total: hits.length,
        contexto: formatarContextoRag(hits),
        trechos: hits.map((h) => ({
          id: h.id,
          topico: h.topico,
          titulo: h.titulo,
          conteudo: h.conteudo,
          score: Number(h.score.toFixed(3)),
          fonte: h.fonte,
        })),
      };
    }

    default:
      return { erro: 'tool_desconhecida', name };
  }
}
