import { query } from './db.js';

const TZ = 'America/Sao_Paulo';
const LUNCH_START = 12 * 60;
const LUNCH_END = 12 * 60 + 20;

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const NOMES_DIA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

// ordem importa: nomes mais longos primeiro
const DIA_SEMANA_MAP = [
  ['segunda feira', 1],
  ['segunda-feira', 1],
  ['terca feira', 2],
  ['terca-feira', 2],
  ['quarta feira', 3],
  ['quarta-feira', 3],
  ['quinta feira', 4],
  ['quinta-feira', 4],
  ['sexta feira', 5],
  ['sexta-feira', 5],
  ['domingo', 0],
  ['segunda', 1],
  ['terca', 2],
  ['quarta', 3],
  ['quinta', 4],
  ['sexta', 5],
  ['sabado', 6],
];

function normalizeText(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function agoraSp() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function nextWeekdayIso(targetDow, horaHHMM = null) {
  const sp = agoraSp();
  const current = sp.getDay();
  let add = (targetDow - current + 7) % 7;

  if (add === 0 && horaHHMM) {
    const [hh, mm] = horaHHMM.split(':').map(Number);
    const agoraMin = sp.getHours() * 60 + sp.getMinutes();
    const alvoMin = hh * 60 + mm;
    if (alvoMin <= agoraMin) add = 7;
  }

  const d = new Date(sp);
  d.setDate(d.getDate() + add);
  return toDateKey(d);
}

function parseHoraNatural(t) {
  // 10:30 | 10h30 | 10h | as 10 | às 10 horas
  let m = t.match(/(?:(?:as|a)\s*)?(\d{1,2})[:h](\d{2})(?:\s*h(?:oras)?)?/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  m = t.match(/(?:(?:as|a)\s*)?(\d{1,2})\s*h(?:oras)?(?:\s*(\d{2}))?/);
  if (m) {
    const hh = Number(m[1]);
    const mm = m[2] !== undefined ? Number(m[2]) : 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  m = t.match(/(?:(?:as|a)\s+)(\d{1,2})(?:\s*horas?)?$/);
  if (m) {
    const hh = Number(m[1]);
    if (hh >= 0 && hh <= 23) {
      return `${String(hh).padStart(2, '0')}:00`;
    }
  }

  return null;
}

function detectarDiaSemana(t) {
  for (const [nome, dow] of DIA_SEMANA_MAP) {
    if (t.includes(nome)) {
      return { dow, nome: NOMES_DIA[dow] };
    }
  }
  return null;
}

export function parseDia(texto) {
  const t = normalizeText(texto);
  const sp = agoraSp();

  if (t === 'hoje') return toDateKey(sp);
  if (t === 'amanha') {
    const d = new Date(sp);
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }

  const diaSemana = detectarDiaSemana(t);
  // só dia da semana, sem horário (ex: "terca", "na quarta")
  if (diaSemana && !parseHoraNatural(t)) {
    // se o texto for só o dia (ou "na terca"), resolve
    const soDia = /^(na\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)([- ]feira)?$/.test(
      t,
    );
    if (soDia || !/\d/.test(t)) {
      return nextWeekdayIso(diaSemana.dow);
    }
  }

  let m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  m = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    const [, dd, mm] = m;
    let year = sp.getFullYear();
    let key = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const hoje = toDateKey(sp);
    if (key < hoje) {
      year += 1;
      key = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return key;
  }

  return null;
}

/**
 * Interpreta frases como:
 * - "segunda as 10h"
 * - "terca 14:00"
 * - "quarta-feira às 9h30"
 * - "sabado as 10"
 * Retorna { dataIso, hora, diaNome } ou null
 */
export function parseDiaHoraNatural(texto) {
  const t = normalizeText(texto);
  if (!t) return null;

  const diaSemana = detectarDiaSemana(t);
  const hora = parseHoraNatural(t);

  if (diaSemana && hora) {
    const dataIso = nextWeekdayIso(diaSemana.dow, hora);
    return {
      dataIso,
      hora,
      diaNome: diaSemana.nome,
      label: `${diaSemana.nome}, ${formatDiaBr(dataIso)} às ${hora}`,
    };
  }

  // "10/08 as 10h" ou "10/08/2026 14:00"
  if (hora) {
    const dataIso = parseDia(t.replace(/(?:as|a)\s*\d{1,2}.*$/, '').trim()) || parseDia(t);
    if (dataIso) {
      const dow = new Date(`${dataIso}T12:00:00`).getDay();
      return {
        dataIso,
        hora,
        diaNome: NOMES_DIA[dow],
        label: `${NOMES_DIA[dow]}, ${formatDiaBr(dataIso)} às ${hora}`,
      };
    }
  }

  return null;
}

export function formatDiaBr(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function nomeDiaDaData(isoDate) {
  const dow = new Date(`${isoDate}T12:00:00`).getDay();
  return NOMES_DIA[dow];
}

export async function encontrarSlotExato({
  dataIso,
  hora,
  servicoId,
  duracaoMinutos,
  profissionalId = null,
}) {
  // normaliza para grade de 30 min
  const [hh, mm] = hora.split(':').map(Number);
  const rounded = mm < 15 ? 0 : mm < 45 ? 30 : 0;
  const hourAdj = mm >= 45 ? hh + 1 : hh;
  const horaNorm = `${String(hourAdj).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;

  const slots = await listarHorariosLivres({
    dataIso,
    servicoId,
    duracaoMinutos,
    profissionalId,
  });
  return slots.find((s) => s.hora === horaNorm) || null;
}

function cruzaAlmoco(inicioMin, fimMin) {
  return inicioMin < LUNCH_END && fimMin > LUNCH_START;
}

async function slotLivre(profissionalId, dataIso, hora, duracaoMinutos) {
  const r = await query(
    `SELECT NOT EXISTS (
       SELECT 1
       FROM salao.agendamentos a
       WHERE a.status IN ('confirmado', 'pendente')
         AND a.profissional_id = $1
         AND tstzrange(a.inicio_em, a.fim_em, '[)') &&
             tstzrange(
               ($2::date + $3::time) AT TIME ZONE 'America/Sao_Paulo',
               (($2::date + $3::time) AT TIME ZONE 'America/Sao_Paulo')
                 + make_interval(mins => $4::int),
               '[)'
             )
     ) AS livre`,
    [profissionalId, dataIso, hora, duracaoMinutos],
  );
  return Boolean(r.rows[0]?.livre);
}

export async function listarHorariosLivres({
  dataIso,
  servicoId,
  duracaoMinutos,
  profissionalId = null,
  limite = 12,
}) {
  const diaSemanaRes = await query(
    `SELECT EXTRACT(DOW FROM $1::date)::int AS dow`,
    [dataIso],
  );
  const dow = Number(diaSemanaRes.rows[0].dow);

  // Domingo (0) e Segunda (1) fechados
  if (dow === 0 || dow === 1) {
    return [];
  }

  const params = [servicoId, dow];
  let sql = `
    SELECT p.id, p.nome, h.hora_inicio, h.hora_fim
    FROM salao.profissionais p
    JOIN salao.horarios_trabalho h ON h.profissional_id = p.id
    JOIN salao.profissional_servicos ps ON ps.profissional_id = p.id
    WHERE p.ativo AND ps.servico_id = $1 AND h.dia_semana = $2`;
  if (profissionalId) {
    sql += ` AND p.id = $3`;
    params.push(profissionalId);
  }
  sql += ` ORDER BY p.nome`;

  const { rows: profissionais } = await query(sql, params);
  if (!profissionais.length) return [];

  const sp = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const hojeKey = toDateKey(sp);
  const agoraMin = sp.getHours() * 60 + sp.getMinutes();

  const slots = [];
  const step = 30;

  for (const p of profissionais) {
    const [hiH, hiM] = String(p.hora_inicio).slice(0, 5).split(':').map(Number);
    const [hfH, hfM] = String(p.hora_fim).slice(0, 5).split(':').map(Number);
    let cursor = hiH * 60 + hiM;
    const fim = hfH * 60 + hfM;

    while (cursor + duracaoMinutos <= fim) {
      const hh = String(Math.floor(cursor / 60)).padStart(2, '0');
      const mm = String(cursor % 60).padStart(2, '0');
      const hora = `${hh}:${mm}`;
      const fimSlot = cursor + duracaoMinutos;

      if (dataIso === hojeKey && cursor <= agoraMin) {
        cursor += step;
        continue;
      }

      // Intervalo de almoço 12:00–12:20
      if (cruzaAlmoco(cursor, fimSlot)) {
        cursor += step;
        continue;
      }

      const livre = await slotLivre(p.id, dataIso, hora, duracaoMinutos);
      if (livre) {
        slots.push({
          hora,
          profissionalId: p.id,
          profissionalNome: p.nome,
          label: profissionalId ? hora : `${hora} — ${p.nome}`,
        });
      }
      cursor += step;
      if (slots.length >= limite) break;
    }
    if (slots.length >= limite) break;
  }

  return slots;
}

/**
 * Próximos horários livres reais (grade + ocupação no banco).
 * Não inventa data/hora: só devolve o que listarHorariosLivres achar.
 */
export async function listarProximosSlotsLivres({
  servicoId,
  duracaoMinutos,
  profissionalId = null,
  dias = 14,
  maxSlots = 8,
  maxPorDia = 3,
} = {}) {
  if (!servicoId || !duracaoMinutos) return [];
  const sp = agoraSp();
  const resultados = [];

  for (let i = 0; i < dias && resultados.length < maxSlots; i += 1) {
    const d = new Date(sp);
    d.setDate(d.getDate() + i);
    const dataIso = toDateKey(d);
    const dow = d.getDay();
    if (dow === 0 || dow === 1) continue;

    const slotsDia = await listarHorariosLivres({
      dataIso,
      servicoId,
      duracaoMinutos,
      profissionalId,
      limite: maxPorDia,
    });
    const diaNome = NOMES_DIA[dow];
    for (const s of slotsDia) {
      resultados.push({
        dataIso,
        hora: s.hora,
        profissionalId: s.profissionalId,
        profissionalNome: s.profissionalNome,
        diaNome,
        label: `${diaNome}, ${formatDiaBr(dataIso)} às ${s.hora} — ${s.profissionalNome}`,
      });
      if (resultados.length >= maxSlots) break;
    }
  }

  return resultados;
}
